import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const neonPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function diagnosePlanMapping() {
  try {
    console.log('\n🔍 DIAGNOSING PLAN MAPPING ISSUE\n');
    console.log('=' .repeat(80));

    // 1. Check what's actually in the members table
    console.log('\n📋 MEMBERS TABLE DATA (with plan info):');
    console.log('-'.repeat(80));
    const membersResult = await neonPool.query(`
      SELECT 
        id,
        customer_number,
        first_name,
        last_name,
        plan_id,
        coverage_type,
        total_monthly_price,
        enrolled_by_agent_id
      FROM members 
      WHERE is_active = true
      ORDER BY id
    `);
    
    console.table(membersResult.rows);
    console.log(`\n✅ Found ${membersResult.rows.length} active members\n`);

    // 2. Check the plans table
    console.log('\n📋 PLANS TABLE DATA:');
    console.log('-'.repeat(80));
    const plansResult = await neonPool.query(`
      SELECT id, name, price, billing_period
      FROM plans 
      ORDER BY id
    `);
    
    console.table(plansResult.rows);
    console.log(`\n✅ Found ${plansResult.rows.length} plans\n`);

    // 3. Check commissions table
    console.log('\n💰 COMMISSIONS TABLE DATA:');
    console.log('-'.repeat(80));
    const commissionsResult = await neonPool.query(`
      SELECT 
        id,
        agent_id,
        member_id,
        commission_amount,
        plan_name,
        plan_type,
        plan_tier,
        status,
        payment_status
      FROM commissions
      ORDER BY id
    `);
    
    console.table(commissionsResult.rows);
    console.log(`\n✅ Found ${commissionsResult.rows.length} commissions\n`);

    // 4. Try to JOIN members with plans
    console.log('\n🔗 ATTEMPTING TO JOIN MEMBERS WITH PLANS:');
    console.log('-'.repeat(80));
    const joinResult = await neonPool.query(`
      SELECT 
        m.id as member_id,
        m.customer_number,
        m.first_name,
        m.last_name,
        m.plan_id,
        m.coverage_type,
        m.total_monthly_price,
        p.id as plan_table_id,
        p.name as plan_name,
        p.price as plan_price
      FROM members m
      LEFT JOIN plans p ON m.plan_id = p.id
      WHERE m.is_active = true
      ORDER BY m.id
    `);
    
    console.table(joinResult.rows);
    
    // 5. Check if plan_id values match any plan IDs
    console.log('\n⚠️  PLAN_ID MAPPING ANALYSIS:');
    console.log('-'.repeat(80));
    
    const memberPlanIds = membersResult.rows.map(m => m.plan_id);
    const planIds = plansResult.rows.map(p => p.id);
    
    console.log('Plan IDs in members table:', memberPlanIds);
    console.log('Plan IDs in plans table:', planIds);
    
    const unmatchedIds = memberPlanIds.filter(id => !planIds.includes(id));
    if (unmatchedIds.length > 0) {
      console.log('\n❌ UNMATCHED PLAN IDs:', unmatchedIds);
      console.log('These plan_id values in members table do NOT exist in plans table!');
    } else {
      console.log('\n✅ All member plan_ids match plans table');
    }

    // 6. Check what the dashboard query would actually return
    console.log('\n📊 SIMULATING DASHBOARD QUERY:');
    console.log('-'.repeat(80));
    const dashboardSimulation = await neonPool.query(`
      SELECT 
        COUNT(DISTINCT m.id) as total_members,
        COUNT(DISTINCT c.id) as total_commissions,
        SUM(c.commission_amount) as total_commission_amount
      FROM members m
      LEFT JOIN commissions c ON c.member_id = m.id
      WHERE m.is_active = true
    `);
    
    console.table(dashboardSimulation.rows);

    await neonPool.end();

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    await neonPool.end();
    process.exit(1);
  }
}

diagnosePlanMapping();
