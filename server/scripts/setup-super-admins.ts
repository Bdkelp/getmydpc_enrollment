
import { storage } from "../storage";
import { supabase } from "../lib/supabaseClient";

async function setupSuperAdmins() {
  const superAdminEmails = [
    'michael@mypremierplans.com',
    'travis@mypremierplans.com'
  ];

  console.log('🔐 Setting up super admin accounts...');

  for (const email of superAdminEmails) {
    try {
      console.log(`\n[Super Admin Setup] Processing: ${email}`);

      // Check if user exists in database
      let user = await storage.getUserByEmail(email);

      if (!user) {
        console.log(`[Super Admin Setup] User not found in database: ${email}`);
        
        // Check if user exists in Supabase Auth
        const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers();
        if (listError) {
          console.error(`[Super Admin Setup] Error listing auth users:`, listError);
          continue;
        }

        const authUser = authUsers.users.find(u => u.email === email);
        
        if (authUser) {
          console.log(`[Super Admin Setup] Found in Supabase Auth, creating database record`);
          
          // Create user in database with admin role
          user = await storage.createUser({
            id: authUser.id,
            email: authUser.email!,
            firstName: email === 'michael@mypremierplans.com' ? 'Michael' : 'Travis',
            lastName: 'Admin',
            emailVerified: true,
            role: 'admin',
            isActive: true,
            approvalStatus: 'approved',
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          console.log(`[Super Admin Setup] ✅ Created database user for ${email}`);
        } else {
          console.log(`[Super Admin Setup] User not found in Supabase Auth, creating...`);
          
          // Create in Supabase Auth first
          const temporaryPassword = `SuperAdmin${Date.now()}!`;
          const { data: newAuthUser, error: createError } = await supabase.auth.admin.createUser({
            email: email,
            password: temporaryPassword,
            email_confirm: true,
            user_metadata: {
              firstName: email === 'michael@mypremierplans.com' ? 'Michael' : 'Travis',
              lastName: 'Admin',
              role: 'admin'
            }
          });

          if (createError) {
            console.error(`[Super Admin Setup] Error creating auth user:`, createError);
            continue;
          }

          // Create in database
          user = await storage.createUser({
            id: newAuthUser.user!.id,
            email: newAuthUser.user!.email!,
            firstName: email === 'michael@mypremierplans.com' ? 'Michael' : 'Travis',
            lastName: 'Admin',
            emailVerified: true,
            role: 'admin',
            isActive: true,
            approvalStatus: 'approved',
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          console.log(`[Super Admin Setup] ✅ Created complete account for ${email}`);
          console.log(`[Super Admin Setup] Temporary password: ${temporaryPassword}`);
        }
      } else {
        console.log(`[Super Admin Setup] User exists, verifying admin privileges`);
      }

      // Ensure user has admin role and is active
      if (user.role !== 'admin' || !user.isActive || user.approvalStatus !== 'approved') {
        console.log(`[Super Admin Setup] Updating ${email} to admin status`);
        
        const updatedUser = await storage.updateUser(user.id, {
          role: 'admin',
          isActive: true,
          approvalStatus: 'approved',
          emailVerified: true,
          updatedAt: new Date(),
        });

        console.log(`[Super Admin Setup] ✅ Updated ${email} to admin status`);
      }

      // Verify final state
      const finalUser = await storage.getUserByEmail(email);
      if (finalUser) {
        console.log(`[Super Admin Setup] ✅ Final status for ${email}:`, {
          id: finalUser.id,
          role: finalUser.role,
          isActive: finalUser.isActive,
          approvalStatus: finalUser.approvalStatus,
          emailVerified: finalUser.emailVerified
        });
      }

    } catch (error) {
      console.error(`[Super Admin Setup] Error processing ${email}:`, error);
    }
  }

  console.log('\n🎉 Super admin setup completed!');
  console.log('\nBoth Michael and Travis now have super admin access.');
  console.log('\nThey can access:');
  console.log('- Full admin dashboard');
  console.log('- User role management');
  console.log('- Agent number assignment');
  console.log('- Complete system oversight');
  console.log('- All agent functionality');
}

// Run the setup
setupSuperAdmins().then(() => {
  console.log('[Super Admin Setup] Script completed successfully');
  process.exit(0);
}).catch((error) => {
  console.error('[Super Admin Setup] Script failed:', error);
  process.exit(1);
});
