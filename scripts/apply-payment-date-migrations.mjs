import { supabase } from '../server/lib/supabaseClient.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function applyMigrations() {
  try {
    console.log('🔄 Applying commission payment date migrations...\n');

    // Migration 1: Add payment_eligible_date column
    console.log('📝 Step 1: Adding payment_eligible_date column...');
    const migration1 = readFileSync(
      join(__dirname, '../migrations/20260220_add_payment_eligible_date.sql'),
      'utf8'
    );
    
    const { error: error1 } = await supabase.rpc('exec_sql', { sql_query: migration1 });
    
    if (error1) {
      console.error('❌ Error applying payment_eligible_date migration:', error1);
      // Try direct query approach
      console.log('   Trying alternate approach...');
      const lines = migration1.split(';').filter(line => line.trim());
      for (const sql of lines) {
        if (sql.trim()) {
          const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
          if (error && !error.message?.includes('already exists')) {
            console.error('   Error:', error.message);
          }
        }
      }
    } else {
      console.log('✅ Successfully added payment_eligible_date column\n');
    }

    // Migration 2: Fix member 10's plan
    console.log('📝 Step 2: Fixing member 10 plan type...');
    const migration2 = readFileSync(
      join(__dirname, '../migrations/20260220_fix_member_10_plan.sql'),
      'utf8'
    );
    
    const { error: error2 } = await supabase.rpc('exec_sql', { sql_query: migration2 });
    
    if (error2) {
      console.error('❌ Error applying member 10 fix:', error2);
      console.log('   You may need to run this manually in the Supabase SQL editor');
    } else {
      console.log('✅ Successfully fixed member 10 plan type\n');
    }

    console.log('\n🎉 Migrations complete!');
    console.log('\nNext steps:');
    console.log('1. Verify member 10 commission shows correct plan (Member/Spouse Plus)');
    console.log('2. Payment eligible dates will be calculated automatically for new commissions');
    console.log('3. Admin can override payment dates in the UI');

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

applyMigrations();
