import { Router } from 'express';
import { supabase } from '../lib/supabaseClient';
import { storage } from '../storage';
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
    'sarah.johnson@mypremierplans.com'
  ];
  
  const lowerEmail = email.toLowerCase();
  
  if (adminEmails.some(e => e.toLowerCase() === lowerEmail)) {
    return 'admin';
  }
  
  if (agentEmails.some(e => e.toLowerCase() === lowerEmail)) {
    return 'agent';
  }
  
  return 'user';
}

export default router;