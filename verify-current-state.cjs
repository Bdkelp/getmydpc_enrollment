// verify-current-state.cjs
// Check current database state before migration

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function verifyCurrentState() {
  console.log('========================================');
  console.log('CURRENT DATABASE STATE VERIFICATION');
  console.log('========================================\n');

  try {
    // Check if members table exists
    console.log('1. Checking if members table exists...');
    const membersTableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'members'
      );
    `);
    const membersTableExists = membersTableCheck.rows[0].exists;
    console.log(`   Members table exists: ${membersTableExists ? '✅ YES' : '❌ NO'}\n`);

    // Count users by role
    console.log('2. Counting users by role...');
    const usersByRole = await pool.query(`
      SELECT 
        role, 
        COUNT(*) as count
      FROM users
      GROUP BY role
      ORDER BY role;
    `);
    
    console.log('   User counts by role:');
    let memberCount = 0;
    let agentCount = 0;
    let adminCount = 0;
    
    usersByRole.rows.forEach(row => {
      console.log(`   - ${row.role || 'NULL'}: ${row.count}`);
      if (row.role === 'member' || row.role === 'user') {
        memberCount += parseInt(row.count);
      } else if (row.role === 'agent') {
        agentCount += parseInt(row.count);
      } else if (row.role === 'admin' || row.role === 'super_admin') {
        adminCount += parseInt(row.count);
      }
    });
    
    console.log(`\n   Summary:`);
    console.log(`   - Members (role='member' or 'user'): ${memberCount} 👥`);
    console.log(`   - Agents: ${agentCount} 👔`);
    console.log(`   - Admins: ${adminCount} 🛡️\n`);

    // Check subscriptions
    console.log('3. Checking subscriptions...');
    const subscriptionsCheck = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(member_id) as with_member_id,
        COUNT(user_id) as with_user_id
      FROM subscriptions;
    `);
    const subData = subscriptionsCheck.rows[0];
    console.log(`   Total subscriptions: ${subData.total}`);
    console.log(`   With member_id: ${subData.with_member_id}`);
    console.log(`   With user_id: ${subData.with_user_id}\n`);

    // Check if member_id column exists
    console.log('4. Checking if member_id columns exist...');
    const memberIdColumns = await pool.query(`
      SELECT 
        table_name,
        column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'member_id'
        AND table_name IN ('subscriptions', 'payments', 'commissions', 'family_members')
      ORDER BY table_name;
    `);
    
    if (memberIdColumns.rows.length > 0) {
      console.log('   ✅ member_id columns found in:');
      memberIdColumns.rows.forEach(row => {
        console.log(`      - ${row.table_name}`);
      });
    } else {
      console.log('   ❌ No member_id columns found');
    }
    console.log('');

    // Check sample user data
    console.log('5. Sample user data (first 5 members)...');
    const sampleUsers = await pool.query(`
      SELECT id, email, first_name, last_name, role, is_active, created_at
      FROM users
      WHERE role IN ('member', 'user')
      ORDER BY created_at DESC
      LIMIT 5;
    `);
    
    if (sampleUsers.rows.length > 0) {
      console.log('   Sample members in users table:');
      sampleUsers.rows.forEach((user, i) => {
        console.log(`   ${i + 1}. ${user.first_name} ${user.last_name} (${user.email}) - Role: ${user.role}`);
      });
    } else {
      console.log('   ℹ️  No members found in users table');
    }
    console.log('');

    // Summary
    console.log('========================================');
    console.log('SUMMARY');
    console.log('========================================');
    console.log(`Members table exists: ${membersTableExists ? '✅' : '❌'}`);
    console.log(`Members in users table: ${memberCount} ${memberCount > 0 ? '⚠️  NEEDS MIGRATION' : '✅'}`);
    console.log(`Agents/Admins: ${agentCount + adminCount} ✅`);
    console.log(`member_id columns exist: ${memberIdColumns.rows.length > 0 ? '✅' : '❌'}`);
    console.log('');
    
    if (!membersTableExists && memberCount > 0) {
      console.log('🚨 ACTION REQUIRED:');
      console.log('   1. Run member_user_separation_migration.sql');
      console.log('   2. This will move ' + memberCount + ' members to the new members table');
      console.log('   3. Users table will only contain agents and admins');
    } else if (membersTableExists && memberCount > 0) {
      console.log('⚠️  PARTIAL MIGRATION:');
      console.log('   Members table exists but users table still has members');
      console.log('   Run cleanup to finish migration');
    } else if (membersTableExists && memberCount === 0) {
      console.log('✅ MIGRATION COMPLETE:');
      console.log('   Members table exists and users table is clean');
    }
    
    console.log('========================================\n');

  } catch (error) {
    console.error('Error verifying database state:', error);
  } finally {
    await pool.end();
  }
}

verifyCurrentState();
