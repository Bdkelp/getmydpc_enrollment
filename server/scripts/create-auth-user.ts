import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import pg from 'pg';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const databaseUrl = process.env.DATABASE_URL || '';

// Use service role key for admin operations
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createAuthUser() {
  console.log('\n🔧 Creating Supabase Auth user for Duanne...\n');

  const email = 'bdkelp@gmail.com';
  const password = 'TempPassword123!'; // Temporary password - user should change this

  // First, get the user from the users table
  const { Pool } = pg;
  const pool = new Pool({ connectionString: databaseUrl });
  
  try {
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, role, agent_number FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      console.log('❌ User not found in users table');
      await pool.end();
      return;
    }

    const user = result.rows[0];
    console.log('✅ Found user in users table:');
    console.log('   ID:', user.id);
    console.log('   Email:', user.email);
    console.log('   Name:', user.first_name, user.last_name);
    console.log('   Role:', user.role);
    console.log('   Agent Number:', user.agent_number);

    // Check if auth user already exists
    const { data: existingAuth, error: checkError } = await supabase.auth.admin.getUserByEmail(email);
    
    if (existingAuth?.user) {
      console.log('\n⚠️  Auth user already exists in Supabase Auth');
      console.log('   Auth ID:', existingAuth.user.id);
      console.log('   Users Table ID:', user.id);
      
      if (existingAuth.user.id !== user.id) {
        console.log('\n⚠️  WARNING: Auth ID and Users Table ID DO NOT MATCH!');
        console.log('   This will cause login issues.');
        console.log('   Recommendation: Delete auth user and recreate with matching ID');
      } else {
        console.log('\n✅ IDs match! User should be able to log in.');
        console.log('\n📝 Login credentials:');
        console.log('   Email:', email);
        console.log('   Password: Use the password you set when creating this account');
      }
      
      await pool.end();
      return;
    }

    // Create auth user with the SAME ID as the users table
    console.log('\n🔨 Creating Supabase Auth user with ID:', user.id);
    
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      id: user.id, // CRITICAL: Use the same ID as the users table
      email: email,
      password: password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        agent_number: user.agent_number
      }
    });

    if (authError) {
      console.error('❌ Error creating auth user:', authError.message);
      await pool.end();
      return;
    }

    console.log('\n✅ SUCCESS! Auth user created:');
    console.log('   Auth ID:', authData.user.id);
    console.log('   Email:', authData.user.email);
    console.log('   Email Confirmed:', authData.user.email_confirmed_at ? 'Yes' : 'No');
    
    console.log('\n📝 Login credentials:');
    console.log('   Email:', email);
    console.log('   Password:', password);
    console.log('\n⚠️  IMPORTANT: Have the user change their password after first login!');

    await pool.end();
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    await pool.end();
  }
}

createAuthUser().catch(console.error);
