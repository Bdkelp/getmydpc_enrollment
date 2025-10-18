import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function findCommissionAgent() {
  const result = await pool.query(`
    SELECT id, email, first_name, last_name, agent_number, role
    FROM users 
    WHERE id = '8bda1072-ab65-4733-a84b-2a3609a69450'
  `);
  
  console.log('Agent with UUID 8bda1072-ab65-4733-a84b-2a3609a69450:');
  console.log(result.rows);
  
  if (result.rows.length === 0) {
    console.log('\n❌ No user found with this UUID!');
    console.log('This might be an old/deleted agent account.');
  }
  
  await pool.end();
}

findCommissionAgent();
