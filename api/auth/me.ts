import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { users } from '../../shared/schema';
import { eq } from 'drizzle-orm';

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Initialize database
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const sql = neon(DATABASE_URL);
const db = drizzle(sql);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get authorization token
    const authHeader = req.headers.authorization;
    console.log('[Auth/Me] Request with auth header:', authHeader ? 'present' : 'missing');

    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }

    const token = authHeader.split(' ')[1];

    // Verify token with Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.log('[Auth/Me] Token validation failed:', authError?.message);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    console.log('[Auth/Me] Authenticated user:', user.id);

    // Get user data from database
    const [userData] = await db
      .select()
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!userData) {
      console.log('[Auth/Me] User not found in database:', user.id);
      return res.status(404).json({ error: 'User not found' });
    }

    // Check approval status
    if (userData.approvalStatus === 'pending') {
      return res.status(403).json({ 
        error: 'Account pending approval',
        requiresApproval: true 
      });
    }

    if (userData.approvalStatus === 'rejected') {
      return res.status(403).json({ 
        error: 'Account access denied' 
      });
    }

    console.log('[Auth/Me] Returning user data for:', userData.email);

    // Return user data (without sensitive fields)
    const { password, ...safeUserData } = userData;
    return res.status(200).json({ 
      user: safeUserData,
      session: {
        access_token: token,
        user: {
          id: user.id,
          email: user.email,
          user_metadata: user.user_metadata
        }
      }
    });

  } catch (error: any) {
    console.error('[Auth/Me] Error:', error);
    return res.status(500).json({ 
      error: 'Authentication failed',
      message: error.message 
    });
  }
}