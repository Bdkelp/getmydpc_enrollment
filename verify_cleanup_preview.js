
#!/usr/bin/env node

// Cleanup Preview Script - Supabase Version
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase configuration');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function previewCleanup() {
  try {
    console.log('🔍 PRODUCTION CLEANUP PREVIEW');
    console.log('=====================================\n');

    const keepEmails = [
      'michael@mypremierplans.com',
      'travis@mypremierplans.com',
      'richard@mypremierplans.com', 
      'joaquin@mypremierplans.com',
      'mdkeener@gmail.com'
    ];

    // Check which users will be kept
    const { data: usersToKeep } = await supabase
      .from('users')
      .select('email, role')
      .in('email', keepEmails);

    // Count users that will be removed
    const { count: totalUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    const { count: usersToRemove } = await supabase
      .from('users')  
      .select('*', { count: 'exact', head: true })
      .not('email', 'in', `(${keepEmails.map(e => `"${e}"`).join(',')})`);

    console.log('👥 User Account Changes:');
    console.log('   ✅ WILL KEEP (Admin/Agent accounts):');
    (usersToKeep || []).forEach(user => {
      console.log(`      - ${user.email} (${user.role})`);
    });
    console.log(`   ❌ WILL REMOVE: ${usersToRemove || 0} test member accounts`);

    console.log('\n📋 What will be PRESERVED:');
    console.log('   ✅ All leads and lead activities');
    console.log('   ✅ Admin and agent user accounts');
    console.log('   ✅ Database structure and plans');

    console.log('\n🗑️  What will be REMOVED:');
    console.log('   ❌ All test member enrollments');
    console.log('   ❌ All subscriptions and payments');
    console.log('   ❌ All family members');
    console.log('   ❌ All commissions');
    console.log('   ❌ All enrollment modifications');
    console.log('   ❌ All user sessions');

    console.log('\n⚠️  Ready to run production cleanup? Use: node clear_production_prep.js');

  } catch (error) {
    console.error('❌ Error during verification:', error);
    process.exit(1);
  }
}

previewCleanup();
