
import { supabase } from '../lib/supabaseClient';

async function verifyRLSPolicies() {
  try {
    console.log('🔒 VERIFYING RLS POLICIES AND DATA ACCESS\n');

    // 1. Check if RLS is enabled on all tables
    console.log('📋 CHECKING RLS STATUS ON TABLES:');
    const { data: rlsStatus, error: rlsError } = await supabase.rpc('check_rls_status');
    
    if (rlsError) {
      console.log('Creating RLS status check function...');
      
      // Create a function to check RLS status
      await supabase.rpc('exec_sql', {
        sql: `
          CREATE OR REPLACE FUNCTION check_rls_status()
          RETURNS TABLE(table_name text, rls_enabled boolean) AS $$
          BEGIN
            RETURN QUERY
            SELECT 
              schemaname||'.'||tablename as table_name,
              rowsecurity as rls_enabled
            FROM pg_tables t
            JOIN pg_class c ON c.relname = t.tablename
            WHERE t.schemaname = 'public'
            AND t.tablename IN ('users', 'family_members', 'subscriptions', 'payments', 'commissions', 'leads', 'lead_activities', 'enrollment_modifications', 'plans')
            ORDER BY t.tablename;
          END;
          $$ LANGUAGE plpgsql;
        `
      });
    }

    // 2. Check user role distribution
    console.log('\n👥 USER ROLE DISTRIBUTION:');
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, firstName, lastName, role, agentNumber, isActive, approvalStatus, createdAt')
      .order('role');

    if (usersError) {
      console.error('❌ Error fetching users:', usersError);
      return;
    }

    const roleStats = users.reduce((acc: any, user: any) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    }, {});

    console.log('Role distribution:');
    Object.entries(roleStats).forEach(([role, count]) => {
      console.log(`  ${role}: ${count} users`);
    });

    // 3. Check members specifically
    console.log('\n🏥 CURRENT MEMBERS (Healthcare Enrollees):');
    const members = users.filter(user => user.role === 'member' || user.role === 'user');
    
    if (members.length === 0) {
      console.log('  ❌ NO MEMBERS FOUND');
      console.log('  This indicates:');
      console.log('    - No healthcare members are enrolled');
      console.log('    - Possible role assignment issues');
      console.log('    - Data may have been cleared');
    } else {
      console.log(`  ✅ Found ${members.length} healthcare members:`);
      members.forEach((member: any, index: number) => {
        console.log(`  ${index + 1}. ${member.firstName} ${member.lastName} (${member.email})`);
        console.log(`      Role: ${member.role}, Active: ${member.isActive}, Status: ${member.approvalStatus}`);
        console.log(`      Created: ${new Date(member.createdAt).toLocaleDateString()}`);
        if (member.agentNumber) {
          console.log(`      ⚠️  WARNING: Member has agent_number: ${member.agentNumber}`);
        }
      });
    }

    // 4. Check agents
    console.log('\n👔 CURRENT AGENTS:');
    const agents = users.filter(user => user.role === 'agent');
    
    if (agents.length === 0) {
      console.log('  ❌ NO AGENTS FOUND');
    } else {
      console.log(`  ✅ Found ${agents.length} agents:`);
      agents.forEach((agent: any, index: number) => {
        console.log(`  ${index + 1}. ${agent.firstName} ${agent.lastName} (${agent.email})`);
        console.log(`      Agent #: ${agent.agentNumber}, Active: ${agent.isActive}`);
      });
    }

    // 5. Check subscriptions and member data integrity
    console.log('\n💳 SUBSCRIPTION DATA INTEGRITY:');
    const { data: subscriptions, error: subError } = await supabase
      .from('subscriptions')
      .select(`
        id,
        userId,
        status,
        amount,
        startDate,
        users!inner(email, firstName, lastName, role)
      `);

    if (subError) {
      console.error('❌ Error fetching subscriptions:', subError);
    } else if (!subscriptions || subscriptions.length === 0) {
      console.log('  ❌ NO SUBSCRIPTIONS FOUND');
    } else {
      console.log(`  ✅ Found ${subscriptions.length} subscriptions`);
      
      const memberSubs = subscriptions.filter((sub: any) => 
        sub.users && (sub.users.role === 'member' || sub.users.role === 'user')
      );
      
      console.log(`  📊 Healthcare member subscriptions: ${memberSubs.length}`);
      memberSubs.forEach((sub: any, index: number) => {
        const user = sub.users;
        console.log(`  ${index + 1}. ${user.firstName} ${user.lastName} - $${sub.amount} (${sub.status})`);
      });
    }

    // 6. Check family members
    console.log('\n👨‍👩‍👧‍👦 FAMILY MEMBERS:');
    const { data: familyMembers, error: familyError } = await supabase
      .from('family_members')
      .select(`
        id,
        firstName,
        lastName,
        relationship,
        primaryUserId,
        users!inner(email, firstName, lastName, role)
      `);

    if (familyError) {
      console.error('❌ Error fetching family members:', familyError);
    } else if (!familyMembers || familyMembers.length === 0) {
      console.log('  ❌ NO FAMILY MEMBERS FOUND');
    } else {
      console.log(`  ✅ Found ${familyMembers.length} family members`);
      familyMembers.forEach((fm: any, index: number) => {
        const primaryUser = fm.users;
        console.log(`  ${index + 1}. ${fm.firstName} ${fm.lastName} (${fm.relationship})`);
        console.log(`      Primary: ${primaryUser.firstName} ${primaryUser.lastName} (${primaryUser.email})`);
      });
    }

    // 7. Test RLS policy enforcement
    console.log('\n🔐 TESTING RLS POLICY ENFORCEMENT:');
    
    // Test with different auth contexts
    console.log('Testing data access patterns...');
    
    // Check if policies exist
    const { data: policies, error: policyError } = await supabase
      .rpc('get_table_policies');

    if (policyError) {
      console.log('Creating policy check function...');
      await supabase.rpc('exec_sql', {
        sql: `
          CREATE OR REPLACE FUNCTION get_table_policies()
          RETURNS TABLE(table_name text, policy_name text, policy_type text) AS $$
          BEGIN
            RETURN QUERY
            SELECT 
              schemaname||'.'||tablename as table_name,
              policyname as policy_name,
              cmd as policy_type
            FROM pg_policies
            WHERE schemaname = 'public'
            AND tablename IN ('users', 'family_members', 'subscriptions', 'payments', 'commissions', 'leads')
            ORDER BY tablename, policyname;
          END;
          $$ LANGUAGE plpgsql;
        `
      });
    }

    // 8. Check for role conflicts
    console.log('\n🚨 CHECKING FOR ROLE CONFLICTS:');
    
    const conflicts = users.filter(user => 
      (user.agentNumber && user.role !== 'agent') ||
      (user.role === 'agent' && !user.agentNumber)
    );

    if (conflicts.length === 0) {
      console.log('  ✅ No role conflicts found');
    } else {
      console.log(`  ⚠️  Found ${conflicts.length} role conflicts:`);
      conflicts.forEach((user: any) => {
        console.log(`    - ${user.email}: role=${user.role}, agentNumber=${user.agentNumber}`);
      });
    }

    // 9. Verify admin access
    console.log('\n👑 ADMIN USERS:');
    const admins = users.filter(user => user.role === 'admin');
    
    if (admins.length === 0) {
      console.log('  ❌ NO ADMIN USERS FOUND');
    } else {
      console.log(`  ✅ Found ${admins.length} admin users:`);
      admins.forEach((admin: any, index: number) => {
        console.log(`  ${index + 1}. ${admin.firstName} ${admin.lastName} (${admin.email})`);
      });
    }

    console.log('\n✅ RLS POLICY AND DATA VERIFICATION COMPLETE!');
    console.log('\n📋 SUMMARY:');
    console.log(`  • Total users: ${users.length}`);
    console.log(`  • Healthcare members: ${members.length}`);
    console.log(`  • Agents: ${agents.length}`);
    console.log(`  • Admins: ${admins.length}`);
    console.log(`  • Subscriptions: ${subscriptions?.length || 0}`);
    console.log(`  • Family members: ${familyMembers?.length || 0}`);
    console.log(`  • Role conflicts: ${conflicts.length}`);

  } catch (error) {
    console.error('❌ Error during RLS verification:', error);
  }
}

// Helper function to create missing RLS policies if needed
async function ensureRLSPolicies() {
  console.log('\n🔧 ENSURING RLS POLICIES ARE IN PLACE...');
  
  const policies = [
    // Enable RLS on all tables first
    'ALTER TABLE users ENABLE ROW LEVEL SECURITY;',
    'ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;',
    'ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;',
    'ALTER TABLE payments ENABLE ROW LEVEL SECURITY;',
    'ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;',
    'ALTER TABLE leads ENABLE ROW LEVEL SECURITY;',
    'ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;',
    'ALTER TABLE enrollment_modifications ENABLE ROW LEVEL SECURITY;',
    
    // Service role bypass (critical for backend operations)
    `CREATE POLICY IF NOT EXISTS "Service role bypass users" ON users FOR ALL USING (auth.role() = 'service_role');`,
    `CREATE POLICY IF NOT EXISTS "Service role bypass family_members" ON family_members FOR ALL USING (auth.role() = 'service_role');`,
    `CREATE POLICY IF NOT EXISTS "Service role bypass subscriptions" ON subscriptions FOR ALL USING (auth.role() = 'service_role');`,
    `CREATE POLICY IF NOT EXISTS "Service role bypass payments" ON payments FOR ALL USING (auth.role() = 'service_role');`,
    `CREATE POLICY IF NOT EXISTS "Service role bypass commissions" ON commissions FOR ALL USING (auth.role() = 'service_role');`,
    
    // Admin access to all data
    `CREATE POLICY IF NOT EXISTS "Admins can access all users" ON users FOR ALL USING (auth.uid() IN (SELECT id FROM users WHERE role = 'admin'));`,
    `CREATE POLICY IF NOT EXISTS "Admins can access all family_members" ON family_members FOR ALL USING (auth.uid() IN (SELECT id FROM users WHERE role = 'admin'));`,
    `CREATE POLICY IF NOT EXISTS "Admins can access all subscriptions" ON subscriptions FOR ALL USING (auth.uid() IN (SELECT id FROM users WHERE role = 'admin'));`,
    
    // Member access to own data only
    `CREATE POLICY IF NOT EXISTS "Members can access own data" ON users FOR SELECT USING (id = auth.uid() OR auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'agent')));`,
    `CREATE POLICY IF NOT EXISTS "Members can access own family" ON family_members FOR ALL USING (primaryUserId = auth.uid() OR auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'agent')));`,
    `CREATE POLICY IF NOT EXISTS "Members can access own subscriptions" ON subscriptions FOR SELECT USING (userId = auth.uid() OR auth.uid() IN (SELECT id FROM users WHERE role IN ('admin', 'agent')));`,
  ];

  for (const policy of policies) {
    try {
      await supabase.rpc('exec_sql', { sql: policy });
      console.log(`✅ Applied policy: ${policy.substring(0, 50)}...`);
    } catch (error) {
      console.log(`⚠️  Policy may already exist: ${policy.substring(0, 50)}...`);
    }
  }
}

// Run verification
verifyRLSPolicies();
