import pkg from "pg";
import dotenv from "dotenv";
import { resolve } from "path";

const { Pool } = pkg;

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '../../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function verifySchema() {
  console.log("🔍 Verifying database schema...\n");

  try {
    // Check members table columns
    const columnsResult = await pool.query(`
      SELECT column_name, data_type, character_maximum_length, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'members'
      ORDER BY ordinal_position;
    `);
    
    console.log("📋 Members Table Columns:");
    console.log("=".repeat(80));
    
    const importantColumns = ['ssn', 'phone', 'plan_id', 'coverage_type', 'total_monthly_price', 'add_rx_valet'];
    
    columnsResult.rows.forEach(row => {
      if (importantColumns.includes(row.column_name)) {
        const length = row.character_maximum_length ? ` (${row.character_maximum_length})` : '';
        const nullable = row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        console.log(`✓ ${row.column_name.padEnd(25)} | ${row.data_type.padEnd(20)}${length.padEnd(10)} | ${nullable}`);
      }
    });
    
    console.log("=".repeat(80));
    
    // Check plans table
    const plansCount = await pool.query('SELECT COUNT(*) FROM plans');
    console.log(`\n📊 Plans in database: ${plansCount.rows[0].count}`);
    
    // Check users table
    const usersCount = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'agent'");
    console.log(`👥 Active agents: ${usersCount.rows[0].count}`);
    
    console.log("\n✅ Schema verification complete!");

  } catch (error) {
    console.error("❌ Error verifying schema:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

verifySchema();
