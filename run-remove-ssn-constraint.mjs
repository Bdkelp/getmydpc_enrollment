import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';

const { Pool } = pg;

async function removeSSNConstraint() {
  console.log('🔧 Removing SSN format constraint...\n');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const sql = fs.readFileSync('remove_ssn_constraint.sql', 'utf8');
    console.log('📄 Executing migration SQL...\n');
    
    await pool.query(sql);
    
    console.log('✅ SSN constraint removed successfully!');
    console.log('   - Removed: check_ssn_format (9-digit regex)');
    console.log('   - Added: check_ssn_not_empty (allows encrypted data)');
    console.log('   - SSN can now store encrypted hex strings\n');
    
    console.log('🎉 Migration complete! You can now retry the enrollment.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

removeSSNConstraint();
