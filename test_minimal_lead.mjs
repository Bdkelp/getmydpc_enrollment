import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function testMinimalLead() {
  console.log('🧪 Testing minimal lead creation (only required fields)...\n');

  // Only insert fields that definitely exist in the table
  const minimalLead = {
    first_name: 'Test',
    last_name: 'User',
    email: 'minimal@example.com',
    phone: '1234567890',
    message: 'Minimal test lead',
    status: 'new'
  };

  console.log('📝 Attempting minimal insert:', minimalLead);

  const { data, error } = await supabase
    .from('leads')
    .insert([minimalLead])
    .select()
    .single();

  if (error) {
    console.error('\n❌ Minimal lead creation FAILED:');
    console.error('   Message:', error.message);
  } else {
    console.log('\n✅ Minimal lead created successfully!');
    console.log('   Lead ID:', data.id);
    console.log('   Available columns:', Object.keys(data));
    console.log('\n📋 Full data:', data);
    
    // Clean up
    console.log('\n🧹 Cleaning up...');
    await supabase.from('leads').delete().eq('id', data.id);
    console.log('✅ Test lead deleted');
  }
}

testMinimalLead().catch(console.error);
