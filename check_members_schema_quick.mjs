import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkSchema() {
  const result = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'members' 
    ORDER BY ordinal_position
  `);
  
  console.log('Members table columns:');
  result.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));
  await pool.end();
}

checkSchema();
