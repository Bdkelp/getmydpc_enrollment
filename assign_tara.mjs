import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const neonPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function assignTaraAndCreateCommission() {
  try {
    console.log('\n👤 ASSIGNING TARA TO MICHAEL & CREATING COMMISSION\n');
    console.log('=' .repeat(80));

    // 1. Assign tara to Michael
    await neonPool.query(`
      UPDATE members 
      SET enrolled_by_agent_id = 'michael@mypremierplans.com'
      WHERE id = 1
    `);
    console.log('✅ Assigned tara hamilton (MPP2025-0001) to Michael Keener');

    // 2. Create commission for tara
    await neonPool.query(`
      INSERT INTO commissions (
        agent_id,
        member_id,
        commission_amount,
        plan_name,
        plan_type,
        plan_tier,
        status,
        payment_status,
        total_plan_cost,
        created_at
      ) VALUES (
        '8bda1072-ab65-4733-a84b-2a3609a69450',
        1,
        8,
        'Base',
        'Member Only',
        'Base',
        'pending',
        'unpaid',
        61.36,
        NOW()
      )
    `);
    console.log('✅ Created commission: $8.00 (Base plan)');

    // 3. Show final totals
    const result = await neonPool.query(`
      SELECT COUNT(*) as count, SUM(commission_amount) as total 
      FROM commissions
    `);
    
    console.log('\n📊 FINAL TOTALS:');
    console.log('-'.repeat(80));
    console.log(`   Total commissions: ${result.rows[0].count}`);
    console.log(`   Total amount: $${parseFloat(result.rows[0].total).toFixed(2)}`);

    await neonPool.end();
    console.log('\n✅ COMPLETE!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    await neonPool.end();
    process.exit(1);
  }
}

assignTaraAndCreateCommission();
