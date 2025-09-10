import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../lib/auth';
import { createUser } from '../lib/db';

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
          lastName
        }
      }
    });

    if (error) {
      console.error('Registration error:', error);
      return res.status(400).json({ message: error.message || 'Registration failed' });
    }

    if (!data.user) {
      return res.status(400).json({ message: 'Failed to create user' });
    }

    // Create user in our database
    const user = await createUser({
      id: data.user.id,
      email: data.user.email!,
      firstName: firstName || 'User',
      lastName: lastName || '',
      emailVerified: false,
      role: 'member',
      isActive: true,
      approvalStatus: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    return res.status(200).json({
      message: 'Registration successful. Please check your email to verify your account.',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      }
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    return res.status(500).json({ message: 'Registration failed' });
  }
}