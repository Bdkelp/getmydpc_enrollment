import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkTylaraJones() {
  try {
    console.log('🔍 Searching for Tylara Jones enrollment...\n');
    
    // Search for member
    const memberResult = await pool.query(`
      SELECT *
      FROM members 
      WHERE LOWER(first_name) LIKE '%tylara%' 
         OR LOWER(last_name) LIKE '%jones%'
      ORDER BY created_at DESC
    `);
    
    if (memberResult.rows.length === 0) {
      console.log('❌ No member found with name Tylara Jones');
      console.log('\n📋 Recent members in database:');
      
      const recentMembers = await pool.query(`
        SELECT 
          customer_number,
          first_name,
          last_name,
          email,
          created_at
        FROM members 
        ORDER BY created_at DESC 
        LIMIT 5
      `);
      
      if (recentMembers.rows.length === 0) {
        console.log('   No members found in database');
      } else {
        recentMembers.rows.forEach(member => {
          console.log(`   - ${member.first_name} ${member.last_name} (${member.customer_number}) - ${member.email}`);
          console.log(`     Created: ${new Date(member.created_at).toLocaleString()}`);
        });
      }
    } else {
      console.log(`✅ Found ${memberResult.rows.length} member(s):\n`);
      
      for (const member of memberResult.rows) {
        console.log(`👤 Member Details:`);
        console.log(JSON.stringify(member, null, 2));
        
        // Check for commissions
        console.log(`\n💰 Checking commissions...`);
        const commissionResult = await pool.query(`
          SELECT *
          FROM commissions
          WHERE customer_number = $1
          ORDER BY created_at DESC
        `, [member.customer_number]);
        
        if (commissionResult.rows.length === 0) {
          console.log(`   ❌ No commissions found for this member`);
        } else {
          console.log(`   ✅ Found ${commissionResult.rows.length} commission(s):`);
          console.log(JSON.stringify(commissionResult.rows, null, 2));
        }
        console.log('');
      }
    }
    
    // Check total member count
    const countResult = await pool.query('SELECT COUNT(*) as total FROM members');
    console.log(`\n📊 Total members in database: ${countResult.rows[0].total}`);
    
    // Check total commission count
    const commCountResult = await pool.query('SELECT COUNT(*) as total FROM commissions');
    console.log(`📊 Total commissions in database: ${commCountResult.rows[0].total}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

checkTylaraJones();
