import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function listAgents() {
  console.log('🔍 Listing all agents in the system...\n');
  
  try {
    const { data: agents, error } = await supabase
      .from('users')
      .select('email, first_name, last_name, agent_number, role, is_active')
      .eq('role', 'agent')
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('❌ Error:', error.message);
      return;
    }
    
    if (agents && agents.length > 0) {
      console.log(`Found ${agents.length} agent(s):\n`);
      agents.forEach((agent, index) => {
        console.log(`${index + 1}. ${agent.first_name} ${agent.last_name}`);
        console.log(`   Email: ${agent.email}`);
        console.log(`   Agent Number: ${agent.agent_number}`);
        console.log(`   Status: ${agent.is_active ? '✅ Active' : '❌ Inactive'}`);
        console.log('');
      });
    } else {
      console.log('❌ No agents found in database');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

listAgents();
