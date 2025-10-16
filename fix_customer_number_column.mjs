import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const neonPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function fixCustomerNumberColumn() {
  try {
    console.log('\n🔧 FIXING CUSTOMER NUMBER COLUMN\n');
    console.log('=' .repeat(80));

    // 1. Check current column type
    console.log('\n📋 Current column definition:');
    const columnInfo = await neonPool.query(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'members' AND column_name = 'customer_number'
    `);
    console.table(columnInfo.rows);

    // 2. Alter the column to VARCHAR(20) to accommodate MPP2025-0001 format
    console.log('\n🔄 Changing customer_number from CHAR(11) to VARCHAR(20)...');
    await neonPool.query(`
      ALTER TABLE members 
      ALTER COLUMN customer_number TYPE VARCHAR(20)
    `);
    console.log('✅ Column updated to VARCHAR(20)');

    // 3. Verify the change
    console.log('\n✅ NEW column definition:');
    const newColumnInfo = await neonPool.query(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'members' AND column_name = 'customer_number'
    `);
    console.table(newColumnInfo.rows);

    await neonPool.end();
    console.log('\n✅ COLUMN FIXED! Now you can run update_customer_numbers.mjs\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    await neonPool.end();
    process.exit(1);
  }
}

fixCustomerNumberColumn();
