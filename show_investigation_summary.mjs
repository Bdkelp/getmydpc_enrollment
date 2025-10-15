import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function showInvestigationSummary() {
  console.log('═'.repeat(80));
  console.log('📊 COMMISSION INVESTIGATION SUMMARY');
  console.log('═'.repeat(80));
  
  try {
    // Get member count
    const memberCount = await pool.query('SELECT COUNT(*) as count FROM members');
    const commissionCount = await pool.query('SELECT COUNT(*) as count FROM commissions');
    
    console.log('\n📈 DATABASE STATISTICS:');
    console.log(`   Total Members: ${memberCount.rows[0].count}`);
    console.log(`   Total Commissions: ${commissionCount.rows[0].count}`);
    console.log(`   Expected Commissions: ${memberCount.rows[0].count} (assuming all enrolled by agents)`);
    console.log(`   Missing Commissions: ${memberCount.rows[0].count - commissionCount.rows[0].count}`);
    
    // Get members with agent info but no commission
    const membersWithoutCommissions = await pool.query(`
      SELECT 
        m.customer_number,
        m.first_name,
        m.last_name,
        m.agent_number,
        m.enrolled_by_agent_id,
        m.created_at
      FROM members m
      LEFT JOIN commissions c ON m.customer_number = CAST(c.subscription_id AS VARCHAR)
      WHERE m.agent_number IS NOT NULL 
        AND m.enrolled_by_agent_id IS NOT NULL
        AND c.id IS NULL
      ORDER BY m.created_at DESC
    `);
    
    console.log('\n❌ MEMBERS WITH AGENT INFO BUT NO COMMISSION:');
    if (membersWithoutCommissions.rows.length === 0) {
      console.log('   None (all agent enrollments have commissions) ✅');
    } else {
      membersWithoutCommissions.rows.forEach((member, i) => {
        console.log(`\n   ${i + 1}. ${member.customer_number} - ${member.first_name} ${member.last_name}`);
        console.log(`      Agent: ${member.agent_number}`);
        console.log(`      Enrolled By: ${member.enrolled_by_agent_id}`);
        console.log(`      Created: ${new Date(member.created_at).toLocaleString()}`);
        console.log(`      Status: ⚠️  COMMISSION MISSING`);
      });
    }
    
    // Get all members
    const allMembers = await pool.query(`
      SELECT 
        m.customer_number,
        m.first_name,
        m.last_name,
        m.email,
        m.agent_number,
        m.enrolled_by_agent_id,
        m.created_at,
        c.id as commission_id,
        c.commission_amount,
        c.status as commission_status
      FROM members m
      LEFT JOIN commissions c ON m.customer_number = CAST(c.subscription_id AS VARCHAR)
      ORDER BY m.created_at DESC
    `);
    
    console.log('\n\n📋 ALL MEMBERS & COMMISSION STATUS:');
    console.log('─'.repeat(80));
    
    allMembers.rows.forEach((member, i) => {
      const hasAgent = !!(member.agent_number && member.enrolled_by_agent_id);
      const hasCommission = !!member.commission_id;
      const shouldHaveCommission = hasAgent;
      
      let statusIcon = '✅';
      let statusText = 'OK';
      
      if (shouldHaveCommission && !hasCommission) {
        statusIcon = '❌';
        statusText = 'MISSING COMMISSION';
      } else if (!shouldHaveCommission && !hasCommission) {
        statusIcon = 'ℹ️';
        statusText = 'No agent (expected)';
      }
      
      console.log(`\n${i + 1}. ${statusIcon} ${member.customer_number} - ${member.first_name} ${member.last_name}`);
      console.log(`   Email: ${member.email}`);
      console.log(`   Agent: ${member.agent_number || 'None'}`);
      console.log(`   Enrolled By: ${member.enrolled_by_agent_id || 'None'}`);
      console.log(`   Created: ${new Date(member.created_at).toLocaleString()}`);
      
      if (hasCommission) {
        console.log(`   Commission: ✅ $${member.commission_amount} (${member.commission_status})`);
      } else if (shouldHaveCommission) {
        console.log(`   Commission: ❌ MISSING - Should have been created!`);
      } else {
        console.log(`   Commission: N/A (direct enrollment, no agent)`);
      }
      console.log(`   Status: ${statusText}`);
    });
    
    console.log('\n\n' + '═'.repeat(80));
    console.log('🔍 ROOT CAUSE ANALYSIS:');
    console.log('═'.repeat(80));
    
    const problemCount = membersWithoutCommissions.rows.length;
    
    if (problemCount > 0) {
      console.log(`\n❌ PROBLEM CONFIRMED: ${problemCount} agent enrollments missing commissions`);
      console.log('\n📌 Commission Creation Requirements:');
      console.log('   1. agentNumber must be present ✅');
      console.log('   2. enrolledByAgentId must be present ✅');
      console.log('   3. planId must be present ❓ (LIKELY MISSING)');
      console.log('\n💡 HYPOTHESIS:');
      console.log('   The planId is not being passed from frontend to backend during enrollment.');
      console.log('   This causes the commission creation condition to fail.');
      console.log('\n🎯 NEXT STEP:');
      console.log('   Run a test enrollment at http://localhost:5000');
      console.log('   Watch the server logs for [Commission Check] messages');
      console.log('   The logs will show which value is missing');
    } else {
      console.log('\n✅ NO PROBLEMS FOUND: All agent enrollments have commissions');
    }
    
    console.log('\n' + '═'.repeat(80));
    console.log('📝 LOGGING STATUS:');
    console.log('═'.repeat(80));
    console.log('\n✅ Comprehensive logging added to server/routes.ts');
    console.log('   • Full request body logging (line 2379)');
    console.log('   • Extracted fields logging (line 2436)');
    console.log('   • Subscription check logging (line 2519)');
    console.log('   • Commission check logging (line 2544)');
    console.log('   • Missing values warnings (line 2599)');
    console.log('\n🚀 Server Status: Running on http://localhost:5000');
    console.log('📊 Ready for test enrollment with full diagnostic logging');
    
    console.log('\n' + '═'.repeat(80));
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

showInvestigationSummary();
