import { supabase } from '../lib/supabaseClient';
import { storage } from '../storage';

async function setupAdminAccount() {
  const email = 'michael@mypremierplans.com';
  const temporaryPassword = 'TempAdmin2025!'; // User will need to reset this
  
  try {
    console.log('Setting up admin account for:', email);
    
    // First, check if user exists
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;
    
    const existingUser = users.users.find(u => u.email === email);
    
    if (existingUser) {
      console.log('Auth user already exists, updating password...');
      
      // Update password and confirm email
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        existingUser.id,
        { 
          password: temporaryPassword,
          email_confirm: true,
          user_metadata: {
            firstName: 'Michael',
            lastName: 'Admin',
            role: 'admin'
          }
        }
      );
      
      if (updateError) {
        throw updateError;
      } else {
        console.log('✅ Updated existing auth user');
      }
    } else {
      console.log('Creating new auth user...');
      
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: {
          firstName: 'Michael',
          lastName: 'Admin',
          role: 'admin'
        }
      });
      
      if (authError) throw authError;
      console.log('✅ Created new auth user:', authData.user?.id);
    }
    
    // Update database user to ensure sync
    const dbUser = await storage.getUserByEmail(email);
    if (dbUser) {
      await storage.updateUser(dbUser.id, {
        emailVerified: true,
        role: 'admin',
        isActive: true,
        approvalStatus: 'approved'
      });
      console.log('Updated database user');
    }
    
    console.log('\n✅ Admin account setup complete!');
    console.log('Email:', email);
    console.log('Temporary Password:', temporaryPassword);
    console.log('\nIMPORTANT: Please change this password after first login!');
    
  } catch (error) {
    console.error('Error setting up admin account:', error);
  }
  
  process.exit(0);
}

setupAdminAccount();