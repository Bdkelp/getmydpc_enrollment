import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const neonPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkAgentEnrollmentsData() {
  try {
    console.log('\n🔍 CHECKING AGENT ENROLLMENTS DATA\n');
    console.log('=' .repeat(80));

    const agentId = 'michael@mypremierplans.com';

    // 1. What getAgentEnrollments is currently querying (WRONG - users table)
    console.log('\n❌ CURRENT QUERY (from users table - WRONG):');
    console.log('-'.repeat(80));
    const wrongQuery = await neonPool.query(`
      SELECT * FROM users WHERE enrolled_by_agent_id = $1
    `, [agentId]);
    console.log(`Found ${wrongQuery.rows.length} records in users table`);
    if (wrongQuery.rows.length > 0) {
      console.table(wrongQuery.rows.slice(0, 5).map(r => ({
        id: r.id,
        email: r.email,
        role: r.role,
        created_at: r.created_at
      })));
    }

    // 2. What it SHOULD be querying (members table)
    console.log('\n✅ CORRECT QUERY (from members table):');
    console.log('-'.repeat(80));
    const correctQuery = await neonPool.query(`
      SELECT 
        m.*,
        p.name as plan_name,
        p.price as plan_price,
        c.commission_amount,
        c.payment_status
      FROM members m
      LEFT JOIN plans p ON m.plan_id = p.id
      LEFT JOIN commissions c ON c.member_id = m.id
      WHERE m.enrolled_by_agent_id = $1 AND m.is_active = true
      ORDER BY m.created_at DESC
    `, [agentId]);
    
    console.log(`Found ${correctQuery.rows.length} records in members table`);
    console.table(correctQuery.rows.map(r => ({
      customer_number: r.customer_number,
      first_name: r.first_name,
      last_name: r.last_name,
      plan_id: r.plan_id,
      plan_name: r.plan_name,
      plan_price: r.plan_price,
      coverage_type: r.coverage_type,
      total_monthly_price: r.total_monthly_price,
      commission: r.commission_amount,
      status: r.payment_status
    })));

    await neonPool.end();

  } catch (error) {
    console.error('❌ Error:', error.message);
    await neonPool.end();
    process.exit(1);
  }
}

checkAgentEnrollmentsData();
