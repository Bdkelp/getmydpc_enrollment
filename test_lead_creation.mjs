import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function testLeadCreation() {
  console.log('🧪 Testing lead creation with correct camelCase schema...\n');

  // Use snake_case to match actual Supabase table structure
  const testLead = {
    first_name: 'Test',
    last_name: 'User',
    email: 'testuser@example.com',
    phone: '1234567890',
    message: 'This is a test lead from the public contact form',
    source: 'contact_form',
    status: 'new',
    assigned_agent_id: null,  // No agent assigned for public submissions
    created_at: new Date(),
    updated_at: new Date()
  };

  console.log('📝 Attempting to insert lead:', testLead);

  const { data, error } = await supabase
    .from('leads')
    .insert([testLead])
    .select()
    .single();

  if (error) {
    console.error('\n❌ Lead creation FAILED:');
    console.error('   Message:', error.message);
    console.error('   Details:', error.details);
    console.error('   Hint:', error.hint);
    console.error('   Code:', error.code);
  } else {
    console.log('\n✅ Lead created successfully!');
    console.log('   Lead ID:', data.id);
    console.log('   Name:', `${data.first_name} ${data.last_name}`);
    console.log('   Email:', data.email);
    console.log('   Status:', data.status);
    console.log('   Source:', data.source);
    console.log('   Assigned Agent:', data.assigned_agent_id || 'None (as expected)');
    
    // Clean up test lead
    console.log('\n🧹 Cleaning up test lead...');
    await supabase.from('leads').delete().eq('id', data.id);
    console.log('✅ Test lead deleted');
  }
}

testLeadCreation().catch(console.error);
