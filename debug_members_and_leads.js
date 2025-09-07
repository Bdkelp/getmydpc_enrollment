
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function debugMembersAndLeads() {
  try {
    console.log('🔍 DEBUGGING MEMBERS AND LEADS SYSTEM\n');

    // 1. Check table structure
    console.log('1. CHECKING TABLE STRUCTURES:');
    
    // Check leads table structure
    const { data: leadsStructure, error: leadsStructureError } = await supabase
      .from('leads')
      .select('*')
      .limit(1);
    
    if (leadsStructureError) {
      console.error('❌ Error checking leads structure:', leadsStructureError.message);
    } else {
      console.log('✅ Leads table accessible');
      if (leadsStructure && leadsStructure.length > 0) {
        console.log('📋 Sample lead columns:', Object.keys(leadsStructure[0]));
      }
    }

    // Check family_members table structure
    const { data: familyStructure, error: familyStructureError } = await supabase
      .from('family_members')
      .select('*')
      .limit(1);
    
    if (familyStructureError) {
      console.error('❌ Error checking family_members structure:', familyStructureError.message);
    } else {
      console.log('✅ Family_members table accessible');
      if (familyStructure && familyStructure.length > 0) {
        console.log('📋 Sample family_member columns:', Object.keys(familyStructure[0]));
      }
    }

    // 2. Check data counts
    console.log('\n2. CHECKING DATA COUNTS:');
    
    const { count: leadsCount, error: leadsCountError } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true });
    
    console.log(`📊 Total leads: ${leadsCount || 0}`);
    
    const { count: usersCount, error: usersCountError } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });
    
    console.log(`👥 Total users: ${usersCount || 0}`);

    // 3. Check for users with member/user role vs admin/agent
    console.log('\n3. CHECKING USER ROLES:');
    const { data: userRoles, error: rolesError } = await supabase
      .from('users')
      .select('role, count(*)')
      .eq('is_active', true);
    
    if (!rolesError && userRoles) {
      const roleCounts = {};
      userRoles.forEach(user => {
        roleCounts[user.role] = (roleCounts[user.role] || 0) + 1;
      });
      console.log('👤 User role distribution:', roleCounts);
    }

    // 4. Test creating a lead with correct column names
    console.log('\n4. TESTING LEAD CREATION WITH CORRECT COLUMN NAMES:');
    try {
      const testLead = {
        first_name: 'Test',
        last_name: 'User',
        email: 'test@example.com',
        phone: '555-TEST-LEAD',
        message: 'Test lead creation',
        source: 'debug_test',
        status: 'new'
      };

      const { data: createdLead, error: createError } = await supabase
        .from('leads')
        .insert([testLead])
        .select()
        .single();

      if (createError) {
        console.error('❌ Error creating test lead:', createError.message);
      } else {
        console.log('✅ Test lead created successfully:', createdLead.id);
        
        // Clean up test lead
        await supabase.from('leads').delete().eq('id', createdLead.id);
        console.log('🧹 Test lead cleaned up');
      }
    } catch (error) {
      console.error('❌ Test lead creation failed:', error.message);
    }

    // 5. Check recent leads with column mapping
    console.log('\n5. CHECKING RECENT LEADS:');
    const { data: recentLeads, error: recentError } = await supabase
      .from('leads')
      .select('id, first_name, last_name, email, status, assigned_agent_id, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    if (recentError) {
      console.error('❌ Error fetching recent leads:', recentError.message);
    } else {
      console.log('✅ Recent leads (showing column names):');
      recentLeads?.forEach(lead => {
        console.log(`  - ID: ${lead.id}, Name: ${lead.first_name} ${lead.last_name}, Status: ${lead.status}, Agent: ${lead.assigned_agent_id || 'Unassigned'}`);
      });
    }

    console.log('\n🎉 Debug completed successfully!');

  } catch (error) {
    console.error('❌ Debug error:', error);
  }
}

debugMembersAndLeads();
