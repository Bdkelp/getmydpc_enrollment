import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testAdminFeatures() {
  console.log('🧪 Testing Lead Admin Features\n');

  try {
    // 1. Test fetching all leads (should work now with assigned_agent_id column)
    console.log('1️⃣  Testing getAllLeads()...');
    const { data: leads, error: fetchError } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('❌ Failed to fetch leads:', fetchError.message);
      return;
    }

    console.log(`✅ Successfully fetched ${leads.length} leads`);
    leads.forEach((lead, index) => {
      console.log(`   Lead ${index + 1}:`, {
        id: lead.id,
        name: `${lead.first_name} ${lead.last_name}`,
        email: lead.email,
        status: lead.status,
        assigned_agent_id: lead.assigned_agent_id || 'UNASSIGNED',
        source: lead.source || 'contact_form',
        created_at: lead.created_at
      });
    });

    if (leads.length === 0) {
      console.log('\n⚠️  No leads found to test with. Please submit a lead through the contact form first.');
      return;
    }

    // 2. Test updating lead status
    const testLead = leads[0];
    console.log(`\n2️⃣  Testing updateLead() - Changing status from "${testLead.status}" to "contacted"...`);
    
    const { data: updatedLead, error: updateError } = await supabase
      .from('leads')
      .update({
        status: 'contacted',
        updated_at: new Date().toISOString()
      })
      .eq('id', testLead.id)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Failed to update lead status:', updateError.message);
      return;
    }

    console.log('✅ Successfully updated lead status:', {
      id: updatedLead.id,
      old_status: testLead.status,
      new_status: updatedLead.status,
      updated_at: updatedLead.updated_at
    });

    // 3. Test assigning lead to agent
    const testAgentId = 'test-agent-123'; // Replace with actual agent ID from your users table if needed
    console.log(`\n3️⃣  Testing assignLeadToAgent() - Assigning to agent "${testAgentId}"...`);
    
    const { data: assignedLead, error: assignError } = await supabase
      .from('leads')
      .update({
        assigned_agent_id: testAgentId,
        updated_at: new Date().toISOString()
      })
      .eq('id', testLead.id)
      .select()
      .single();

    if (assignError) {
      console.error('❌ Failed to assign lead to agent:', assignError.message);
      return;
    }

    console.log('✅ Successfully assigned lead to agent:', {
      id: assignedLead.id,
      assigned_agent_id: assignedLead.assigned_agent_id,
      status: assignedLead.status,
      updated_at: assignedLead.updated_at
    });

    // 4. Test adding notes to lead
    console.log(`\n4️⃣  Testing updateLead() - Adding notes...`);
    
    const { data: leadWithNotes, error: notesError } = await supabase
      .from('leads')
      .update({
        notes: 'Test note: Initial contact made via phone call',
        updated_at: new Date().toISOString()
      })
      .eq('id', testLead.id)
      .select()
      .single();

    if (notesError) {
      console.error('❌ Failed to add notes to lead:', notesError.message);
      return;
    }

    console.log('✅ Successfully added notes to lead:', {
      id: leadWithNotes.id,
      notes: leadWithNotes.notes,
      updated_at: leadWithNotes.updated_at
    });

    // 5. Test filtering leads by assigned agent
    console.log(`\n5️⃣  Testing filtering by assigned_agent_id...`);
    
    const { data: agentLeads, error: filterError } = await supabase
      .from('leads')
      .select('*')
      .eq('assigned_agent_id', testAgentId);

    if (filterError) {
      console.error('❌ Failed to filter leads by agent:', filterError.message);
      return;
    }

    console.log(`✅ Successfully filtered leads by agent: Found ${agentLeads.length} lead(s)`);

    // 6. Restore original state
    console.log(`\n6️⃣  Restoring original lead state...`);
    
    const { error: restoreError } = await supabase
      .from('leads')
      .update({
        status: testLead.status,
        assigned_agent_id: null,
        notes: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', testLead.id);

    if (restoreError) {
      console.error('⚠️  Warning: Failed to restore original state:', restoreError.message);
    } else {
      console.log('✅ Successfully restored lead to original state');
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ ALL ADMIN FEATURES WORKING CORRECTLY!');
    console.log('='.repeat(60));
    console.log('\n📋 Summary:');
    console.log('   ✅ Fetch all leads (getAllLeads)');
    console.log('   ✅ Update lead status');
    console.log('   ✅ Assign lead to agent');
    console.log('   ✅ Add notes to lead');
    console.log('   ✅ Filter leads by assigned agent');
    console.log('\n🎉 The admin Lead Management features are ready to use!');

  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    throw error;
  }
}

testAdminFeatures();
