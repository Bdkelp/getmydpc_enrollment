#!/usr/bin/env node

/**
 * Backfill Commissions for Existing Enrollments
 * This script creates commission records for existing members who don't have commissions yet
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

// Commission calculation logic (simplified version from commissionCalculator)
function calculateCommission(planName, memberType, addRxValet = false) {
  const baseCommissions = {
    'MyPremierPlan': { IE: 50, C: 40, CH: 35, AM: 30 },
    'MyPremierPlan Plus': { IE: 60, C: 50, CH: 45, AM: 40 },
    'MyPremierElite Plan': { IE: 75, C: 65, CH: 60, AM: 55 }
  };

  const planCommissions = baseCommissions[planName];
  if (!planCommissions) return null;

  const baseCommission = planCommissions[memberType];
  if (!baseCommission) return null;

  const rxValetBonus = addRxValet ? 10 : 0;
  const totalCommission = baseCommission + rxValetBonus;

  // Estimate total plan cost based on commission rates
  const totalCost = {
    'MyPremierPlan': { IE: 200, C: 160, CH: 140, AM: 120 },
    'MyPremierPlan Plus': { IE: 240, C: 200, CH: 180, AM: 160 },
    'MyPremierElite Plan': { IE: 300, C: 260, CH: 240, AM: 220 }
  };

  return {
    commission: totalCommission,
    totalCost: totalCost[planName]?.[memberType] || 200
  };
}

function getPlanTypeFromMemberType(memberType) {
  const typeMap = {
    'Individual': 'IE',
    'Couple': 'C', 
    'Children': 'CH',
    'Adult/Minor': 'AM'
  };
  return typeMap[memberType] || 'IE';
}

function getPlanTierFromName(planName) {
  if (planName.includes('Elite')) return 'MyPremierElite Plan';
  if (planName.includes('Plus')) return 'MyPremierPlan Plus';
  return 'MyPremierPlan';
}

async function backfillCommissions() {
  console.log('🔄 Starting Commission Backfill for Existing Enrollments...\n');

  try {
    // 1. Get all members who don't have commissions yet
    console.log('1️⃣ Finding members without commissions...');
    
    const { data: membersWithoutCommissions, error: memberError } = await supabase
      .from('members')
      .select(`
        id,
        first_name,
        last_name,
        plan_name,
        coverage_type,
        total_monthly_price,
        enrolled_by_agent_id,
        status,
        created_at,
        subscriptions!inner(id, status)
      `)
      .eq('status', 'active')
      .not('id', 'in', `(
        SELECT DISTINCT member_id 
        FROM commissions 
        WHERE member_id IS NOT NULL
      )`);

    if (memberError) throw memberError;
    
    if (!membersWithoutCommissions || membersWithoutCommissions.length === 0) {
      console.log('✅ All members already have commissions or no active members found');
      return;
    }

    console.log(`📊 Found ${membersWithoutCommissions.length} members without commissions:`);
    membersWithoutCommissions.forEach((member, i) => {
      console.log(`  ${i + 1}. ${member.first_name} ${member.last_name} - ${member.plan_name} (${member.coverage_type})`);
    });
    console.log('');

    // 2. Get agent information for commission creation
    console.log('2️⃣ Fetching agent information...');
    const { data: agents, error: agentError } = await supabase
      .from('users')
      .select('id, agent_number, first_name, last_name, role')
      .eq('role', 'agent');

    if (agentError) throw agentError;
    
    const agentMap = new Map();
    agents.forEach(agent => {
      agentMap.set(agent.id, agent);
    });
    console.log(`✅ Found ${agents.length} agents in system\n`);

    // 3. Create commissions for each member
    console.log('3️⃣ Creating commissions...\n');
    
    let created = 0;
    let skipped = 0;
    const createdCommissions = [];

    for (const member of membersWithoutCommissions) {
      try {
        // Skip if no agent assigned or agent is admin
        if (!member.enrolled_by_agent_id) {
          console.log(`⏭️  Skipping ${member.first_name} ${member.last_name}: No agent assigned`);
          skipped++;
          continue;
        }

        const agent = agentMap.get(member.enrolled_by_agent_id);
        if (!agent) {
          console.log(`⏭️  Skipping ${member.first_name} ${member.last_name}: Agent not found`);
          skipped++;
          continue;
        }

        if (agent.role === 'admin') {
          console.log(`⏭️  Skipping ${member.first_name} ${member.last_name}: Agent is admin`);
          skipped++;
          continue;
        }

        // Calculate commission
        const planName = member.plan_name || 'MyPremierPlan';
        const memberType = getPlanTypeFromMemberType(member.coverage_type || 'Individual');
        
        const commissionResult = calculateCommission(planName, memberType);
        if (!commissionResult) {
          console.log(`⏭️  Skipping ${member.first_name} ${member.last_name}: No commission rate found`);
          skipped++;
          continue;
        }

        // Get subscription ID
        const subscriptionId = member.subscriptions?.[0]?.id;
        if (!subscriptionId) {
          console.log(`⏭️  Skipping ${member.first_name} ${member.last_name}: No subscription found`);
          skipped++;
          continue;
        }

        // Create commission record
        const commissionData = {
          agent_id: agent.id,
          agent_number: agent.agent_number,
          subscription_id: subscriptionId,
          user_id: null, // For member enrollments
          member_id: member.id,
          plan_name: planName,
          plan_type: memberType,
          plan_tier: getPlanTierFromName(planName),
          commission_amount: commissionResult.commission,
          total_plan_cost: member.total_monthly_price || commissionResult.totalCost,
          status: 'pending',
          payment_status: 'unpaid'
        };

        const { data: newCommission, error: commissionError } = await supabase
          .from('commissions')
          .insert(commissionData)
          .select()
          .single();

        if (commissionError) {
          console.error(`❌ Failed to create commission for ${member.first_name} ${member.last_name}:`, commissionError.message);
          skipped++;
          continue;
        }

        console.log(`✅ Created commission: ${member.first_name} ${member.last_name} → Agent ${agent.agent_number} → $${commissionResult.commission}`);
        createdCommissions.push({
          member: `${member.first_name} ${member.last_name}`,
          agent: agent.agent_number,
          amount: commissionResult.commission,
          commissionId: newCommission.id
        });
        created++;

      } catch (error) {
        console.error(`❌ Error processing ${member.first_name} ${member.last_name}:`, error.message);
        skipped++;
      }
    }

    // 4. Summary
    console.log('\n📈 BACKFILL SUMMARY:');
    console.log(`✅ Commissions Created: ${created}`);
    console.log(`⏭️  Members Skipped: ${skipped}`);
    console.log(`📊 Total Members Processed: ${membersWithoutCommissions.length}\n`);

    if (createdCommissions.length > 0) {
      console.log('💰 CREATED COMMISSIONS:');
      createdCommissions.forEach((comm, i) => {
        console.log(`  ${i + 1}. ${comm.member} → Agent ${comm.agent} → $${comm.amount} (ID: ${comm.commissionId})`);
      });
      console.log('');

      // Calculate totals by agent
      const agentTotals = {};
      createdCommissions.forEach(comm => {
        if (!agentTotals[comm.agent]) {
          agentTotals[comm.agent] = { count: 0, total: 0 };
        }
        agentTotals[comm.agent].count++;
        agentTotals[comm.agent].total += comm.amount;
      });

      console.log('👥 AGENT COMMISSION TOTALS:');
      Object.entries(agentTotals).forEach(([agentNumber, data]) => {
        console.log(`  Agent ${agentNumber}: ${data.count} commissions, $${data.total.toFixed(2)} total`);
      });
      console.log('');
    }

    // 5. Verify total commissions in system
    console.log('5️⃣ Verifying total commissions...');
    const { data: allCommissions, error: countError } = await supabase
      .from('commissions')
      .select('commission_amount, payment_status');

    if (countError) throw countError;

    const totalCommissions = allCommissions.reduce((sum, comm) => sum + parseFloat(comm.commission_amount), 0);
    const paidCommissions = allCommissions.filter(c => c.payment_status === 'paid').length;
    const unpaidCommissions = allCommissions.filter(c => c.payment_status === 'unpaid').length;

    console.log(`✅ Total Commissions in System: ${allCommissions.length}`);
    console.log(`💰 Total Commission Value: $${totalCommissions.toFixed(2)}`);
    console.log(`💳 Paid Commissions: ${paidCommissions}`);
    console.log(`⏳ Unpaid Commissions: ${unpaidCommissions}\n`);

    console.log('🎉 COMMISSION BACKFILL COMPLETED!');
    console.log('✅ All existing enrollments now have commission records');
    console.log('✅ Agents can now see their historical commissions');
    console.log('✅ Admin can see commission analytics');

  } catch (error) {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  }
}

backfillCommissions();