import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function testCommissionDataStructure() {
  console.log('🔍 Testing Commission Data Structure');
  console.log('============================================================\n');

  try {
    // Get Michael's UUID
    const admin = await pool.query(`
      SELECT id FROM users WHERE email = 'michael@mypremierplans.com'
    `);
    
    const adminUUID = admin.rows[0].id;
    
    // Get commissions exactly as the API would
    const commissions = await pool.query(`
      SELECT * FROM commissions WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 5
    `, [adminUUID]);
    
    console.log(`📋 Sample commission records (${commissions.rows.length} shown):\n`);
    
    if (commissions.rows.length === 0) {
      console.log('❌ No commissions found!');
    } else {
      console.log('Commission data structure:');
      console.log(JSON.stringify(commissions.rows[0], null, 2));
      console.log('\n');
      
      // Check what fields are missing
      console.log('📊 Field Analysis:');
      const sampleCommission = commissions.rows[0];
      const requiredFields = ['userName', 'planName', 'planType', 'planTier', 'commissionAmount', 'totalPlanCost', 'status', 'paymentStatus'];
      
      requiredFields.forEach(field => {
        const hasField = field in sampleCommission;
        const value = sampleCommission[field];
        console.log(`  ${hasField ? '✅' : '❌'} ${field}: ${value !== undefined && value !== null ? JSON.stringify(value) : 'MISSING'}`);
      });
      
      // Check if we need to join with members table
      console.log('\n🔗 Checking member data:');
      const memberQuery = await pool.query(`
        SELECT 
          c.*,
          m.first_name,
          m.last_name,
          m.email
        FROM commissions c
        LEFT JOIN members m ON c.member_id = m.id
        WHERE c.agent_id = $1
        ORDER BY c.created_at DESC
        LIMIT 1
      `, [adminUUID]);
      
      if (memberQuery.rows.length > 0) {
        console.log('Member data attached:');
        console.log(JSON.stringify(memberQuery.rows[0], null, 2));
      }
    }
    
    console.log('\n============================================================');
    console.log('✅ TEST COMPLETE');
    console.log('============================================================\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

testCommissionDataStructure();
