
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function debugAuthFlow() {
  console.log('🔍 Debugging Authentication Flow...\n');
  
  // 1. Check environment variables
  console.log('1. Environment Variables:');
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  console.log(`   SUPABASE_URL: ${supabaseUrl ? '✅ Set' : '❌ Missing'}`);
  console.log(`   ANON_KEY: ${supabaseAnonKey ? '✅ Set' : '❌ Missing'}`);
  console.log(`   SERVICE_KEY: ${supabaseServiceKey ? '✅ Set' : '❌ Missing'}`);
  
  if (!supabaseUrl || !supabaseAnonKey) {
    console.log('\n❌ Cannot proceed without Supabase credentials');
    return;
  }
  
  // 2. Test Supabase connection
  console.log('\n2. Testing Supabase Connection:');
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    // Test basic connection
    const { data, error } = await supabase
      .from('users')
      .select('count', { count: 'exact', head: true });
    
    if (error) {
      console.log(`   ❌ Connection failed: ${error.message}`);
    } else {
      console.log('   ✅ Supabase connection successful');
    }
    
    // 3. Test existing session
    console.log('\n3. Testing Session:');
    const { data: session } = await supabase.auth.getSession();
    
    if (session?.session) {
      console.log('   ✅ Active session found');
      console.log(`   User: ${session.session.user.email}`);
      console.log(`   Token length: ${session.session.access_token.length}`);
      
      // 4. Test token with our API
      console.log('\n4. Testing API with token:');
      const response = await fetch('http://localhost:5000/api/auth/user', {
        headers: {
          'Authorization': `Bearer ${session.session.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`   Status: ${response.status}`);
      const responseText = await response.text();
      
      if (response.ok) {
        console.log('   ✅ API authentication successful');
        const userData = JSON.parse(responseText);
        console.log(`   User ID: ${userData.id}`);
        console.log(`   Email: ${userData.email}`);
        console.log(`   Role: ${userData.role}`);
      } else {
        console.log(`   ❌ API authentication failed: ${responseText}`);
      }
    } else {
      console.log('   ❌ No active session');
      
      // 5. Test creating a session
      console.log('\n5. Testing Login:');
      const testEmail = 'michael@mypremierplans.com';
      const testPassword = 'Test123!';
      
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: testEmail,
        password: testPassword
      });
      
      if (signInError) {
        console.log(`   ❌ Sign in failed: ${signInError.message}`);
        
        // Try to create account if needed
        console.log('\n   Creating test account...');
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: testEmail,
          password: testPassword,
          options: {
            data: {
              firstName: 'Michael',
              lastName: 'Test',
              role: 'admin'
            }
          }
        });
        
        if (signUpError) {
          console.log(`   ❌ Sign up failed: ${signUpError.message}`);
        } else {
          console.log('   ✅ Test account created');
        }
      } else {
        console.log('   ✅ Sign in successful');
        console.log(`   User: ${signInData.user?.email}`);
      }
    }
    
  } catch (error) {
    console.log(`\n❌ Debug failed: ${error.message}`);
  }
}

debugAuthFlow();
