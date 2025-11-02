import { Router } from 'express';
import { supabase } from '../lib/supabaseClient';
import { storage } from '../storage';

const router = Router();

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
    const { email, password, firstName, lastName } = req.body;
    
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ 
        message: 'Email, password, first name, and last name are required' 
      });
    }
    
    // Sign up with Supabase
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
      return res.status(400).json({ message: error.message });
    }
    
    if (!data.user) {
      return res.status(400).json({ message: 'Registration failed' });
    }
    
    // Create user in our database
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
    
    res.json({
      message: 'Registration successful',
      user: data.user,
      session: data.session
    });
  } catch (error: any) {
    console.error('[Register] Error:', error);
    res.status(500).json({ message: 'Registration failed' });
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