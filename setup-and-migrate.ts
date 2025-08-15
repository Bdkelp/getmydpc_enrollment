import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';
import * as fs from 'fs';

// Configuration
const NEON_DATABASE_URL = process.env.DATABASE_URL!;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL!.replace(/^'|'$/g, ''); // Remove quotes if present
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

console.log('🚀 Supabase Migration Process Starting...\n');
console.log('Supabase URL:', SUPABASE_URL);

// Initialize connections
const neonPool = new Pool({ connectionString: NEON_DATABASE_URL });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

async function runMigration() {
  try {
    // Step 1: Show what we're migrating
    console.log('📊 Data inventory from Neon:');
    const userCount = await neonPool.query('SELECT COUNT(*) FROM users');
    const leadCount = await neonPool.query('SELECT COUNT(*) FROM leads');
    const planCount = await neonPool.query('SELECT COUNT(*) FROM plans');
    const subCount = await neonPool.query('SELECT COUNT(*) FROM subscriptions');
    const familyCount = await neonPool.query('SELECT COUNT(*) FROM family_members');
    
    console.log(`  • ${userCount.rows[0].count} users`);
    console.log(`  • ${leadCount.rows[0].count} leads`);
    console.log(`  • ${planCount.rows[0].count} plans`);
    console.log(`  • ${subCount.rows[0].count} subscriptions`);
    console.log(`  • ${familyCount.rows[0].count} family members\n`);
    
    // Step 2: Output SQL for manual execution
    console.log('📝 IMPORTANT: First create tables in Supabase\n');
    console.log('1. Go to your Supabase dashboard');
    console.log('2. Click "SQL Editor" in the left sidebar');
    console.log('3. Click "New Query"');
    console.log('4. Copy and paste the contents of supabase_migration.sql');
    console.log('5. Click "Run"\n');
    
    const sqlScript = fs.readFileSync('supabase_migration.sql', 'utf-8');
    
    // Save a trimmed version for easy copying
    fs.writeFileSync('supabase_tables_only.sql', sqlScript.split('-- Note:')[0]);
    console.log('✅ SQL script saved to: supabase_tables_only.sql\n');
    
    console.log('Press Enter after you have created the tables in Supabase...');
    
    await new Promise(resolve => {
      process.stdin.resume();
      process.stdin.once('data', resolve);
    });
    
    // Step 3: Migrate the data
    console.log('\n🔄 Starting data migration...\n');
    
    // Migrate users
    console.log('Migrating users...');
    const users = await neonPool.query('SELECT * FROM users ORDER BY created_at');
    if (users.rows.length > 0) {
      const { error } = await supabase.from('users').insert(users.rows);
      if (error) throw error;
      console.log(`✅ Migrated ${users.rows.length} users`);
    }
    
    // Migrate plans
    console.log('Migrating plans...');
    const plans = await neonPool.query('SELECT * FROM plans ORDER BY id');
    if (plans.rows.length > 0) {
      const { error } = await supabase.from('plans').insert(plans.rows);
      if (error) throw error;
      console.log(`✅ Migrated ${plans.rows.length} plans`);
    }
    
    // Migrate subscriptions
    console.log('Migrating subscriptions...');
    const subs = await neonPool.query('SELECT * FROM subscriptions ORDER BY id');
    if (subs.rows.length > 0) {
      const { error } = await supabase.from('subscriptions').insert(subs.rows);
      if (error) throw error;
      console.log(`✅ Migrated ${subs.rows.length} subscriptions`);
    }
    
    // Migrate leads
    console.log('Migrating leads...');
    const leads = await neonPool.query('SELECT * FROM leads ORDER BY id');
    if (leads.rows.length > 0) {
      const { error } = await supabase.from('leads').insert(leads.rows);
      if (error) throw error;
      console.log(`✅ Migrated ${leads.rows.length} leads`);
    }
    
    // Migrate family members
    console.log('Migrating family members...');
    const family = await neonPool.query('SELECT * FROM family_members ORDER BY id');
    if (family.rows.length > 0) {
      const { error } = await supabase.from('family_members').insert(family.rows);
      if (error) throw error;
      console.log(`✅ Migrated ${family.rows.length} family members`);
    }
    
    // Migrate lead activities if any
    console.log('Migrating lead activities...');
    const activities = await neonPool.query('SELECT * FROM lead_activities ORDER BY id');
    if (activities.rows.length > 0) {
      const { error } = await supabase.from('lead_activities').insert(activities.rows);
      if (error) throw error;
      console.log(`✅ Migrated ${activities.rows.length} lead activities`);
    } else {
      console.log('  No lead activities to migrate');
    }
    
    console.log('\n✅ Migration completed successfully!\n');
    
    // Verify the migration
    console.log('🔍 Verifying migration in Supabase...');
    const { count: supaUsers } = await supabase.from('users').select('*', { count: 'exact', head: true });
    const { count: supaLeads } = await supabase.from('leads').select('*', { count: 'exact', head: true });
    const { count: supaPlans } = await supabase.from('plans').select('*', { count: 'exact', head: true });
    const { count: supaSubs } = await supabase.from('subscriptions').select('*', { count: 'exact', head: true });
    
    console.log('\nData now in Supabase:');
    console.log(`  • ${supaUsers} users`);
    console.log(`  • ${supaLeads} leads`);
    console.log(`  • ${supaPlans} plans`);
    console.log(`  • ${supaSubs} subscriptions`);
    
    console.log('\n🎉 Success! Your data is now in Supabase.');
    console.log('You can verify this in your Supabase dashboard under "Table Editor"');
    
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
    process.exit(0);
  }
}

runMigration().catch(console.error);