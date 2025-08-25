import { supabase } from '../lib/supabaseClient';

async function testAuthFlow() {
  const email = 'michael@mypremierplans.com';
  const password = 'TempAdmin2025!';
  
  console.log('Testing authentication flow...\n');
  
  try {
    // Step 1: Sign in with Supabase
    console.log('Step 1: Signing in with Supabase...');
    const { data: signInResult, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (signInError) {
      console.error('❌ Sign in failed:', signInError.message);
      return;
    }
    
    if (!signInResult.session) {
      console.error('❌ No session returned');
      return;
    }
    
    console.log('✅ Sign in successful');
    console.log('   User ID:', signInResult.user.id);
    console.log('   Email:', signInResult.user.email);
    console.log('   Token:', signInResult.session.access_token.substring(0, 50) + '...');
    
    // Step 2: Test API call with token
    console.log('\nStep 2: Testing API authentication...');
    const response = await fetch('http://localhost:5000/api/auth/user', {
      headers: {
        'Authorization': `Bearer ${signInResult.session.access_token}`
      }
    });
    
    if (!response.ok) {
      console.error('❌ API authentication failed:', response.status);
      const error = await response.text();
      console.error('   Error:', error);
      return;
    }
    
    const userData = await response.json();
    console.log('✅ API authentication successful');
    console.log('   User data:', {
      email: userData.email,
      role: userData.role,
      firstName: userData.firstName,
      lastName: userData.lastName
    });
    
    // Step 3: Sign out
    console.log('\nStep 3: Signing out...');
    await supabase.auth.signOut();
    console.log('✅ Sign out successful');
    
    console.log('\n========================================');
    console.log('✅ Authentication flow test completed successfully!');
    console.log('========================================');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testAuthFlow();