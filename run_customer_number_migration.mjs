import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import pg from 'pg';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

const { Pool } = pg;

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('🔄 Connecting to database...');
    const client = await pool.connect();

    try {
      console.log('📝 Running customer number generator migration...');
      
      // Read and execute the migration SQL
      const migrationSQL = readFileSync(
        join(__dirname, 'migrations', 'add_customer_number_generator.sql'),
        'utf-8'
      );

      await client.query(migrationSQL);
      
      console.log('✅ Migration completed successfully!');
      console.log('');
      console.log('📊 Testing customer number generation...');
      
      // Test the function
      const result = await client.query('SELECT generate_customer_number() as customer_number');
      console.log('Generated test customer number:', result.rows[0].customer_number);
      
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
