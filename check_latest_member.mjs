import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkLatestMember() {
  try {
    const result = await pool.query(`
      SELECT 
        customer_number,
        first_name,
        last_name,
        email,
        phone,
        member_type,
        agent_number,
        enrolled_by_agent_id,
        status,
        plan_start_date,
        enrollment_date,
        created_at
      FROM members
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (result.rows.length > 0) {
      const member = result.rows[0];
      console.log('\n📋 Latest Member Enrollment Data:\n');
      console.log('Customer Number:', member.customer_number);
      console.log('Name:', member.first_name, member.last_name);
      console.log('Email:', member.email);
      console.log('Phone:', member.phone);
      console.log('\n💳 Plan Information (from members table):');
      console.log('  Member Type:', member.member_type);
      console.log('  Plan Start Date:', member.plan_start_date);
      console.log('  Enrollment Date:', member.enrollment_date);
      console.log('\n⚠️  MISSING COLUMNS:');
      console.log('  - plan_id (not stored)');
      console.log('  - coverage_type (not stored)');
      console.log('  - total_monthly_price (not stored)');
      console.log('  - add_rx_valet (not stored)');
      console.log('\n👤 Agent Information:');
      console.log('  Agent Number:', member.agent_number);
      console.log('  Enrolled By:', member.enrolled_by_agent_id);
      console.log('\n📅 Status:');
      console.log('  Status:', member.status);
      console.log('  Created:', member.created_at);
    } else {
      console.log('No members found');
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkLatestMember();
