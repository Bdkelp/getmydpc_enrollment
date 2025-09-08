import { supabase } from '../lib/supabaseClient';

async function fixAgentNumbers() {
  console.log('Fixing agent numbers to ensure uniqueness...\n');
  
  try {
    // First, get all admin and agent users
    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, role, agent_number')
      .in('role', ['admin', 'agent'])
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Error fetching users:', error);
      process.exit(1);
    }
    
    console.log(`Found ${users.length} admin/agent users\n`);
    
    // Separate admins and agents
    const admins = users.filter(u => u.role === 'admin');
    const agents = users.filter(u => u.role === 'agent');
    
    // Track used numbers to ensure uniqueness
    const usedNumbers = new Set<string>();
    const updates: { id: string, email: string, oldNumber: string | null, newNumber: string }[] = [];
    
    // Process admins first (MPP0001 - MPP0099)
    let adminCounter = 1;
    for (const admin of admins) {
      let newNumber = `MPP${String(adminCounter).padStart(4, '0')}`;
      
      // Keep existing valid number if it's unique and in correct format
      if (admin.agent_number && 
          admin.agent_number.match(/^MPP\d{4}$/) && 
          !usedNumbers.has(admin.agent_number)) {
        usedNumbers.add(admin.agent_number);
        console.log(`✓ Admin ${admin.email} keeps existing number: ${admin.agent_number}`);
      } else {
        // Find next available number
        while (usedNumbers.has(newNumber)) {
          adminCounter++;
          newNumber = `MPP${String(adminCounter).padStart(4, '0')}`;
        }
        usedNumbers.add(newNumber);
        updates.push({
          id: admin.id,
          email: admin.email,
          oldNumber: admin.agent_number,
          newNumber
        });
        adminCounter++;
      }
    }
    
    // Process agents (MPP0100 onwards)
    let agentCounter = 100;
    for (const agent of agents) {
      let newNumber = `MPP${String(agentCounter).padStart(4, '0')}`;
      
      // Keep existing valid number if it's unique and in correct format
      if (agent.agent_number && 
          agent.agent_number.match(/^MPP\d{4}$/) && 
          !usedNumbers.has(agent.agent_number)) {
        usedNumbers.add(agent.agent_number);
        console.log(`✓ Agent ${agent.email} keeps existing number: ${agent.agent_number}`);
      } else {
        // Find next available number
        while (usedNumbers.has(newNumber)) {
          agentCounter++;
          newNumber = `MPP${String(agentCounter).padStart(4, '0')}`;
        }
        usedNumbers.add(newNumber);
        updates.push({
          id: agent.id,
          email: agent.email,
          oldNumber: agent.agent_number,
          newNumber
        });
        agentCounter++;
      }
    }
    
    // Apply updates
    if (updates.length > 0) {
      console.log('\nApplying agent number updates:');
      console.log('─'.repeat(80));
      
      for (const update of updates) {
        const { error: updateError } = await supabase
          .from('users')
          .update({ agent_number: update.newNumber })
          .eq('id', update.id);
        
        if (updateError) {
          console.error(`✗ Failed to update ${update.email}:`, updateError);
        } else {
          console.log(`✓ Updated ${update.email}: ${update.oldNumber || 'NOT SET'} → ${update.newNumber}`);
        }
      }
    } else {
      console.log('\n✓ All agent numbers are already correctly assigned!');
    }
    
    // Show final summary
    console.log('\n' + '='.repeat(80));
    console.log('FINAL AGENT NUMBER ASSIGNMENTS:');
    console.log('='.repeat(80));
    
    const { data: finalUsers } = await supabase
      .from('users')
      .select('email, role, agent_number')
      .in('role', ['admin', 'agent'])
      .order('agent_number', { ascending: true });
    
    if (finalUsers) {
      console.log('\nADMINS:');
      finalUsers.filter(u => u.role === 'admin').forEach(u => {
        console.log(`  ${u.agent_number} - ${u.email}`);
      });
      
      console.log('\nAGENTS:');
      finalUsers.filter(u => u.role === 'agent').forEach(u => {
        console.log(`  ${u.agent_number} - ${u.email}`);
      });
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

fixAgentNumbers();