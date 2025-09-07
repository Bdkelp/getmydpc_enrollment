
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://sgtnzhgxlkcvtrzejobx.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNndG56aGd4bGtjdnRyemVqb2J4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1MTAwNzMsImV4cCI6MjA2NzA4NjA3M30.hxXOAabQfzOWtI2ZK4a-zKNQlz6R7SbqHCQX6Bh2Xhk';

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugMembersAndLeads() {
  console.log('🔍 DEBUGGING MEMBERS AND LEADS ISSUE');
  console.log('=====================================\n');

  try {
    // 1. Check users table and roles
    console.log('1. CHECKING USERS TABLE:');
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, firstName, lastName, role, agentNumber, isActive, approvalStatus')
      .order('createdAt', { ascending: false });

    if (usersError) {
      console.error('❌ Error fetching users:', usersError);
      return;
    }

    console.log(`Total users: ${users.length}`);
    
    const roleBreakdown = users.reduce((acc, user) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    }, {});
    
    console.log('Role breakdown:', roleBreakdown);
    
    // Show agents specifically
    const agents = users.filter(u => u.role === 'agent');
    console.log(`\nAgents (${agents.length}):`);
    agents.forEach(agent => {
      console.log(`  - ${agent.firstName} ${agent.lastName} (${agent.email}) - Agent #${agent.agentNumber || 'NONE'}`);
    });
    
    // Show members specifically  
    const members = users.filter(u => u.role === 'member');
    console.log(`\nMembers (${members.length}):`);
    members.forEach(member => {
      console.log(`  - ${member.firstName} ${member.lastName} (${member.email}) - Status: ${member.approvalStatus}`);
    });

    // 2. Check leads table
    console.log('\n2. CHECKING LEADS TABLE:');
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('*')
      .order('createdAt', { ascending: false });

    if (leadsError) {
      console.error('❌ Error fetching leads:', leadsError);
      console.error('Error details:', leadsError);
    } else {
      console.log(`Total leads: ${leads.length}`);
      
      if (leads.length > 0) {
        console.log('\nRecent leads:');
        leads.slice(0, 5).forEach(lead => {
          console.log(`  - ${lead.firstName} ${lead.lastName} (${lead.email}) - Status: ${lead.status}, Assigned: ${lead.assignedAgentId || 'None'}`);
        });
        
        const statusBreakdown = leads.reduce((acc, lead) => {
          acc[lead.status] = (acc[lead.status] || 0) + 1;
          return acc;
        }, {});
        console.log('\nLead status breakdown:', statusBreakdown);
        
        const assignmentBreakdown = {
          assigned: leads.filter(l => l.assignedAgentId).length,
          unassigned: leads.filter(l => !l.assignedAgentId).length
        };
        console.log('Lead assignment breakdown:', assignmentBreakdown);
      }
    }

    // 3. Check table structure
    console.log('\n3. CHECKING TABLE STRUCTURE:');
    const { data: columns, error: columnsError } = await supabase
      .rpc('get_table_columns', { table_name: 'leads' });
    
    if (!columnsError && columns) {
      console.log('Leads table columns:', columns.map(c => c.column_name));
    }

  } catch (error) {
    console.error('❌ Debug error:', error);
  }
}

debugMembersAndLeads();
