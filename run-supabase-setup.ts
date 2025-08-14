import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    persistSession: false
  }
});

async function setupTables() {
  console.log('Creating tables in Supabase...\n');
  
  const sqlScript = fs.readFileSync('supabase_migration.sql', 'utf-8');
  
  // Execute the SQL script
  const { error } = await supabase.from('_sql').select('*').single();
  
  // Use direct SQL execution via Supabase
  const { data, error: sqlError } = await supabase.rpc('exec_sql', {
    sql: sqlScript
  }).single();
  
  if (sqlError) {
    // If RPC doesn't exist, we'll need to run it manually
    console.log('Please run the following SQL in your Supabase SQL Editor:');
    console.log('\n--- Copy everything below this line ---\n');
    console.log(sqlScript);
    console.log('\n--- Copy everything above this line ---\n');
    console.log('\nAfter running the SQL, press Enter to continue with data migration...');
    
    // Wait for user confirmation
    await new Promise(resolve => {
      process.stdin.resume();
      process.stdin.once('data', resolve);
    });
  } else {
    console.log('✓ Tables created successfully');
  }
  
  console.log('\nTables are ready for migration!');
}

setupTables().catch(console.error);