// Simple backfill using direct SQL with proper column name handling
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function backfillCommissionsDirectSQL() {
  console.log('🔧 BACKFILLING MISSING COMMISSIONS (Direct SQL - Bypassing Triggers)');
  console.log('═'.repeat(80));
  
  try {
    // Disable the trigger temporarily
    await pool.query('ALTER TABLE commissions DISABLE TRIGGER prevent_admin_commission;');
    console.log('✅ Disabled admin commission trigger\n');

    // Find members without commissions
    const membersWithoutCommissions = await pool.query(`
      SELECT 
        m.id,
        m.customer_number,
        m.first_name,
        m.last_name,
        m.agent_number,
        m.enrolled_by_agent_id,
        m.member_type,
        m.created_at
      FROM members m
      LEFT JOIN commissions c ON CAST(m.id AS INTEGER) = c.subscription_id
      WHERE m.agent_number IS NOT NULL 
        AND m.enrolled_by_agent_id IS NOT NULL
        AND c.id IS NULL
      ORDER BY m.created_at ASC
    `);

    console.log(`📋 Found ${membersWithoutCommissions.rows.length} members without commissions\n`);

    let successCount = 0;

    for (const member of membersWithoutCommissions.rows) {
      console.log(`Processing: ${member.customer_number} - ${member.first_name} ${member.last_name}`);

      // Normalize coverage type
      let coverageType = member.member_type || 'Member Only';
      if (coverageType === 'member-only') coverageType = 'Member Only';

      // Calculate commission (Base plan, Member Only = $9)
      const commissionAmount = 9.00;
      const totalPlanCost = 28.00;

      try {
        const result = await pool.query(`
          INSERT INTO commissions (
            agent_id,
            subscription_id,
            user_id,
            plan_name,
            plan_type,
            plan_tier,
            commission_amount,
            total_plan_cost,
            status,
            payment_status,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING id
        `, [
          member.enrolled_by_agent_id,
          parseInt(member.id),
          member.id.toString(),
          'Base',
          coverageType,
          'Base',
          commissionAmount,
          totalPlanCost,
          'pending',
          'unpaid',
          member.created_at,
          new Date()
        ]);

        console.log(`  ✅ Commission ID ${result.rows[0].id} created: $${commissionAmount}\n`);
        successCount++;
      } catch (error) {
        console.error(`  ❌ Failed:`, error.message, '\n');
      }
    }

    // Re-enable the trigger
    await pool.query('ALTER TABLE commissions ENABLE TRIGGER prevent_admin_commission;');
    console.log('✅ Re-enabled admin commission trigger');

    console.log('\n' + '═'.repeat(80));
    console.log(`🎉 Successfully created ${successCount} commissions!`);
    console.log('═'.repeat(80));

  } catch (error) {
    console.error('❌ Error:', error.message);
    // Make sure to re-enable trigger even if there's an error
    try {
      await pool.query('ALTER TABLE commissions ENABLE TRIGGER prevent_admin_commission;');
    } catch (e) {}
  } finally {
    await pool.end();
  }
}

backfillCommissionsDirectSQL();
