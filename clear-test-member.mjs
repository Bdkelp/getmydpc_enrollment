import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

async function clearTestData() {
  console.log('🧹 Clearing test member data...\n');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Delete Tara Hamilton
    const result = await pool.query(`
      DELETE FROM members 
      WHERE email ILIKE '%tara%' 
      OR first_name ILIKE '%tara%'
      RETURNING customer_number, first_name, last_name, email
    `);
    
    if (result.rows.length > 0) {
      console.log('✅ Deleted test member(s):');
      result.rows.forEach(m => {
        console.log(`   ${m.customer_number} - ${m.first_name} ${m.last_name} (${m.email})`);
      });
    } else {
      console.log('ℹ️  No test members found to delete');
    }
    
    console.log('\n✅ Test data cleared - ready for fresh enrollment test\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

clearTestData();
