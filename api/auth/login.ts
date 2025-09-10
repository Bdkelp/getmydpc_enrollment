import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase, determineUserRole } from '../lib/auth';
import { getUserByEmail, createUser, updateUser, createLoginSession } from '../lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }
  
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
      console.error('Login error:', error);
      return res.status(401).json({ message: error.message || 'Invalid credentials' });
    }

    if (!data.session) {
      return res.status(401).json({ message: 'Failed to create session' });
    }

    // Get or create user in our database
    console.log('[Login] Checking for existing user:', email);
    let user = await getUserByEmail(email);

    if (!user) {
      console.log('[Login] User not found, creating new user');
      const userRole = determineUserRole(data.user.email!);
      console.log('[Login] Determined role for', email, ':', userRole);

      // Create user in our database if they don't exist
      user = await createUser({
        id: data.user.id,
        email: data.user.email!,
        firstName: data.user.user_metadata?.firstName || data.user.user_metadata?.first_name || 'User',
        lastName: data.user.user_metadata?.lastName || data.user.user_metadata?.last_name || '',
        emailVerified: data.user.email_confirmed_at ? true : false,
        role: userRole,
        isActive: true,
        approvalStatus: 'approved',
        createdAt: new Date(),
        updatedAt: new Date()
      });

      console.log('[Login] Created new user:', {
        id: user.id,
        email: user.email,
        role: user.role,
        approvalStatus: user.approvalStatus
      });
    } else {
      console.log('[Login] Found existing user:', {
        id: user.id,
        email: user.email,
        role: user.role,
        approvalStatus: user.approvalStatus
      });
    }

    // Update last login
    await updateUser(user.id, {
      lastLoginAt: new Date()
    });

    // Create login session record
    try {
      const userAgent = req.headers['user-agent'] || '';
      const ipAddress = req.headers['x-forwarded-for'] as string || req.headers['x-real-ip'] as string || 'unknown';

      // Parse user agent for device/browser info
      let deviceType = 'desktop';
      let browser = 'unknown';

      if (userAgent.includes('Mobile')) deviceType = 'mobile';
      else if (userAgent.includes('Tablet')) deviceType = 'tablet';

      if (userAgent.includes('Chrome')) browser = 'Chrome';
      else if (userAgent.includes('Firefox')) browser = 'Firefox';
      else if (userAgent.includes('Safari')) browser = 'Safari';
      else if (userAgent.includes('Edge')) browser = 'Edge';

      await createLoginSession({
        userId: user.id,
        ipAddress: ipAddress,
        userAgent: userAgent,
        deviceType: deviceType,
        browser: browser
      });

      console.log('[Login] Session tracked for user:', user.email);
    } catch (error) {
      console.error('[Login] Error tracking session:', error);
      // Don't fail login if session tracking fails
    }

    console.log('[Login] Login successful for user:', user.email);

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        agentNumber: user.agentNumber,
        profileImageUrl: user.profileImageUrl,
        isActive: user.isActive,
        approvalStatus: user.approvalStatus
      },
      session: data.session
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Login failed' });
  }
}