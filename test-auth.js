// Test authentication script
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testAuth() {
  console.log('Testing Supabase authentication...');
  
  // Try to sign in with a test admin account
  const testEmail = 'admin@test.com';
  const testPassword = 'Admin123!';
  
  console.log(`Attempting to sign in with ${testEmail}...`);
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword
  });
  
  if (error) {
    console.error('Sign in failed:', error.message);
    
    // Try to create the account if it doesn't exist
    console.log('Attempting to create test admin account...');
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
      options: {
        data: {
          role: 'admin',
          firstName: 'Test',
          lastName: 'Admin'
        }
      }
    });
    
    if (signUpError) {
      console.error('Sign up failed:', signUpError.message);
    } else {
      console.log('Test admin account created successfully!');
      console.log('User ID:', signUpData.user?.id);
    }
  } else {
    console.log('Sign in successful!');
    console.log('User ID:', data.user?.id);
    console.log('Access Token:', data.session?.access_token?.substring(0, 50) + '...');
  }
  
  // Check current session
  const { data: session } = await supabase.auth.getSession();
  if (session?.session) {
    console.log('\nCurrent session found:');
    console.log('User email:', session.session.user.email);
    console.log('Session expires at:', new Date(session.session.expires_at * 1000).toLocaleString());
  } else {
    console.log('\nNo active session found');
  }
}

testAuth().catch(console.error);