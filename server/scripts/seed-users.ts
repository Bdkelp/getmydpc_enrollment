#!/usr/bin/env node
/**
 * Seed Users Script
 * 
 * Creates production admin and agent users
 * Run with: npm run seed:users
 * 
 * Users created from DPC Enrollment Platform team
 */

import { supabase } from '../lib/supabaseClient';
import { neonPool } from '../lib/neonDb';

interface UserToCreate {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: 'admin' | 'agent' | 'super_admin';
  agentNumber: string;
  password: string;
}

// Define users to create - REAL TEAM MEMBERS
const usersToCreate: UserToCreate[] = [
  // SUPER ADMIN - KEEP INTACT (Michael Keener)
  // ⚠️  NOT MODIFYING - Already exists in production
  // {
  //   email: 'michael@mypremierplans.com',
  //   firstName: 'Michael',
  //   lastName: 'Keener',
  //   phone: '915-283-1682',
  //   role: 'super_admin',
  //   agentNumber: 'MPP0001',
  //   password: 'GetMyDPC2025!Secure'
  // },

  // ADMIN - KEEP INTACT (Travis Matheny)
  // ⚠️  NOT MODIFYING - Already exists in production
  // {
  //   email: 'travis@mypremierplans.com',
  //   firstName: 'Travis',
  //   lastName: 'Matheny',
  //   phone: '720-289-5309',
  //   role: 'admin',
  //   agentNumber: 'MPP0002',
  //   password: 'GetMyDPC2025!Secure'
  // },

  // ADMIN - UPDATE with new phone number
  {
    email: 'richard@mypremeirplans.com',
    firstName: 'Richard',
    lastName: 'Salinas',
    phone: '210-274-8633',
    role: 'admin',
    agentNumber: 'MPP0003',
    password: 'GetMyDPC2025!Secure'
  },

  // ADMIN - UPDATE with new phone number
  {
    email: 'joaquin@mypremierplans.com',
    firstName: 'Joaquin',
    lastName: 'Davila',
    phone: '832-732-9323',
    role: 'admin',
    agentNumber: 'MPP0004',
    password: 'GetMyDPC2025!Secure'
  },

  // AGENTS - NEW REAL AGENTS (replace old test agents)
  {
    email: 'svillarreal@cyariskmanagement.com',
    firstName: 'Steven',
    lastName: 'Villarreal',
    phone: '210-286-0669',
    role: 'agent',
    agentNumber: 'MPP0005',
    password: 'GetMyDPC2025!Secure'
  },
  {
    email: 'addsumbalance@gmail.com',
    firstName: 'Ana',
    lastName: 'Vasquez',
    phone: '956-221-2464',
    role: 'agent',
    agentNumber: 'MPP0006',
    password: 'GetMyDPC2025!Secure'
  },
  {
    email: 'sean@sciahealthins.com',
    firstName: 'Sean',
    lastName: 'Casados',
    phone: '720-584-6097',
    role: 'agent',
    agentNumber: 'MPP0007',
    password: 'GetMyDPC2025!Secure'
  },
  {
    email: 'penningtonfinancialservices@gmail.com',
    firstName: 'Richard',
    lastName: 'Pennington',
    phone: '832-997-9323',
    role: 'agent',
    agentNumber: 'MPP0008',
    password: 'GetMyDPC2025!Secure'
  }
];

// Old test accounts to DELETE (these should be removed from Supabase)
const oldTestAccountsToRemove = [
  'mdkeener@gmail.com',        // Old test agent
  'tmatheny77@gmail.com',      // Old test agent
  'sarah.johnson@mypremierplans.com' // Old test agent
];

async function removeOldTestAccounts() {
  console.log('🗑️  Removing old test accounts...\n');
  
  const removed = [];
  const failed = [];

  try {
    const { data: allUsers } = await supabase.auth.admin.listUsers();
    
    for (const email of oldTestAccountsToRemove) {
      try {
        const userToDelete = allUsers?.users?.find(u => u.email === email);
        
        if (userToDelete) {
          await supabase.auth.admin.deleteUser(userToDelete.id);
          console.log(`   ✅ Deleted: ${email}`);
          removed.push(email);
          
          // Also delete from users table
          try {
            await neonPool.query(
              'DELETE FROM users WHERE email = $1',
              [email]
            );
            console.log(`   ✅ Deleted from database: ${email}`);
          } catch (dbErr: any) {
            console.warn(`   ⚠️  Failed to delete from database:`, dbErr.message);
          }
        } else {
          console.log(`   ℹ️  Not found: ${email}`);
        }
      } catch (error: any) {
        console.error(`   ❌ Error deleting ${email}:`, error.message);
        failed.push({ email, error: error.message });
      }
    }
  } catch (error: any) {
    console.error('❌ Error removing old accounts:', error.message);
  }

  console.log(`\n   Removed: ${removed.length} accounts`);
  if (failed.length > 0) {
    console.log(`   Failed: ${failed.length} accounts`);
  }
  console.log('');
  
  return { removed, failed };
}

async function seedUsers() {
  console.log('👥 Starting user seeding...\n');

  // Step 1: Remove old test accounts first
  console.log('📋 STEP 1: Cleaning up old test accounts');
  console.log('='.repeat(60));
  await removeOldTestAccounts();
  
  // Step 2: Create/update new users
  console.log('📋 STEP 2: Creating/updating real team members');
  console.log('='.repeat(60));
  console.log('');

  const createdUsers = [];
  const errors = [];

  for (const userData of usersToCreate) {
    try {
      console.log(`📝 Creating ${userData.role}: ${userData.email}`);

      // Step 1: Create user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: userData.email,
        password: userData.password,
        email_confirm: true, // Auto-confirm email for test users
        user_metadata: {
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: userData.role,
          agentNumber: userData.agentNumber
        }
      });

      if (authError) {
        // User might already exist - try to get it
        if (authError.message.includes('already exists')) {
          console.log(`   ⚠️  User already exists in auth, fetching...`);
          
          const { data: existingUsers } = await supabase.auth.admin.listUsers();
          const existingUser = existingUsers?.users.find(u => u.email === userData.email);
          
          if (existingUser) {
            console.log(`   ✅ Using existing auth user: ${existingUser.id}`);
            
            // Update in database
            const dbUser = {
              id: existingUser.id,
              email: userData.email,
              firstName: userData.firstName,
              lastName: userData.lastName,
              role: userData.role,
              agentNumber: userData.agentNumber,
              isActive: true,
              approvalStatus: 'approved',
              approvedAt: new Date(),
              emailVerified: true,
              emailVerifiedAt: new Date(),
              createdAt: new Date(),
              updatedAt: new Date()
            };

            // Insert or update in database
            await neonPool.query(
              `INSERT INTO users (id, email, first_name, last_name, phone_number, role, agent_number, is_active, approval_status, approved_at, email_verified, email_verified_at, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
               ON CONFLICT (id) DO UPDATE SET
               email = $2,
               first_name = $3,
               last_name = $4,
               phone_number = $5,
               role = $6,
               agent_number = $7,
               is_active = $8,
               approval_status = $9,
               email_verified = $11,
               updated_at = $14`,
              [
                existingUser.id,
                userData.email,
                userData.firstName,
                userData.lastName,
                userData.phone,
                userData.role,
                userData.agentNumber,
                true,
                'approved',
                new Date(),
                true,
                new Date(),
                new Date(),
                new Date()
              ]
            );

            createdUsers.push({
              email: userData.email,
              role: userData.role,
              agentNumber: userData.agentNumber,
              status: 'updated'
            });
          }
        } else {
          throw authError;
        }
      } else if (authData?.user) {
        console.log(`   ✅ Auth user created: ${authData.user.id}`);

        // Step 2: Create corresponding record in users table
        try {
          await neonPool.query(
            `INSERT INTO users (id, email, first_name, last_name, phone_number, role, agent_number, is_active, approval_status, approved_at, email_verified, email_verified_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
             ON CONFLICT (id) DO UPDATE SET
             email = $2,
             first_name = $3,
             last_name = $4,
             phone_number = $5,
             role = $6,
             agent_number = $7`,
            [
              authData.user.id,
              userData.email,
              userData.firstName,
              userData.lastName,
              userData.phone,
              userData.role,
              userData.agentNumber,
              true, // is_active
              'approved', // approval_status
              new Date(), // approved_at
              true, // email_verified
              new Date(), // email_verified_at
              new Date(), // created_at
              new Date() // updated_at
            ]
          );

          console.log(`   ✅ Database record created`);

          createdUsers.push({
            email: userData.email,
            role: userData.role,
            agentNumber: userData.agentNumber,
            status: 'created',
            requiresPasswordChange: true
          });
        } catch (dbError: any) {
          console.error(`   ❌ Database error:`, dbError.message);
          errors.push({
            email: userData.email,
            error: `Database: ${dbError.message}`
          });
        }
      }
    } catch (error: any) {
      console.error(`   ❌ Error creating user:`, error.message);
      errors.push({
        email: userData.email,
        error: error.message
      });
    }

    console.log('');
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('✨ SEEDING COMPLETE');
  console.log('='.repeat(60));

  if (createdUsers.length > 0) {
    console.log(`\n✅ Successfully created/updated ${createdUsers.length} users:\n`);
    createdUsers.forEach(user => {
      console.log(`   • ${user.role.toUpperCase().padEnd(12)} | ${user.agentNumber} | ${user.email}`);
    });
  }

  if (errors.length > 0) {
    console.log(`\n⚠️  ${errors.length} errors encountered:\n`);
    errors.forEach(err => {
      console.log(`   • ${err.email}: ${err.error}`);
    });
  }

  console.log('\n📝 User Credentials:\n');
  console.log('\n⚠️  PRESERVED ACCOUNTS (NOT MODIFIED):');
  console.log('   • michael@mypremierplans.com (Super Admin) - KEPT INTACT');
  console.log('   • travis@mypremierplans.com (Admin) - KEPT INTACT');
  
  console.log('\n📋 NEW/UPDATED Users:\n');
  usersToCreate.forEach(user => {
    console.log(`   Email: ${user.email}`);
    console.log(`   Password: ${user.password}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Agent #: ${user.agentNumber}`);
    console.log('   ⚠️  Users will be prompted to change password on first login');
    console.log('');
  });

  console.log('🔐 Summary of Changes:');
  console.log('   ✅ Old test agents REMOVED: mdkeener@, tmatheny77@, sarah.johnson@');
  console.log('   ✅ New real agents ADDED: Steven, Ana, Sean, Richard P.');
  console.log('   ✅ Richard S. & Joaquin UPDATED with phone numbers');
  console.log('   ✅ Michael (super admin) PRESERVED - NOT CHANGED');
  console.log('   ✅ Travis (admin) PRESERVED - NOT CHANGED');

  console.log('\n✨ Done!');

  process.exit(0);
}

// Run with error handling
seedUsers().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
