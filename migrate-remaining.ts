import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';

// Configuration
const NEON_DATABASE_URL = process.env.DATABASE_URL!;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL!.replace(/^'|'$/g, '');
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

console.log('🚀 Migrating remaining data to Supabase...\n');

// Initialize connections
const neonPool = new Pool({ connectionString: NEON_DATABASE_URL });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

async function migrateRemainingData() {
  try {
    // 1. Check what's already in Supabase
    console.log('📊 Checking existing data in Supabase:\n');
    const { count: supaUsers } = await supabase.from('users').select('*', { count: 'exact', head: true });
    const { count: supaPlans } = await supabase.from('plans').select('*', { count: 'exact', head: true });
    const { count: supaSubs } = await supabase.from('subscriptions').select('*', { count: 'exact', head: true });
    const { count: supaPayments } = await supabase.from('payments').select('*', { count: 'exact', head: true });
    
    console.log('Already in Supabase:');
    console.log(`  ✅ ${supaUsers} users`);
    console.log(`  ✅ ${supaPlans} plans`);
    console.log(`  ✅ ${supaSubs} subscriptions`);
    console.log(`  ✅ ${supaPayments} payments\n`);
    
    console.log('📊 Migrating remaining tables:\n');
    
    // 2. Migrate leads
    console.log('1. Migrating leads...');
    const leads = await neonPool.query('SELECT * FROM leads ORDER BY id');
    if (leads.rows.length > 0) {
      // Clear existing leads first to avoid duplicates
      await supabase.from('leads').delete().neq('id', 0);
      const { error } = await supabase.from('leads').insert(leads.rows);
      if (error) {
        console.error('Error migrating leads:', error);
        throw error;
      }
      console.log(`   ✅ Migrated ${leads.rows.length} leads`);
    }
    
    // 3. Migrate lead activities
    console.log('2. Migrating lead activities...');
    const activities = await neonPool.query('SELECT * FROM lead_activities ORDER BY id');
    if (activities.rows.length > 0) {
      // Clear existing activities first
      await supabase.from('lead_activities').delete().neq('id', 0);
      const { error } = await supabase.from('lead_activities').insert(activities.rows);
      if (error) {
        console.error('Error migrating lead activities:', error);
        throw error;
      }
      console.log(`   ✅ Migrated ${activities.rows.length} lead activities`);
    } else {
      console.log('   ⚪ No lead activities to migrate');
    }
    
    // 4. Migrate family members
    console.log('3. Migrating family members...');
    const family = await neonPool.query('SELECT * FROM family_members ORDER BY id');
    if (family.rows.length > 0) {
      // Clear existing family members first
      await supabase.from('family_members').delete().neq('id', 0);
      const { error } = await supabase.from('family_members').insert(family.rows);
      if (error) {
        console.error('Error migrating family members:', error);
        throw error;
      }
      console.log(`   ✅ Migrated ${family.rows.length} family members`);
    }
    
    // 5. Migrate enrollment modifications
    console.log('4. Migrating enrollment modifications...');
    const mods = await neonPool.query('SELECT * FROM enrollment_modifications ORDER BY id');
    if (mods.rows.length > 0) {
      // Clear existing modifications first
      await supabase.from('enrollment_modifications').delete().neq('id', 0);
      const { error } = await supabase.from('enrollment_modifications').insert(mods.rows);
      if (error) {
        console.error('Error migrating enrollment modifications:', error);
        throw error;
      }
      console.log(`   ✅ Migrated ${mods.rows.length} enrollment modifications`);
    } else {
      console.log('   ⚪ No enrollment modifications to migrate');
    }
    
    console.log('\n✨ Migration completed successfully!\n');
    
    // Final verification
    console.log('🔍 Final data count in Supabase:\n');
    const { count: finalUsers } = await supabase.from('users').select('*', { count: 'exact', head: true });
    const { count: finalLeads } = await supabase.from('leads').select('*', { count: 'exact', head: true });
    const { count: finalPlans } = await supabase.from('plans').select('*', { count: 'exact', head: true });
    const { count: finalSubs } = await supabase.from('subscriptions').select('*', { count: 'exact', head: true });
    const { count: finalPayments } = await supabase.from('payments').select('*', { count: 'exact', head: true });
    const { count: finalFamily } = await supabase.from('family_members').select('*', { count: 'exact', head: true });
    const { count: finalActivities } = await supabase.from('lead_activities').select('*', { count: 'exact', head: true });
    
    console.log('✅ Complete data in Supabase:');
    console.log(`  • ${finalUsers} users`);
    console.log(`  • ${finalLeads} leads`);
    console.log(`  • ${finalPlans} plans`);
    console.log(`  • ${finalSubs} subscriptions`);
    console.log(`  • ${finalPayments} payments`);
    console.log(`  • ${finalFamily} family members`);
    console.log(`  • ${finalActivities} lead activities`);
    
    console.log('\n🎉 SUCCESS! All your data has been migrated to Supabase.');
    console.log('\n📝 Next steps:');
    console.log('1. Verify your data in the Supabase dashboard');
    console.log('2. The application will now use Supabase for all data');
    console.log('3. You can safely disconnect from Neon when ready');
    
  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    if (error.details) {
      console.error('Details:', error.details);
    }
    if (error.hint) {
      console.error('Hint:', error.hint);
    }
  } finally {
    await neonPool.end();
  }
}

migrateRemainingData().catch(console.error);