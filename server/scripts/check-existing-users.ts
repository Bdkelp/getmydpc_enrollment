#!/usr/bin/env node
/**
 * Check Existing Users Script
 * 
 * Queries Supabase Auth and PostgreSQL to see which users already exist
 * Run with: npx tsx server/scripts/check-existing-users.ts
 */

import { supabase } from '../lib/supabaseClient';
import { neonPool } from '../lib/neonDb';

// Users we want to create
const targetUsers = [
  { email: 'michael@mypremierplans.com', name: 'Michael Keener', role: 'super_admin' },
  { email: 'travis@mypremierplans.com', name: 'Travis Matheny', role: 'admin' },
  { email: 'richard@mypremeirplans.com', name: 'Richard Salinas', role: 'admin' },
  { email: 'joaquin@mypremierplans.com', name: 'Joaquin Davila', role: 'admin' },
  { email: 'svillarreal@cyariskmanagement.com', name: 'Steven Villarreal', role: 'agent' },
  { email: 'addsumbalance@gmail.com', name: 'Ana Vasquez', role: 'agent' },
  { email: 'sean@sciahealthins.com', name: 'Sean Casados', role: 'agent' },
  { email: 'penningtonfinancialservices@gmail.com', name: 'Richard Pennington', role: 'agent' }
];

async function checkUsers() {
  console.log('🔍 Checking existing users...\n');
  
  const existsInAuth: any[] = [];
  const existsInDb: any[] = [];
  const missingInAuth: any[] = [];
  const missingInDb: any[] = [];
  const completelyMissing: any[] = [];

  for (const user of targetUsers) {
    try {
      // Check Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.admin.listUsers();
      const authUser = authData?.users?.find((u: any) => u.email === user.email);
      
      // Check PostgreSQL
      let dbUser = null;
      try {
        const result = await neonPool.query(
          'SELECT id, email, first_name, last_name, role FROM users WHERE email = $1',
          [user.email]
        );
        dbUser = result.rows[0] || null;
      } catch (err: any) {
        console.error(`   DB query error for ${user.email}:`, err.message);
      }

      // Determine status
      if (authUser && dbUser) {
        console.log(`✅ ${user.email} (${user.name})`);
        console.log(`   ├─ Supabase Auth: YES (ID: ${authUser.id})`);
        console.log(`   └─ PostgreSQL: YES (Role: ${dbUser.role})\n`);
        existsInAuth.push(user);
        existsInDb.push(user);
      } else if (authUser && !dbUser) {
        console.log(`⚠️  ${user.email} (${user.name})`);
        console.log(`   ├─ Supabase Auth: YES (ID: ${authUser.id})`);
        console.log(`   └─ PostgreSQL: NO ❌\n`);
        existsInAuth.push(user);
        missingInDb.push(user);
      } else if (!authUser && dbUser) {
        console.log(`⚠️  ${user.email} (${user.name})`);
        console.log(`   ├─ Supabase Auth: NO ❌`);
        console.log(`   └─ PostgreSQL: YES (Role: ${dbUser.role})\n`);
        missingInAuth.push(user);
        existsInDb.push(user);
      } else {
        console.log(`❌ ${user.email} (${user.name})`);
        console.log(`   ├─ Supabase Auth: NO`);
        console.log(`   └─ PostgreSQL: NO\n`);
        completelyMissing.push(user);
      }
    } catch (error: any) {
      console.error(`❌ Error checking ${user.email}:`, error.message);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  
  console.log(`\n✅ Both Supabase & DB: ${existsInAuth.length} users`);
  if (existsInAuth.length > 0) {
    existsInAuth.forEach(u => {
      console.log(`   • ${u.email}`);
    });
  }

  console.log(`\n⚠️  In Supabase only (missing from PostgreSQL): ${missingInDb.length} users`);
  if (missingInDb.length > 0) {
    missingInDb.forEach(u => {
      console.log(`   • ${u.email}`);
    });
  }

  console.log(`\n⚠️  In PostgreSQL only (missing from Supabase): ${missingInAuth.length} users`);
  if (missingInAuth.length > 0) {
    missingInAuth.forEach(u => {
      console.log(`   • ${u.email}`);
    });
  }

  console.log(`\n❌ Completely missing: ${completelyMissing.length} users`);
  if (completelyMissing.length > 0) {
    completelyMissing.forEach(u => {
      console.log(`   • ${u.email}`);
    });
  }

  console.log('\n💡 Next steps:');
  if (missingInDb.length > 0 || missingInAuth.length > 0) {
    console.log(`   • ${missingInDb.length} users need PostgreSQL records`);
    console.log(`   • ${missingInAuth.length} users need Supabase Auth records`);
  }
  if (completelyMissing.length > 0) {
    console.log(`   • ${completelyMissing.length} users need to be created completely`);
  }
  if (completelyMissing.length === 0 && missingInDb.length === 0 && missingInAuth.length === 0) {
    console.log(`   ✅ All 8 users are fully configured!`);
  }

  console.log('\n✨ Done!\n');
}

// Run
checkUsers().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
