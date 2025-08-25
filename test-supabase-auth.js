
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function testSupabaseAuth() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  
  console.log('🔧 Testing Supabase Authentication...\n');
  
  if (!supabaseUrl || !supabaseAnonKey) {
    console.log('❌ Missing environment variables');
    console.log(`SUPABASE_URL: ${supabaseUrl ? '✅' : '❌'}`);
    console.log(`ANON_KEY: ${supabaseAnonKey ? '✅' : '❌'}`);
    return;
  }
  
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  
  // Test 1: Check if we can connect
  try {
    const { data, error } = await supabase
      .from('users')
      .select('count', { count: 'exact', head: true });
    
    if (error) {
      console.log('❌ Database connection failed:', error.message);
    } else {
      console.log('✅ Database connection successful');
    }
  } catch (error) {
    console.log('❌ Connection test failed:', error.message);
  }
  
  // Test 2: Try to sign in with a test account
  console.log('\n🔑 Testing sign in...');
  const testEmail = 'michael@mypremierplans.com';
  const testPassword = 'Test123!';
  
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    });
    
    if (error) {
      console.log('❌ Sign in failed:', error.message);
      
      // Try to create the account
      console.log('\n📝 Attempting to create test account...');
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: testEmail,
        password: testPassword,
        options: {
          data: {
            firstName: 'Michael',
            lastName: 'Test'
          }
        }
      });
      
      if (signUpError) {
        console.log('❌ Sign up failed:', signUpError.message);
      } else {
        console.log('✅ Account created successfully');
        console.log(`User ID: ${signUpData.user?.id}`);
        console.log(`Email: ${signUpData.user?.email}`);
      }
    } else {
      console.log('✅ Sign in successful!');
      console.log(`User ID: ${data.user?.id}`);
      console.log(`Email: ${data.user?.email}`);
      console.log(`Token: ${data.session?.access_token?.substring(0, 50)}...`);
      
      // Test API call
      console.log('\n🌐 Testing API call...');
      const response = await fetch('http://localhost:5000/api/auth/user', {
        headers: {
          'Authorization': `Bearer ${data.session?.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const userData = await response.json();
        console.log('✅ API call successful');
        console.log(`API User: ${userData.email} (${userData.role})`);
      } else {
        console.log('❌ API call failed:', response.status, await response.text());
      }
    }
  } catch (error) {
    console.log('❌ Auth test failed:', error.message);
  }
}

testSupabaseAuth();
