import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Supabase connection
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Neon connection
const neonPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkUserStorage() {
  try {
    console.log('\n🔍 CHECKING USER/AGENT STORAGE LOCATIONS\n');
    console.log('=' .repeat(80));

    // 1. Check Supabase auth.users (authentication)
    console.log('\n📋 SUPABASE AUTH.USERS (Authentication):');
    console.log('-'.repeat(80));
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      console.log('❌ Error fetching auth users:', authError.message);
    } else {
      console.log(`✅ Found ${authUsers.users.length} users in Supabase Auth`);
      authUsers.users.forEach(user => {
        console.log(`  - ID: ${user.id}`);
        console.log(`    Email: ${user.email}`);
        console.log(`    Created: ${user.created_at}`);
        console.log(`    Role: ${user.role || 'user'}`);
        console.log('');
      });
    }

    // 2. Check Supabase public.users table (user profiles)
    console.log('\n📋 SUPABASE PUBLIC.USERS TABLE (User Profiles):');
    console.log('-'.repeat(80));
    const { data: supabaseUsers, error: supaError } = await supabase
      .from('users')
      .select('*');
    
    if (supaError) {
      console.log('❌ Error:', supaError.message);
    } else {
      console.log(`✅ Found ${supabaseUsers?.length || 0} users in public.users table`);
      if (supabaseUsers && supabaseUsers.length > 0) {
        console.table(supabaseUsers);
      }
    }

    // 3. Check Neon users table (if it exists)
    console.log('\n📋 NEON USERS TABLE:');
    console.log('-'.repeat(80));
    try {
      const neonUsers = await neonPool.query(`
        SELECT id, email, role, agent_number, created_at
        FROM users
        ORDER BY created_at
      `);
      console.log(`✅ Found ${neonUsers.rows.length} users in Neon`);
      console.table(neonUsers.rows);
    } catch (err) {
      console.log('❌ Error or table does not exist:', err.message);
    }

    // 4. Check Neon members table
    console.log('\n📋 NEON MEMBERS TABLE (Customers/Patients):');
    console.log('-'.repeat(80));
    const members = await neonPool.query(`
      SELECT id, customer_number, first_name, last_name, email, enrolled_by_agent_id
      FROM members
      WHERE is_active = true
      ORDER BY id
    `);
    console.log(`✅ Found ${members.rows.length} members`);
    console.table(members.rows);

    // 5. Find the agent michael@mypremierplans.com
    console.log('\n🔎 SEARCHING FOR michael@mypremierplans.com:');
    console.log('-'.repeat(80));
    
    // Check Supabase auth
    const michaelAuth = authUsers?.users.find(u => u.email === 'michael@mypremierplans.com');
    if (michaelAuth) {
      console.log('✅ Found in Supabase Auth:');
      console.log(`   ID: ${michaelAuth.id}`);
      console.log(`   Email: ${michaelAuth.email}`);
    } else {
      console.log('❌ NOT found in Supabase Auth');
    }

    // Check Supabase public.users
    const michaelSupabase = supabaseUsers?.find(u => u.email === 'michael@mypremierplans.com');
    if (michaelSupabase) {
      console.log('\n✅ Found in Supabase public.users:');
      console.log(michaelSupabase);
    } else {
      console.log('❌ NOT found in Supabase public.users table');
    }

    await neonPool.end();

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    await neonPool.end();
    process.exit(1);
  }
}

checkUserStorage();
