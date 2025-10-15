import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkUsersSchema() {
  console.log('🔍 Checking users table schema...\n');
  
  try {
    // Get a sample user to see the structure
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('role', 'agent')
      .limit(1);
    
    if (error) {
      console.error('❌ Error:', error.message);
      return;
    }
    
    if (users && users.length > 0) {
      console.log('📋 Sample agent user:');
      console.log(JSON.stringify(users[0], null, 2));
      console.log('\n✅ Columns:', Object.keys(users[0]).join(', '));
    } else {
      console.log('❌ No agent users found in database');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkUsersSchema();
