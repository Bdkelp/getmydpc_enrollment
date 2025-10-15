import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const neonPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function fixCommissionsSchema() {
  try {
    console.log('\n🔧 FIXING COMMISSIONS SCHEMA...\n');
    
    console.log('1️⃣ Making subscription_id nullable and removing FK constraint...');
    
    // Drop the foreign key constraint
    await neonPool.query(`
      ALTER TABLE commissions 
      DROP CONSTRAINT IF EXISTS commissions_subscription_id_subscriptions_id_fk
    `);
    console.log('   ✅ Foreign key constraint dropped');
    
    // Make subscription_id nullable
    await neonPool.query(`
      ALTER TABLE commissions 
      ALTER COLUMN subscription_id DROP NOT NULL
    `);
    console.log('   ✅ subscription_id is now nullable');
    
    console.log('\n2️⃣ Schema updated successfully!');
    console.log('   - subscription_id can now be NULL');
    console.log('   - No FK constraint to subscriptions table');
    console.log('   - Commissions can be created without subscription records\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await neonPool.end();
  }
}

fixCommissionsSchema();
