
#!/usr/bin/env node

// Production Data Cleanup Script - Supabase Version
// This removes test data while preserving admin/agent accounts

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase configuration');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function clearProductionData() {
  try {
    console.log('🧹 Starting production data cleanup...');

    const preserveEmails = [
      'michael@mypremierplans.com',
      'travis@mypremierplans.com', 
      'richard@mypremierplans.com',
      'joaquin@mypremierplans.com',
      'mdkeener@gmail.com'
    ];

    console.log('Deleting family members...');
    await supabase.from('family_members').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    console.log('Deleting commissions...');
    await supabase.from('commissions').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    console.log('Deleting payments...');
    await supabase.from('payments').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    console.log('Deleting subscriptions...');
    await supabase.from('subscriptions').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    console.log('Deleting test users (preserving admin/agent accounts)...');
    await supabase.from('users').delete().not('email', 'in', `(${preserveEmails.map(e => `"${e}"`).join(',')})`);

    console.log('✅ Production cleanup completed successfully');
    console.log('📊 Final record counts:');
    
    // Show final counts
    const tables = ['users', 'subscriptions', 'payments', 'family_members', 'leads', 'lead_activities', 'commissions'];
    
    for (const table of tables) {
      const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
      console.log(`   ${table}: ${count || 0} records`);
    }
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
}

// Run the cleanup
clearProductionData();
