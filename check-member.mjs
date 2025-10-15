import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

async function checkMember() {
  console.log('🔍 Searching for Tara Hamilton...\n');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Search for member
    const member = await pool.query(`
      SELECT * FROM members 
      WHERE first_name ILIKE '%tara%' 
      OR last_name ILIKE '%hamilton%'
      OR email ILIKE '%tara%'
      ORDER BY created_at DESC
      LIMIT 5
    `);
    
    console.log(`Found ${member.rows.length} member(s):\n`);
    
    if (member.rows.length > 0) {
      member.rows.forEach(m => {
        console.log('📋 Member Details:');
        console.log(`  Customer Number: ${m.customer_number}`);
        console.log(`  Name: ${m.first_name} ${m.last_name}`);
        console.log(`  Email: ${m.email}`);
        console.log(`  Phone: ${m.phone}`);
        console.log(`  Agent Number: ${m.agent_number || 'N/A'}`);
        console.log(`  Enrolled By Agent ID: ${m.enrolled_by_agent_id || 'N/A'}`);
        console.log(`  Status: ${m.status}`);
        console.log(`  Created: ${m.created_at}`);
        console.log('');
      });
      
      // Check for commissions
      console.log('💰 Checking for commissions...\n');
      const commissions = await pool.query(`
        SELECT * FROM commissions 
        WHERE member_id IN (${member.rows.map(m => m.id).join(',')})
        OR member_customer_number IN (${member.rows.map(m => `'${m.customer_number}'`).join(',')})
        ORDER BY created_at DESC
      `);
      
      console.log(`Found ${commissions.rows.length} commission(s)\n`);
      
      if (commissions.rows.length > 0) {
        commissions.rows.forEach(c => {
          console.log('  Commission Details:');
          console.log(`    Agent ID: ${c.agent_id}`);
          console.log(`    Amount: $${c.amount}`);
          console.log(`    Status: ${c.status}`);
          console.log(`    Created: ${c.created_at}`);
          console.log('');
        });
      } else {
        console.log('  ❌ No commissions found for this member\n');
      }
    } else {
      console.log('❌ No member found with name Tara Hamilton\n');
      
      // Show last 5 members
      const recent = await pool.query(`
        SELECT customer_number, first_name, last_name, email, created_at 
        FROM members 
        ORDER BY created_at DESC 
        LIMIT 5
      `);
      
      console.log('📋 Last 5 members created:');
      recent.rows.forEach(m => {
        console.log(`  ${m.customer_number} - ${m.first_name} ${m.last_name} (${m.email}) - ${m.created_at}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkMember();
