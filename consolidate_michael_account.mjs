import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function consolidateMichaelAccount() {
  console.log('🔧 Consolidating Michael Keener Accounts');
  console.log('============================================================\n');

  try {
    // Step 1: Verify the accounts
    console.log('📋 STEP 1: Current State');
    console.log('------------------------------------------------------------');
    
    const duplicateAgent = await pool.query(`
      SELECT id, email, agent_number, role
      FROM users
      WHERE id = '41688777'
    `);
    
    const adminAccount = await pool.query(`
      SELECT id, email, agent_number, role
      FROM users
      WHERE email = 'michael@mypremierplans.com'
    `);
    
    console.log('Duplicate Agent Account (to be deleted):');
    console.log('  ', duplicateAgent.rows[0]);
    console.log('\nAdmin Account (to be kept and updated):');
    console.log('  ', adminAccount.rows[0]);
    console.log('');

    // Step 2: Check for any data linked to the duplicate account
    console.log('📋 STEP 2: Checking for linked data');
    console.log('------------------------------------------------------------');
    
    const linkedMembers = await pool.query(`
      SELECT COUNT(*) as count FROM members WHERE enrolled_by_agent_id = 'mdkeener@gmail.com'
    `);
    
    const linkedCommissions = await pool.query(`
      SELECT COUNT(*) as count FROM commissions WHERE agent_id = '41688777'
    `);
    
    console.log(`Members linked to mdkeener@gmail.com: ${linkedMembers.rows[0].count}`);
    console.log(`Commissions linked to UUID 41688777: ${linkedCommissions.rows[0].count}`);
    console.log('');

    if (linkedMembers.rows[0].count > 0 || linkedCommissions.rows[0].count > 0) {
      console.log('⚠️  Data is linked to the duplicate account. Aborting!');
      console.log('   Please manually migrate this data first.');
      await pool.end();
      return;
    }

    // Step 3: Update admin account agent number to MPP0001
    console.log('📋 STEP 3: Updating admin account agent number');
    console.log('------------------------------------------------------------');
    
    await pool.query(`
      UPDATE users 
      SET agent_number = 'MPP0001'
      WHERE email = 'michael@mypremierplans.com'
    `);
    
    console.log('✅ Updated michael@mypremierplans.com agent_number to MPP0001\n');

    // Step 4: Update all commissions to use admin account UUID
    console.log('📋 STEP 4: Updating commissions to use correct agent UUID');
    console.log('------------------------------------------------------------');
    
    const adminUUID = adminAccount.rows[0].id;
    
    const updateResult = await pool.query(`
      UPDATE commissions 
      SET agent_id = $1
      WHERE agent_id = '8bda1072-ab65-4733-a84b-2a3609a69450'
      RETURNING id
    `, [adminUUID]);
    
    console.log(`✅ Updated ${updateResult.rows.length} commission records to agent_id: ${adminUUID}\n`);

    // Step 5: Delete the duplicate agent account
    console.log('📋 STEP 5: Deleting duplicate agent account');
    console.log('------------------------------------------------------------');
    
    await pool.query(`
      DELETE FROM users WHERE id = '41688777'
    `);
    
    console.log('✅ Deleted mdkeener@gmail.com agent account (UUID: 41688777)\n');

    // Step 6: Verify final state
    console.log('📋 STEP 6: Verification');
    console.log('------------------------------------------------------------');
    
    const finalState = await pool.query(`
      SELECT 
        u.id,
        u.email,
        u.agent_number,
        u.role,
        COUNT(c.id) as commission_count
      FROM users u
      LEFT JOIN commissions c ON c.agent_id = u.id
      WHERE u.email = 'michael@mypremierplans.com'
      GROUP BY u.id, u.email, u.agent_number, u.role
    `);
    
    console.log('Final Account State:');
    console.log('  Email:', finalState.rows[0].email);
    console.log('  UUID:', finalState.rows[0].id);
    console.log('  Agent Number:', finalState.rows[0].agent_number);
    console.log('  Role:', finalState.rows[0].role);
    console.log('  Commissions:', finalState.rows[0].commission_count);
    console.log('');

    // Step 7: Check members table alignment
    console.log('📋 STEP 7: Checking member alignment');
    console.log('------------------------------------------------------------');
    
    const memberCheck = await pool.query(`
      SELECT 
        COUNT(*) as total_members,
        COUNT(DISTINCT agent_number) as unique_agent_numbers,
        COUNT(DISTINCT enrolled_by_agent_id) as unique_enrolled_by
      FROM members
      WHERE agent_number = 'MPP0001'
    `);
    
    console.log('Members with agent_number MPP0001:', memberCheck.rows[0].total_members);
    console.log('');

    const commissionCheck = await pool.query(`
      SELECT COUNT(*) as count
      FROM commissions
      WHERE agent_id = $1
    `, [adminUUID]);
    
    console.log('Commissions for admin UUID:', commissionCheck.rows[0].count);
    console.log('');

    console.log('============================================================');
    console.log('✅ CONSOLIDATION COMPLETE');
    console.log('============================================================\n');
    
    console.log('📝 Summary:');
    console.log('  ✅ Deleted duplicate agent account (mdkeener@gmail.com)');
    console.log('  ✅ Updated admin account agent_number to MPP0001');
    console.log('  ✅ Updated all commissions to use admin account UUID');
    console.log('  ✅ Michael Keener now has ONE unified account');
    console.log('');
    console.log('🎯 Result:');
    console.log('  When you log in as michael@mypremierplans.com (admin/agent),');
    console.log('  you will see all 11 commissions tied to agent number MPP0001');

  } catch (error) {
    console.error('❌ Error:', error);
    console.log('\n⚠️  Rolling back changes...');
    await pool.query('ROLLBACK');
  } finally {
    await pool.end();
  }
}

consolidateMichaelAccount();
