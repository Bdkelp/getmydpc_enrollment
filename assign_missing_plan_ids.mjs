import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const neonPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function assignMissingPlanIds() {
  try {
    console.log('\n📋 ASSIGNING PLAN IDs TO MEMBERS WITHOUT PLANS\n');
    console.log('=' .repeat(80));

    // 1. Find members without plan_id
    console.log('\n🔍 Members without plan_id:');
    console.log('-'.repeat(80));
    const membersWithoutPlans = await neonPool.query(`
      SELECT 
        id,
        customer_number,
        first_name,
        last_name,
        plan_id,
        coverage_type,
        total_monthly_price
      FROM members
      WHERE plan_id IS NULL AND is_active = true
      ORDER BY id
    `);
    
    console.table(membersWithoutPlans.rows);
    console.log(`\n⚠️  Found ${membersWithoutPlans.rows.length} members without plan_id\n`);

    // 2. Show available plans
    console.log('\n📋 AVAILABLE PLANS:');
    console.log('-'.repeat(80));
    const plans = await neonPool.query(`
      SELECT id, name, price
      FROM plans
      WHERE is_active = true
      ORDER BY id
    `);
    console.table(plans.rows);

    // 3. Assign default plan (Base - Member Only, ID 28) to members without plan_id
    console.log('\n🔄 Assigning Base - Member Only (ID 28) to members without plan_id...');
    console.log('-'.repeat(80));
    
    const defaultPlanId = 28; // MyPremierPlan Base - Member Only
    const defaultCoverageType = 'Member Only';
    const defaultPrice = '59.00';

    for (const member of membersWithoutPlans.rows) {
      await neonPool.query(`
        UPDATE members 
        SET 
          plan_id = $1,
          coverage_type = $2,
          total_monthly_price = $3,
          updated_at = NOW()
        WHERE id = $4
      `, [defaultPlanId, defaultCoverageType, defaultPrice, member.id]);
      
      console.log(`  ✅ Updated ${member.customer_number} (${member.first_name} ${member.last_name}): plan_id = 28, price = $59.00`);
    }

    // 4. Verify all members now have plan_id
    console.log('\n✅ VERIFICATION - ALL MEMBERS:');
    console.log('-'.repeat(80));
    const allMembers = await neonPool.query(`
      SELECT 
        m.id,
        m.customer_number,
        m.first_name,
        m.last_name,
        m.plan_id,
        p.name as plan_name,
        m.coverage_type,
        m.total_monthly_price
      FROM members m
      LEFT JOIN plans p ON m.plan_id = p.id
      WHERE m.is_active = true
      ORDER BY m.id
    `);
    
    console.table(allMembers.rows);

    const stillMissing = allMembers.rows.filter(m => !m.plan_id);
    if (stillMissing.length > 0) {
      console.log(`\n⚠️  ${stillMissing.length} members still missing plan_id`);
    } else {
      console.log('\n✅ All active members now have plan_id assigned!');
    }

    // 5. Check if commissions need to be created for these members
    console.log('\n💰 CHECKING COMMISSIONS:');
    console.log('-'.repeat(80));
    
    for (const member of membersWithoutPlans.rows) {
      const commissionCheck = await neonPool.query(`
        SELECT id FROM commissions WHERE member_id = $1
      `, [member.id]);
      
      if (commissionCheck.rows.length === 0) {
        console.log(`  ⚠️  Member ${member.customer_number} has NO commission record`);
      } else {
        console.log(`  ✅ Member ${member.customer_number} already has ${commissionCheck.rows.length} commission(s)`);
      }
    }

    await neonPool.end();
    console.log('\n✅ PLAN ASSIGNMENT COMPLETE!\n');
    console.log('📝 Note: Members were assigned Base - Member Only plan ($59/month)');
    console.log('You can manually update their plans if they selected different tiers.\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    await neonPool.end();
    process.exit(1);
  }
}

assignMissingPlanIds();
