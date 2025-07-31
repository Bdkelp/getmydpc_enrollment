import { createClient } from '@supabase/supabase-js';
import type { Express, RequestHandler } from "express";
import { storage } from "../storage";
import { determineUserRole } from "./authService";

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Middleware to verify JWT token from Supabase
export const verifySupabaseToken: RequestHandler = async (req: any, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('[verifySupabaseToken] No token provided');
      return res.status(401).json({ message: 'No token provided' });
    }
    
    const token = authHeader.substring(7);
    console.log('[verifySupabaseToken] Verifying token:', token.substring(0, 20) + '...');
    
    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      console.log('[verifySupabaseToken] Token verification failed:', error);
      return res.status(401).json({ message: 'Invalid token' });
    }
    
    console.log('[verifySupabaseToken] Supabase user verified:', { id: user.id, email: user.email });
    
    // Pass the Supabase user data directly to the /api/auth/user endpoint
    // The endpoint will handle database syncing
    req.user = user;
    next();
  } catch (error) {
    console.error('[verifySupabaseToken] Token verification error:', error);
    res.status(401).json({ message: 'Token verification failed' });
  }
};

// Helper function to sync user data from Supabase to our database
export async function syncSupabaseUser(supabaseUser: any) {
  try {
    let dbUser = await storage.getUserByEmail(supabaseUser.email);
    
    if (!dbUser) {
      const role = determineUserRole(supabaseUser.email);
      
      dbUser = await storage.createUser({
        id: supabaseUser.id,
        email: supabaseUser.email,
        firstName: supabaseUser.user_metadata?.first_name || supabaseUser.user_metadata?.full_name?.split(' ')[0] || '',
        lastName: supabaseUser.user_metadata?.last_name || supabaseUser.user_metadata?.full_name?.split(' ').slice(1).join(' ') || '',
        profileImageUrl: supabaseUser.user_metadata?.avatar_url,
        emailVerified: supabaseUser.email_confirmed_at !== null,
        emailVerifiedAt: supabaseUser.email_confirmed_at ? new Date(supabaseUser.email_confirmed_at) : null,
        role,
        // approvalStatus: role === 'admin' ? 'approved' : 'pending', // TODO: Add if approval system needed
        registrationIp: supabaseUser.last_sign_in_at ? supabaseUser.ip_address : null,
        registrationUserAgent: supabaseUser.app_metadata?.provider || 'email',
        lastLoginAt: new Date()
      });
    } else {
      // Update existing user
      await storage.updateUserProfile(dbUser.id, {
        firstName: supabaseUser.user_metadata?.first_name || dbUser.firstName,
        lastName: supabaseUser.user_metadata?.last_name || dbUser.lastName,
        profileImageUrl: supabaseUser.user_metadata?.avatar_url || dbUser.profileImageUrl,
        emailVerified: supabaseUser.email_confirmed_at !== null,
        lastLoginAt: new Date()
      });
    }
    
    return dbUser;
  } catch (error) {
    console.error('Error syncing Supabase user:', error);
    throw error;
  }
}

// Setup Supabase auth routes
export function setupSupabaseAuth(app: Express) {
  // Get current user (for JWT authentication)
  app.get('/api/auth/user', verifySupabaseToken, async (req: any, res) => {
    try {
      console.log('[Supabase Auth] Fetching user data for:', req.user);
      
      // First check if user exists in our database
      let dbUser = await storage.getUser(req.user.id);
      console.log('[Supabase Auth] User from database:', dbUser);
      
      if (!dbUser) {
        console.log('[Supabase Auth] User not found in database, creating new user');
        
        // Determine role based on email domain
        let role = 'user'; // default role
        const email = req.user.email?.toLowerCase() || '';
        
        // Admin emails
        const adminEmails = [
          'michael@mypremierplans.com',
          'travis@mypremierplans.com', 
          'richard@mypremierplans.com',
          'joaquin@mypremierplans.com'
        ];
        
        // Agent emails
        const agentEmails = [
          'mdkeener@gmail.com',
          'tmatheny77@gmail.com',
          'svillarreal@cyariskmanagement.com'
        ];
        
        if (adminEmails.includes(email)) {
          role = 'admin';
        } else if (agentEmails.includes(email)) {
          role = 'agent';
        }
        
        console.log('[Supabase Auth] Creating user with role:', role);
        
        // Create the user
        const fullName = req.user.user_metadata?.name || req.user.user_metadata?.full_name || req.user.email?.split('@')[0] || 'User';
        const nameParts = fullName.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        
        dbUser = await storage.createUser({
          id: req.user.id,
          email: req.user.email,
          firstName,
          lastName,
          role,
          approvalStatus: (role === 'admin' || role === 'agent') ? 'approved' : 'pending' // Auto-approve admins and agents
        });
        
        console.log('[Supabase Auth] Created new user:', dbUser);
      }
      
      // Auto-approve admin and agent users if not already approved
      if (dbUser && (dbUser.role === 'admin' || dbUser.role === 'agent') && dbUser.approvalStatus !== 'approved') {
        console.log('[Supabase Auth] Auto-approving admin/agent user');
        await storage.updateUser(dbUser.id, { approvalStatus: 'approved' });
        dbUser = await storage.getUser(dbUser.id);
      }
      
      // Get user's current subscription and plan
      const subscription = await storage.getUserSubscription(dbUser.id);
      let plan = null;
      if (subscription) {
        plan = await storage.getPlan(subscription.planId);
      }
      
      // Return the database user with auth metadata
      const enrichedUser = {
        ...dbUser,
        email: req.user.email, // Use email from JWT
        metadata: req.user.user_metadata,
        subscription,
        plan
      };
      
      console.log('[Supabase Auth] Returning enriched user:', enrichedUser);
      res.json(enrichedUser);
    } catch (error) {
      console.error("[Supabase Auth] Error fetching user:", error);
      console.error("[Supabase Auth] Error stack:", error.stack);
      console.error("[Supabase Auth] Request user:", req.user);
      res.status(500).json({ message: "Failed to fetch user data", error: error.message });
    }
  });

  // Webhook endpoint for Supabase auth events
  app.post('/api/auth/webhook', async (req, res) => {
    try {
      const { type, record } = req.body;
      
      switch (type) {
        case 'INSERT':
          // New user signed up
          await syncSupabaseUser(record);
          break;
        case 'UPDATE':
          // User updated their profile
          await syncSupabaseUser(record);
          break;
        case 'DELETE':
          // User deleted their account
          if (record.email) {
            const user = await storage.getUserByEmail(record.email);
            if (user) {
              await storage.updateUser(user.id, { isActive: false });
            }
          }
          break;
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  // Logout endpoint
  app.post('/api/auth/logout', (req, res) => {
    res.json({ message: 'Logged out successfully' });
  });
}