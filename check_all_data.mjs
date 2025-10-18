import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkAllData() {
  console.log('🔍 Complete Database Overview');
  console.log('============================================================\n');

  try {
    // 1. All agents
    console.log('👥 ALL AGENTS:');
    const agents = await pool.query(`
      SELECT id, email, first_name, last_name, agent_number, role
      FROM users
      WHERE role = 'agent'
      ORDER BY created_at DESC
    `);
    
    console.log(`   Found ${agents.rows.length} agent(s):\n`);
    agents.rows.forEach((agent, idx) => {
      console.log(`   ${idx + 1}. ${agent.first_name} ${agent.last_name} (${agent.agent_number})`);
      console.log(`      Email: ${agent.email}`);
      console.log(`      UUID: ${agent.id}`);
      console.log('');
    });

    // 2. All members
    console.log('👥 ALL MEMBERS:');
    const members = await pool.query(`
      SELECT 
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
      ORDER BY m.created_at DESC
    `);
    
    console.log(`   Found ${members.rows.length} member(s):\n`);
    members.rows.forEach((member, idx) => {
      console.log(`   ${idx + 1}. ${member.first_name} ${member.last_name} (${member.customer_number})`);
      console.log(`      Email: ${member.email}`);
      console.log(`      Status: ${member.status}`);
      console.log(`      Agent: ${member.agent_number || 'None'}`);
      console.log(`      Enrolled By: ${member.enrolled_by_agent_id || 'None'}`);
      console.log(`      Plan: ${member.plan_name || 'N/A'} - ${member.coverage_type || 'N/A'}`);
      console.log(`      Price: $${member.total_monthly_price || '0.00'}`);
      console.log(`      Created: ${new Date(member.created_at).toLocaleString()}`);
      console.log('');
    });

    // 3. All commissions
    console.log('💰 ALL COMMISSIONS:');
    const commissions = await pool.query(`
      SELECT 
        id,
        agent_id,
        subscription_id,
        member_id,
        commission_amount,
        total_plan_cost,
        plan_name,
        plan_type,
        plan_tier,
        status,
        payment_status,
        created_at
      FROM commissions
      ORDER BY created_at DESC
    `);
    
    console.log(`   Found ${commissions.rows.length} commission(s):\n`);
    
    if (commissions.rows.length === 0) {
      console.log('   ❌ NO COMMISSIONS IN DATABASE!\n');
    } else {
      commissions.rows.forEach((commission, idx) => {
        console.log(`   ${idx + 1}. Commission ID: ${commission.id}`);
        console.log(`      Agent ID: ${commission.agent_id}`);
        console.log(`      Subscription ID: ${commission.subscription_id}`);
        console.log(`      Member ID: ${commission.member_id}`);
        console.log(`      Plan: ${commission.plan_name} (${commission.plan_tier})`);
        console.log(`      Commission: $${parseFloat(commission.commission_amount || 0).toFixed(2)}`);
        console.log(`      Plan Cost: $${commission.total_plan_cost}`);
        console.log(`      Status: ${commission.status} / ${commission.payment_status}`);
        console.log(`      Created: ${new Date(commission.created_at).toLocaleString()}`);
        console.log('');
      });
    }

    // 4. Summary
    console.log('📊 SUMMARY:');
    console.log(`   Agents: ${agents.rows.length}`);
    console.log(`   Members: ${members.rows.length}`);
    console.log(`   Commissions: ${commissions.rows.length}`);
    
    const membersWithAgent = members.rows.filter(m => m.agent_number && m.enrolled_by_agent_id);
    console.log(`   Members enrolled by agent: ${membersWithAgent.length}`);
    console.log(`   Members missing commission: ${membersWithAgent.length - commissions.rows.length}`);

    // 5. Check if there's a mismatch
    if (membersWithAgent.length > 0 && commissions.rows.length === 0) {
      console.log('\n⚠️  WARNING: Members were enrolled by an agent but no commissions exist!');
      console.log('   This indicates the commission tracking system may not be working.\n');
    } else if (membersWithAgent.length === commissions.rows.length) {
      console.log('\n✅ All agent enrollments have corresponding commissions!\n');
    }

    console.log('============================================================');
    console.log('✅ DATA CHECK COMPLETE');
    console.log('============================================================\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

checkAllData();
