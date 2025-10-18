import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Commission structure based on plan tier and coverage type
function calculateCommission(planTier, coverageType, planName) {
  // Best Choice Rx - always $2.50
  if (planName && (planName.toLowerCase().includes('best choice') || planName.toLowerCase().includes('rx'))) {
    return 2.50;
  }

  // Base Plan
  if (planTier === 'Base') {
    if (coverageType === 'Member Only') return 9.00;
    if (coverageType === 'Member + Spouse') return 15.00;
    if (coverageType === 'Member + Child' || coverageType === 'Member + Children') return 17.00;
    if (coverageType === 'Family') return 17.00;
  }

  // Plus Plan
  if (planTier === 'Plus') {
    if (coverageType === 'Member Only') return 20.00;
    if (coverageType === 'Member + Spouse') return 40.00;
    if (coverageType === 'Member + Child' || coverageType === 'Member + Children') return 40.00;
    if (coverageType === 'Family') return 40.00;
  }

  // Elite Plan (same as Plus)
  if (planTier === 'Elite') {
    if (coverageType === 'Member Only') return 20.00;
    if (coverageType === 'Member + Spouse') return 40.00;
    if (coverageType === 'Member + Child' || coverageType === 'Member + Children') return 40.00;
    if (coverageType === 'Family') return 40.00;
  }

  // Default fallback
  return 9.00;
}

async function recalculateCommissions() {
  console.log('💰 Recalculating All Commission Amounts');
  console.log('============================================================\n');

  try {
    // Get all commissions with member coverage info
    const result = await pool.query(`
      SELECT 
        c.id,
        c.commission_amount as old_commission,
        c.plan_tier,
        c.plan_type,
        c.plan_name,
        m.coverage_type,
        m.first_name,
        m.last_name,
        m.customer_number
      FROM commissions c
      LEFT JOIN members m ON c.member_id = m.id
      ORDER BY c.id
    `);

    console.log(`📋 Found ${result.rows.length} commission records\n`);

    let updatedCount = 0;
    let unchangedCount = 0;
    let totalOldCommission = 0;
    let totalNewCommission = 0;

    for (const row of result.rows) {
      const oldCommission = parseFloat(row.old_commission || 0);
      const coverageType = row.coverage_type || row.plan_type || 'Member Only';
      const newCommission = calculateCommission(row.plan_tier, coverageType, row.plan_name);

      totalOldCommission += oldCommission;
      totalNewCommission += newCommission;

      if (oldCommission !== newCommission) {
        // Update the commission
        await pool.query(`
          UPDATE commissions 
          SET commission_amount = $1, updated_at = NOW()
          WHERE id = $2
        `, [newCommission, row.id]);

        console.log(`✏️  Updated Commission #${row.id}:`);
        console.log(`   Member: ${row.first_name} ${row.last_name} (${row.customer_number})`);
        console.log(`   Plan: ${row.plan_tier} - ${coverageType}`);
        console.log(`   Old: $${oldCommission.toFixed(2)} → New: $${newCommission.toFixed(2)}`);
        console.log('');
        updatedCount++;
      } else {
        unchangedCount++;
      }
    }

    console.log('\n============================================================');
    console.log('📊 RECALCULATION SUMMARY:');
    console.log('============================================================');
    console.log(`Total commissions: ${result.rows.length}`);
    console.log(`Updated: ${updatedCount}`);
    console.log(`Unchanged: ${unchangedCount}`);
    console.log(`\nOld total: $${totalOldCommission.toFixed(2)}`);
    console.log(`New total: $${totalNewCommission.toFixed(2)}`);
    console.log(`Difference: $${(totalNewCommission - totalOldCommission).toFixed(2)}`);
    console.log('\n============================================================');
    console.log('✅ RECALCULATION COMPLETE');
    console.log('============================================================\n');

    // Show commission structure reference
    console.log('📋 Commission Structure Reference:');
    console.log('============================================================');
    console.log('Best Choice Rx: $2.50 (all tiers, all coverage types)');
    console.log('\nBase Plan:');
    console.log('  - Member Only: $9.00');
    console.log('  - Member + Spouse: $15.00');
    console.log('  - Member + Child: $17.00');
    console.log('  - Family: $17.00');
    console.log('\nPlus Plan:');
    console.log('  - Member Only: $20.00');
    console.log('  - Member + Spouse: $40.00');
    console.log('  - Member + Child: $40.00');
    console.log('  - Family: $40.00');
    console.log('\nElite Plan (same as Plus):');
    console.log('  - Member Only: $20.00');
    console.log('  - Member + Spouse: $40.00');
    console.log('  - Member + Child: $40.00');
    console.log('  - Family: $40.00');
    console.log('============================================================\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

recalculateCommissions();
