// Quick script to check for missing users
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const emails = [
  'addsumbalance@gmail.com',
  'sean@sciahealthins.com'
];

async function checkUsers() {
  console.log('Checking for users in database...\n');
  
  for (const email of emails) {
    // Check in users table
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    console.log(`\n=== ${email} ===`);
    
    if (dbError && dbError.code !== 'PGRST116') {
      console.error('Database error:', dbError);
    } else if (dbUser) {
      console.log('✅ Found in database (users table)');
      console.log('   ID:', dbUser.id);
      console.log('   Name:', dbUser.first_name, dbUser.last_name);
      console.log('   Role:', dbUser.role);
      console.log('   Agent Number:', dbUser.agent_number || 'Not assigned');
      console.log('   Active:', dbUser.is_active);
      console.log('   Approval Status:', dbUser.approval_status);
    } else {
      console.log('❌ NOT found in database (users table)');
    }
    
    // Check in Supabase Auth
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      console.error('Auth error:', authError);
    } else {
      const authUser = authUsers.users.find(u => u.email === email);
      if (authUser) {
        console.log('✅ Found in Supabase Auth');
        console.log('   Auth ID:', authUser.id);
        console.log('   Confirmed:', authUser.email_confirmed_at ? 'Yes' : 'No');
      } else {
        console.log('❌ NOT found in Supabase Auth');
      }
    }
  }
}

checkUsers().catch(console.error);
