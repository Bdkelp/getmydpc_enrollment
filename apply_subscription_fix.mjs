import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const { Pool } = pg;

const neonPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function applyMigration() {
  try {
    console.log('\n🔧 APPLYING SUBSCRIPTION/COMMISSION SCHEMA FIX...\n');
    
    // Read the SQL file
    const sql = fs.readFileSync('./fix_subscriptions_for_members.sql', 'utf8');
    
    // Split into individual statements (simple split on semicolon)
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`Found ${statements.length} SQL statements to execute\n`);
    
    let successCount = 0;
    let skipCount = 0;
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      const preview = statement.substring(0, 80).replace(/\n/g, ' ') + '...';
      
      try {
        console.log(`${i + 1}/${statements.length}: Executing...`);
        console.log(`   ${preview}`);
        
        await neonPool.query(statement);
        console.log('   ✅ Success\n');
        successCount++;
      } catch (error) {
        // Some constraints might not exist, that's okay
        if (error.code === '42704' || error.message.includes('does not exist')) {
          console.log(`   ⏭️  Skipped (constraint doesn't exist)\n`);
          skipCount++;
        } else {
          console.log(`   ⚠️  Warning: ${error.message}\n`);
        }
      }
    }
    
    console.log('='.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successful: ${successCount}`);
    console.log(`⏭️  Skipped: ${skipCount}`);
    console.log('='.repeat(60));
    
    // Verify the changes
    console.log('\n🔍 VERIFYING SCHEMA CHANGES...\n');
    
    const subsColumns = await neonPool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'subscriptions'
      ORDER BY ordinal_position
    `);
    
    console.log('📋 Subscriptions table columns:');
    subsColumns.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type}`);
    });
    
    const commColumns = await neonPool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'commissions'
      AND column_name IN ('agent_id', 'member_id', 'subscription_id')
    `);
    
    console.log('\n📋 Commissions table key columns:');
    commColumns.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });
    
    const fks = await neonPool.query(`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name IN ('subscriptions', 'commissions')
      ORDER BY tc.table_name, kcu.column_name
    `);
    
    console.log('\n🔗 Foreign key constraints:');
    fks.rows.forEach(fk => {
      console.log(`   - ${fk.table_name}.${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
    });
    
    console.log('\n✅ MIGRATION COMPLETE!\n');
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.error(error.stack);
  } finally {
    await neonPool.end();
  }
}

applyMigration();
