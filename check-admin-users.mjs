import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAdminUsers() {
  console.log('🔍 Checking admin users...\n');
  
  try {
    const { data: admins, error } = await supabase
      .from('users')
      .select('email, first_name, last_name, agent_number, role, is_active')
      .eq('role', 'admin')
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('❌ Error:', error.message);
      return;
    }
    
    if (admins && admins.length > 0) {
      console.log(`Found ${admins.length} admin(s):\n`);
      admins.forEach((admin, index) => {
        console.log(`${index + 1}. ${admin.first_name} ${admin.last_name}`);
        console.log(`   Email: ${admin.email}`);
        console.log(`   Agent Number: ${admin.agent_number || 'N/A (Admin only)'}`);
        console.log(`   Role: ${admin.role}`);
        console.log(`   Status: ${admin.is_active ? '✅ Active' : '❌ Inactive'}`);
        console.log('');
      });
    } else {
      console.log('❌ No admins found in database');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkAdminUsers();
