import { config } from 'dotenv';
import pg from 'pg';
const { Pool } = pg;

config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function diagnoseCommissions() {
  console.log('='.repeat(60));
  console.log('COMMISSION TRACKING DIAGNOSIS');
  console.log('='.repeat(60));
  
  try {
    // 1. Check Members Table
    console.log('\n1️⃣ MEMBERS TABLE:');
    const membersResult = await pool.query(`
      SELECT 
        id,
        customer_number,
        first_name,
        last_name,
        email,
        enrolled_by_agent_id,
        agent_number,
        member_type,
        plan_id,
        coverage_type,
        total_monthly_price,
        created_at
      FROM members 
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    console.log(`   Total members: ${membersResult.rows.length}`);
    console.log('   Sample data:');
    membersResult.rows.forEach((row, idx) => {
      console.log(`   ${idx + 1}. ${row.customer_number} - ${row.first_name} ${row.last_name}`);
      console.log(`      Email: ${row.email}`);
      console.log(`      Agent: ${row.agent_number} / ${row.enrolled_by_agent_id}`);
      console.log(`      Plan ID: ${row.plan_id}, Coverage: ${row.coverage_type}, Price: $${row.total_monthly_price}`);
      console.log(`      Created: ${row.created_at}`);
      console.log('');
    });

    // 2. Check Commissions Table
    console.log('\n2️⃣ COMMISSIONS TABLE:');
    const commissionsResult = await pool.query(`
      SELECT * FROM commissions ORDER BY created_at DESC LIMIT 10
    `);
    
    console.log(`   Total commissions: ${commissionsResult.rows.length}`);
    if (commissionsResult.rows.length > 0) {
      commissionsResult.rows.forEach((row, idx) => {
        console.log(`   ${idx + 1}. Agent: ${row.agent_id}, Amount: $${row.commission_amount}`);
        console.log(`      Plan: ${row.plan_name} (${row.plan_type})`);
        console.log(`      Member ID: ${row.user_id}, Subscription ID: ${row.subscription_id}`);
        console.log(`      Status: ${row.status}, Payment: ${row.payment_status}`);
        console.log('');
      });
    } else {
      console.log('   ❌ NO COMMISSIONS FOUND');
    }

    // 3. Check Commissions Table Schema
    console.log('\n3️⃣ COMMISSIONS TABLE SCHEMA:');
    const schemaResult = await pool.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable,
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'commissions'
      ORDER BY ordinal_position
    `);
    
    console.log('   Columns:');
    schemaResult.rows.forEach(col => {
      console.log(`   - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULLABLE'}`);
      if (col.column_default) console.log(`     Default: ${col.column_default}`);
    });

    // 4. Check for any commission creation errors or constraints
    console.log('\n4️⃣ TABLE CONSTRAINTS:');
    const constraintsResult = await pool.query(`
      SELECT
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.table_name = 'commissions'
      ORDER BY tc.constraint_type, tc.constraint_name
    `);
    
    if (constraintsResult.rows.length > 0) {
      constraintsResult.rows.forEach(row => {
        console.log(`   ${row.constraint_type}: ${row.constraint_name} on ${row.column_name || 'table'}`);
      });
    } else {
      console.log('   No constraints found');
    }

    // 5. Check subscriptions table (if it exists)
    console.log('\n5️⃣ SUBSCRIPTIONS TABLE:');
    try {
      const subsResult = await pool.query(`
        SELECT COUNT(*) as count FROM subscriptions
      `);
      console.log(`   Total subscriptions: ${subsResult.rows[0].count}`);
      
      if (subsResult.rows[0].count > 0) {
        const subsDetailResult = await pool.query(`
          SELECT id, user_id, status, amount, created_at 
          FROM subscriptions 
          ORDER BY created_at DESC 
          LIMIT 5
        `);
        console.log('   Recent subscriptions:');
        subsDetailResult.rows.forEach((row, idx) => {
          console.log(`   ${idx + 1}. ID: ${row.id}, User: ${row.user_id}, Status: ${row.status}, Amount: $${row.amount}`);
        });
      }
    } catch (err) {
      console.log('   Table might not exist or has different structure');
    }

    // 6. Check if commissions table is in Neon or Supabase
    console.log('\n6️⃣ DATABASE LOCATION CHECK:');
    console.log(`   Connected to: ${process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] || 'unknown'}`);
    
    // 7. Try to insert a test commission to see what fails
    console.log('\n7️⃣ TEST COMMISSION INSERT:');
    try {
      const testMember = membersResult.rows[0];
      if (testMember && testMember.enrolled_by_agent_id) {
        console.log('   Attempting test insert...');
        const testResult = await pool.query(`
          INSERT INTO commissions (
            agent_id,
            user_id,
            subscription_id,
            plan_name,
            plan_type,
            plan_tier,
            commission_amount,
            total_plan_cost,
            status,
            payment_status,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id
        `, [
          testMember.enrolled_by_agent_id,
          testMember.id,
          testMember.id, // Using member ID as subscription
          'Base',
          testMember.coverage_type || 'Member Only',
          'Base',
          9.00,
          testMember.total_monthly_price || 79.00,
          'pending',
          'unpaid',
          new Date()
        ]);
        
        console.log(`   ✅ TEST COMMISSION CREATED! ID: ${testResult.rows[0].id}`);
        
        // Delete the test commission
        await pool.query('DELETE FROM commissions WHERE id = $1', [testResult.rows[0].id]);
        console.log('   Test commission cleaned up');
      } else {
        console.log('   ⚠️  No member with agent info found for test');
      }
    } catch (testError) {
      console.log(`   ❌ TEST INSERT FAILED: ${testError.message}`);
      console.log(`   Error code: ${testError.code}`);
      console.log(`   Error detail: ${testError.detail}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('DIAGNOSIS COMPLETE');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ Diagnosis failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

diagnoseCommissions();
