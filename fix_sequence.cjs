const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function fixSequence() {
  console.log('\n🔧 FIXING SUBSCRIPTIONS SEQUENCE\n');
  console.log('=' .repeat(60));
  
  try {
    // Step 1: Check current state
    console.log('\n📊 STEP 1: Checking current state...\n');
    const checkResult = await pool.query(`
      SELECT 
        (SELECT COALESCE(MAX(id), 0) FROM subscriptions) as max_id_in_table,
        (SELECT last_value FROM subscriptions_id_seq) as sequence_current_value
    `);
    
    const { max_id_in_table, sequence_current_value } = checkResult.rows[0];
    console.log(`   Max ID in table: ${max_id_in_table}`);
    console.log(`   Sequence current value: ${sequence_current_value}`);
    
    if (parseInt(sequence_current_value) > parseInt(max_id_in_table)) {
      console.log('\n✅ Sequence is already correct! No fix needed.');
      await pool.end();
      return;
    }
    
    console.log(`\n⚠️  PROBLEM DETECTED!`);
    console.log(`   Sequence (${sequence_current_value}) is behind max ID (${max_id_in_table})`);
    console.log(`   This causes "duplicate key" errors on insert`);
    
    // Step 2: Fix the sequence
    console.log('\n🔧 STEP 2: Resetting sequence...\n');
    const newValue = parseInt(max_id_in_table) + 1;
    await pool.query(`SELECT setval('subscriptions_id_seq', $1, false)`, [newValue]);
    console.log(`   ✅ Sequence reset to ${newValue}`);
    
    // Step 3: Verify the fix
    console.log('\n✅ STEP 3: Verifying fix...\n');
    const verifyResult = await pool.query(`
      SELECT 
        (SELECT MAX(id) FROM subscriptions) as max_id_in_table,
        (SELECT last_value FROM subscriptions_id_seq) as sequence_current_value
    `);
    
    const afterFix = verifyResult.rows[0];
    console.log(`   Max ID in table: ${afterFix.max_id_in_table}`);
    console.log(`   Sequence current value: ${afterFix.sequence_current_value}`);
    
    if (parseInt(afterFix.sequence_current_value) > parseInt(afterFix.max_id_in_table)) {
      console.log('\n🎉 SUCCESS! Sequence is now correct!');
      console.log(`   Next subscription ID will be: ${afterFix.sequence_current_value}`);
    } else {
      console.log('\n❌ Fix may have failed. Sequence still incorrect.');
    }
    
    console.log('\n' + '='.repeat(60));
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
}

fixSequence();
