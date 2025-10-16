import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const neonPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Correct commission structure from COMMISSION_STRUCTURE.md
function calculateCommission(planTier, coverageType, hasRxValet) {
  let baseCommission = 0;
  
  // Normalize coverage type
  const normalizedCoverage = coverageType?.toLowerCase().replace(/[^a-z]/g, '') || '';
  
  // Base Plan commissions
  if (planTier === 'Base') {
    if (normalizedCoverage.includes('memberonly') || normalizedCoverage === 'member') {
      baseCommission = 9.00;
    } else if (normalizedCoverage.includes('spouse')) {
      baseCommission = 15.00;
    } else if (normalizedCoverage.includes('child')) {
      baseCommission = 17.00;
    } else if (normalizedCoverage.includes('family')) {
      baseCommission = 17.00;
    }
  }
  // Plus Plan commissions
  else if (planTier === 'Plus' || planTier === 'MyPremierPlan+') {
    if (normalizedCoverage.includes('memberonly') || normalizedCoverage === 'member') {
      baseCommission = 20.00;
    } else if (normalizedCoverage.includes('spouse') || normalizedCoverage.includes('child') || normalizedCoverage.includes('family')) {
      baseCommission = 40.00;
    }
  }
  // Elite Plan commissions
  else if (planTier === 'Elite') {
    if (normalizedCoverage.includes('memberonly') || normalizedCoverage === 'member') {
      baseCommission = 20.00;
    } else if (normalizedCoverage.includes('spouse') || normalizedCoverage.includes('child') || normalizedCoverage.includes('family')) {
      baseCommission = 40.00;
    }
  }
  
  // Add RxValet bonus if applicable
  if (hasRxValet) {
    baseCommission += 2.50;
  }
  
  return baseCommission;
}

async function fixAllCommissions() {
  try {
    console.log('\n💰 FIXING ALL COMMISSION AMOUNTS\n');
    console.log('=' .repeat(80));

    // 1. Get all members with their plan and coverage info
    console.log('\n📋 Fetching members with plan details...');
    const membersResult = await neonPool.query(`
      SELECT 
        m.id,
        m.customer_number,
        m.first_name,
        m.last_name,
        m.plan_id,
        m.coverage_type,
        m.add_rx_valet,
        p.name as plan_name
      FROM members m
      LEFT JOIN plans p ON m.plan_id = p.id
      WHERE m.is_active = true
      ORDER BY m.id
    `);

    console.log(`✅ Found ${membersResult.rows.length} members\n`);

    // 2. Update each commission with correct amount
    console.log('🔧 Updating commission amounts...');
    console.log('-'.repeat(80));

    for (const member of membersResult.rows) {
      // Determine plan tier from plan name
      let planTier = 'Base';
      if (member.plan_name) {
        if (member.plan_name.includes('Elite')) {
          planTier = 'Elite';
        } else if (member.plan_name.includes('+')) {
          planTier = 'Plus';
        }
      }

      const correctCommission = calculateCommission(
        planTier,
        member.coverage_type,
        member.add_rx_valet
      );

      // Update the commission
      const updateResult = await neonPool.query(`
        UPDATE commissions 
        SET commission_amount = $1,
            plan_name = $2,
            plan_tier = $2
        WHERE member_id = $3
        RETURNING id, commission_amount
      `, [correctCommission, planTier, member.id]);

      if (updateResult.rows.length > 0) {
        console.log(`  ✅ ${member.customer_number} (${member.first_name} ${member.last_name})`);
        console.log(`     Plan: ${planTier} - ${member.coverage_type || 'Member Only'}`);
        console.log(`     RxValet: ${member.add_rx_valet ? 'Yes (+$2.50)' : 'No'}`);
        console.log(`     Commission: $${correctCommission.toFixed(2)}`);
        console.log('');
      }
    }

    // 3. Show final summary
    console.log('\n✅ FINAL COMMISSION SUMMARY:');
    console.log('-'.repeat(80));
    
    const summary = await neonPool.query(`
      SELECT 
        c.id,
        m.customer_number,
        m.first_name,
        m.last_name,
        c.plan_tier,
        m.coverage_type,
        m.add_rx_valet,
        c.commission_amount
      FROM commissions c
      JOIN members m ON c.member_id = m.id
      ORDER BY c.id
    `);

    console.table(summary.rows);

    const totalResult = await neonPool.query(`
      SELECT 
        COUNT(*) as count,
        SUM(commission_amount) as total
      FROM commissions
    `);

    console.log(`\n📊 Total Commissions: ${totalResult.rows[0].count}`);
    console.log(`💰 Total Amount: $${parseFloat(totalResult.rows[0].total).toFixed(2)}`);

    await neonPool.end();
    console.log('\n✅ COMMISSION FIX COMPLETE!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    await neonPool.end();
    process.exit(1);
  }
}

fixAllCommissions();
