// Check if admin user exists in database
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function checkAdminUser() {
  try {
    console.log('Checking for admin user: michael@mypremierplans.com');
    
    const result = await sql`
      SELECT id, email, role, first_name, last_name, created_at 
      FROM users 
      WHERE email = 'michael@mypremierplans.com'
    `;
    
    if (result.length > 0) {
      console.log('✅ User exists in database:');
      console.log(JSON.stringify(result[0], null, 2));
    } else {
      console.log('❌ User NOT found in database');
      console.log('This means the account needs to be created in Supabase Auth first');
    }
  } catch (error) {
    console.error('Error checking user:', error);
  }
}

checkAdminUser();
