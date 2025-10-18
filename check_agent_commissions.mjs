import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkAgentCommissions() {
  console.log('🧪 Checking Agent Commissions Data');
  console.log('============================================================\n');

  try {
    // 1. Find the agent (Michael)
    console.log('👤 Finding agent...');
    const agentResult = await pool.query(`
      SELECT id, email, first_name, last_name, agent_number, role
      FROM users
      WHERE role = 'agent'
      LIMIT 1
    `);

    if (agentResult.rows.length === 0) {
      console.log('❌ No agent found in database!');
      return;
    }

    const agent = agentResult.rows[0];
    console.log(`✅ Agent found: ${agent.first_name} ${agent.last_name}`);
    console.log(`   Email: ${agent.email}`);
    console.log(`   Agent Number: ${agent.agent_number}`);
    console.log(`   UUID: ${agent.id}\n`);

    // 2. Check members enrolled by this agent
    console.log('👥 Members enrolled by this agent:');
    const membersResult = await pool.query(`
      SELECT 
        m.id,
        m.customer_number,
        m.first_name,
        m.last_name,
        m.email,
        m.status,
        m.agent_number,
        m.enrolled_by_agent_id,
        m.total_monthly_price,
        m.coverage_type,
        m.created_at,
        p.name as plan_name
      FROM members m
      LEFT JOIN plans p ON m.plan_id = p.id
      WHERE m.enrolled_by_agent_id = $1
      ORDER BY m.created_at DESC
    `, [agent.email]);

    console.log(`   Total enrollments: ${membersResult.rows.length}\n`);

    if (membersResult.rows.length === 0) {
      console.log('   ℹ️ No enrollments found for this agent\n');
    } else {
      membersResult.rows.forEach((member, idx) => {
        console.log(`   ${idx + 1}. ${member.first_name} ${member.last_name} (${member.customer_number})`);
        console.log(`      Status: ${member.status}`);
        console.log(`      Plan: ${member.plan_name || 'N/A'} - ${member.coverage_type || 'N/A'}`);
        console.log(`      Price: $${member.total_monthly_price || '0.00'}`);
        console.log(`      Created: ${new Date(member.created_at).toLocaleString()}`);
        console.log('');
      });
    }

    // 3. Check commissions for this agent
    console.log('💰 Commissions for this agent:');
    const commissionsResult = await pool.query(`
      SELECT 
        id,
        agent_id,
        member_id,
        subscription_id,
        commission_amount,
        total_plan_cost,
        plan_name,
        plan_type,
        plan_tier,
        status,
        payment_status,
        paid_date,
        created_at
      FROM commissions
      WHERE agent_id = $1
      ORDER BY created_at DESC
    `, [agent.id]);

    console.log(`   Total commissions: ${commissionsResult.rows.length}\n`);

    if (commissionsResult.rows.length === 0) {
      console.log('   ❌ NO COMMISSIONS FOUND!\n');
      console.log('   🔍 This is the problem - enrollments exist but no commission records\n');
    } else {
      let totalCommission = 0;
      let totalPending = 0;
      let totalPaid = 0;

      commissionsResult.rows.forEach((commission, idx) => {
        const amount = parseFloat(commission.commission_amount || 0);
        totalCommission += amount;

        if (commission.payment_status === 'paid') {
          totalPaid += amount;
        } else {
          totalPending += amount;
        }

        console.log(`   ${idx + 1}. Subscription ID: ${commission.subscription_id}`);
        console.log(`      Plan: ${commission.plan_name} (${commission.plan_tier})`);
        console.log(`      Commission: $${amount.toFixed(2)}`);
        console.log(`      Plan Cost: $${commission.total_plan_cost}`);
        console.log(`      Status: ${commission.status}`);
        console.log(`      Payment: ${commission.payment_status}`);
        console.log(`      Created: ${new Date(commission.created_at).toLocaleString()}`);
        console.log('');
      });

      console.log('📊 Commission Summary:');
      console.log(`   Total Earned: $${totalCommission.toFixed(2)}`);
      console.log(`   Total Pending: $${totalPending.toFixed(2)}`);
      console.log(`   Total Paid: $${totalPaid.toFixed(2)}\n`);
    }

    // 4. Check if there are enrollments without commissions
    console.log('🔍 Checking for enrollments missing commissions...');
    const missingCommissionsResult = await pool.query(`
      SELECT 
        m.customer_number,
        m.first_name,
        m.last_name,
        m.agent_number,
        m.total_monthly_price,
        m.created_at,
        p.name as plan_name
      FROM members m
      LEFT JOIN plans p ON m.plan_id = p.id
      LEFT JOIN commissions c ON c.subscription_id = m.customer_number::integer
      WHERE m.enrolled_by_agent_id = $1
        AND c.id IS NULL
      ORDER BY m.created_at DESC
    `, [agent.email]);

    if (missingCommissionsResult.rows.length > 0) {
      console.log(`   ❌ Found ${missingCommissionsResult.rows.length} enrollments WITHOUT commissions:\n`);
      missingCommissionsResult.rows.forEach((member, idx) => {
        console.log(`   ${idx + 1}. ${member.first_name} ${member.last_name} (${member.customer_number})`);
        console.log(`      Plan: ${member.plan_name || 'N/A'}`);
        console.log(`      Price: $${member.total_monthly_price || '0.00'}`);
        console.log(`      Created: ${new Date(member.created_at).toLocaleString()}`);
        console.log('');
      });
    } else {
      console.log('   ✅ All enrollments have commissions!\n');
    }

    // 5. Test the API endpoint data structure
    console.log('🔌 Simulating API response structure:');
    if (commissionsResult.rows.length > 0) {
      const sampleCommission = commissionsResult.rows[0];
      
      // Find the member for this commission
      const memberForCommission = await pool.query(`
        SELECT first_name, last_name
        FROM members
        WHERE customer_number = $1::text
      `, [sampleCommission.subscription_id]);

      const userName = memberForCommission.rows.length > 0
        ? `${memberForCommission.rows[0].first_name} ${memberForCommission.rows[0].last_name}`
        : 'Unknown';

      console.log('   Sample commission object:');
      console.log(JSON.stringify({
        id: sampleCommission.id,
        subscriptionId: sampleCommission.subscription_id,
        userId: sampleCommission.agent_id,
        userName: userName,
        planName: sampleCommission.plan_name,
        planType: sampleCommission.plan_type,
        planTier: sampleCommission.plan_tier,
        commissionAmount: parseFloat(sampleCommission.commission_amount),
        totalPlanCost: parseFloat(sampleCommission.total_plan_cost),
        status: sampleCommission.status,
        paymentStatus: sampleCommission.payment_status,
        paidDate: sampleCommission.paid_date,
        createdAt: sampleCommission.created_at
      }, null, 2));
    }

    console.log('\n============================================================');
    console.log('✅ COMMISSION CHECK COMPLETE');
    console.log('============================================================\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

checkAgentCommissions();
