import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkMichaelAccount() {
  try {
    console.log('\n🔍 CHECKING MICHAEL KEENER ACCOUNT\n');
    console.log('=' .repeat(80));

    // 1. Check Supabase Auth
    console.log('\n📋 SUPABASE AUTH STATUS:');
    console.log('-'.repeat(80));
    const { data: authData } = await supabase.auth.admin.listUsers();
    const michaelAuth = authData.users.find(u => u.email === 'michael@mypremierplans.com');
    
    if (michaelAuth) {
      console.log('✅ Found in Supabase Auth:');
      console.log(`   ID: ${michaelAuth.id}`);
      console.log(`   Email: ${michaelAuth.email}`);
      console.log(`   Email Confirmed: ${michaelAuth.email_confirmed_at ? 'Yes' : 'No'}`);
      console.log(`   Banned: ${michaelAuth.banned_until ? 'YES - BANNED UNTIL ' + michaelAuth.banned_until : 'No'}`);
      console.log(`   Role: ${michaelAuth.role}`);
      console.log(`   Last Sign In: ${michaelAuth.last_sign_in_at || 'Never'}`);
      console.log(`   Created: ${michaelAuth.created_at}`);
    } else {
      console.log('❌ NOT FOUND in Supabase Auth!');
    }

    // 2. Check Supabase public.users table
    console.log('\n📋 SUPABASE PUBLIC.USERS TABLE:');
    console.log('-'.repeat(80));
    const { data: publicUser, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', 'michael@mypremierplans.com')
      .single();
    
    if (error) {
      console.log('❌ Error or not found:', error.message);
    } else if (publicUser) {
      console.log('✅ Found in public.users:');
      console.log(JSON.stringify(publicUser, null, 2));
    }

    // 3. Check if email/password is correct by attempting sign in
    console.log('\n🔐 TESTING SIGN IN:');
    console.log('-'.repeat(80));
    console.log('Note: This will only work if we know the password.');
    console.log('If you cannot log in, you may need to reset your password.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

checkMichaelAccount();
