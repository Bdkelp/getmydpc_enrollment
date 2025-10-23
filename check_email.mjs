import { fileURLToPath } from 'url';
import { dirname } from 'path';
import pg from 'pg';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

const { Pool } = pg;

async function checkEmail() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const emailToCheck = process.argv[2] || 'kim.kard@gmail.com';

  try {
    console.log(`🔄 Checking for ${emailToCheck}...\n`);
    const client = await pool.connect();

    try {
      const membersResult = await client.query(
        'SELECT id, email, customer_number, first_name, last_name, created_at FROM members WHERE email = $1',
        [emailToCheck]
      );

      if (membersResult.rows.length > 0) {
        console.log('❌ MEMBER ALREADY EXISTS:');
        membersResult.rows.forEach(row => {
          console.log(`  ID: ${row.id}`);
          console.log(`  Email: ${row.email}`);
          console.log(`  Customer Number: ${row.customer_number}`);
          console.log(`  Name: ${row.first_name} ${row.last_name}`);
          console.log(`  Created: ${new Date(row.created_at).toLocaleString()}`);
        });
        console.log('\n💡 To delete this member, run:');
        console.log(`  DELETE FROM members WHERE email = '${emailToCheck}';`);
      } else {
        console.log('✅ Email is available - no member exists with this email');
      }
      
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

checkEmail();
