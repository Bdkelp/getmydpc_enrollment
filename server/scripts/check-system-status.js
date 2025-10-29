#!/usr/bin/env node

/**
 * Check Current Commission System Status
 * This script shows the current state of members and commissions
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL?.replace(/['"]/g, '') || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkSystemStatus() {
  console.log('🔍 Checking Commission System Status...\n');

  try {
    // 1. Check members
    console.log('1️⃣ MEMBERS STATUS:');
    const { data: members, error: memberError } = await supabase
      .from('members')
      .select('id, first_name, last_name, status, plan_name, coverage_type, total_monthly_price, enrolled_by_agent_id, created_at');

    if (memberError) throw memberError;

    const activeMembers = members.filter(m => m.status === 'active');
    console.log(`   Total Members: ${members.length}`);
    console.log(`   Active Members: ${activeMembers.length}`);
    console.log(`   Inactive Members: ${members.length - activeMembers.length}\n`);

    if (activeMembers.length > 0) {
      console.log('   📋 Active Members:');
      activeMembers.forEach((member, i) => {
        const agentInfo = member.enrolled_by_agent_id ? `Agent: ${member.enrolled_by_agent_id}` : 'No Agent';
        console.log(`     ${i + 1}. ${member.first_name} ${member.last_name} - ${member.plan_name} ($${member.total_monthly_price}) - ${agentInfo}`);
      });
      console.log('');
    }

    // 2. Check agents
    console.log('2️⃣ AGENTS STATUS:');
    const { data: agents, error: agentError } = await supabase
      .from('users')
      .select('id, first_name, last_name, agent_number, role, is_active');

    if (agentError) throw agentError;

    const activeAgents = agents.filter(a => a.role === 'agent' && a.is_active);
    const adminUsers = agents.filter(a => a.role === 'admin');

    console.log(`   Total Users: ${agents.length}`);
    console.log(`   Active Agents: ${activeAgents.length}`);
    console.log(`   Admin Users: ${adminUsers.length}\n`);

    if (activeAgents.length > 0) {
      console.log('   👥 Active Agents:');
      activeAgents.forEach((agent, i) => {
        console.log(`     ${i + 1}. ${agent.first_name} ${agent.last_name} - ${agent.agent_number}`);
      });
      console.log('');
    }

    // 3. Check subscriptions
    console.log('3️⃣ SUBSCRIPTIONS STATUS:');
    const { data: subscriptions, error: subError } = await supabase
      .from('subscriptions')
      .select('id, user_id, status, amount');

    if (subError) throw subError;

    const activeSubscriptions = subscriptions.filter(s => s.status === 'active');
    console.log(`   Total Subscriptions: ${subscriptions.length}`);
    console.log(`   Active Subscriptions: ${activeSubscriptions.length}`);
    console.log(`   Inactive Subscriptions: ${subscriptions.length - activeSubscriptions.length}\n`);

    // 4. Check commissions
    console.log('4️⃣ COMMISSIONS STATUS:');
    const { data: commissions, error: commError } = await supabase
      .from('commissions')
      .select('id, agent_id, member_id, user_id, commission_amount, payment_status, status, created_at');

    if (commError) throw commError;

    console.log(`   Total Commissions: ${commissions.length}`);
    
    if (commissions.length === 0) {
      console.log('   ❌ NO COMMISSIONS FOUND - This is the problem!\n');
    } else {
      const paidCommissions = commissions.filter(c => c.payment_status === 'paid');
      const unpaidCommissions = commissions.filter(c => c.payment_status === 'unpaid');
      const totalValue = commissions.reduce((sum, c) => sum + parseFloat(c.commission_amount), 0);

      console.log(`   Paid Commissions: ${paidCommissions.length}`);
      console.log(`   Unpaid Commissions: ${unpaidCommissions.length}`);
      console.log(`   Total Commission Value: $${totalValue.toFixed(2)}\n`);

      console.log('   💰 Commission Details:');
      commissions.forEach((comm, i) => {
        const memberInfo = comm.member_id ? `Member ID: ${comm.member_id}` : `User ID: ${comm.user_id}`;
        console.log(`     ${i + 1}. Agent: ${comm.agent_id} → $${comm.commission_amount} (${comm.payment_status}) - ${memberInfo}`);
      });
      console.log('');
    }

    // 5. Check for members without commissions
    console.log('5️⃣ MISSING COMMISSIONS CHECK:');
    const memberIds = activeMembers.map(m => m.id);
    const membersWithCommissions = commissions.filter(c => c.member_id).map(c => c.member_id);
    const membersWithoutCommissions = memberIds.filter(id => !membersWithCommissions.includes(id));

    if (membersWithoutCommissions.length === 0) {
      console.log('   ✅ All active members have commissions\n');
    } else {
      console.log(`   ❌ ${membersWithoutCommissions.length} active members are missing commissions:`);
      membersWithoutCommissions.forEach(memberId => {
        const member = activeMembers.find(m => m.id === memberId);
        if (member) {
          console.log(`     - ${member.first_name} ${member.last_name} (ID: ${member.id})`);
        }
      });
      console.log('');
    }

    // 6. Check real-time publication status
    console.log('6️⃣ REAL-TIME STATUS:');
    const { data: realtimeTables, error: rtError } = await supabase
      .from('pg_publication_tables')
      .select('tablename')
      .eq('pubname', 'supabase_realtime')
      .eq('schemaname', 'public');

    if (rtError) {
      console.log('   ⚠️  Could not check real-time status:', rtError.message);
    } else {
      const tables = realtimeTables.map(t => t.tablename);
      const hasCommissionsRealtime = tables.includes('commissions');
      
      console.log(`   Real-time enabled tables: ${tables.length}`);
      console.log(`   Commissions real-time: ${hasCommissionsRealtime ? '✅ Enabled' : '❌ Disabled'}`);
      if (tables.length > 0) {
        console.log(`   Tables: ${tables.join(', ')}`);
      }
    }
    console.log('');

    // 7. Summary and recommendations
    console.log('📊 SUMMARY & RECOMMENDATIONS:');
    
    if (activeMembers.length === 0) {
      console.log('❌ No active members found - need to create test members');
    } else if (commissions.length === 0) {
      console.log('❌ No commissions found - run backfill script to create commissions for existing members');
      console.log('💡 Recommended action: node server/scripts/quick-commission-fix.js');
    } else if (membersWithoutCommissions.length > 0) {
      console.log(`❌ ${membersWithoutCommissions.length} members missing commissions - run backfill script`);
      console.log('💡 Recommended action: node server/scripts/backfill-commissions.js');
    } else {
      console.log('✅ Commission system appears to be working correctly!');
      console.log('✅ All active members have commissions');
      console.log('✅ Commission data is available for testing');
    }

  } catch (error) {
    console.error('❌ Status check failed:', error);
    process.exit(1);
  }
}

checkSystemStatus();