
import { Pool } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

async function clearTestData() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not found in environment variables');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('🧹 Starting test data cleanup...');
    
    // Read and execute the SQL script
    const sqlScript = readFileSync(join(__dirname, 'clear_test_data.sql'), 'utf8');
    await pool.query(sqlScript);
    
    console.log('✅ Test data cleanup completed successfully!');
    console.log('📊 Final record counts:');
    
    // Show final counts
    const result = await pool.query(`
      SELECT 
        'users' as table_name, COUNT(*) as remaining_records FROM users
      UNION ALL
      SELECT 'subscriptions', COUNT(*) FROM subscriptions
      UNION ALL
      SELECT 'payments', COUNT(*) FROM payments
      UNION ALL
      SELECT 'family_members', COUNT(*) FROM family_members
      UNION ALL
      SELECT 'leads', COUNT(*) FROM leads
      UNION ALL
      SELECT 'lead_activities', COUNT(*) FROM lead_activities
      UNION ALL
      SELECT 'commissions', COUNT(*) FROM commissions
      UNION ALL
      SELECT 'enrollment_modifications', COUNT(*) FROM enrollment_modifications
      ORDER BY table_name;
    `);
    
    result.rows.forEach(row => {
      console.log(`   ${row.table_name}: ${row.remaining_records} records`);
    });
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the cleanup
clearTestData();
