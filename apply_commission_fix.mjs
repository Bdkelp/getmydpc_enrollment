import { config } from 'dotenv';
import pg from 'pg';
import fs from 'fs';
const { Pool } = pg;

config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function applyFix() {
  try {
    console.log('Applying commission trigger fix...\n');
    
    const sql = fs.readFileSync('./fix_commission_trigger.sql', 'utf-8');
    const result = await pool.query(sql);
    
    console.log('✅ Fix applied successfully!');
    console.log('Result:', result[result.length - 1].rows[0]);
    
  } catch (error) {
    console.error('❌ Error applying fix:', error.message);
  } finally {
    await pool.end();
  }
}

applyFix();
