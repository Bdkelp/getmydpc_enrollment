import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkNeonData() {
  try {
    console.log('🔍 Checking Neon Database for Members and Commissions\n');
    console.log('=' .repeat(80));

    // Check all members
    console.log('\n📋 MEMBERS TABLE:');
    const membersResult = await pool.query(`
      SELECT 
        customer_number,
        first_name,
        last_name,
        email,
        agent_number,
        enrolled_by_agent_id,
        status,
        created_at
      FROM members
      ORDER BY created_at DESC
      LIMIT 10
    `);

    if (membersResult.rows.length === 0) {
      console.log('   No members found in database');
    } else {
      console.log(`   Found ${membersResult.rows.length} members:\n`);
      membersResult.rows.forEach((member, i) => {
        console.log(`   ${i + 1}. ${member.customer_number} - ${member.first_name} ${member.last_name}`);
        console.log(`      Email: ${member.email}`);
        console.log(`      Agent: ${member.agent_number || 'Not set'}`);
        console.log(`      Enrolled By: ${member.enrolled_by_agent_id || 'Not set'}`);
        console.log(`      Status: ${member.status}`);
        console.log(`      Created: ${new Date(member.created_at).toLocaleString()}`);
        console.log('');
      });
    }

    // Check all commissions
    console.log('=' .repeat(80));
    console.log('\n💰 COMMISSIONS TABLE:');
    const commissionsResult = await pool.query(`
      SELECT 
        id,
        agent_id,
        subscription_id,
        commission_amount,
        status,
        plan_name,
        plan_type,
        plan_tier,
        created_at
      FROM commissions
      ORDER BY created_at DESC
      LIMIT 10
    `);

    if (commissionsResult.rows.length === 0) {
      console.log('   ❌ No commissions found in database');
    } else {
      console.log(`   Found ${commissionsResult.rows.length} commissions:\n`);
      commissionsResult.rows.forEach((commission, i) => {
        console.log(`   ${i + 1}. Commission ID: ${commission.id}`);
        console.log(`      Agent ID: ${commission.agent_id}`);
        console.log(`      Member ID: ${commission.subscription_id}`);
        console.log(`      Amount: $${commission.amount}`);
        console.log(`      Plan: ${commission.plan_name}`);
        console.log(`      Coverage: ${commission.coverage_type}`);
        console.log(`      Status: ${commission.status}`);
        console.log(`      Created: ${new Date(commission.created_at).toLocaleString()}`);
        console.log('');
      });
    }

    // Check member-commission relationships
    console.log('=' .repeat(80));
    console.log('\n🔗 MEMBER-COMMISSION RELATIONSHIPS:');
    const relationshipResult = await pool.query(`
      SELECT 
        m.customer_number,
        m.first_name,
        m.last_name,
        m.agent_number,
        m.enrolled_by_agent_id,
        c.amount as commission_amount,
        c.status as commission_status,
        c.agent_id,
        c.plan_name,
        c.coverage_type
      FROM members m
      LEFT JOIN commissions c ON m.customer_number = c.subscription_id
      ORDER BY m.created_at DESC
      LIMIT 10
    `);

    if (relationshipResult.rows.length === 0) {
      console.log('   No relationships found');
    } else {
      relationshipResult.rows.forEach((row, i) => {
        console.log(`   ${i + 1}. ${row.customer_number} - ${row.first_name} ${row.last_name}`);
        console.log(`      Member's Agent: ${row.agent_number || 'Not set'}`);
        if (row.commission_amount) {
          console.log(`      ✅ Commission: $${row.commission_amount} (${row.commission_status})`);
          console.log(`      Plan: ${row.plan_name} - ${row.coverage_type}`);
          console.log(`      Commission Agent: ${row.agent_id}`);
        } else {
          console.log(`      ❌ NO COMMISSION FOUND`);
        }
        console.log('');
      });
    }

    // Check Tylara Jones specifically
    console.log('=' .repeat(80));
    console.log('\n🔎 CHECKING TYLARA JONES (MPP20250002):');
    const tylaraResult = await pool.query(`
      SELECT 
        m.*,
        c.id as commission_id,
        c.amount as commission_amount,
        c.status as commission_status,
        c.agent_id as commission_agent_id
      FROM members m
      LEFT JOIN commissions c ON m.customer_number = c.subscription_id
      WHERE m.customer_number = 'MPP20250002'
         OR m.first_name ILIKE '%tylara%'
         OR m.first_name ILIKE '%tara%'
    `);

    if (tylaraResult.rows.length === 0) {
      console.log('   Member not found');
    } else {
      const member = tylaraResult.rows[0];
      console.log(`   Customer Number: ${member.customer_number}`);
      console.log(`   Name: ${member.first_name} ${member.last_name}`);
      console.log(`   Email: ${member.email}`);
      console.log(`   Status: ${member.status}`);
      console.log(`   Agent Number: ${member.agent_number || 'Not set'}`);
      console.log(`   Enrolled By: ${member.enrolled_by_agent_id || 'Not set'}`);
      
      if (member.commission_id) {
        console.log(`   ✅ Commission Found:`);
        console.log(`      Commission ID: ${member.commission_id}`);
        console.log(`      Amount: $${member.commission_amount}`);
        console.log(`      Status: ${member.commission_status}`);
        console.log(`      Agent ID: ${member.commission_agent_id}`);
      } else {
        console.log(`   ❌ NO COMMISSION FOUND FOR THIS MEMBER`);
      }
    }

    console.log('\n' + '=' .repeat(80));
    console.log('✅ Database check complete\n');

  } catch (error) {
    console.error('❌ Error checking database:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

checkNeonData();
