import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const neonPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function fixSchema() {
  try {
    console.log('\n🔧 FIXING SUBSCRIPTIONS & COMMISSIONS SCHEMA...\n');
    console.log('Goal: Make subscriptions and commissions work with members (not users)\n');
    
    // Step 1: Drop FK constraints
    console.log('1️⃣ Dropping old foreign key constraints...');
    try {
      await neonPool.query('ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_user_id_users_id_fk');
      console.log('   ✅ Dropped subscriptions.user_id FK');
    } catch (e) {
      console.log('   ⏭️  Constraint may not exist');
    }
    
    try {
      await neonPool.query('ALTER TABLE commissions DROP CONSTRAINT IF EXISTS commissions_user_id_users_id_fk');
      console.log('   ✅ Dropped commissions.user_id FK');
    } catch (e) {
      console.log('   ⏭️  Constraint may not exist');
    }
    
    try {
      await neonPool.query('ALTER TABLE commissions DROP CONSTRAINT IF EXISTS commissions_subscription_id_subscriptions_id_fk');
      console.log('   ✅ Dropped commissions.subscription_id FK');
    } catch (e) {
      console.log('   ⏭️  Constraint may not exist');
    }
    
    // Step 2: Rename columns
    console.log('\n2️⃣ Renaming user_id columns to member_id...');
    try {
      await neonPool.query('ALTER TABLE subscriptions RENAME COLUMN user_id TO member_id');
      console.log('   ✅ Renamed subscriptions.user_id → member_id');
    } catch (e) {
      if (e.message.includes('does not exist')) {
        console.log('   ℹ️  Column already named member_id or doesn\'t exist');
      } else {
        console.log('   ⚠️  Error:', e.message);
      }
    }
    
    try {
      await neonPool.query('ALTER TABLE commissions RENAME COLUMN user_id TO member_id');
      console.log('   ✅ Renamed commissions.user_id → member_id');
    } catch (e) {
      if (e.message.includes('does not exist')) {
        console.log('   ℹ️  Column already named member_id or doesn\'t exist');
      } else {
        console.log('   ⚠️  Error:', e.message);
      }
    }
    
    // Step 3: Make subscription_id nullable
    console.log('\n3️⃣ Making commissions.subscription_id nullable...');
    try {
      await neonPool.query('ALTER TABLE commissions ALTER COLUMN subscription_id DROP NOT NULL');
      console.log('   ✅ subscription_id is now nullable');
    } catch (e) {
      console.log('   ⚠️  Error:', e.message);
    }
    
    // Step 4: Add new FK constraints
    console.log('\n4️⃣ Adding new foreign key constraints...');
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
    
    const subsCol = await neonPool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'subscriptions' AND column_name IN ('user_id', 'member_id')
    `);
    console.log('   Subscriptions ID column:', subsCol.rows.map(r => r.column_name).join(', '));
    
    const commCol = await neonPool.query(`
      SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_name = 'commissions' AND column_name IN ('user_id', 'member_id', 'subscription_id')
    `);
    console.log('   Commissions columns:');
    commCol.rows.forEach(r => console.log(`     - ${r.column_name} (nullable: ${r.is_nullable})`));
    
    const fks = await neonPool.query(`
      SELECT tc.table_name, kcu.column_name, ccu.table_name AS ref_table
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name IN ('subscriptions', 'commissions')
        AND kcu.column_name LIKE '%member%'
    `);
    console.log('   Member-related FKs:');
    fks.rows.forEach(r => console.log(`     - ${r.table_name}.${r.column_name} → ${r.ref_table}`));
    
    console.log('\n✅ SCHEMA FIX COMPLETE!\n');
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.error(error.stack);
  } finally {
    await neonPool.end();
  }
}

fixSchema();
