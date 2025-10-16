import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Neon connection
const neonPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Supabase connection
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function syncPlansFromSupabase() {
  try {
    console.log('\n🔄 SYNCING PLANS FROM SUPABASE TO NEON\n');
    console.log('=' .repeat(80));

    // 1. Get plans from Supabase
    console.log('\n📥 Fetching plans from Supabase...');
    const { data: supabasePlans, error: fetchError } = await supabase
      .from('plans')
      .select('*')
      .order('id');

    if (fetchError) {
      throw new Error(`Failed to fetch from Supabase: ${fetchError.message}`);
    }

    console.log(`✅ Found ${supabasePlans.length} plans in Supabase`);
    console.table(supabasePlans.map(p => ({
      id: p.id,
      name: p.name,
      price: p.price,
      billing_period: p.billing_period
    })));

    // 2. Clear existing plans in Neon
    console.log('\n🗑️  Clearing existing plans in Neon...');
    await neonPool.query('DELETE FROM plans');
    console.log('✅ Cleared old plans');

    // 3. Insert plans from Supabase into Neon with SAME IDs
    console.log('\n📤 Inserting Supabase plans into Neon...');
    
    for (const plan of supabasePlans) {
      await neonPool.query(`
        INSERT INTO plans (
          id, 
          name, 
          description, 
          price, 
          billing_period, 
          is_active, 
          created_at, 
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        plan.id,
        plan.name,
        plan.description || '',
        plan.price,
        plan.billing_period || 'monthly',
        plan.is_active !== false,
        plan.created_at || new Date().toISOString(),
        plan.updated_at || new Date().toISOString()
      ]);
      
      console.log(`  ✅ Inserted plan ${plan.id}: ${plan.name}`);
    }

    // 4. Reset the sequence to continue from the highest ID
    const maxId = Math.max(...supabasePlans.map(p => p.id));
    await neonPool.query(`SELECT setval('plans_id_seq', $1, true)`, [maxId]);
    console.log(`\n✅ Reset sequence to ${maxId}`);

    // 5. Verify the sync
    console.log('\n🔍 Verifying sync...');
    const verifyResult = await neonPool.query('SELECT id, name, price FROM plans ORDER BY id');
    console.log(`\n✅ Neon now has ${verifyResult.rows.length} plans:`);
    console.table(verifyResult.rows);

    // 6. Check if members' plan_ids now match
    console.log('\n🔗 Checking member-plan relationships...');
    const memberPlanCheck = await neonPool.query(`
      SELECT 
        m.id as member_id,
        m.customer_number,
        m.first_name,
        m.last_name,
        m.plan_id,
        p.name as plan_name,
        p.price as plan_price
      FROM members m
      LEFT JOIN plans p ON m.plan_id = p.id
      WHERE m.is_active = true
      ORDER BY m.id
    `);

    console.table(memberPlanCheck.rows);

    const membersWithoutPlans = memberPlanCheck.rows.filter(r => !r.plan_name);
    if (membersWithoutPlans.length > 0) {
      console.log(`\n⚠️  ${membersWithoutPlans.length} members still have no matching plan`);
    } else {
      console.log('\n✅ All members now have matching plans!');
    }

    await neonPool.end();
    console.log('\n✅ SYNC COMPLETE!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    await neonPool.end();
    process.exit(1);
  }
}

syncPlansFromSupabase();
