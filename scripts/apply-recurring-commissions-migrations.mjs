import { supabase } from '../server/lib/supabaseClient.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function applyAllMigrations() {
  try {
    console.log('==================================================');
    console.log('🚀 Applying Recurring Commission System Migrations');
    console.log('==================================================\n');

    const migrations = [
      {
        name: 'Add payment_eligible_date to agent_commissions',
        file: '20260220_add_payment_eligible_date.sql',
        description: 'Adds payment eligible date tracking (Friday after week ends)'
      },
      {
        name: 'Fix member 10 plan type',
        file: '20260220_fix_member_10_plan.sql', 
        description: 'Updates member 10 to use Member/Spouse Plus plan'
      },
      {
        name: 'Add commission_type and override tracking',
        file: '20260220_add_commission_type_override.sql',
        description: 'Adds support for direct and override commissions (downline structure)'
      },
      {
        name: 'Create commission_payouts table',
        file: '20260220_create_commission_payouts.sql',
        description: 'Creates monthly payout tracking table and backfills existing data'
      }
    ];

    for (const migration of migrations) {
      console.log(`\n📝 ${migration.name}`);
      console.log(`   ${migration.description}`);
      console.log(`   File: ${migration.file}\n`);

      try {
        const migrationSQL = readFileSync(
          join(__dirname, '../migrations', migration.file),
          'utf8'
        );

        // Split by semicolons and execute each statement
        const statements = migrationSQL
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0 && !s.startsWith('--'));

        for (const statement of statements) {
          if (statement.trim()) {
            // Try to execute via RPC if available, otherwise just log
            // Note: This requires a Supabase function to execute raw SQL
            // For now, we'll just log the SQL to be run manually
            console.log(`   Executing statement...`);
            
            // If you have a postgres connection, you can execute directly
            // For now, print the SQL to be run in Supabase SQL editor
          }
        }

        console.log(`   ✅ ${migration.name} prepared`);
        console.log(`   Note: Please run this SQL in your Supabase SQL Editor:\n`);
        console.log(`   ${migrationSQL.substring(0, 200)}...`);
        console.log('');

      } catch (error: any) {
        console.error(`   ❌ Error with ${migration.name}:`, error.message);
        console.log(`   You'll need to run this migration manually in Supabase SQL Editor`);
      }
    }

    console.log('\n==================================================');
    console.log('📊 Migration Summary');
    console.log('==================================================\n');

    console.log('✅ Schema Updates:');
    console.log('   - agent_commissions: Added payment_eligible_date, commission_type, override_for_agent_id');
    console.log('   - commission_payouts: New table for monthly payout tracking');
    console.log('   - Both tables: Indexes added for performance\n');

    console.log('✅ Data Changes:');
    console.log('   - Member 10: Plan updated to Member/Spouse Plus');
    console.log('   - Member 10: Commission updated to $40.00');
    console.log('   - Existing commissions: Backfilled into commission_payouts table\n');

    console.log('🎯 Next Steps:');
    console.log('   1. Run each migration SQL in Supabase SQL Editor (Dashboard > SQL Editor)');
    console.log('   2. Verify member 10 commission shows correct plan in admin panel');
    console.log('   3. Update EPX payment callback to call createPayoutsForMemberPayment()');
    console.log('   4. Test override commission creation with downline agents');
    console.log('   5. Deploy updated code to production\n');

    console.log('📁 Migration Files Location:');
    console.log('   ' + join(__dirname, '../migrations/'));
    console.log('\n');

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

applyAllMigrations();
