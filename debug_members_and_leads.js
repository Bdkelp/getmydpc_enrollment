
#!/usr/bin/env node

// Member and Lead Debug Script - Supabase Version
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase configuration');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debugData() {
  try {
    console.log('🔍 MEMBER AND LEAD DEBUG REPORT');
    console.log('================================\n');

    // Check users by role
    console.log('👥 USERS BY ROLE:');
    const { data: users } = await supabase
      .from('users')
      .select('role, email, first_name, last_name')
      .order('role');

    const roleGroups = {};
    (users || []).forEach(user => {
      if (!roleGroups[user.role]) roleGroups[user.role] = [];
      roleGroups[user.role].push(user);
    });

    Object.keys(roleGroups).forEach(role => {
      console.log(`  ${role.toUpperCase()}: ${roleGroups[role].length}`);
      roleGroups[role].slice(0, 3).forEach(user => {
        console.log(`    - ${user.first_name} ${user.last_name} (${user.email})`);
      });
      if (roleGroups[role].length > 3) {
        console.log(`    ... and ${roleGroups[role].length - 3} more`);
      }
    });

    // Check leads
    console.log('\n📋 LEADS STATUS:');
    const { data: leads } = await supabase
      .from('leads')
      .select('status, first_name, last_name, email')
      .order('created_at', { ascending: false })
      .limit(10);

    if (!leads || leads.length === 0) {
      console.log('  ❌ NO LEADS FOUND');
    } else {
      console.log(`  ✅ Found ${leads.length} recent leads:`);
      leads.forEach((lead, index) => {
        console.log(`  ${index + 1}. ${lead.first_name} ${lead.last_name} - ${lead.status}`);
      });
    }

    // Check subscriptions
    console.log('\n💳 ACTIVE SUBSCRIPTIONS:');
    const { data: subscriptions } = await supabase
      .from('subscriptions')
      .select(`
        status,
        amount,
        users!inner(first_name, last_name, email)
      `)
      .eq('status', 'active');

    if (!subscriptions || subscriptions.length === 0) {
      console.log('  ❌ NO ACTIVE SUBSCRIPTIONS');
    } else {
      console.log(`  ✅ Found ${subscriptions.length} active subscriptions:`);
      subscriptions.slice(0, 5).forEach((sub, index) => {
        const user = sub.users;
        console.log(`  ${index + 1}. ${user.first_name} ${user.last_name} - $${sub.amount}`);
      });
    }

    console.log('\n✅ Debug report completed');

  } catch (error) {
    console.error('❌ Error during debug:', error);
    process.exit(1);
  }
}

debugData();
