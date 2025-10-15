import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

async function runMigration() {
  console.log('🔧 Creating members table in Neon database...\n');
  
  // Create connection pool
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'create_members_table.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('📄 Executing migration SQL...\n');
    
    // Execute the SQL
    await pool.query(sql);
    
    console.log('✅ Migration completed successfully!\n');
    
    // Verify the table was created
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'members'
    `);
    
    if (result.rows.length > 0) {
      console.log('✅ Members table exists in database');
      
      // Show columns
      const columns = await pool.query(`
        SELECT column_name, data_type, character_maximum_length
        FROM information_schema.columns
        WHERE table_name = 'members'
        ORDER BY ordinal_position
        LIMIT 10
      `);
      
      console.log('\n📋 First 10 columns:');
      columns.rows.forEach(col => {
        const length = col.character_maximum_length ? `(${col.character_maximum_length})` : '';
        console.log(`  - ${col.column_name}: ${col.data_type}${length}`);
      });
    } else {
      console.log('❌ Members table not found');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
  
  console.log('\n🎉 Done!');
  process.exit(0);
}

runMigration();
