import pkg from 'pg';
const { Client } = pkg;
import { config } from 'dotenv';

config();

const neonClient = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

console.log('🔬 COMPREHENSIVE DATA FLOW DIAGNOSIS\n');
console.log('='.repeat(80));

async function main() {
  try {
    await neonClient.connect();
    console.log('✅ Connected to Neon database\n');

    // ===== 1. MEMBERS TABLE STRUCTURE =====
    console.log('\n📊 1. MEMBERS TABLE STRUCTURE');
    console.log('='.repeat(80));
    
    const membersSchema = await neonClient.query(`
      SELECT column_name, data_type, character_maximum_length, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'members'
      ORDER BY ordinal_position;
    `);
    
    console.log('\nMEMBERS TABLE COLUMNS:');
    membersSchema.rows.forEach(col => {
      console.log(`  ${col.column_name.padEnd(30)} | ${col.data_type.padEnd(20)} | ${col.character_maximum_length || 'N/A'} | ${col.is_nullable}`);
    });

    // ===== 2. COMMISSIONS TABLE STRUCTURE =====
    console.log('\n\n📊 2. COMMISSIONS TABLE STRUCTURE');
    console.log('='.repeat(80));
    
    const commissionsSchema = await neonClient.query(`
      SELECT column_name, data_type, character_maximum_length, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'commissions'
      ORDER BY ordinal_position;
    `);
    
    console.log('\nCOMMISSIONS TABLE COLUMNS:');
    commissionsSchema.rows.forEach(col => {
      console.log(`  ${col.column_name.padEnd(30)} | ${col.data_type.padEnd(20)} | ${col.character_maximum_length || 'N/A'} | ${col.is_nullable}`);
    });

    // ===== 3. PLANS TABLE STRUCTURE =====
    console.log('\n\n📊 3. PLANS TABLE STRUCTURE');
    console.log('='.repeat(80));
    
    const plansSchema = await neonClient.query(`
      SELECT column_name, data_type, character_maximum_length, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'plans'
      ORDER BY ordinal_position;
    `);
    
    console.log('\nPLANS TABLE COLUMNS:');
    plansSchema.rows.forEach(col => {
      console.log(`  ${col.column_name.padEnd(30)} | ${col.data_type.padEnd(20)} | ${col.character_maximum_length || 'N/A'} | ${col.is_nullable}`);
    });

    // ===== 4. ACTUAL MEMBER DATA =====
    console.log('\n\n📋 4. ACTUAL MEMBER DATA (What storage.ts returns)');
    console.log('='.repeat(80));
    
    const members = await neonClient.query(`
      SELECT 
        id,
        customer_number,
        first_name,
        last_name,
        email,
        plan_id,
        coverage_type,
        total_monthly_price,
        enrolled_by_agent_id,
        is_active,
        created_at
      FROM members
      ORDER BY id
      LIMIT 3;
    `);
    
    console.log(`\nFound ${members.rows.length} members (showing first 3):\n`);
    members.rows.forEach(m => {
      console.log(`Member ID: ${m.id}`);
      console.log(`  customer_number: ${m.customer_number}`);
      console.log(`  name: ${m.first_name} ${m.last_name}`);
      console.log(`  email: ${m.email}`);
      console.log(`  plan_id: ${m.plan_id}`);
      console.log(`  coverage_type: ${m.coverage_type}`);
      console.log(`  total_monthly_price: ${m.total_monthly_price}`);
      console.log(`  enrolled_by_agent_id: ${m.enrolled_by_agent_id}`);
      console.log(`  is_active: ${m.is_active}`);
      console.log('');
    });

    // ===== 5. ACTUAL COMMISSION DATA =====
    console.log('\n📋 5. ACTUAL COMMISSION DATA');
    console.log('='.repeat(80));
    
    const commissions = await neonClient.query(`
      SELECT 
        id,
        agent_id,
        member_id,
        subscription_id,
        plan_name,
        plan_tier,
        commission_amount,
        payment_status,
        created_at
      FROM commissions
      ORDER BY id
      LIMIT 3;
    `);
    
    console.log(`\nFound ${commissions.rows.length} commissions (showing first 3):\n`);
    commissions.rows.forEach(c => {
      console.log(`Commission ID: ${c.id}`);
      console.log(`  agent_id: ${c.agent_id}`);
      console.log(`  member_id: ${c.member_id}`);
      console.log(`  subscription_id: ${c.subscription_id}`);
      console.log(`  plan_name: ${c.plan_name}`);
      console.log(`  plan_tier: ${c.plan_tier}`);
      console.log(`  commission_amount: $${c.commission_amount}`);
      console.log(`  payment_status: ${c.payment_status}`);
      console.log('');
    });

    // ===== 6. ACTUAL PLAN DATA =====
    console.log('\n📋 6. ACTUAL PLAN DATA');
    console.log('='.repeat(80));
    
    const plans = await neonClient.query(`
      SELECT 
        id,
        name,
        price,
        billing_period,
        is_active
      FROM plans
      ORDER BY id
      LIMIT 5;
    `);
    
    console.log(`\nFound ${plans.rows.length} plans (showing first 5):\n`);
    plans.rows.forEach(p => {
      console.log(`Plan ID: ${p.id}`);
      console.log(`  name: ${p.name}`);
      console.log(`  price: $${p.price}`);
      console.log(`  billing_period: ${p.billing_period}`);
      console.log(`  is_active: ${p.is_active}`);
      console.log('');
    });

    // ===== 7. THE QUERY storage.ts ACTUALLY EXECUTES =====
    console.log('\n🔍 7. ACTUAL QUERY FROM storage.ts getAgentEnrollments()');
    console.log('='.repeat(80));
    
    console.log('\nQUERY:');
    console.log(`
      SELECT 
        m.*,
        p.name as plan_name,
        p.price as plan_price,
        c.commission_amount,
        c.payment_status as commission_status
      FROM members m
      LEFT JOIN plans p ON m.plan_id = p.id
      LEFT JOIN commissions c ON c.member_id = m.id
      WHERE m.enrolled_by_agent_id = $1 AND m.is_active = true
      ORDER BY m.created_at DESC;
    `);

    const agentEmail = 'michael@mypremierplans.com';
    console.log(`\nRunning with agent_id: ${agentEmail}\n`);
    
    const queryResult = await neonClient.query(`
      SELECT 
        m.id,
        m.customer_number,
        m.first_name,
        m.last_name,
        m.plan_id,
        m.coverage_type,
        m.total_monthly_price,
        p.name as plan_name,
        p.price as plan_price,
        c.commission_amount,
        c.payment_status as commission_status,
        m.created_at
      FROM members m
      LEFT JOIN plans p ON m.plan_id = p.id
      LEFT JOIN commissions c ON c.member_id = m.id
      WHERE m.enrolled_by_agent_id = $1 AND m.is_active = true
      ORDER BY m.created_at DESC
      LIMIT 3;
    `, [agentEmail]);

    console.log(`📊 QUERY RETURNED ${queryResult.rows.length} ROWS:\n`);
    
    if (queryResult.rows.length === 0) {
      console.log('⚠️ NO ROWS RETURNED! This is the problem.\n');
    } else {
      queryResult.rows.forEach((row, idx) => {
        console.log(`Row ${idx + 1}:`);
        console.log(`  id: ${row.id}`);
        console.log(`  customer_number: ${row.customer_number}`);
        console.log(`  name: ${row.first_name} ${row.last_name}`);
        console.log(`  plan_id: ${row.plan_id}`);
        console.log(`  plan_name: ${row.plan_name} ${row.plan_name ? '✅' : '❌ NULL'}`);
        console.log(`  plan_price: ${row.plan_price} ${row.plan_price ? '✅' : '❌ NULL'}`);
        console.log(`  coverage_type: ${row.coverage_type}`);
        console.log(`  total_monthly_price: ${row.total_monthly_price}`);
        console.log(`  commission_amount: ${row.commission_amount} ${row.commission_amount ? '✅' : '❌ NULL'}`);
        console.log(`  commission_status: ${row.commission_status} ${row.commission_status ? '✅' : '❌ NULL'}`);
        console.log('');
      });
    }

    // ===== 8. WHAT FRONTEND EXPECTS =====
    console.log('\n📱 8. WHAT FRONTEND EXPECTS (from agent-dashboard.tsx)');
    console.log('='.repeat(80));
    
    console.log(`
TypeScript Interface:
interface Enrollment {
  id: string;
  createdAt: string;
  firstName: string;
  lastName: string;
  planName: string;           ← EXPECTED
  memberType: string;
  monthlyPrice: number;       ← EXPECTED
  commission: number;         ← EXPECTED
  status: string;
}

Dashboard Table Columns:
  - Date
  - Member Name
  - Plan                      ← Shows enrollment.planName
  - Type                      ← Shows enrollment.memberType
  - Monthly                   ← Shows $enrollment.monthlyPrice
  - Commission                ← Shows $enrollment.commission
  - Status
    `);

    // ===== 9. WHAT storage.ts RETURNS =====
    console.log('\n🔄 9. WHAT storage.ts mapUserFromDB() RETURNS');
    console.log('='.repeat(80));
    
    console.log(`
storage.ts getAgentEnrollments() maps rows to:
{
  id: row.id.toString(),
  email: row.email,
  firstName: row.first_name,
  lastName: row.last_name,
  ...
  planId: row.plan_id,
  planName: row.plan_name,        ← FROM LEFT JOIN
  planPrice: row.plan_price,      ← FROM LEFT JOIN
  totalMonthlyPrice: row.total_monthly_price,
  commissionAmount: row.commission_amount,  ← FROM LEFT JOIN
  commissionStatus: row.commission_status   ← FROM LEFT JOIN
}
    `);

    // ===== 10. DEBUGGING CHECKLIST =====
    console.log('\n✅ 10. DEBUGGING CHECKLIST');
    console.log('='.repeat(80));
    
    const checksResult = await neonClient.query(`
      SELECT 
        COUNT(*) FILTER (WHERE m.plan_id IS NULL) as members_without_plan,
        COUNT(*) FILTER (WHERE m.plan_id IS NOT NULL AND p.id IS NULL) as members_with_invalid_plan,
        COUNT(*) FILTER (WHERE c.id IS NULL) as members_without_commission,
        COUNT(*) FILTER (WHERE m.plan_id IS NOT NULL AND p.id IS NOT NULL) as members_with_valid_plan,
        COUNT(*) FILTER (WHERE c.id IS NOT NULL) as members_with_commission,
        COUNT(*) as total_members
      FROM members m
      LEFT JOIN plans p ON m.plan_id = p.id
      LEFT JOIN commissions c ON c.member_id = m.id
      WHERE m.is_active = true;
    `);
    
    const checks = checksResult.rows[0];
    console.log('\n📊 DATA INTEGRITY CHECK:');
    console.log(`  Total active members: ${checks.total_members}`);
    console.log(`  Members without plan_id: ${checks.members_without_plan} ${checks.members_without_plan > 0 ? '❌' : '✅'}`);
    console.log(`  Members with invalid plan_id: ${checks.members_with_invalid_plan} ${checks.members_with_invalid_plan > 0 ? '❌' : '✅'}`);
    console.log(`  Members with valid plan: ${checks.members_with_valid_plan} ${checks.members_with_valid_plan > 0 ? '✅' : '❌'}`);
    console.log(`  Members without commission: ${checks.members_without_commission} ${checks.members_without_commission > 0 ? '⚠️' : '✅'}`);
    console.log(`  Members with commission: ${checks.members_with_commission} ${checks.members_with_commission > 0 ? '✅' : '❌'}`);

    // ===== 11. FRONTEND API CALL TRACE =====
    console.log('\n\n📡 11. FRONTEND API CALL TRACE');
    console.log('='.repeat(80));
    
    console.log(`
1. agent-dashboard.tsx calls:
   const { data: enrollments } = useQuery<Enrollment[]>({
     queryKey: ["/api/agent/enrollments", dateFilter],
   });

2. This hits server route:
   GET /api/agent/enrollments

3. Route calls storage function:
   await storage.getAgentEnrollments(agentId, startDate, endDate)

4. storage.getAgentEnrollments() executes SQL with JOINs

5. Returns mapped data with planName, planPrice, commissionAmount

6. Frontend receives array of enrollments

7. Dashboard renders:
   <td>{enrollment.planName}</td>
   <td>$\{enrollment.monthlyPrice}</td>
   <td>$\{enrollment.commission?.toFixed(2)}</td>
    `);

    // ===== 12. POTENTIAL ISSUES =====
    console.log('\n\n🐛 12. POTENTIAL ISSUES TO CHECK');
    console.log('='.repeat(80));
    
    console.log(`
POTENTIAL ISSUE 1: Field name mismatch
  - Frontend expects: enrollment.commission
  - storage.ts returns: commissionAmount
  - Solution: Frontend should use enrollment.commissionAmount

POTENTIAL ISSUE 2: Field name mismatch
  - Frontend expects: enrollment.monthlyPrice
  - storage.ts returns: totalMonthlyPrice
  - Solution: Frontend should use enrollment.totalMonthlyPrice

POTENTIAL ISSUE 3: Column name in members table
  - Schema has: coverage_type
  - storage.ts maps to: memberType
  - Check if frontend expects memberType or coverageType

POTENTIAL ISSUE 4: NULL values in JOINs
  - If plan_id is NULL → plan_name will be NULL
  - If no commission record → commission_amount will be NULL
  - Frontend must handle NULL values gracefully
    `);

    console.log('\n\n' + '='.repeat(80));
    console.log('✅ DIAGNOSIS COMPLETE');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await neonClient.end();
  }
}

main();
