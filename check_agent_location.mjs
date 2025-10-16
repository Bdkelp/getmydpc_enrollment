import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Supabase connection
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Neon connection
const neonPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkAgentLocation() {
  try {
    console.log('\n🔍 CHECKING WHERE AGENT/USER DATA IS STORED\n');
    console.log('=' .repeat(80));

    // Check Supabase users table
    console.log('\n📊 SUPABASE - Checking users table:');
    console.log('-'.repeat(80));
    
    const { data: supabaseUsers, error: supabaseError } = await supabase
      .from('users')
      .select('*');
    
    if (supabaseError) {
      console.log(`❌ Error querying Supabase users: ${supabaseError.message}`);
    } else {
      console.log(`✅ Found ${supabaseUsers?.length || 0} users in Supabase`);
      if (supabaseUsers && supabaseUsers.length > 0) {
        console.table(supabaseUsers.map(u => ({
          id: u.id,
          email: u.email,
          role: u.role,
          full_name: u.full_name
        })));
        
        // Check for michael
        const michael = supabaseUsers.find(u => u.email === 'michael@mypremierplans.com');
        if (michael) {
          console.log('\n✅ Found michael@mypremierplans.com in SUPABASE:');
          console.log(`   UUID: ${michael.id}`);
        } else {
          console.log('\n❌ michael@mypremierplans.com NOT found in Supabase');
        }
      }
    }

    // Check Neon users table
    console.log('\n📊 NEON - Checking users table:');
    console.log('-'.repeat(80));
    
    const neonUsers = await neonPool.query('SELECT * FROM users');
    console.log(`✅ Found ${neonUsers.rows.length} users in Neon`);
    
    if (neonUsers.rows.length > 0) {
      console.table(neonUsers.rows.map(u => ({
        id: u.id,
        email: u.email,
        role: u.role,
        full_name: u.full_name
      })));
      
      // Check for michael
      const michael = neonUsers.rows.find(u => u.email === 'michael@mypremierplans.com');
      if (michael) {
        console.log('\n✅ Found michael@mypremierplans.com in NEON:');
        console.log(`   UUID: ${michael.id}`);
      } else {
        console.log('\n❌ michael@mypremierplans.com NOT found in Neon');
      }
    }

    // Check what the commissions table is using
    console.log('\n💰 COMMISSIONS - Checking agent_id values:');
    console.log('-'.repeat(80));
    
    const commissions = await neonPool.query(`
      SELECT DISTINCT agent_id, COUNT(*) as commission_count
      FROM commissions
      GROUP BY agent_id
    `);
    
    console.table(commissions.rows);

    await neonPool.end();
    
    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY:');
    console.log('- Users in Supabase:', supabaseUsers?.length || 0);
    console.log('- Users in Neon:', neonUsers.rows.length);
    console.log('- The correct database for users is:', supabaseUsers?.length > 0 ? 'SUPABASE ✅' : 'NEON ✅');
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    await neonPool.end();
    process.exit(1);
  }
}

checkAgentLocation();
