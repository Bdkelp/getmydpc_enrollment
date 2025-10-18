import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkLeadsSchema() {
  console.log('🔍 Checking leads table schema using Supabase RPC...\n');

  // Use raw SQL to get table structure
  const { data, error } = await supabase.rpc('get_table_columns', {
    table_name: 'leads'
  });

  if (error) {
    console.log('⚠️ RPC not available, trying direct query...\n');
    
    // Try a raw SQL query instead
    const { data: columnsData, error: columnsError } = await supabase
      .from('leads')
      .select('*')
      .limit(0); // Get no rows, just structure
    
    if (columnsError) {
      console.error('❌ Error:', columnsError.message);
      
      // Last resort - try different column name variations
      console.log('\n🧪 Testing different column name formats...');
      
      const variations = [
        { first_name: 'Test', last_name: 'User', email: 'test@test.com', phone: '1234567890' },
        { firstName: 'Test', lastName: 'User', email: 'test@test.com', phone: '1234567890' },
        { 'first name': 'Test', 'last name': 'User', email: 'test@test.com', phone: '1234567890' }
      ];
      
      for (const testData of variations) {
        console.log('\n  Testing:', Object.keys(testData));
        const { error: testError } = await supabase.from('leads').insert([testData]);
        if (!testError) {
          console.log('  ✅ SUCCESS with these columns!');
          // Clean up
          await supabase.from('leads').delete().match(testData);
          break;
        } else {
          console.log('  ❌', testError.message);
        }
      }
    }
  } else {
    console.log('✅ Table columns:', data);
  }
}

checkLeadsSchema().catch(console.error);
