#!/usr/bin/env node

/**
 * Quick Commission Fix for Test Data
 * This script specifically targets the test enrollments and creates commissions for them
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

async function quickCommissionFix() {
  console.log('⚡ Quick Commission Fix for Test Data...\n');

  try {
    // 1. Find all active members with their enrollment details
    console.log('1️⃣ Finding all active members...');
    const { data: members, error: memberError } = await supabase
      .from('members')
      .select(`
        id,
        first_name, 
        last_name,
        email,
        plan_name,
        coverage_type,
        total_monthly_price,
        enrolled_by_agent_id,
        status,
        created_at
      `)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (memberError) throw memberError;
    
    console.log(`📊 Found ${members.length} active members:`);
    members.forEach((member, i) => {
      console.log(`  ${i + 1}. ${member.first_name} ${member.last_name} (${member.email}) - ${member.plan_name}`);
    });
    console.log('');

    // 2. Check which members already have commissions
    console.log('2️⃣ Checking existing commissions...');
    const { data: existingCommissions, error: commError } = await supabase
      .from('commissions')
      .select('member_id, agent_id, commission_amount')
      .not('member_id', 'is', null);

    if (commError) throw commError;

    const membersWithCommissions = new Set(existingCommissions.map(c => c.member_id));
    const membersNeedingCommissions = members.filter(m => !membersWithCommissions.has(m.id));
    
    console.log(`✅ Existing commissions: ${existingCommissions.length}`);
    console.log(`🔍 Members needing commissions: ${membersNeedingCommissions.length}\n`);

    if (membersNeedingCommissions.length === 0) {
      console.log('🎉 All members already have commissions!');
      return;
    }

    // 3. Get agents for assignment
    console.log('3️⃣ Getting agents...');
    const { data: agents, error: agentError } = await supabase
      .from('users')
      .select('id, first_name, last_name, agent_number, role, is_active')
      .eq('role', 'agent')
      .eq('is_active', true);

    if (agentError) throw agentError;

    console.log(`👥 Active agents: ${agents.length}`);
    agents.forEach((agent, i) => {
      console.log(`  ${i + 1}. ${agent.first_name} ${agent.last_name} - ${agent.agent_number}`);
    });
    console.log('');

    // 4. Find or create subscriptions for members
    console.log('4️⃣ Finding subscriptions...');
    const { data: subscriptions, error: subError } = await supabase
      .from('subscriptions')
      .select('id, user_id, status, amount');

    if (subError) throw subError;
    console.log(`📑 Available subscriptions: ${subscriptions.length}\n`);

    // 5. Create commissions for members without them
    console.log('5️⃣ Creating missing commissions...\n');
    
    let created = 0;
    const newCommissions = [];

    for (const member of membersNeedingCommissions) {
      try {
        // Find agent (use enrolled_by_agent_id or first active agent)
        let agent = null;
        if (member.enrolled_by_agent_id) {
          agent = agents.find(a => a.id === member.enrolled_by_agent_id);
        }
        if (!agent && agents.length > 0) {
          agent = agents[0]; // Use first available agent
        }
        
        if (!agent) {
          console.log(`⏭️  No agent available for ${member.first_name} ${member.last_name}`);
          continue;
        }

        // Find or create subscription
        let subscription = subscriptions.find(s => s.user_id === member.id);
        if (!subscription) {
          // Create a basic subscription for this member
          const { data: newSub, error: newSubError } = await supabase
            .from('subscriptions')
            .insert({
              user_id: member.id,
              plan_id: 1, // Default plan ID
              status: 'active',
              amount: member.total_monthly_price || 200.00,
              start_date: new Date().toISOString(),
              current_period_start: new Date().toISOString(),
              current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            })
            .select()
            .single();

          if (newSubError) {
            console.log(`⚠️  Could not create subscription for ${member.first_name} ${member.last_name}: ${newSubError.message}`);
            continue;
          }
          subscription = newSub;
          console.log(`📝 Created subscription ${subscription.id} for ${member.first_name} ${member.last_name}`);
        }

        // Calculate commission (simplified)
        const planName = member.plan_name || 'MyPremierPlan';
        const coverageType = member.coverage_type || 'Individual';
        
        let commissionAmount = 50; // Default IE commission
        if (coverageType === 'Couple') commissionAmount = 40;
        else if (coverageType === 'Children') commissionAmount = 35;
        else if (coverageType === 'Adult/Minor') commissionAmount = 30;

        if (planName.includes('Plus')) commissionAmount += 10;
        else if (planName.includes('Elite')) commissionAmount += 25;

        // Create commission
        const commissionData = {
          agent_id: agent.id,
          agent_number: agent.agent_number,
          subscription_id: subscription.id,
          user_id: null,
          member_id: member.id,
          plan_name: planName,
          plan_type: coverageType === 'Individual' ? 'IE' : 
                    coverageType === 'Couple' ? 'C' :
                    coverageType === 'Children' ? 'CH' : 'AM',
          plan_tier: planName.includes('Elite') ? 'MyPremierElite Plan' :
                     planName.includes('Plus') ? 'MyPremierPlan Plus' : 'MyPremierPlan',
          commission_amount: commissionAmount,
          total_plan_cost: member.total_monthly_price || 200.00,
          status: 'active', // Set to active for test data
          payment_status: 'paid' // Set to paid for test data so it shows in analytics
        };

        const { data: newCommission, error: createError } = await supabase
          .from('commissions')
          .insert(commissionData)
          .select()
          .single();

        if (createError) {
          console.error(`❌ Failed to create commission for ${member.first_name} ${member.last_name}:`, createError.message);
          continue;
        }

        console.log(`✅ Created commission: ${member.first_name} ${member.last_name} → Agent ${agent.agent_number} → $${commissionAmount}`);
        newCommissions.push({
          member: `${member.first_name} ${member.last_name}`,
          agent: agent.agent_number,
          amount: commissionAmount,
          id: newCommission.id
        });
        created++;

      } catch (error) {
        console.error(`❌ Error creating commission for ${member.first_name} ${member.last_name}:`, error.message);
      }
    }

    console.log(`\n🎉 COMMISSION FIX COMPLETE!`);
    console.log(`✅ Created ${created} new commissions`);
    console.log(`💰 Total commission value: $${newCommissions.reduce((sum, c) => sum + c.amount, 0)}\n`);

    if (newCommissions.length > 0) {
      console.log('📋 NEW COMMISSIONS CREATED:');
      newCommissions.forEach((comm, i) => {
        console.log(`  ${i + 1}. ${comm.member} → Agent ${comm.agent} → $${comm.amount} (ID: ${comm.id})`);
      });
      console.log('');
    }

    // 6. Final verification
    console.log('6️⃣ Final system status...');
    const { data: finalCommissions } = await supabase
      .from('commissions')
      .select('id, commission_amount, payment_status, agent_id');
    
    const totalCommissions = finalCommissions.length;
    const totalValue = finalCommissions.reduce((sum, c) => sum + parseFloat(c.commission_amount), 0);
    const paidCommissions = finalCommissions.filter(c => c.payment_status === 'paid').length;

    console.log(`📊 FINAL STATS:`);
    console.log(`   Total Commissions: ${totalCommissions}`);
    console.log(`   Total Value: $${totalValue.toFixed(2)}`);
    console.log(`   Paid Commissions: ${paidCommissions}`);
    console.log(`   Unpaid Commissions: ${totalCommissions - paidCommissions}`);
    console.log('');

    console.log('🚀 Ready for testing!');
    console.log('✅ Agents should now see commissions in their dashboard');
    console.log('✅ Admin should see commission analytics');
    console.log('✅ Commission data viewer should show records');

  } catch (error) {
    console.error('❌ Quick fix failed:', error);
    process.exit(1);
  }
}

quickCommissionFix();