import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkCommissionSchema() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'commissions' 
      ORDER BY ordinal_position
    `);
    
    console.log('📋 Commissions table columns:');
    result.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type}`);
    });
    
    // Check all commissions
    const commissions = await pool.query('SELECT * FROM commissions ORDER BY created_at DESC LIMIT 5');
    console.log(`\n💰 Recent commissions (${commissions.rows.length}):`);
    if (commissions.rows.length === 0) {
      console.log('   No commissions found');
    } else {
      console.log(JSON.stringify(commissions.rows, null, 2));
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkCommissionSchema();
