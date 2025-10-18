import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function verifyMichaelAccounts() {
  console.log('🔍 Verifying All Michael Keener Accounts');
  console.log('============================================================\n');

  try {
    // Find ALL users with Michael's email or name
    console.log('👤 All Michael Keener accounts:');
    const michaelAccounts = await pool.query(`
      SELECT 
        id,
        email,
        first_name,
        last_name,
        agent_number,
        role,
        created_at
      FROM users 
      WHERE LOWER(email) LIKE '%michael%' 
         OR LOWER(email) LIKE '%keener%'
         OR LOWER(email) LIKE '%mdkeener%'
         OR (LOWER(first_name) = 'michael' AND LOWER(last_name) = 'keener')
      ORDER BY created_at ASC
    `);
    
    console.log(`   Found ${michaelAccounts.rows.length} account(s):\n`);
    
    michaelAccounts.rows.forEach((account, idx) => {
      console.log(`   ${idx + 1}. ${account.first_name} ${account.last_name}`);
      console.log(`      Email: ${account.email}`);
      console.log(`      UUID: ${account.id}`);
      console.log(`      Agent Number: ${account.agent_number || 'None'}`);
      console.log(`      Role: ${account.role}`);
      console.log(`      Created: ${new Date(account.created_at).toLocaleString()}`);
      console.log('');
    });

    // Check which agent_number is used in members table
    console.log('📋 Agent numbers in members table:');
    const agentNumbersInMembers = await pool.query(`
      SELECT DISTINCT agent_number, COUNT(*) as count
      FROM members
      WHERE agent_number IS NOT NULL
      GROUP BY agent_number
      ORDER BY count DESC
    `);
    
    console.log('   Agent numbers found:');
    agentNumbersInMembers.rows.forEach(row => {
      console.log(`      ${row.agent_number}: ${row.count} member(s)`);
    });
    console.log('');

    // Check which email is used in enrolled_by_agent_id
    console.log('📧 Emails in enrolled_by_agent_id:');
    const emailsInMembers = await pool.query(`
      SELECT DISTINCT enrolled_by_agent_id, COUNT(*) as count
      FROM members
      WHERE enrolled_by_agent_id IS NOT NULL
      GROUP BY enrolled_by_agent_id
      ORDER BY count DESC
    `);
    
    console.log('   Emails found:');
    emailsInMembers.rows.forEach(row => {
      console.log(`      ${row.enrolled_by_agent_id}: ${row.count} member(s)`);
    });
    console.log('');

    // Check agent_id in commissions
    console.log('💰 Agent UUIDs in commissions table:');
    const agentIdsInCommissions = await pool.query(`
      SELECT DISTINCT agent_id, COUNT(*) as count
      FROM commissions
      WHERE agent_id IS NOT NULL
      GROUP BY agent_id
      ORDER BY count DESC
    `);
    
    console.log('   Agent UUIDs found:');
    for (const row of agentIdsInCommissions.rows) {
      // Look up the user for each UUID
      const user = await pool.query(`
        SELECT email, first_name, last_name, agent_number, role
        FROM users
        WHERE id = $1
      `, [row.agent_id]);
      
      if (user.rows.length > 0) {
        const u = user.rows[0];
        console.log(`      ${row.agent_id}:`);
        console.log(`         User: ${u.first_name} ${u.last_name} (${u.email})`);
        console.log(`         Agent#: ${u.agent_number}`);
        console.log(`         Role: ${u.role}`);
        console.log(`         Commissions: ${row.count}`);
      } else {
        console.log(`      ${row.agent_id}: ${row.count} commission(s) - USER NOT FOUND!`);
      }
      console.log('');
    }

    // Cross-reference check
    console.log('🔍 CROSS-REFERENCE CHECK:');
    console.log('============================================================');
    
    const memberAgentNumbers = agentNumbersInMembers.rows.map(r => r.agent_number);
    const memberEmails = emailsInMembers.rows.map(r => r.enrolled_by_agent_id);
    const commissionAgentIds = agentIdsInCommissions.rows.map(r => r.agent_id);
    
    console.log('\n1. Members show agent_number: ', memberAgentNumbers);
    console.log('2. Members show enrolled_by: ', memberEmails);
    console.log('3. Commissions show agent_id: ', commissionAgentIds);
    
    // Check if the UUIDs match any Michael account
    console.log('\n4. Matching accounts:');
    for (const uuid of commissionAgentIds) {
      const match = michaelAccounts.rows.find(acc => acc.id === uuid);
      if (match) {
        console.log(`   ✅ UUID ${uuid} belongs to:`);
        console.log(`      ${match.first_name} ${match.last_name} (${match.email})`);
        console.log(`      Agent#: ${match.agent_number}`);
      } else {
        console.log(`   ❌ UUID ${uuid} - NO MATCHING ACCOUNT FOUND`);
      }
    }

    console.log('\n============================================================');
    console.log('✅ VERIFICATION COMPLETE');
    console.log('============================================================\n');

    // THE KEY QUESTION
    console.log('🎯 KEY FINDINGS:');
    console.log('============================================================');
    
    if (memberAgentNumbers.includes('MPP0001')) {
      console.log('✅ Members have agent_number = MPP0001');
      
      // Find which account has MPP0001
      const mpp0001Account = michaelAccounts.rows.find(acc => acc.agent_number === 'MPP0001');
      if (mpp0001Account) {
        console.log(`   This belongs to: ${mpp0001Account.email} (UUID: ${mpp0001Account.id})`);
        
        // Check if commissions are using this UUID
        if (commissionAgentIds.includes(mpp0001Account.id)) {
          console.log('   ✅ Commissions ARE using this UUID - CORRECT!');
        } else {
          console.log('   ❌ Commissions are NOT using this UUID - MISMATCH!');
          console.log('   🔧 This is the problem - commissions are linked to wrong agent_id');
        }
      } else {
        console.log('   ❌ No account found with agent_number MPP0001!');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

verifyMichaelAccounts();
