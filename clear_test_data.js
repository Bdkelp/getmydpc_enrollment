
#!/usr/bin/env node

// Test Data Cleanup Script - Supabase Version
const { createClient } = require('@supabase/supabase-js');
const { readFileSync } = require('fs');
const { join } = require('path');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase configuration');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function clearTestData() {
  try {
    console.log('🧹 Starting test data cleanup...');
    
    // Execute cleanup operations using Supabase client
    const tables = [
      'family_members',
      'commissions', 
      'payments',
      'subscriptions',
      'enrollment_modifications',
      'lead_activities'
    ];

    for (const table of tables) {
      console.log(`Clearing ${table}...`);
      await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }

    // Clear test users (preserve admins/agents)
    console.log('Clearing test users...');
    const preserveEmails = [
      'michael@mypremierplans.com',
      'travis@mypremierplans.com',
      'richard@mypremierplans.com',
      'joaquin@mypremierplans.com',
      'mdkeener@gmail.com'
    ];
    
    await supabase.from('users')
      .delete()
      .not('email', 'in', `(${preserveEmails.map(e => `"${e}"`).join(',')})`);
    
    console.log('✅ Test data cleanup completed successfully!');
    console.log('📊 Final record counts:');
    
    // Show final counts
    const allTables = [...tables, 'users', 'leads'];
    for (const table of allTables) {
      const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
      console.log(`   ${table}: ${count || 0} records`);
    }
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
}

// Run the cleanup
clearTestData();
