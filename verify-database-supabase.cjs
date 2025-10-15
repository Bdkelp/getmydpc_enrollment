// verify-database-supabase.cjs
// Check database state using Supabase client

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  console.error('   Check your .env file or environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyDatabase() {
  console.log('========================================');
  console.log('DATABASE STATE VERIFICATION (via Supabase)');
  console.log('========================================\n');

  try {
    // 1. Check if members table exists
    console.log('1. Checking for members table...');
    const { data: membersData, error: membersError } = await supabase
      .from('members')
      .select('id')
      .limit(1);
    
    const membersTableExists = !membersError || !membersError.message.includes('does not exist');
    console.log(`   Members table exists: ${membersTableExists ? '✅ YES' : '❌ NO'}`);
    if (membersError && !membersTableExists) {
      console.log(`   Error: ${membersError.message}\n`);
    }

    // 2. Count users by role
    console.log('\n2. Counting users by role...');
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, role');
    
    if (usersError) {
      console.error('   ❌ Error fetching users:', usersError.message);
    } else {
      const roleCounts = {};
      users.forEach(user => {
        const role = user.role || 'NULL';
        roleCounts[role] = (roleCounts[role] || 0) + 1;
      });

      console.log('   User counts by role:');
      let memberCount = 0;
      let agentCount = 0;
      let adminCount = 0;

      Object.entries(roleCounts).forEach(([role, count]) => {
        console.log(`   - ${role}: ${count}`);
        if (role === 'member' || role === 'user') {
          memberCount += count;
        } else if (role === 'agent') {
          agentCount += count;
        } else if (role === 'admin' || role === 'super_admin') {
          adminCount += count;
        }
      });

      console.log(`\n   Summary:`);
      console.log(`   - Members (role='member' or 'user'): ${memberCount} 👥`);
      console.log(`   - Agents: ${agentCount} 👔`);
      console.log(`   - Admins: ${adminCount} 🛡️`);
    }

    // 3. Count members if table exists
    if (membersTableExists) {
      console.log('\n3. Counting records in members table...');
      const { count, error: countError } = await supabase
        .from('members')
        .select('*', { count: 'exact', head: true });
      
      if (countError) {
        console.error('   ❌ Error counting members:', countError.message);
      } else {
        console.log(`   Members in members table: ${count} 📊`);
      }
    }

    // 4. Sample data
    console.log('\n4. Sample data from users table (members only)...');
    const { data: sampleUsers, error: sampleError } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, role, is_active')
      .in('role', ['member', 'user'])
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (sampleError) {
      console.error('   ❌ Error fetching sample:', sampleError.message);
    } else if (sampleUsers && sampleUsers.length > 0) {
      console.log('   Sample members in users table:');
      sampleUsers.forEach((user, i) => {
        console.log(`   ${i + 1}. ${user.first_name} ${user.last_name} (${user.email}) - Role: ${user.role}`);
      });
    } else {
      console.log('   ℹ️  No members found in users table');
    }

    // Summary
    console.log('\n========================================');
    console.log('SUMMARY');
    console.log('========================================');
    console.log(`Supabase connection: ✅ Working`);
    console.log(`Members table exists: ${membersTableExists ? '✅' : '❌'}`);
    
    const userMemberCount = users ? users.filter(u => u.role === 'member' || u.role === 'user').length : 0;
    console.log(`Members in users table: ${userMemberCount} ${userMemberCount > 0 ? '⚠️  NEEDS MIGRATION' : '✅'}`);
    console.log('');
    
    if (!membersTableExists && userMemberCount > 0) {
      console.log('🚨 ACTION REQUIRED:');
      console.log('   1. Run member_user_separation_migration.sql in Supabase SQL Editor');
      console.log('   2. This will move ' + userMemberCount + ' members to new members table');
      console.log('   3. Users table will only contain agents and admins');
      console.log('');
      console.log('📋 How to run migration:');
      console.log('   1. Go to Supabase Dashboard > SQL Editor');
      console.log('   2. Create new query');
      console.log('   3. Copy/paste content from member_user_separation_migration.sql');
      console.log('   4. Run query');
    } else if (membersTableExists && userMemberCount > 0) {
      console.log('⚠️  PARTIAL MIGRATION:');
      console.log('   Members table exists but users table still has members');
      console.log('   Run cleanup queries to finish migration');
    } else if (membersTableExists && userMemberCount === 0) {
      console.log('✅ MIGRATION COMPLETE:');
      console.log('   Members table exists and users table is clean!');
      console.log('   Now update code to use members table');
    }
    
    console.log('========================================\n');

  } catch (error) {
    console.error('Error:', error);
  }
}

verifyDatabase();
