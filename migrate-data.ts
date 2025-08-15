import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';

// Configuration
const NEON_DATABASE_URL = process.env.DATABASE_URL!;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL!.replace(/^'|'$/g, '');
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

console.log('🚀 Starting data migration to Supabase...\n');

// Initialize connections
const neonPool = new Pool({ connectionString: NEON_DATABASE_URL });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

async function migrateData() {
  try {
    // Show what we're migrating
    console.log('📊 Migrating data from Neon to Supabase:\n');
    
    // 1. Migrate users
    console.log('1. Migrating users...');
    const users = await neonPool.query('SELECT * FROM users ORDER BY created_at');
    if (users.rows.length > 0) {
      const { error } = await supabase.from('users').insert(users.rows);
      if (error) {
        console.error('Error migrating users:', error);
        throw error;
      }
      console.log(`   ✅ Migrated ${users.rows.length} users`);
    }
    
    // 2. Migrate plans
    console.log('2. Migrating plans...');
    const plans = await neonPool.query('SELECT * FROM plans ORDER BY id');
    if (plans.rows.length > 0) {
      const { error } = await supabase.from('plans').insert(plans.rows);
      if (error) {
        console.error('Error migrating plans:', error);
        throw error;
      }
      console.log(`   ✅ Migrated ${plans.rows.length} plans`);
    }
    
    // 3. Migrate subscriptions
    console.log('3. Migrating subscriptions...');
    const subs = await neonPool.query('SELECT * FROM subscriptions ORDER BY id');
    if (subs.rows.length > 0) {
      const { error } = await supabase.from('subscriptions').insert(subs.rows);
      if (error) {
        console.error('Error migrating subscriptions:', error);
        throw error;
      }
      console.log(`   ✅ Migrated ${subs.rows.length} subscriptions`);
    }
    
    // 4. Migrate payments
    console.log('4. Migrating payments...');
    const payments = await neonPool.query('SELECT * FROM payments ORDER BY id');
    if (payments.rows.length > 0) {
      const { error } = await supabase.from('payments').insert(payments.rows);
      if (error) {
        console.error('Error migrating payments:', error);
        throw error;
      }
      console.log(`   ✅ Migrated ${payments.rows.length} payments`);
    } else {
      console.log('   ⚪ No payments to migrate');
    }
    
    // 5. Migrate leads
    console.log('5. Migrating leads...');
    const leads = await neonPool.query('SELECT * FROM leads ORDER BY id');
    if (leads.rows.length > 0) {
      const { error } = await supabase.from('leads').insert(leads.rows);
      if (error) {
        console.error('Error migrating leads:', error);
        throw error;
      }
      console.log(`   ✅ Migrated ${leads.rows.length} leads`);
    }
    
    // 6. Migrate lead activities
    console.log('6. Migrating lead activities...');
    const activities = await neonPool.query('SELECT * FROM lead_activities ORDER BY id');
    if (activities.rows.length > 0) {
      const { error } = await supabase.from('lead_activities').insert(activities.rows);
      if (error) {
        console.error('Error migrating lead activities:', error);
        throw error;
      }
      console.log(`   ✅ Migrated ${activities.rows.length} lead activities`);
    } else {
      console.log('   ⚪ No lead activities to migrate');
    }
    
    // 7. Migrate family members
    console.log('7. Migrating family members...');
    const family = await neonPool.query('SELECT * FROM family_members ORDER BY id');
    if (family.rows.length > 0) {
      const { error } = await supabase.from('family_members').insert(family.rows);
      if (error) {
        console.error('Error migrating family members:', error);
        throw error;
      }
      console.log(`   ✅ Migrated ${family.rows.length} family members`);
    }
    
    // 8. Migrate enrollment modifications
    console.log('8. Migrating enrollment modifications...');
    const mods = await neonPool.query('SELECT * FROM enrollment_modifications ORDER BY id');
    if (mods.rows.length > 0) {
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
    
    // Verify the migration
    console.log('🔍 Verifying data in Supabase...\n');
    const { count: supaUsers } = await supabase.from('users').select('*', { count: 'exact', head: true });
    const { count: supaLeads } = await supabase.from('leads').select('*', { count: 'exact', head: true });
    const { count: supaPlans } = await supabase.from('plans').select('*', { count: 'exact', head: true });
    const { count: supaSubs } = await supabase.from('subscriptions').select('*', { count: 'exact', head: true });
    const { count: supaFamily } = await supabase.from('family_members').select('*', { count: 'exact', head: true });
    
    console.log('Data now in Supabase:');
    console.log(`  • ${supaUsers} users`);
    console.log(`  • ${supaLeads} leads`);
    console.log(`  • ${supaPlans} plans`);
    console.log(`  • ${supaSubs} subscriptions`);
    console.log(`  • ${supaFamily} family members`);
    
    console.log('\n🎉 SUCCESS! All your data has been migrated to Supabase.');
    console.log('\nYou can verify this in your Supabase dashboard:');
    console.log('1. Go to "Table Editor" in the left sidebar');
    console.log('2. Click on each table to see your data');
    
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

migrateData().catch(console.error);