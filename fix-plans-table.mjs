import 'dotenv/config';
import { supabase } from './server/lib/supabaseClient';

async function addMissingColumns() {
  console.log('🔧 Adding missing columns to plans table...\n');
  
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      ALTER TABLE plans 
      ADD COLUMN IF NOT EXISTS features JSONB,
      ADD COLUMN IF NOT EXISTS max_members INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
    `
  });
  
  if (error) {
    console.error('❌ Error:', error);
    console.log('\n⚠️  You need to run this SQL manually in Supabase SQL Editor:');
    console.log(`
ALTER TABLE plans 
ADD COLUMN IF NOT EXISTS features JSONB,
ADD COLUMN IF NOT EXISTS max_members INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
    `);
  } else {
    console.log('✅ Success!', data);
  }
}

addMissingColumns();
