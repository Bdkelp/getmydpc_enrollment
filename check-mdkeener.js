import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUser() {
  const email = 'mdkeener@gmail.com';
  
  console.log('=== CHECKING USER:', email, '===\n');
  
  // Check in local users table
  console.log('1. Checking local users table...');
  const { data: localUser, error: localError } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();
  
  if (localError) {
    console.log('❌ Local user error:', localError.message);
  } else if (localUser) {
    console.log('✅ Found in users table:');
    console.log('   ID:', localUser.id);
    console.log('   Email:', localUser.email);
    console.log('   Role:', localUser.role);
    console.log('   Agent Number:', localUser.agent_number);
    console.log('   Active:', localUser.is_active);
    console.log('   Approval Status:', localUser.approval_status);
    console.log('   Email Verified:', localUser.email_verified);
    console.log('   Password Change Required:', localUser.password_change_required);
  } else {
    console.log('⚠️  Not found in users table');
  }
  
  console.log('\n2. Checking Supabase Auth...');
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
  
  if (authError) {
    console.log('❌ Auth error:', authError.message);
  } else {
    const authUser = authUsers.users.find(u => u.email === email);
    if (authUser) {
      console.log('✅ Found in Supabase Auth:');
      console.log('   ID:', authUser.id);
      console.log('   Email:', authUser.email);
      console.log('   Email Confirmed:', authUser.email_confirmed_at ? 'Yes' : 'No');
      console.log('   Last Sign In:', authUser.last_sign_in_at);
      console.log('   Created:', authUser.created_at);
    } else {
      console.log('⚠️  Not found in Supabase Auth');
    }
  }
  
  console.log('\n3. ID Match Check:');
  if (localUser && authUsers) {
    const authUser = authUsers.users.find(u => u.email === email);
    if (authUser) {
      if (localUser.id === authUser.id) {
        console.log('✅ IDs match:', localUser.id);
      } else {
        console.log('❌ ID MISMATCH!');
        console.log('   Local users table ID:', localUser.id);
        console.log('   Supabase Auth ID:', authUser.id);
      }
    }
  }
}

checkUser().catch(console.error);
