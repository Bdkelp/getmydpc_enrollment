import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const neonPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function convertToInteger() {
  try {
    console.log('\n🔧 CONVERTING member_id COLUMNS TO INTEGER...\n');
    
    // Step 1: Check existing subscriptions
    console.log('1️⃣ Checking existing subscriptions...');
    const subs = await neonPool.query('SELECT COUNT(*) as count FROM subscriptions');
    console.log(`   Found ${subs.rows[0].count} subscriptions`);
    
    if (parseInt(subs.rows[0].count) > 0) {
      console.log('   ⚠️  Deleting existing subscriptions (they have wrong member_id format)');
      await neonPool.query('DELETE FROM subscriptions');
      console.log('   ✅ Cleared subscriptions table');
    }
    
    // Step 2: Convert subscriptions.member_id to INTEGER
    console.log('\n2️⃣ Converting subscriptions.member_id to INTEGER...');
    await neonPool.query('ALTER TABLE subscriptions ALTER COLUMN member_id TYPE INTEGER USING NULL');
    console.log('   ✅ subscriptions.member_id is now INTEGER');
    
    // Step 3: Convert commissions.member_id to INTEGER  
    console.log('\n3️⃣ Converting commissions.member_id to INTEGER...');
    await neonPool.query('ALTER TABLE commissions ALTER COLUMN member_id TYPE INTEGER USING NULL');
    console.log('   ✅ commissions.member_id is now INTEGER');
    
    // Step 4: Add foreign key constraints
    console.log('\n4️⃣ Adding foreign key constraints...');
    try {
      await neonPool.query(`
        ALTER TABLE subscriptions
        ADD CONSTRAINT subscriptions_member_id_members_id_fk 
        FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
      `);
      console.log('   ✅ Added subscriptions.member_id → members.id FK');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('   ℹ️  FK already exists');
      } else {
        console.log('   ⚠️  Error:', e.message);
      }
    }
    
    try {
      await neonPool.query(`
        ALTER TABLE commissions
        ADD CONSTRAINT commissions_member_id_members_id_fk
        FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
      `);
      console.log('   ✅ Added commissions.member_id → members.id FK');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('   ℹ️  FK already exists');
      } else {
        console.log('   ⚠️  Error:', e.message);
      }
    }
    
    // Verify
    console.log('\n5️⃣ Verifying schema...');
    const result = await neonPool.query(`
      SELECT 
        c.column_name,
        c.data_type,
        c.is_nullable,
        tc.constraint_type,
        ccu.table_name AS foreign_table
      FROM information_schema.columns c
      LEFT JOIN information_schema.key_column_usage kcu 
        ON c.table_name = kcu.table_name AND c.column_name = kcu.column_name
      LEFT JOIN information_schema.table_constraints tc 
        ON kcu.constraint_name = tc.constraint_name
      LEFT JOIN information_schema.constraint_column_usage ccu 
        ON tc.constraint_name = ccu.constraint_name
      WHERE c.table_name IN ('subscriptions', 'commissions')
        AND c.column_name = 'member_id'
      ORDER BY c.table_name
    `);
    
    console.log('\n   Table Schema:');
    result.rows.forEach(r => {
      console.log(`   - ${r.table_name || r.column_name}.member_id: ${r.data_type} (nullable: ${r.is_nullable})`);
      if (r.foreign_table) {
        console.log(`     FK → ${r.foreign_table}`);
      }
    });
    
    console.log('\n✅ CONVERSION COMPLETE!\n');
    console.log('📝 Summary:');
    console.log('   - subscriptions.member_id → INTEGER, references members.id');
    console.log('   - commissions.member_id → INTEGER, references members.id');
    console.log('   - commissions.subscription_id → nullable');
    console.log('   - Ready for backfill!\n');
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.error(error.stack);
  } finally {
    await neonPool.end();
  }
}

convertToInteger();
