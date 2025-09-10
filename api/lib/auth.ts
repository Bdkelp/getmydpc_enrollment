import { VercelRequest } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getUser } from './db';

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  agentNumber?: string;
  profileImageUrl?: string;
  isActive: boolean;
  approvalStatus: string;
}

/**
 * Verifies the Bearer token and returns the authenticated user
 * @param req - The Vercel request object
 * @returns The authenticated user or null if not authenticated
 */
export async function verifyAuth(req: VercelRequest): Promise<AuthUser | null> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    
    const token = authHeader.substring(7);
    
    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      console.error('Token verification failed:', error?.message || 'No user found');
      return null;
    }
    
    // Get user from our database
    const dbUser = await getUser(user.id);
    
    if (!dbUser) {
      return null;
    }
    
    // Check approval status
    if (dbUser.approvalStatus === 'pending' || dbUser.approvalStatus === 'rejected' || !dbUser.isActive) {
      return null;
    }
    
    return {
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      role: dbUser.role,
      agentNumber: dbUser.agentNumber,
      profileImageUrl: dbUser.profileImageUrl,
      isActive: dbUser.isActive,
      approvalStatus: dbUser.approvalStatus
    };
  } catch (error) {
    console.error('Auth verification error:', error);
    return null;
  }
}

/**
 * Middleware helper to require authentication
 * @param req - The Vercel request object
 * @param requiredRole - Optional required role for the user
 * @returns The authenticated user or throws an error
 */
export async function requireAuth(req: VercelRequest, requiredRole?: string): Promise<AuthUser> {
  const user = await verifyAuth(req);
  
  if (!user) {
    throw new Error('Unauthorized');
  }
  
  if (requiredRole && user.role !== requiredRole && user.role !== 'admin') {
    throw new Error('Forbidden');
  }
  
  return user;
}

/**
 * Determines user role based on email
 */
export function determineUserRole(email: string): "admin" | "agent" | "member" {
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

export { supabase };