import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkSchemas() {
  console.log('📋 Plans table columns:');
  const plans = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'plans' 
    ORDER BY ordinal_position
  `);
  plans.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));
  
  console.log('\n📋 Commissions table columns:');
  const commissions = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'commissions' 
    ORDER BY ordinal_position
  `);
  commissions.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));
  
  await pool.end();
}

checkSchemas();
