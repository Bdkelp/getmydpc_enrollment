import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const neonPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Commission calculation function (matching server logic)
function calculateCommission(planName, coverageType) {
  const commissionRates = {
    'Base': {
      'Member Only': { totalCost: 47.19, commission: 8.00 },
      'Member + Spouse': { totalCost: 94.38, commission: 16.00 },
      'Member + Children': { totalCost: 94.38, commission: 16.00 },
      'Family': { totalCost: 141.57, commission: 24.00 }
    },
    'Plus': {
      'Member Only': { totalCost: 59.49, commission: 12.00 },
      'Member + Spouse': { totalCost: 118.98, commission: 24.00 },
      'Member + Children': { totalCost: 118.98, commission: 24.00 },
      'Family': { totalCost: 178.47, commission: 36.00 }
    },
    'Elite': {
      'Member Only': { totalCost: 82.96, commission: 18.00 },
      'Member + Spouse': { totalCost: 165.92, commission: 36.00 },
      'Member + Children': { totalCost: 165.92, commission: 36.00 },
      'Family': { totalCost: 248.88, commission: 54.00 }
    }
  };

  const planRates = commissionRates[planName];
  if (!planRates) return null;

  const rate = planRates[coverageType];
  if (!rate) return null;

  return rate;
}

async function backfillCommissions() {
  try {
    console.log('\n🔄 BACKFILLING COMMISSIONS FOR EXISTING MEMBERS...\n');
    
    // Get agent UUID
    const agentEmail = 'michael@mypremierplans.com';
    const agentResult = await neonPool.query(
      'SELECT id, email, agent_number FROM users WHERE email = $1',
      [agentEmail]
    );
    
    if (agentResult.rows.length === 0) {
      console.log('❌ Agent not found in users table:', agentEmail);
      return;
    }
    
    const agentUUID = agentResult.rows[0].id;
    console.log('✅ Agent found:');
    console.log(`   UUID: ${agentUUID}`);
    console.log(`   Email: ${agentEmail}`);
    console.log(`   Agent Number: ${agentResult.rows[0].agent_number}\n`);
    
    // Get all members enrolled by this agent
    const membersResult = await neonPool.query(`
      SELECT 
        id,
        customer_number,
        first_name,
        last_name,
        enrolled_by_agent_id,
        agent_number,
        plan_id,
        coverage_type,
        member_type,
        total_monthly_price,
        created_at
      FROM members
      WHERE enrolled_by_agent_id = $1
      ORDER BY created_at ASC
    `, [agentEmail]);
    
    console.log(`📋 Found ${membersResult.rows.length} members enrolled by this agent:\n`);
    
    let created = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const member of membersResult.rows) {
      console.log(`\n👤 Processing: ${member.customer_number} - ${member.first_name} ${member.last_name}`);
      
      // Check if commission already exists
      const existingComm = await neonPool.query(
        'SELECT id FROM commissions WHERE member_id = $1',
        [member.id]
      );
      
      if (existingComm.rows.length > 0) {
        console.log(`   ⏭️  Commission already exists (ID: ${existingComm.rows[0].id})`);
        skipped++;
        continue;
      }
      
      // Determine plan and coverage
      let planName = 'Base';
      let planTier = 'Base';
      let rawCoverage = member.coverage_type || member.member_type || 'Member Only';
      
      // Normalize coverage type to match commission rates
      let coverage = rawCoverage;
      const coverageMap = {
        'member-only': 'Member Only',
        'member_only': 'Member Only',
        'MemberOnly': 'Member Only',
        'member-spouse': 'Member + Spouse',
        'member_spouse': 'Member + Spouse',
        'MemberSpouse': 'Member + Spouse',
        'member-children': 'Member + Children',
        'member_children': 'Member + Children',
        'MemberChildren': 'Member + Children',
        'family': 'Family',
        'Family': 'Family'
      };
      
      if (coverageMap[rawCoverage]) {
        coverage = coverageMap[rawCoverage];
      }
      
      // Infer plan from price if available
      if (member.total_monthly_price) {
        const basePrice = member.total_monthly_price / 1.04; // Remove 4% admin fee
        if (basePrice >= 70) {
          planName = 'Elite';
          planTier = 'Elite';
        } else if (basePrice >= 50) {
          planName = 'Plus';
          planTier = 'Plus';
        }
      }
      
      console.log(`   Plan: ${planName}, Coverage: ${coverage} (raw: ${rawCoverage})`);
      
      // Calculate commission
      const commissionResult = calculateCommission(planName, coverage);
      
      if (!commissionResult) {
        console.log(`   ❌ Could not calculate commission - no rate for ${planName} / ${coverage}`);
        errors++;
        continue;
      }
      
      console.log(`   Commission: $${commissionResult.commission.toFixed(2)} (Total: $${commissionResult.totalCost.toFixed(2)})`);
      
      // Check if subscription exists, create if not
      let subscriptionId = member.id;
      const subCheck = await neonPool.query(
        'SELECT id FROM subscriptions WHERE member_id = $1',
        [member.id]
      );
      
      if (subCheck.rows.length === 0) {
        console.log(`   Creating subscription record for member ${member.id}...`);
        try {
          const subResult = await neonPool.query(`
            INSERT INTO subscriptions (
              member_id,
              plan_id,
              status,
              amount,
              created_at,
              updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
          `, [
            member.id,
            member.plan_id || 36, // Default to plan 36 if not specified
            'active',
            commissionResult.totalCost,
            member.created_at,
            new Date()
          ]);
          subscriptionId = subResult.rows[0].id;
          console.log(`   ✅ Subscription created: ${subscriptionId}`);
        } catch (subError) {
          console.log(`   ⚠️  Could not create subscription: ${subError.message}`);
          subscriptionId = null; // subscription_id is now nullable
        }
      } else {
        subscriptionId = subCheck.rows[0].id;
      }
      
      // Create commission
      try {
        await neonPool.query(`
          INSERT INTO commissions (
            agent_id,
            subscription_id,
            member_id,
            plan_name,
            plan_type,
            plan_tier,
            commission_amount,
            total_plan_cost,
            status,
            payment_status,
            created_at,
            updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
          )
        `, [
          agentUUID,
          subscriptionId,
          member.id,
          planName,
          coverage,
          planTier,
          commissionResult.commission,
          commissionResult.totalCost,
          'pending',
          'unpaid',
          member.created_at,
          new Date()
        ]);
        
        console.log(`   ✅ Commission created successfully`);
        created++;
      } catch (error) {
        console.log(`   ❌ Error creating commission:`, error.message);
        errors++;
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 BACKFILL SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total members processed: ${membersResult.rows.length}`);
    console.log(`✅ Commissions created: ${created}`);
    console.log(`⏭️  Skipped (already exists): ${skipped}`);
    console.log(`❌ Errors: ${errors}`);
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.error(error.stack);
  } finally {
    await neonPool.end();
  }
}

backfillCommissions();
