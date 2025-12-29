import { Router } from 'express';
import { supabase } from '../lib/supabaseClient';
import { storage } from '../storage';
import { sendEmailVerification } from '../email';
import { isAtLeastAdmin } from '../auth/roles';
import axios from 'axios';

const router = Router();

// ============================================
// RATE LIMITING & BOT PROTECTION
// ============================================

// Store registration attempts by IP
// Format: { ip: { count: number, resetTime: number } }
const registrationAttempts = new Map<string, { count: number; resetTime: number }>();

// Configuration
const RATE_LIMIT_WINDOW = 3600000; // 1 hour in milliseconds
const RATE_LIMIT_MAX = 5; // Max registrations per window per IP
const RECAPTCHA_VERIFICATION_URL = 'https://www.google.com/recaptcha/api/siteverify';
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY || '';
const RECAPTCHA_SCORE_THRESHOLD = 0.5;

/**
 * Check if IP has exceeded rate limit for registrations
 */
function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetTime?: number } {
  const now = Date.now();
  const attempt = registrationAttempts.get(ip);

  // Clean up old entries if they exist
  if (attempt && now > attempt.resetTime) {
    registrationAttempts.delete(ip);
    return { allowed: true, remaining: RATE_LIMIT_MAX };
  }

  if (!attempt) {
    // First attempt from this IP
    registrationAttempts.set(ip, { count: 0, resetTime: now + RATE_LIMIT_WINDOW });
    return { allowed: true, remaining: RATE_LIMIT_MAX };
  }

  if (attempt.count >= RATE_LIMIT_MAX) {
    return { 
      allowed: false, 
      remaining: 0,
      resetTime: attempt.resetTime
    };
  }

  return { allowed: true, remaining: RATE_LIMIT_MAX - attempt.count };
}

/**
 * Increment registration attempt counter for IP
 */
function recordRegistrationAttempt(ip: string): void {
  const attempt = registrationAttempts.get(ip);
  if (attempt) {
    attempt.count++;
  }
}

/**
 * Verify reCAPTCHA token with Google
 */
async function verifyRecaptcha(token: string): Promise<{ success: boolean; score: number; action: string }> {
  if (!RECAPTCHA_SECRET_KEY) {
    console.warn('[reCAPTCHA] Secret key not configured - skipping verification');
    return { success: true, score: 1.0, action: 'register' };
  }

  if (!token) {
    return { success: false, score: 0, action: 'register' };
  }

  try {
    console.log('[reCAPTCHA] Verifying token with Google...');
    const response = await axios.post(
      RECAPTCHA_VERIFICATION_URL,
      null,
      {
        params: {
          secret: RECAPTCHA_SECRET_KEY,
          response: token
        },
        timeout: 5000 // 5 second timeout
      }
    );

    const { success, score, action } = response.data;
    console.log(`[reCAPTCHA] Verification result - success: ${success}, score: ${score}, action: ${action}`);

    return { success: success === true, score: score || 0, action };
  } catch (error) {
    console.error('[reCAPTCHA] Verification failed:', error instanceof Error ? error.message : 'Unknown error');
    // Fail open - allow registration if verification fails (network issue)
    return { success: true, score: 0.5, action: 'register' };
  }
}

// Get current user endpoint
router.get('/api/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }
    
    const token = authHeader.substring(7);
    
    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      console.error('Token verification failed:', error?.message || 'No user found');
      return res.status(401).json({ message: 'Invalid token' });
    }
    
    // Get user from our database
    const dbUser = await storage.getUser(user.id);
    
    if (!dbUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check approval status
    if (dbUser.approvalStatus === 'pending') {
      return res.status(403).json({ 
        message: 'Account pending approval',
        requiresApproval: true 
      });
    }
    
    if (dbUser.approvalStatus === 'rejected') {
      return res.status(403).json({ 
        message: 'Account has been rejected',
        rejected: true 
      });
    }
    
    if (!dbUser.isActive) {
      return res.status(403).json({ 
        message: 'Account has been deactivated' 
      });
    }
    
    // Return user data
    res.json({
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      role: dbUser.role,
      profileImageUrl: dbUser.profileImageUrl,
      lastLoginAt: dbUser.lastLoginAt,
      createdAt: dbUser.createdAt
    });
  } catch (error: any) {
    console.error('[Auth /me] Error:', error);
    res.status(500).json({ message: 'Failed to fetch user data' });
  }
});

// Login endpoint using Supabase
router.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    
    // Sign in with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) {
      console.error('[Login] Supabase auth error:', error);
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    if (!data.user || !data.session) {
      return res.status(401).json({ message: 'Login failed' });
    }
    
    // Get or create user in our database
    let dbUser = await storage.getUser(data.user.id);
    
    if (!dbUser) {
      // Create user in our database
      dbUser = await storage.createUser({
        id: data.user.id,
        email: data.user.email!,
        firstName: data.user.user_metadata?.firstName || 'User',
        lastName: data.user.user_metadata?.lastName || '',
        emailVerified: true,
        role: determineUserRole(data.user.email!),
        isActive: true,
        approvalStatus: 'approved',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    
    // Update last login - temporarily skip due to RLS recursion issue
    try {
      await storage.updateUser(dbUser.id, { 
        lastLoginAt: new Date() 
      });
    } catch (updateError) {
      console.warn('[Login] Could not update last login time:', updateError);
      // Continue with login even if update fails
    }
    
    // Return session data
    res.json({
      user: data.user,
      session: data.session,
      dbUser: {
        id: dbUser.id,
        email: dbUser.email,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
        role: dbUser.role
      }
    });
  } catch (error: any) {
    console.error('[Login] Error:', error);
    res.status(500).json({ message: 'Login failed' });
  }
});

// Register endpoint using Supabase
router.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, recaptchaToken } = req.body;
    
    // Extract client IP
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || 
                     req.socket?.remoteAddress || 
                     'unknown';

    console.log(`[Register] New registration attempt from IP: ${clientIp}, email: ${email}`);

    // ============================================
    // VALIDATION
    // ============================================
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ 
        message: 'Email, password, first name, and last name are required' 
      });
    }

    // ============================================
    // RATE LIMITING CHECK
    // ============================================
    const rateLimitCheck = checkRateLimit(clientIp);
    if (!rateLimitCheck.allowed) {
      console.warn(`[Rate Limit] IP ${clientIp} exceeded registration limit`);
      return res.status(429).json({
        message: 'Too many registration attempts. Please try again later.',
        retryAfter: Math.ceil((rateLimitCheck.resetTime! - Date.now()) / 1000)
      });
    }

    // ============================================
    // reCAPTCHA VERIFICATION
    // ============================================
    const recaptchaResult = await verifyRecaptcha(recaptchaToken);
    if (!recaptchaResult.success || recaptchaResult.score < RECAPTCHA_SCORE_THRESHOLD) {
      console.warn(`[reCAPTCHA] Registration failed verification - score: ${recaptchaResult.score}, threshold: ${RECAPTCHA_SCORE_THRESHOLD}`);
      recordRegistrationAttempt(clientIp);
      return res.status(400).json({
        message: 'Registration failed verification. Please try again or contact support if you continue to have issues.',
        code: 'RECAPTCHA_FAILED'
      });
    }

    console.log(`[reCAPTCHA] Registration passed verification - score: ${recaptchaResult.score}`);

    // ============================================
    // SIGN UP WITH SUPABASE
    // ============================================
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          firstName,
          lastName,
          email
        }
      }
    });
    
    if (error) {
      console.error('[Register] Supabase auth error:', error);
      recordRegistrationAttempt(clientIp);
      return res.status(400).json({ message: error.message });
    }
    
    if (!data.user) {
      console.error('[Register] No user returned from Supabase signup');
      recordRegistrationAttempt(clientIp);
      return res.status(400).json({ message: 'Registration failed' });
    }

    // ============================================
    // CREATE USER IN DATABASE
    // ============================================
    const dbUser = await storage.createUser({
      id: data.user.id,
      email: data.user.email!,
      firstName,
      lastName,
      emailVerified: false,
      role: determineUserRole(data.user.email!),
      isActive: true,
      approvalStatus: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Record successful registration attempt
    recordRegistrationAttempt(clientIp);
    
    console.log(`[Register] User created successfully - ID: ${dbUser.id}, email: ${email}, role: ${dbUser.role}`);

    res.json({
      message: 'Registration successful',
      user: data.user,
      session: data.session,
      success: true
    });
  } catch (error: any) {
    console.error('[Register] Error:', error);
    res.status(500).json({ message: 'Registration failed', error: error.message });
  }
});

// Logout endpoint
router.post('/api/auth/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      // Sign out from Supabase
      const { error } = await supabase.auth.admin.signOut(token);
      
      if (error) {
        console.error('[Logout] Supabase signout error:', error);
      }
    }
    
    res.json({ message: 'Logged out successfully' });
  } catch (error: any) {
    console.error('[Logout] Error:', error);
    res.status(500).json({ message: 'Logout failed' });
  }
});

// ============================================
// ADMIN USER CREATION ENDPOINT
// ============================================

/**
 * Create a new user account as an admin
 * POST /api/admin/create-user
 * 
 * This endpoint allows admins to create user accounts directly from the app
 * with automatic audit trail (created_by field tracks which admin created the user)
 */
router.post('/api/admin/create-user', async (req, res) => {
  try {
    const { email, firstName, lastName, password, role } = req.body;
    const authHeader = req.headers.authorization;

    // ============================================
    // AUTHENTICATION CHECK
    // ============================================
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No authentication token provided' });
    }

    const token = authHeader.substring(7);

    // Verify token with Supabase
    const { data: { user: adminUser }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !adminUser) {
      console.error('[Admin Create User] Token verification failed:', authError?.message);
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    // Get admin user from database
    const adminDbUser = await storage.getUser(adminUser.id);

    if (!adminDbUser) {
      return res.status(401).json({ message: 'Admin user not found' });
    }

    // ============================================
    // PERMISSION CHECK
    // ============================================
    if (!isAtLeastAdmin(adminDbUser.role)) {
      console.warn(`[Admin Create User] Unauthorized attempt by ${adminDbUser.email} with role ${adminDbUser.role}`);
      return res.status(403).json({ 
        message: 'Only admins can create user accounts',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    // ============================================
    // INPUT VALIDATION
    // ============================================
    if (!email || !firstName || !lastName || !role) {
      return res.status(400).json({
        message: 'Email, first name, last name, and role are required',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        message: 'Invalid email format',
        code: 'INVALID_EMAIL'
      });
    }

    // Validate role
    if (!['admin', 'agent', 'user'].includes(role)) {
      return res.status(400).json({
        message: 'Role must be one of: admin, agent, user',
        code: 'INVALID_ROLE'
      });
    }

    // ============================================
    // CHECK EMAIL UNIQUENESS
    // ============================================
    const existingUser = await storage.getUserByEmail(email);
    if (existingUser) {
      console.warn(`[Admin Create User] Email already exists: ${email}`);
      return res.status(409).json({
        message: 'Email already exists',
        code: 'EMAIL_EXISTS'
      });
    }

    // Also check Supabase Auth
    const { data: supabaseUser } = await supabase.auth.admin.listUsers();
    const emailExists = supabaseUser?.users?.some(u => u.email?.toLowerCase() === email.toLowerCase());
    if (emailExists) {
      console.warn(`[Admin Create User] Email exists in Supabase Auth: ${email}`);
      return res.status(409).json({
        message: 'Email already exists',
        code: 'EMAIL_EXISTS'
      });
    }

    // ============================================
    // GENERATE TEMPORARY PASSWORD IF NOT PROVIDED
    // ============================================
    const finalPassword = password || generateTemporaryPassword();

    // ============================================
    // CREATE USER IN SUPABASE AUTH
    // ============================================
    console.log(`[Admin Create User] Creating Supabase Auth user: ${email}`);

    const { data: signUpData, error: signUpError } = await supabase.auth.admin.createUser({
      email,
      password: finalPassword,
      email_confirm: false, // Require email verification for security
      user_metadata: {
        firstName,
        lastName,
        email,
        createdBy: adminUser.id,
        createdByAdmin: adminDbUser.email
      }
    });

    if (signUpError || !signUpData.user) {
      console.error('[Admin Create User] Supabase Auth creation failed:', signUpError);
      return res.status(400).json({
        message: signUpError?.message || 'Failed to create user in authentication system',
        code: 'AUTH_CREATION_FAILED'
      });
    }

    // ============================================
    // CREATE USER IN DATABASE WITH AUDIT TRAIL
    // ============================================
    console.log(`[Admin Create User] Creating database user record: ${email}`);

    const dbUser = await storage.createUser({
      id: signUpData.user.id,
      email,
      firstName,
      lastName,
      role,
      isActive: true,
      approvalStatus: 'approved', // Admin-created users are auto-approved
      emailVerified: false, // Require email verification for security
      createdBy: adminUser.id, // AUDIT TRAIL: Track which admin created this user
      createdAt: new Date(),
      updatedAt: new Date()
    });

    console.log(`[Admin Create User] User created successfully - ID: ${dbUser.id}, email: ${email}, role: ${role}, createdBy: ${adminUser.id}`);

    // ============================================
    // SEND EMAIL VERIFICATION
    // ============================================
    const verificationUrl = `${process.env.FRONTEND_URL || 'https://enrollment.getmydpc.com'}/api/auth/verify-email?token=${signUpData.user.id}&email=${encodeURIComponent(email)}`;
    
    try {
      await sendEmailVerification({
        email,
        firstName,
        verificationUrl
      });
      console.log(`[Admin Create User] Verification email sent to ${email}`);
    } catch (emailError) {
      console.error(`[Admin Create User] Failed to send verification email:`, emailError);
      // Continue anyway - admin can resend later
    }

    // ============================================
    // RETURN SUCCESS RESPONSE
    // ============================================
    res.json({
      success: true,
      message: 'User account created successfully',
      user: {
        id: dbUser.id,
        email: dbUser.email,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
        role: dbUser.role,
        createdAt: dbUser.createdAt,
        createdBy: dbUser.createdBy,
        approvalStatus: dbUser.approvalStatus,
        emailVerified: dbUser.emailVerified
      },
      temporaryPassword: password ? undefined : finalPassword, // Return temp password only if we generated it
      adminCreatedBy: {
        id: adminDbUser.id,
        email: adminDbUser.email,
        name: `${adminDbUser.firstName} ${adminDbUser.lastName}`
      }
    });
  } catch (error: any) {
    console.error('[Admin Create User] Error:', error);
    res.status(500).json({
      message: 'Failed to create user account',
      code: 'SERVER_ERROR',
      error: error.message
    });
  }
});

/**
 * Generate a temporary password
 * Format: Adjective + Noun + RandomNumber + SpecialChar
 * Example: BlueRaven42!
 */
function generateTemporaryPassword(): string {
  const adjectives = ['Blue', 'Green', 'Bright', 'Swift', 'Calm', 'Mighty', 'Quick', 'Smart', 'Cool', 'Happy'];
  const nouns = ['Eagle', 'Tiger', 'Phoenix', 'Raven', 'Falcon', 'Dragon', 'Lion', 'Wolf', 'Bear', 'Fox'];
  const specialChars = ['!', '@', '#', '$', '%'];
  
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const number = Math.floor(Math.random() * 100).toString().padStart(2, '0');
  const specialChar = specialChars[Math.floor(Math.random() * specialChars.length)];
  
  return `${adjective}${noun}${number}${specialChar}`;
}

// Helper function to determine user role based on email
function determineUserRole(email: string): string {
  const adminEmails = [
    'michael@mypremierplans.com',
    'travis@mypremierplans.com',
    'richard@mypremierplans.com',
    'joaquin@mypremierplans.com'
  ];
  
  const agentEmails = [
    'mdkeener@gmail.com',
    'tmatheny77@gmail.com',
    'svillarreal@cyariskmanagement.com',
    'sarah.johnson@mypremierplans.com',
    'addsumbalance@gmail.com',
    'sean@sciahealthins.com',
    'penningtonfinancialservices@gmail.com'
  ];
  
  const lowerEmail = email.toLowerCase();
  
  if (adminEmails.some(e => e.toLowerCase() === lowerEmail)) {
    return 'admin';
  }
  
  if (agentEmails.some(e => e.toLowerCase() === lowerEmail)) {
    return 'agent';
  }
  
  return 'agent';
}

export default router;