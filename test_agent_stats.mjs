import pkg from 'pg';
const { Pool } = pkg;
import 'dotenv/config';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function testAgentStats() {
  try {
    console.log('🧪 Testing Agent Stats Data\n');
    console.log('=' .repeat(80));
    
    // Get Michael Keener's agent ID
    const agentResult = await pool.query(`
      SELECT id, email, first_name, last_name, agent_number, role
      FROM users
      WHERE email = 'michael@mypremierplans.com'
    `);
    
    if (agentResult.rows.length === 0) {
      console.log('❌ Agent not found');
      return;
    }
    
    const agent = agentResult.rows[0];
    console.log('\n👤 Agent Info:');
    console.log(`   Name: ${agent.first_name} ${agent.last_name}`);
    console.log(`   Email: ${agent.email}`);
    console.log(`   Agent #: ${agent.agent_number}`);
    console.log(`   ID: ${agent.id}`);
    
    // Get all commissions for this agent
    console.log('\n' + '=' .repeat(80));
    console.log('\n💰 Commission Stats:');
    
    const commissionsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_count,
        SUM(CASE WHEN payment_status = 'paid' THEN commission_amount::numeric ELSE 0 END) as total_paid,
        SUM(CASE WHEN payment_status IN ('unpaid', 'pending') THEN commission_amount::numeric ELSE 0 END) as total_pending,
        SUM(commission_amount::numeric) as total_earned
      FROM commissions
      WHERE agent_id = $1
    `, [agent.id]);
    
    const stats = commissionsResult.rows[0];
    console.log(`   Total Commissions: ${stats.total_count}`);
    console.log(`   Total Earned: $${parseFloat(stats.total_earned || 0).toFixed(2)}`);
    console.log(`   Total Paid: $${parseFloat(stats.total_paid || 0).toFixed(2)}`);
    console.log(`   Total Pending: $${parseFloat(stats.total_pending || 0).toFixed(2)}`);
    
    // Get this month's commissions
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);
    
    const monthlyResult = await pool.query(`
      SELECT 
        COUNT(*) as monthly_count,
        SUM(commission_amount::numeric) as monthly_total
      FROM commissions
      WHERE agent_id = $1 AND created_at >= $2
    `, [agent.id, thisMonth]);
    
    const monthly = monthlyResult.rows[0];
    console.log(`\n   This Month's Commissions: ${monthly.monthly_count}`);
    console.log(`   This Month's Total: $${parseFloat(monthly.monthly_total || 0).toFixed(2)}`);
    
    // List all commissions
    console.log('\n' + '=' .repeat(80));
    console.log('\n📋 All Commissions:');
    
    const allCommissions = await pool.query(`
      SELECT 
        c.id,
        c.commission_amount,
        c.payment_status,
        c.plan_name,
        c.plan_tier,
        c.plan_type,
        c.created_at,
        m.first_name || ' ' || m.last_name as member_name
      FROM commissions c
      LEFT JOIN members m ON c.member_id = m.id
      WHERE c.agent_id = $1
      ORDER BY c.created_at DESC
    `, [agent.id]);
    
    allCommissions.rows.forEach((comm, index) => {
      console.log(`\n   ${index + 1}. ${comm.member_name || 'Unknown'}`);
      console.log(`      Plan: ${comm.plan_tier || 'N/A'} ${comm.plan_name || ''}`);
      console.log(`      Amount: $${parseFloat(comm.commission_amount).toFixed(2)}`);
      console.log(`      Status: ${comm.payment_status}`);
      console.log(`      Date: ${new Date(comm.created_at).toLocaleDateString()}`);
    });
    
    console.log('\n' + '=' .repeat(80));
    console.log('\n✅ Test complete!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

testAgentStats();
