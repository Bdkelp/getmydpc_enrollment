import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function testCreateLeadWithoutOptionalColumns() {
  console.log('🧪 Testing lead creation WITHOUT optional columns (current table)...\n');

  // Simulate what the createLead() function will do
  const dbData = {
    first_name: 'John',
    last_name: 'Doe',
    email: 'johndoe@example.com',
    phone: '5551234567',
    message: 'I am interested in learning more about your DPC membership plans.',
    status: 'new'
    // NOT including: source, assigned_agent_id, updated_at (they don't exist yet)
  };

  console.log('📝 Inserting lead:', dbData);

  try {
    const { data, error } = await supabase
      .from('leads')
      .insert([dbData])
      .select()
      .single();

    if (error) {
      console.error('\n❌ Lead creation FAILED:');
      console.error('   Error:', error.message);
    } else {
      console.log('\n✅ Lead created successfully!');
      console.log('   Lead ID:', data.id);
      console.log('   Name:', `${data.first_name} ${data.last_name}`);
      console.log('   Email:', data.email);
      console.log('   Status:', data.status);
      console.log('\n📋 Full data:', data);
      
      // Clean up
      console.log('\n🧹 Cleaning up test lead...');
      await supabase.from('leads').delete().eq('id', data.id);
      console.log('✅ Test lead deleted');
    }
  } catch (error) {
    console.error('\n❌ Unexpected error:', error);
  }
}

testCreateLeadWithoutOptionalColumns().catch(console.error);
