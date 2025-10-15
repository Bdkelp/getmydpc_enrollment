import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const neonPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkDataTypes() {
  try {
    console.log('\n🔍 CHECKING DATA TYPE COMPATIBILITY...\n');
    
    // Check members.id type
    const membersId = await neonPool.query(`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'members' AND column_name = 'id'
    `);
    console.log('members.id type:', membersId.rows[0]?.data_type);
    
    // Check subscriptions.member_id type
    const subsMemberId = await neonPool.query(`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'subscriptions' AND column_name = 'member_id'
    `);
    console.log('subscriptions.member_id type:', subsMemberId.rows[0]?.data_type);
    
    // Check commissions.member_id type
    const commMemberId = await neonPool.query(`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'commissions' AND column_name = 'member_id'
    `);
    console.log('commissions.member_id type:', commMemberId.rows[0]?.data_type);
    
    // Check sample data
    console.log('\n📊 SAMPLE DATA:\n');
    
    const members = await neonPool.query('SELECT id, customer_number FROM members LIMIT 3');
    console.log('Sample member IDs:');
    members.rows.forEach(m => console.log(`  - ${m.id} (${typeof m.id}) - ${m.customer_number}`));
    
    const subs = await neonPool.query('SELECT id, member_id FROM subscriptions LIMIT 3');
    console.log('\nSample subscription member_ids:');
    subs.rows.forEach(s => console.log(`  - ${s.member_id} (${typeof s.member_id})`));
    
    const comms = await neonPool.query('SELECT id, member_id FROM commissions LIMIT 3');
    console.log('\nSample commission member_ids:');
    if (comms.rows.length > 0) {
      comms.rows.forEach(c => console.log(`  - ${c.member_id} (${typeof c.member_id})`));
    } else {
      console.log('  (no commissions yet)');
    }
    
    console.log('\n💡 SOLUTION:');
    if (membersId.rows[0]?.data_type === 'integer') {
      console.log('  - members.id is INTEGER');
      console.log('  - subscriptions.member_id is', subsMemberId.rows[0]?.data_type);
      console.log('  - commissions.member_id is', commMemberId.rows[0]?.data_type);
      
      if (subsMemberId.rows[0]?.data_type !== 'integer') {
        console.log('  ⚠️  Need to convert subscriptions.member_id to INTEGER');
      }
      if (commMemberId.rows[0]?.data_type !== 'integer') {
        console.log('  ⚠️  Need to convert commissions.member_id to INTEGER');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await neonPool.end();
  }
}

checkDataTypes();
