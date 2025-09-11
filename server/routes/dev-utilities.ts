import { Router } from 'express';
import { supabase } from '../lib/supabaseClient';
import { storage } from '../storage';
import bcrypt from 'bcryptjs';

const router = Router();

// Middleware to check if we're in development mode
const requireDevelopmentMode = (req: any, res: any, next: any) => {
  // Allow in development or if explicitly enabled
  const isDev = process.env.NODE_ENV === 'development' || 
                process.env.ALLOW_DEV_UTILITIES === 'true' ||
                process.env.REPL_SLUG === 'enrollment-getmydpc-com';
  
  if (!isDev) {
    return res.status(403).json({ 
      message: 'This endpoint is only available in development mode' 
    });
  }
  next();
};

// Create test accounts endpoint
router.post('/api/dev/create-test-accounts', requireDevelopmentMode, async (req, res) => {
  try {
    console.log('[Dev Utilities] Creating test accounts...');
    
    const testAccounts = [
      {
        email: 'test@mypremierplans.com',
        password: 'Test123!@#',
        firstName: 'Test',
        lastName: 'Admin',
        role: 'admin'
      },
      {
        email: 'agent@mypremierplans.com',
        password: 'Agent123!@#',
        firstName: 'Test',
        lastName: 'Agent',
        role: 'agent'
      },
      {
        email: 'user@mypremierplans.com',
        password: 'User123!@#',
        firstName: 'Test',
        lastName: 'User',
        role: 'user'
      }
    ];
    
    const createdAccounts = [];
    
    for (const account of testAccounts) {
      try {
        // Check if user already exists
        const existingUser = await storage.getUserByEmail(account.email);
        
        if (existingUser) {
          console.log(`[Dev Utilities] User ${account.email} already exists, updating password...`);
          
          // Update password in Supabase
          const { data: updateData, error: updateError } = await supabase.auth.admin.updateUserById(
            existingUser.id,
            { password: account.password }
          );
          
          if (updateError) {
            console.error(`[Dev Utilities] Error updating password for ${account.email}:`, updateError);
            continue;
          }
          
          // Update user status in database
          await storage.updateUser(existingUser.id, {
            role: account.role,
            isActive: true,
            approval_status: 'approved',
            email_verified: true
          } as any);
          
          createdAccounts.push({
            email: account.email,
            password: account.password,
            role: account.role,
            status: 'updated'
          });
        } else {
          // Create new user in Supabase
          const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: account.email,
            password: account.password,
            email_confirm: true,
            user_metadata: {
              firstName: account.firstName,
              lastName: account.lastName
            }
          });
          
          if (authError) {
            console.error(`[Dev Utilities] Error creating auth for ${account.email}:`, authError);
            continue;
          }
          
          if (authData.user) {
            // Create user in our database
            await storage.createUser({
              id: authData.user.id,
              email: account.email,
              first_name: account.firstName,
              last_name: account.lastName,
              email_verified: true,
              role: account.role,
              is_active: true,
              approval_status: 'approved',
              created_at: new Date(),
              updated_at: new Date()
            } as any);
            
            createdAccounts.push({
              email: account.email,
              password: account.password,
              role: account.role,
              status: 'created'
            });
          }
        }
      } catch (error: any) {
        console.error(`[Dev Utilities] Error processing ${account.email}:`, error);
      }
    }
    
    res.json({
      success: true,
      message: 'Test accounts processed',
      accounts: createdAccounts
    });
  } catch (error: any) {
    console.error('[Dev Utilities] Error creating test accounts:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to create test accounts',
      error: error.message 
    });
  }
});

// Direct password reset endpoint (development only)
router.post('/api/auth/reset-password-direct', requireDevelopmentMode, async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    
    if (!email || !newPassword) {
      return res.status(400).json({ 
        message: 'Email and new password are required' 
      });
    }
    
    console.log(`[Dev Utilities] Resetting password for ${email}...`);
    
    // Get user from database
    const user = await storage.getUserByEmail(email);
    
    if (!user) {
      return res.status(404).json({ 
        message: 'User not found' 
      });
    }
    
    // Update password in Supabase
    const { data, error } = await supabase.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    );
    
    if (error) {
      console.error('[Dev Utilities] Error resetting password:', error);
      return res.status(500).json({ 
        message: 'Failed to reset password',
        error: error.message 
      });
    }
    
    // Ensure user is active and approved
    await storage.updateUser(user.id, {
      is_active: true,
      approval_status: 'approved',
      email_verified: true,
      updated_at: new Date()
    } as any);
    
    console.log(`[Dev Utilities] Password reset successful for ${email}`);
    
    res.json({
      success: true,
      message: `Password reset successful for ${email}`,
      email: email
    });
  } catch (error: any) {
    console.error('[Dev Utilities] Error resetting password:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to reset password',
      error: error.message 
    });
  }
});

// Development setup endpoint - combines multiple utilities
router.post('/api/dev/setup', requireDevelopmentMode, async (req, res) => {
  try {
    console.log('[Dev Utilities] Running development setup...');
    
    const results: any = {
      testAccounts: [],
      adminPasswordReset: null,
      databaseStatus: null
    };
    
    // Step 1: Create test accounts
    const testAccounts = [
      {
        email: 'test@mypremierplans.com',
        password: 'Test123!@#',
        firstName: 'Test',
        lastName: 'Admin',
        role: 'admin'
      },
      {
        email: 'michael@mypremierplans.com',
        password: 'Admin123!@#',
        firstName: 'Michael',
        lastName: 'Keener',
        role: 'admin'
      }
    ];
    
    for (const account of testAccounts) {
      try {
        const existingUser = await storage.getUserByEmail(account.email);
        
        if (existingUser) {
          // Update existing user
          const { error } = await supabase.auth.admin.updateUserById(
            existingUser.id,
            { password: account.password }
          );
          
          if (!error) {
            await storage.updateUser(existingUser.id, {
              role: account.role,
              is_active: true,
              approval_status: 'approved',
              email_verified: true
            } as any);
            
            results.testAccounts.push({
              email: account.email,
              password: account.password,
              role: account.role,
              status: 'updated'
            });
          }
        } else {
          // Create new user
          const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: account.email,
            password: account.password,
            email_confirm: true,
            user_metadata: {
              firstName: account.firstName,
              lastName: account.lastName
            }
          });
          
          if (!authError && authData.user) {
            await storage.createUser({
              id: authData.user.id,
              email: account.email,
              first_name: account.firstName,
              last_name: account.lastName,
              email_verified: true,
              role: account.role,
              is_active: true,
              approval_status: 'approved',
              created_at: new Date(),
              updated_at: new Date()
            } as any);
            
            results.testAccounts.push({
              email: account.email,
              password: account.password,
              role: account.role,
              status: 'created'
            });
          }
        }
      } catch (error: any) {
        console.error(`[Dev Utilities] Error processing ${account.email}:`, error);
      }
    }
    
    // Step 2: Test database connection
    try {
      const users = await storage.getAllUsers();
      results.databaseStatus = {
        connected: true,
        userCount: users.length
      };
    } catch (error: any) {
      results.databaseStatus = {
        connected: false,
        error: error.message
      };
    }
    
    res.json({
      success: true,
      message: 'Development setup complete',
      results,
      instructions: {
        testLogin: 'Use test@mypremierplans.com with password Test123!@#',
        adminLogin: 'Use michael@mypremierplans.com with password Admin123!@#',
        resetPassword: 'POST to /api/auth/reset-password-direct with {email, newPassword}'
      }
    });
  } catch (error: any) {
    console.error('[Dev Utilities] Setup error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Setup failed',
      error: error.message 
    });
  }
});

// Get user info endpoint (for debugging)
router.get('/api/dev/user/:email', requireDevelopmentMode, async (req, res) => {
  try {
    const { email } = req.params;
    
    const user = await storage.getUserByEmail(email);
    
    if (!user) {
      return res.status(404).json({ 
        message: 'User not found' 
      });
    }
    
    // Get Supabase auth user
    const { data: authUsers, error } = await supabase.auth.admin.listUsers();
    
    const authUser = authUsers?.users?.find(u => u.email === email);
    
    res.json({
      databaseUser: user,
      authUser: authUser ? {
        id: authUser.id,
        email: authUser.email,
        emailConfirmed: authUser.email_confirmed_at ? true : false,
        createdAt: authUser.created_at,
        lastSignIn: authUser.last_sign_in_at
      } : null
    });
  } catch (error: any) {
    console.error('[Dev Utilities] Error fetching user:', error);
    res.status(500).json({ 
      message: 'Failed to fetch user',
      error: error.message 
    });
  }
});

// List all users endpoint (for debugging)
router.get('/api/dev/users', requireDevelopmentMode, async (req, res) => {
  try {
    const users = await storage.getAllUsers();
    
    res.json({
      totalUsers: users.length,
      users: users.map(u => ({
        id: u.id,
        email: u.email,
        name: `${u.firstName} ${u.lastName}`,
        role: u.role,
        approvalStatus: u.approvalStatus,
        isActive: u.isActive,
        createdAt: u.createdAt
      }))
    });
  } catch (error: any) {
    console.error('[Dev Utilities] Error fetching users:', error);
    res.status(500).json({ 
      message: 'Failed to fetch users',
      error: error.message 
    });
  }
});

export default router;