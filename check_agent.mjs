import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkAgent() {
  try {
    // Check members
    const members = await pool.query(`
      SELECT customer_number, first_name, last_name, agent_number, enrolled_by_agent_id
      FROM members
      WHERE agent_number IS NOT NULL
      ORDER BY created_at
    `);

    console.log('\n📋 Members with agent info:');
    members.rows.forEach(m => {
      console.log(`  ${m.customer_number}: enrolled_by_agent_id = "${m.enrolled_by_agent_id}"`);
    });

    // Check if agent exists in users table
    const agentEmail = members.rows[0]?.enrolled_by_agent_id;
    if (agentEmail) {
      const user = await pool.query(`
        SELECT id, email, role, username
        FROM users
        WHERE email = $1 OR id = $1
      `, [agentEmail]);

      console.log(`\n🔍 Checking for agent "${agentEmail}" in users table:`);
      if (user.rows.length > 0) {
        console.log('  ✅ Agent found:');
        user.rows.forEach(u => {
          console.log(`    ID: ${u.id}, Email: ${u.email}, Role: ${u.role}, Username: ${u.username}`);
        });
      } else {
        console.log('  ❌ Agent NOT found in users table!');
        console.log('\n💡 The agent must exist in the users table for foreign key constraint');
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkAgent();
