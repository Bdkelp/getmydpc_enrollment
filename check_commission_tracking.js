/**
 * Commission Tracking Diagnostic Script
 * 
 * This script checks if commissions are being automatically tracked
 * when subscriptions are created.
 * 
 * Run with: node check_commission_tracking.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  console.error('Required: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCommissionTracking() {
  console.log('\n🔍 COMMISSION TRACKING DIAGNOSTIC\n');
  console.log('='.repeat(60));

  try {
    // 1. Check if commissions table exists and has data
    console.log('\n📊 1. Checking commissions table...');
    const { data: commissions, error: commError, count: commCount } = await supabase
      .from('commissions')
      .select('*', { count: 'exact' })
      .limit(5);

    if (commError) {
      console.error('❌ Error querying commissions table:', commError.message);
      return;
    }

    console.log(`   Total commissions in database: ${commCount || 0}`);
    if (commissions && commissions.length > 0) {
      console.log('   ✅ Commissions table has data');
      console.log('\n   Sample commission records:');
      commissions.forEach((comm, idx) => {
        console.log(`   ${idx + 1}. ID: ${comm.id}, Agent: ${comm.agentId}, Amount: $${comm.commissionAmount}, Status: ${comm.status}`);
      });
    } else {
      console.log('   ⚠️  No commission records found');
    }

    // 2. Check subscriptions without commissions
    console.log('\n📋 2. Checking subscriptions vs commissions...');
    const { data: subscriptions, error: subError, count: subCount } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact' })
      .limit(10);

    if (subError) {
      console.error('❌ Error querying subscriptions:', subError.message);
      return;
    }

    console.log(`   Total subscriptions: ${subCount || 0}`);

    if (subscriptions && subscriptions.length > 0) {
      // Check which subscriptions have commissions
      const subsWithComm = [];
      const subsWithoutComm = [];

      for (const sub of subscriptions) {
        const { data: comm } = await supabase
          .from('commissions')
          .select('id')
          .eq('subscriptionId', sub.id)
          .single();

        if (comm) {
          subsWithComm.push(sub.id);
        } else {
          subsWithoutComm.push(sub);
        }
      }

      console.log(`   Subscriptions WITH commissions: ${subsWithComm.length}`);
      console.log(`   Subscriptions WITHOUT commissions: ${subsWithoutComm.length}`);

      if (subsWithoutComm.length > 0) {
        console.log('\n   ⚠️  ISSUE: Subscriptions without commission records:');
        subsWithoutComm.forEach((sub) => {
          console.log(`      - Subscription ID: ${sub.id}, User: ${sub.userId}, Status: ${sub.status}`);
        });
      }
    }

    // 3. Check users with agent role
    console.log('\n👥 3. Checking agents in system...');
    const { data: agents, error: agentError, count: agentCount } = await supabase
      .from('users')
      .select('id, firstName, lastName, agentNumber, email', { count: 'exact' })
      .eq('role', 'agent');

    if (agentError) {
      console.error('❌ Error querying agents:', agentError.message);
    } else {
      console.log(`   Total agents: ${agentCount || 0}`);
      if (agents && agents.length > 0) {
        agents.forEach((agent, idx) => {
          console.log(`   ${idx + 1}. ${agent.firstName} ${agent.lastName} (${agent.agentNumber}) - ${agent.email}`);
        });

        // Check commissions for each agent
        for (const agent of agents) {
          const { count: agentCommCount } = await supabase
            .from('commissions')
            .select('*', { count: 'exact', head: true })
            .eq('agentId', agent.id);

          console.log(`      → Has ${agentCommCount || 0} commission records`);
        }
      }
    }

    // 4. Check for users enrolled by agents
    console.log('\n🔗 4. Checking enrolledByAgentId tracking...');
    const { data: enrolledUsers, error: enrollError, count: enrollCount } = await supabase
      .from('users')
      .select('id, firstName, lastName, enrolledByAgentId, role', { count: 'exact' })
      .not('enrolledByAgentId', 'is', null)
      .eq('role', 'member')
      .limit(5);

    if (enrollError) {
      console.error('❌ Error querying enrolled users:', enrollError.message);
    } else {
      console.log(`   Total members enrolled by agents: ${enrollCount || 0}`);
      if (enrolledUsers && enrolledUsers.length > 0) {
        console.log('   Sample enrolled members:');
        enrolledUsers.forEach((user, idx) => {
          console.log(`   ${idx + 1}. ${user.firstName} ${user.lastName}, Agent ID: ${user.enrolledByAgentId}`);
        });
      }
    }

    // 5. Final diagnosis
    console.log('\n' + '='.repeat(60));
    console.log('📝 DIAGNOSIS SUMMARY:\n');

    if (commCount === 0) {
      console.log('❌ CRITICAL: NO commissions are being tracked!');
      console.log('   → Commission creation is NOT happening automatically');
      console.log('   → Subscriptions are created WITHOUT commission records');
    } else if (commCount < subCount) {
      console.log('⚠️  WARNING: Commission tracking is PARTIAL');
      console.log(`   → Only ${commCount} out of ${subCount} subscriptions have commissions`);
      console.log('   → Some enrollments are not generating commissions');
    } else {
      console.log('✅ Commission tracking appears to be working');
      console.log(`   → ${commCount} commission records for ${subCount} subscriptions`);
    }

    console.log('\n🔧 RECOMMENDATIONS:');
    if (commCount === 0 || commCount < subCount) {
      console.log('   1. Commission creation must be integrated into registration/subscription flow');
      console.log('   2. Add commission creation after successful subscription creation');
      console.log('   3. Consider backfilling missing commissions for existing subscriptions');
      console.log('   4. Review routes.ts for POST /api/registration endpoint');
      console.log('   5. Ensure createCommissionWithCheck() is called after createSubscription()');
    }

    console.log('\n' + '='.repeat(60));

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the diagnostic
checkCommissionTracking().then(() => {
  console.log('\n✅ Diagnostic complete\n');
  process.exit(0);
}).catch((error) => {
  console.error('\n❌ Diagnostic failed:', error);
  process.exit(1);
});
