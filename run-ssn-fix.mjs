import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';

const { Pool } = pg;

async function fixSSNColumn() {
  console.log('🔧 Fixing SSN column to handle encrypted data...\n');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const sql = fs.readFileSync('fix_ssn_column.sql', 'utf8');
    console.log('📄 Executing migration SQL...\n');
    
    await pool.query(sql);
    
    console.log('✅ SSN column updated successfully!');
    console.log('   - Type changed from CHAR(9) to VARCHAR(255)');
    console.log('   - Can now store encrypted SSN data');
    console.log('   - SSN is optional and can be NULL\n');
    
    // Verify the change
    const result = await pool.query(`
      SELECT column_name, data_type, character_maximum_length, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'members' AND column_name = 'ssn'
    `);
    
    if (result.rows.length > 0) {
      const col = result.rows[0];
      console.log('📋 Column details:');
      console.log(`   - Column: ${col.column_name}`);
      console.log(`   - Type: ${col.data_type}${col.character_maximum_length ? `(${col.character_maximum_length})` : ''}`);
      console.log(`   - Nullable: ${col.is_nullable}`);
    }
    
    console.log('\n🎉 Migration complete! You can now retry the enrollment.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

fixSSNColumn();
