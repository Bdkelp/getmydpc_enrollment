import { createClient } from '@supabase/supabase-js';import { createClient } from '@supabase/supabase-js';

import dotenv from 'dotenv';import dotenv from 'dotenv';

import path from 'path';import path from 'path';

import pg from 'pg';

// Load environment variables from root .env

// Load environment variables from root .envdotenv.config({ path: path.resolve(__dirname, '../../.env') });

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const databaseUrl = process.env.DATABASE_URL || '';const supabase = createClient(supabaseUrl, supabaseKey);



const supabase = createClient(supabaseUrl, supabaseKey);async function findAgent() {

  console.log('\n Searching for agent: bdkelp@gmail.com\n');

async function findAgent() {

  console.log('\n🔍 Searching for agent: bdkelp@gmail.com\n');  // Query Supabase Auth users

  const { data: authData, error: authError } = await supabase.auth.admin.listUsers();

  // Query users table using direct database connection  

  const { Pool } = pg;  if (authError) {

  const pool = new Pool({ connectionString: databaseUrl });    console.error(' Error querying Supabase Auth:', authError);

    } else {

  try {    const authUser = authData.users.find(u => u.email === 'bdkelp@gmail.com');

    const result = await pool.query(    if (authUser) {

      'SELECT * FROM users WHERE email = $1',      console.log(' Found in Supabase Auth:');

      ['bdkelp@gmail.com']      console.log('   ID:', authUser.id);

    );      console.log('   Email:', authUser.email);

      console.log('   Email Confirmed:', authUser.email_confirmed_at ? 'Yes' : 'No');

    if (result.rows.length === 0) {      console.log('   Created:', authUser.created_at);

      console.log('❌ NOT found in users table');      console.log('   Last Sign In:', authUser.last_sign_in_at || 'Never');

    } else {    } else {

      const user = result.rows[0];      console.log(' NOT found in Supabase Auth');

      console.log('✅ Found in users table:');    }

      console.log('   ID:', user.id);  }

      console.log('   Email:', user.email);

      console.log('   Name:', user.first_name, user.last_name);  // Query users table

      console.log('   Role:', user.role);  const { data: userData, error: userError } = await supabase

      console.log('   Agent Number:', user.agent_number);    .from('users')

      console.log('   Is Active:', user.is_active);    .select('*')

      console.log('   Approval Status:', user.approval_status);    .eq('email', 'bdkelp@gmail.com')

      console.log('   Email Verified:', user.email_verified);    .single();

      console.log('   Password Hash Exists:', user.password_hash ? 'Yes' : 'No');

    }  if (userError) {

    console.log('\n NOT found in users table:', userError.message);

    // Also check Supabase Auth  } else if (userData) {

    console.log('\n🔍 Checking Supabase Auth...');    console.log('\n Found in users table:');

    const { data: authData, error: authError } = await supabase.auth.admin.getUserByEmail('bdkelp@gmail.com');    console.log('   ID:', userData.id);

        console.log('   Email:', userData.email);

    if (authError) {    console.log('   Name:', userData.first_name, userData.last_name);

      console.log('❌ NOT found in Supabase Auth:', authError.message);    console.log('   Role:', userData.role);

    } else if (authData?.user) {    console.log('   Agent Number:', userData.agent_number);

      console.log('✅ Found in Supabase Auth:');    console.log('   Is Active:', userData.is_active);

      console.log('   ID:', authData.user.id);    console.log('   Approval Status:', userData.approval_status);

      console.log('   Email:', authData.user.email);    console.log('   Email Verified:', userData.email_verified);

      console.log('   Email Confirmed:', authData.user.email_confirmed_at ? 'Yes' : 'No');  }

      console.log('   Created:', authData.user.created_at);}

      console.log('   Last Sign In:', authData.user.last_sign_in_at || 'Never');

    } else {findAgent().catch(console.error);

      console.log('❌ NOT found in Supabase Auth');
    }

    await pool.end();
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    await pool.end();
  }
}

findAgent().catch(console.error);
