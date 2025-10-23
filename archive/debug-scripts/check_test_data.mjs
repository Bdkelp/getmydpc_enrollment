import { fileURLToPath } from 'url';
import { dirname } from 'path';
import pg from 'pg';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

const { Pool } = pg;

async function checkAndCleanupTestData() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('🔄 Connecting to database...');
    const client = await pool.connect();

    try {
      // Check for michael@mypremierplans.com in both tables
      console.log('\n📊 Checking for michael@mypremierplans.com...\n');
      
      const usersResult = await client.query(
        'SELECT id, email, role, first_name, last_name FROM users WHERE email = $1',
        ['michael@mypremierplans.com']
      );
      
      const membersResult = await client.query(
        'SELECT id, email, customer_number, first_name, last_name, created_at FROM members WHERE email = $1',
        ['michael@mypremierplans.com']
      );

      console.log('📋 USERS table:');
      if (usersResult.rows.length > 0) {
        usersResult.rows.forEach(row => {
          console.log(`  ✓ Found: ${row.email} (Role: ${row.role}, ID: ${row.id})`);
        });
      } else {
        console.log('  ✗ Not found');
      }

      console.log('\n📋 MEMBERS table:');
      if (membersResult.rows.length > 0) {
        membersResult.rows.forEach(row => {
          console.log(`  ✓ Found: ${row.email} (Customer #: ${row.customer_number}, ID: ${row.id}, Created: ${row.created_at})`);
        });
        
        console.log('\n⚠️  DUPLICATE DETECTED!');
        console.log('The email exists in MEMBERS table (should only be in USERS table for admin)');
        console.log('\nDo you want to delete the member record? (This will keep the admin user)');
        console.log('Run this command to delete:');
        console.log(`  DELETE FROM members WHERE email = 'michael@mypremierplans.com';`);
        
      } else {
        console.log('  ✗ Not found (correct - admin should only be in users table)');
      }

      // List all members for reference
      console.log('\n\n📋 All members in database:');
      const allMembers = await client.query(
        'SELECT id, email, customer_number, first_name, last_name, created_at FROM members ORDER BY created_at DESC LIMIT 10'
      );
      
      if (allMembers.rows.length > 0) {
        allMembers.rows.forEach(row => {
          console.log(`  - ${row.customer_number}: ${row.first_name} ${row.last_name} (${row.email}) - Created: ${new Date(row.created_at).toLocaleString()}`);
        });
      } else {
        console.log('  No members found');
      }

      console.log('\n✅ Check complete!');
      
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkAndCleanupTestData();
