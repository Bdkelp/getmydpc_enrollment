import { supabase } from '../lib/supabaseClient';

async function showAdminCredentials() {
  const email = 'michael@mypremierplans.com';
  const temporaryPassword = 'TempAdmin2025!';
  
  console.log('========================================');
  console.log('Admin Login Credentials');
  console.log('========================================');
  console.log('Email:', email);
  console.log('Password:', temporaryPassword);
  console.log('');
  console.log('Login URL: https://your-app-url/login');
  console.log('');
  console.log('✅ The admin account has been set up!');
  console.log('');
  console.log('IMPORTANT: Please change this password');
  console.log('after your first successful login.');
  console.log('========================================');
}

showAdminCredentials();