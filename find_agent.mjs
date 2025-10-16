import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const result = await pool.query(
  "SELECT id, email, role FROM users WHERE email = 'michael@mypremierplans.com'"
);

console.log('\n🔍 Looking for michael@mypremierplans.com:');
console.table(result.rows);

if (result.rows.length === 0) {
  console.log('\n❌ User not found! Showing all agent users:');
  const allAgents = await pool.query("SELECT id, email, role FROM users WHERE role = 'agent'");
  console.table(allAgents.rows);
}

await pool.end();
