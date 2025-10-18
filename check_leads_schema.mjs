import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkLeadsSchema() {
  console.log('🔍 Checking leads table schema...\n');

  // Try to get one lead record to see column names
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .limit(1);

  if (error) {
    console.error('❌ Error querying leads table:', error);
    return;
  }

  if (data && data.length > 0) {
    console.log('✅ Leads table columns:', Object.keys(data[0]));
  } else {
    console.log('⚠️ No leads found in table');
    
    // Try to insert a test lead to see what columns are required
    console.log('\n🧪 Testing column names with insert...');
    
    const testLead = {
      first_name: 'Test',
      last_name: 'User',
      email: 'test@example.com',
      phone: '1234567890',
      message: 'Test message',
      source: 'contact_form',
      status: 'new'
    };
    
    const { data: insertData, error: insertError } = await supabase
      .from('leads')
      .insert([testLead])
      .select();
    
    if (insertError) {
      console.error('❌ Insert error:', insertError.message);
      console.error('Details:', insertError.details);
    } else {
      console.log('✅ Insert successful! Columns:', Object.keys(insertData[0]));
      
      // Clean up test lead
      await supabase.from('leads').delete().eq('id', insertData[0].id);
      console.log('🧹 Test lead deleted');
    }
  }
}

checkLeadsSchema().catch(console.error);
