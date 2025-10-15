import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const neonPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkCommissionSchema() {
  try {
    console.log('\n🔍 COMMISSION TABLE SCHEMA CHECK...\n');
    
    // Check commission table columns
    const columnsResult = await neonPool.query(`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = 'commissions'
      ORDER BY ordinal_position
    `);
    
    console.log('📋 Commissions table columns:');
    columnsResult.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });
    
    // Check foreign keys
    console.log('\n🔗 Foreign key constraints:');
    const fkResult = await neonPool.query(`
      SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'commissions'
    `);
    
    fkResult.rows.forEach(fk => {
      console.log(`  - ${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
    });
    
    // Check users table id column type
    console.log('\n👤 Users table id column:');
    const usersIdResult = await neonPool.query(`
      SELECT data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'id'
    `);
    
    if (usersIdResult.rows.length > 0) {
      console.log(`  - id: ${usersIdResult.rows[0].data_type}`);
    }
    
    // Check members table enrolled_by_agent_id column type
    console.log('\n👥 Members table enrolled_by_agent_id column:');
    const membersAgentResult = await neonPool.query(`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_name = 'members' AND column_name = 'enrolled_by_agent_id'
    `);
    
    if (membersAgentResult.rows.length > 0) {
      console.log(`  - enrolled_by_agent_id: ${membersAgentResult.rows[0].data_type}`);
    }
    
    console.log('\n🎯 THE ISSUE:');
    console.log('  - members.enrolled_by_agent_id stores EMAIL (text)');
    console.log('  - commissions.agent_id expects UUID (references users.id)');
    console.log('  - Your user ID: 8bda1072-ab65-4733-a84b-2a3609a69450');
    console.log('  - Members have: michael@mypremierplans.com');
    console.log('\n💡 SOLUTION: Commission creation code must use user.id, not email');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await neonPool.end();
  }
}

checkCommissionSchema();
