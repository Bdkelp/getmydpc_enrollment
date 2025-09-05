
import { supabase } from '../lib/supabaseClient';

async function verifyMembers() {
  try {
    console.log('🔍 Verifying member data in the system...\n');

    // 1. Check user role distribution
    console.log('📊 USER ROLE DISTRIBUTION:');
    const { data: roleDistribution, error: roleError } = await supabase
      .from('users')
      .select('role')
      .order('role');

    if (roleError) throw roleError;

    const roleCounts = roleDistribution.reduce((acc: any, user: any) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    }, {});

    Object.entries(roleCounts).forEach(([role, count]) => {
      console.log(`  ${role}: ${count} users`);
    });

    // 2. Get all members (non-agents/non-admins)
    console.log('\n👥 CURRENT MEMBERS:');
    const { data: members, error: membersError } = await supabase
      .from('users')
      .select(`
        id,
        email,
        first_name,
        last_name,
        role,
        agent_number,
        is_active,
        approval_status,
        enrolled_by_agent_id,
        created_at
      `)
      .in('role', ['user', 'member'])
      .order('created_at', { ascending: false });

    if (membersError) throw membersError;

    if (!members || members.length === 0) {
      console.log('  ❌ NO MEMBERS FOUND IN SYSTEM');
      console.log('  This could indicate:');
      console.log('    - All test data was cleared');
      console.log('    - Members have wrong role assignments');
      console.log('    - Database connection issues');
    } else {
      console.log(`  ✅ Found ${members.length} members:`);
      members.forEach((member: any, index: number) => {
        console.log(`  ${index + 1}. ${member.first_name} ${member.last_name} (${member.email})`);
        console.log(`      Role: ${member.role}, Active: ${member.is_active}, Status: ${member.approval_status}`);
        console.log(`      Created: ${new Date(member.created_at).toLocaleDateString()}`);
        if (member.agent_number) {
          console.log(`      ⚠️  WARNING: Member has agent_number: ${member.agent_number}`);
        }
        console.log('');
      });
    }

    // 3. Check for role conflicts
    console.log('\n🚨 CHECKING FOR ROLE CONFLICTS:');
    
    // Users with agent_number but not agent role
    const { data: conflictUsers, error: conflictError } = await supabase
      .from('users')
      .select('email, role, agent_number')
      .not('agent_number', 'is', null)
      .neq('role', 'agent');

    if (conflictError) throw conflictError;

    if (conflictUsers && conflictUsers.length > 0) {
      console.log('  ⚠️  Users with agent_number but not agent role:');
      conflictUsers.forEach((user: any) => {
        console.log(`    - ${user.email}: role=${user.role}, agent_number=${user.agent_number}`);
      });
    } else {
      console.log('  ✅ No role conflicts found');
    }

    // 4. Check subscriptions for members
    console.log('\n💳 MEMBER SUBSCRIPTIONS:');
    const { data: subscriptions, error: subError } = await supabase
      .from('subscriptions')
      .select(`
        id,
        status,
        amount,
        user_id,
        users!inner(email, first_name, last_name, role)
      `)
      .eq('users.role', 'user');

    if (subError) throw subError;

    if (!subscriptions || subscriptions.length === 0) {
      console.log('  ❌ NO ACTIVE SUBSCRIPTIONS FOR MEMBERS');
    } else {
      console.log(`  ✅ Found ${subscriptions.length} member subscriptions:`);
      subscriptions.forEach((sub: any, index: number) => {
        const user = sub.users;
        console.log(`  ${index + 1}. ${user.first_name} ${user.last_name} (${user.email})`);
        console.log(`      Subscription: $${sub.amount}, Status: ${sub.status}`);
      });
    }

    // 5. Check agents for reference
    console.log('\n👔 CURRENT AGENTS:');
    const { data: agents, error: agentsError } = await supabase
      .from('users')
      .select('email, first_name, last_name, agent_number, is_active')
      .eq('role', 'agent')
      .order('agent_number');

    if (agentsError) throw agentsError;

    if (!agents || agents.length === 0) {
      console.log('  ❌ NO AGENTS FOUND');
    } else {
      console.log(`  ✅ Found ${agents.length} agents:`);
      agents.forEach((agent: any, index: number) => {
        console.log(`  ${index + 1}. ${agent.first_name} ${agent.last_name} (${agent.email})`);
        console.log(`      Agent #: ${agent.agent_number}, Active: ${agent.is_active}`);
      });
    }

    console.log('\n✅ Member verification complete!');

  } catch (error) {
    console.error('❌ Error verifying members:', error);
  }
}

// Run the verification
verifyMembers().then(() => process.exit(0));
