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
      return res.status(401).json({ message: 'No token provided' });
    }
    
    const token = authHeader.substring(7);
    
    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    
    // Get or create user in our database
    let dbUser = await storage.getUserByEmail(user.email!);
    
    if (!dbUser) {
      // Create new user with role assignment
      const role = determineUserRole(user.email!);
      
      dbUser = await storage.createUser({
        id: user.id,
        email: user.email!,
        firstName: user.user_metadata?.first_name || user.user_metadata?.full_name?.split(' ')[0] || '',
        lastName: user.user_metadata?.last_name || user.user_metadata?.full_name?.split(' ').slice(1).join(' ') || '',
        profileImageUrl: user.user_metadata?.avatar_url,
        emailVerified: user.email_confirmed_at !== null,
        role,
        lastLoginAt: new Date()
      });
    } else {
      // Update last login
      await storage.updateUser(dbUser.id, { lastLoginAt: new Date() });
    }
    
    req.user = dbUser;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
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
        role,
        lastLoginAt: new Date()
      });
    } else {
      // Update existing user
      await storage.updateUser(dbUser.id, {
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
      const user = req.user;
      
      // Get user's current subscription and plan
      const subscription = await storage.getUserSubscription(user.id);
      let plan = null;
      if (subscription) {
        plan = await storage.getPlan(subscription.planId);
      }
      
      res.json({ ...user, subscription, plan });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
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