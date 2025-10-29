#!/usr/bin/env node

/**
 * Test Commission Creation
 * This script simulates commission creation to verify the fixes are working
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

async function testCommissionCreation() {
  console.log('🧪 Testing Commission Creation System...\n');

  try {
    // 1. Check if we can connect to database
    console.log('1️⃣ Testing database connection...');
    const { data: testQuery, error: connectionError } = await supabase
      .from('users')
      .select('count')
      .limit(1);
    
    if (connectionError) throw connectionError;
    console.log('✅ Database connection successful\n');

    // 2. Find an agent to use for testing
    console.log('2️⃣ Finding test agent...');
    const { data: agents, error: agentError } = await supabase
      .from('users')
      .select('id, first_name, last_name, agent_number, role')
      .eq('role', 'agent')
      .eq('is_active', true)
      .limit(1);

    if (agentError) throw agentError;
    if (!agents || agents.length === 0) {
      console.log('❌ No active agents found in database');
      return;
    }

    const testAgent = agents[0];
    console.log(`✅ Found test agent: ${testAgent.first_name} ${testAgent.last_name} (${testAgent.agent_number})\n`);

    // 3. Find a member to use for testing
    console.log('3️⃣ Finding test member...');
    const { data: members, error: memberError } = await supabase
      .from('members')
      .select('id, first_name, last_name, status, total_monthly_price')
      .eq('status', 'active')
      .limit(1);

    if (memberError) throw memberError;
    if (!members || members.length === 0) {
      console.log('❌ No active members found in database');
      return;
    }

    const testMember = members[0];
    console.log(`✅ Found test member: ${testMember.first_name} ${testMember.last_name} ($${testMember.total_monthly_price}/month)\n`);

    // 4. Find a subscription to use
    console.log('4️⃣ Finding test subscription...');
    const { data: subscriptions, error: subError } = await supabase
      .from('subscriptions')
      .select('id, status, amount')
      .eq('status', 'active')
      .limit(1);

    if (subError) throw subError;
    if (!subscriptions || subscriptions.length === 0) {
      console.log('❌ No active subscriptions found in database');
      return;
    }

    const testSubscription = subscriptions[0];
    console.log(`✅ Found test subscription: ID ${testSubscription.id} ($${testSubscription.amount})\n`);

    // 5. Test commission creation
    console.log('5️⃣ Creating test commission...');
    
    const testCommissionData = {
      agent_id: testAgent.id,
      agent_number: testAgent.agent_number,
      subscription_id: testSubscription.id,
      user_id: null, // For member enrollments
      member_id: testMember.id, // This is the fix - using member_id instead of user_id
      plan_name: 'MyPremierPlan',
      plan_type: 'IE',
      plan_tier: 'MyPremierPlan',
      commission_amount: 50.00,
      total_plan_cost: 200.00,
      status: 'pending',
      payment_status: 'unpaid'
    };

    console.log('Commission data:', testCommissionData);

    const { data: newCommission, error: commissionError } = await supabase
      .from('commissions')
      .insert(testCommissionData)
      .select()
      .single();

    if (commissionError) {
      console.error('❌ Failed to create commission:', commissionError);
      return;
    }

    console.log('✅ Commission created successfully!');
    console.log('Commission ID:', newCommission.id);
    console.log('Agent:', testAgent.agent_number);
    console.log('Member ID:', testMember.id);
    console.log('Amount:', `$${newCommission.commission_amount}\n`);

    // 6. Verify commission can be queried
    console.log('6️⃣ Verifying commission lookup...');
    const { data: foundCommission, error: lookupError } = await supabase
      .from('commissions')
      .select('*')
      .eq('id', newCommission.id)
      .single();

    if (lookupError) throw lookupError;
    console.log('✅ Commission lookup successful');
    console.log(`Found commission: $${foundCommission.commission_amount} for agent ${foundCommission.agent_number}\n`);

    // 7. Test commission update (simulate payment)
    console.log('7️⃣ Testing commission payment update...');
    const { data: updatedCommission, error: updateError } = await supabase
      .from('commissions')
      .update({
        payment_status: 'paid',
        paid_date: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', newCommission.id)
      .select()
      .single();

    if (updateError) throw updateError;
    console.log('✅ Commission payment status updated');
    console.log(`Status: ${updatedCommission.payment_status}, Paid: ${updatedCommission.paid_date}\n`);

    // 8. Clean up test commission
    console.log('8️⃣ Cleaning up test data...');
    const { error: deleteError } = await supabase
      .from('commissions')
      .delete()
      .eq('id', newCommission.id);

    if (deleteError) throw deleteError;
    console.log('✅ Test commission cleaned up\n');

    console.log('🎉 ALL COMMISSION TESTS PASSED!');
    console.log('The commission system is working correctly.');
    console.log('✅ Commission creation: WORKING');
    console.log('✅ Database field mapping: FIXED');
    console.log('✅ Commission lookup: WORKING');
    console.log('✅ Payment status updates: WORKING');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testCommissionCreation();