import 'dotenv/config';
import { supabase } from './server/lib/supabaseClient';

async function checkPlansSchema() {
  console.log('🔍 Checking plans table structure...\n');
  
  // Try to get existing plans to see the structure
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .limit(1);
  
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Current plans:', JSON.stringify(data, null, 2));
    if (data && data.length > 0) {
      console.log('\nColumn names:', Object.keys(data[0]));
    }
  }
}

checkPlansSchema();
