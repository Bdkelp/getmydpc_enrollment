import { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { supabase } from '../lib/supabaseClient';

export interface AuthRequest extends Request {
  user?: any;
  token?: string;
}

export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    // Verify the JWT token with Supabase
    // Create a new Supabase client with the token for this request
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
    
    const supabaseWithToken = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });

    // Now get the user with this authenticated client
    const { data: { user }, error } = await supabaseWithToken.auth.getUser();

    if (error || !user) {
      console.error('Token verification failed:', error?.message || 'No user found');
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Try to get user from our database
    let dbUser = await storage.getUserByEmail(user.email!);

    if (!dbUser) {
      // Create user in our database if they don't exist
      console.log('Creating new user in database:', user.email);

      dbUser = await storage.createUser({
        id: user.id,
        email: user.email!,
        firstName: user.user_metadata?.firstName || user.user_metadata?.first_name || 'User',
        lastName: user.user_metadata?.lastName || user.user_metadata?.last_name || '',
        emailVerified: user.email_confirmed_at ? true : false,
        role: determineUserRole(user.email!),
        isActive: true,
        approvalStatus: 'approved',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    // Check if user needs approval
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

    req.user = dbUser;
    req.token = token;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ message: 'Authentication failed' });
  }
};

function determineUserRole(email: string): "admin" | "agent" | "member" {
  const adminEmails = [
    'michael@mypremierplans.com',
    'travis@mypremierplans.com', 
    'richard@mypremierplans.com',
    'joaquin@mypremierplans.com'
  ];

  const agentEmails = [
    'mdkeener@gmail.com',
    'tmatheny77@gmail.com',
    'svillarreal@cyariskmanagement.com'
  ];

  if (adminEmails.includes(email)) return "admin";
  if (agentEmails.includes(email)) return "agent";
  return "member";
}

