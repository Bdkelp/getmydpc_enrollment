import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

async function checkSchema() {
  console.log('🔍 Checking commissions table structure...\n');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Get commissions table columns
    const columns = await pool.query(`
      SELECT column_name, data_type, character_maximum_length 
      FROM information_schema.columns 
      WHERE table_name = 'commissions' 
      ORDER BY ordinal_position
    `);
    
    console.log('📋 Commissions table columns:');
    columns.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}${col.character_maximum_length ? `(${col.character_maximum_length})` : ''}`);
    });
    
    console.log('\n💰 Recent commissions:');
    const recent = await pool.query(`
      SELECT * FROM commissions 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    
    console.log(`Found ${recent.rows.length} commission(s)\n`);
    
    if (recent.rows.length > 0) {
      recent.rows.forEach((c, i) => {
        console.log(`  Commission ${i + 1}:`);
        console.log(`    ${JSON.stringify(c, null, 2)}`);
      });
    } else {
      console.log('  No commissions found in database');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkSchema();
