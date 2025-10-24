import pkg from "pg";
import dotenv from "dotenv";
import { resolve } from "path";

const { Pool } = pkg;

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '../../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkPlanIds() {
  console.log("📋 Checking plan IDs in database...\n");

  try {
    const result = await pool.query('SELECT id, name, price FROM plans ORDER BY id');
    
    console.log("Total plans in database:", result.rows.length);
    console.log("\nPlan IDs and Names:");
    console.log("=".repeat(80));
    
    result.rows.forEach(row => {
      console.log(`ID: ${row.id.toString().padStart(3)} | $${row.price.toString().padStart(6)} | ${row.name}`);
    });
    
    console.log("=".repeat(80));
    console.log("\n✅ Plan ID check complete!");

  } catch (error) {
    console.error("❌ Error checking plan IDs:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkPlanIds();
