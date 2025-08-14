import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';

config();

// Configuration
const NEON_DATABASE_URL = process.env.DATABASE_URL!;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!; // You'll need to add this

if (!NEON_DATABASE_URL || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required environment variables');
  process.exit(1);
}

// Initialize connections
const neonPool = new Pool({ connectionString: NEON_DATABASE_URL });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    persistSession: false
  }
});

async function migrateData() {
  console.log('Starting migration from Neon to Supabase...\n');

  try {
    // 1. Migrate users
    console.log('Migrating users...');
    const usersResult = await neonPool.query('SELECT * FROM users ORDER BY created_at');
    if (usersResult.rows.length > 0) {
      const { error: usersError } = await supabase
        .from('users')
        .insert(usersResult.rows);
      if (usersError) throw usersError;
      console.log(`✓ Migrated ${usersResult.rows.length} users`);
    } else {
      console.log('  No users to migrate');
    }

    // 2. Migrate plans
    console.log('Migrating plans...');
    const plansResult = await neonPool.query('SELECT * FROM plans ORDER BY id');
    if (plansResult.rows.length > 0) {
      const { error: plansError } = await supabase
        .from('plans')
        .insert(plansResult.rows);
      if (plansError) throw plansError;
      console.log(`✓ Migrated ${plansResult.rows.length} plans`);
    } else {
      console.log('  No plans to migrate');
    }

    // 3. Migrate subscriptions
    console.log('Migrating subscriptions...');
    const subsResult = await neonPool.query('SELECT * FROM subscriptions ORDER BY id');
    if (subsResult.rows.length > 0) {
      const { error: subsError } = await supabase
        .from('subscriptions')
        .insert(subsResult.rows);
      if (subsError) throw subsError;
      console.log(`✓ Migrated ${subsResult.rows.length} subscriptions`);
    } else {
      console.log('  No subscriptions to migrate');
    }

    // 4. Migrate payments
    console.log('Migrating payments...');
    const paymentsResult = await neonPool.query('SELECT * FROM payments ORDER BY id');
    if (paymentsResult.rows.length > 0) {
      const { error: paymentsError } = await supabase
        .from('payments')
        .insert(paymentsResult.rows);
      if (paymentsError) throw paymentsError;
      console.log(`✓ Migrated ${paymentsResult.rows.length} payments`);
    } else {
      console.log('  No payments to migrate');
    }

    // 5. Migrate leads
    console.log('Migrating leads...');
    const leadsResult = await neonPool.query('SELECT * FROM leads ORDER BY id');
    if (leadsResult.rows.length > 0) {
      const { error: leadsError } = await supabase
        .from('leads')
        .insert(leadsResult.rows);
      if (leadsError) throw leadsError;
      console.log(`✓ Migrated ${leadsResult.rows.length} leads`);
    } else {
      console.log('  No leads to migrate');
    }

    // 6. Migrate lead_activities
    console.log('Migrating lead activities...');
    const activitiesResult = await neonPool.query('SELECT * FROM lead_activities ORDER BY id');
    if (activitiesResult.rows.length > 0) {
      const { error: activitiesError } = await supabase
        .from('lead_activities')
        .insert(activitiesResult.rows);
      if (activitiesError) throw activitiesError;
      console.log(`✓ Migrated ${activitiesResult.rows.length} lead activities`);
    } else {
      console.log('  No lead activities to migrate');
    }

    // 7. Migrate family_members
    console.log('Migrating family members...');
    const familyResult = await neonPool.query('SELECT * FROM family_members ORDER BY id');
    if (familyResult.rows.length > 0) {
      const { error: familyError } = await supabase
        .from('family_members')
        .insert(familyResult.rows);
      if (familyError) throw familyError;
      console.log(`✓ Migrated ${familyResult.rows.length} family members`);
    } else {
      console.log('  No family members to migrate');
    }

    // 8. Migrate enrollment_modifications
    console.log('Migrating enrollment modifications...');
    const modsResult = await neonPool.query('SELECT * FROM enrollment_modifications ORDER BY id');
    if (modsResult.rows.length > 0) {
      const { error: modsError } = await supabase
        .from('enrollment_modifications')
        .insert(modsResult.rows);
      if (modsError) throw modsError;
      console.log(`✓ Migrated ${modsResult.rows.length} enrollment modifications`);
    } else {
      console.log('  No enrollment modifications to migrate');
    }

    // 9. Reset sequences to match the data
    console.log('\nResetting sequences...');
    await supabase.rpc('setval', { 
      sequence_name: 'plans_id_seq', 
      value: (await neonPool.query('SELECT MAX(id) FROM plans')).rows[0].max || 1 
    });
    await supabase.rpc('setval', { 
      sequence_name: 'subscriptions_id_seq', 
      value: (await neonPool.query('SELECT MAX(id) FROM subscriptions')).rows[0].max || 1 
    });
    await supabase.rpc('setval', { 
      sequence_name: 'payments_id_seq', 
      value: (await neonPool.query('SELECT MAX(id) FROM payments')).rows[0].max || 1 
    });
    await supabase.rpc('setval', { 
      sequence_name: 'leads_id_seq', 
      value: (await neonPool.query('SELECT MAX(id) FROM leads')).rows[0].max || 1 
    });
    await supabase.rpc('setval', { 
      sequence_name: 'lead_activities_id_seq', 
      value: (await neonPool.query('SELECT MAX(id) FROM lead_activities')).rows[0].max || 1 
    });
    await supabase.rpc('setval', { 
      sequence_name: 'family_members_id_seq', 
      value: (await neonPool.query('SELECT MAX(id) FROM family_members')).rows[0].max || 1 
    });
    console.log('✓ Sequences reset');

    console.log('\n✅ Migration completed successfully!');
    
    // Verify data
    console.log('\nVerifying migration...');
    const { data: userCount } = await supabase.from('users').select('id', { count: 'exact', head: true });
    const { data: leadCount } = await supabase.from('leads').select('id', { count: 'exact', head: true });
    const { data: subCount } = await supabase.from('subscriptions').select('id', { count: 'exact', head: true });
    
    console.log('Data in Supabase:');
    console.log(`  Users: ${userCount}`);
    console.log(`  Leads: ${leadCount}`);
    console.log(`  Subscriptions: ${subCount}`);
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await neonPool.end();
  }
}

// Run migration
migrateData().catch(console.error);