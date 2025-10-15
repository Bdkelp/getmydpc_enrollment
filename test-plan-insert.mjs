import 'dotenv/config';
import { supabase } from './server/lib/supabaseClient';

async function testInsert() {
  console.log('🧪 Testing plan insert...\n');
  
  const testPlan = {
    name: "Test Plan",
    description: "Test description",
    price: 99.00
  };
  
  console.log('Inserting:', testPlan);
  
  const { data, error } = await supabase
    .from('plans')
    .insert(testPlan)
    .select();
  
  if (error) {
    console.error('❌ Error:', error);
  } else {
    console.log('✅ Success! Inserted plan:', JSON.stringify(data, null, 2));
    console.log('\nReturned columns:', Object.keys(data[0]));
  }
}

testInsert();
