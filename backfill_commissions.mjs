import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Commission calculation function (same as in routes.ts)
function calculateCommission(planName, coverageType) {
  const commissions = {
    'Base': {
      'Member Only': { commission: 9, totalCost: 28 },
      'Member+Spouse': { commission: 15, totalCost: 50 },
      'Member+Child': { commission: 17, totalCost: 59 },
      'Family': { commission: 17, totalCost: 59 },
    },
    'Plus': {
      'Member Only': { commission: 20, totalCost: 78 },
      'Member+Spouse': { commission: 40, totalCost: 139 },
      'Member+Child': { commission: 40, totalCost: 156 },
      'Family': { commission: 40, totalCost: 156 },
    },
    'Elite': {
      'Member Only': { commission: 20, totalCost: 86 },
      'Member+Spouse': { commission: 40, totalCost: 150 },
      'Member+Child': { commission: 40, totalCost: 167 },
      'Family': { commission: 40, totalCost: 167 },
    }
  };

  const plan = commissions[planName];
  if (!plan) {
    console.log(`No commission structure found for plan: ${planName}`);
    return null;
  }

  const rate = plan[coverageType];
  if (!rate) {
    console.log(`No commission rate found for coverage type: ${coverageType} in plan: ${planName}`);
    return null;
  }

  return rate;
}

async function backfillCommissions() {
  console.log('🔧 BACKFILLING MISSING COMMISSIONS');
  console.log('═'.repeat(80));
  
  try {
    // Find members with agent info but no commission
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
      LEFT JOIN commissions c ON m.customer_number = CAST(c.subscription_id AS VARCHAR)
      WHERE m.agent_number IS NOT NULL 
        AND m.enrolled_by_agent_id IS NOT NULL
        AND c.id IS NULL
      ORDER BY m.created_at ASC
    `);

    if (membersWithoutCommissions.rows.length === 0) {
      console.log('\n✅ No missing commissions found. All enrollments have commissions!');
      await pool.end();
      return;
    }

    console.log(`\n📋 Found ${membersWithoutCommissions.rows.length} members without commissions\n`);

    let successCount = 0;
    let failCount = 0;

    for (const member of membersWithoutCommissions.rows) {
      console.log(`\nProcessing: ${member.customer_number} - ${member.first_name} ${member.last_name}`);
      console.log(`  Agent: ${member.agent_number}`);
      console.log(`  Enrolled By: ${member.enrolled_by_agent_id}`);
      console.log(`  Member Type: ${member.member_type || 'Unknown'}`);

      // Default to Base plan and Member Only if not specified
      const planName = 'Base'; // Default assumption
      
      // Normalize coverage type format (database has lowercase-hyphen, calculation needs TitleCase Space)
      let coverageType = member.member_type || 'Member Only';
      if (coverageType === 'member-only') coverageType = 'Member Only';
      if (coverageType === 'member+spouse') coverageType = 'Member+Spouse';
      if (coverageType === 'member+child') coverageType = 'Member+Child';
      if (coverageType === 'family') coverageType = 'Family';

      console.log(`  Normalized Coverage Type: ${coverageType}`);
      const commissionResult = calculateCommission(planName, coverageType);

      if (commissionResult) {
        try {
          // Insert commission - use exact column names from schema check
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
            member.enrolled_by_agent_id,  // agent_id
            member.id,                     // subscription_id (member id, not parsed)
            member.id,                     // user_id
            planName,                      // plan_name
            coverageType,                  // plan_type
            planName,                      // plan_tier
            commissionResult.commission,   // commission_amount
            commissionResult.totalCost,    // total_plan_cost
            'pending',                     // status
            'unpaid',                      // payment_status
            member.created_at,             // created_at
            new Date()                     // updated_at
          ]);

          const commissionId = result.rows[0].id;
          console.log(`  ✅ Commission created: ID ${commissionId}, $${commissionResult.commission} (${planName} - ${coverageType})`);
          successCount++;
        } catch (insertError) {
          console.error(`  ❌ Failed to create commission:`, insertError.message);
          failCount++;
        }
      } else {
        console.warn(`  ⚠️  Could not calculate commission for plan: ${planName}, coverage: ${coverageType}`);
        failCount++;
      }
    }

    console.log('\n' + '═'.repeat(80));
    console.log('📊 BACKFILL SUMMARY:');
    console.log('═'.repeat(80));
    console.log(`✅ Successfully created: ${successCount} commissions`);
    console.log(`❌ Failed: ${failCount} commissions`);
    console.log(`📋 Total processed: ${membersWithoutCommissions.rows.length} members`);
    
    if (successCount > 0) {
      console.log('\n🎉 Backfill completed successfully!');
      console.log('\n📝 Next steps:');
      console.log('   1. Run: node check_neon_data.mjs');
      console.log('   2. Verify commissions appear in database');
      console.log('   3. Check agent commission dashboard');
    }

  } catch (error) {
    console.error('❌ Error during backfill:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

console.log('\n⚠️  WARNING: This will create commission records for existing members');
console.log('   Assumptions: Base plan, existing member_type as coverage type');
console.log('   Review the members above before proceeding\n');

backfillCommissions();
