#!/usr/bin/env node
/**
 * Quick Check: Existing Users in Supabase
 * 
 * Run with: npm run check:users
 */

import { supabase } from '../lib/supabaseClient';

const targetEmails = [
  'michael@mypremierplans.com',
  'travis@mypremierplans.com',
  'richard@mypremeirplans.com',
  'joaquin@mypremierplans.com',
  'svillarreal@cyariskmanagement.com',
  'addsumbalance@gmail.com',
  'sean@sciahealthins.com',
  'penningtonfinancialservices@gmail.com'
];

async function checkUsers() {
  console.log('🔍 Checking Supabase for existing users...\n');
  
  try {
    // Get all auth users from Supabase
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      console.error('❌ Error fetching auth users:', authError.message);
      process.exit(1);
    }

    // Get all database users
    const { data: dbUsers, error: dbError } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, role, agent_number')
      .in('email', targetEmails);

    if (dbError) {
      console.error('❌ Error querying users table:', dbError.message);
      process.exit(1);
    }

    console.log('📊 RESULTS:\n');
    
    let foundCount = 0;
    let missingCount = 0;

    targetEmails.forEach(email => {
      const inAuth = authUsers?.users?.some((u: any) => u.email === email);
      const inDb = dbUsers?.some((u: any) => u.email === email);
      const dbUser = dbUsers?.find((u: any) => u.email === email);

      if (inAuth || inDb) {
        foundCount++;
        console.log(`✅ ${email}`);
        if (inAuth) console.log(`   └─ Supabase Auth: YES`);
        if (inDb) console.log(`   └─ Database: YES (${dbUser?.first_name} ${dbUser?.last_name}, Role: ${dbUser?.role})`);
      } else {
        missingCount++;
        console.log(`❌ ${email} - NOT FOUND`);
      }
      console.log('');
    });

    console.log('='.repeat(60));
    console.log(`Found: ${foundCount}/8 users`);
    console.log(`Missing: ${missingCount}/8 users`);
    console.log('='.repeat(60));

    if (missingCount > 0) {
      console.log(`\n💡 Ready to create the ${missingCount} missing users with seed-users.ts`);
    } else {
      console.log(`\n✅ All 8 users already exist!`);
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkUsers();
