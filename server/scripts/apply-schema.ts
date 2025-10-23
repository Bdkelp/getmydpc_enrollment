import pkg from "pg";
import dotenv from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";

const { Pool } = pkg;

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '../../.env') });

const SUPABASE_URL = process.env.SUPABASE_DATABASE_URL;

if (!SUPABASE_URL) {
  console.error("❌ Missing SUPABASE_DATABASE_URL environment variable!");
  process.exit(1);
}

const pool = new Pool({ connectionString: SUPABASE_URL });

async function applySchema() {
  console.log("📝 Applying schema to Supabase database...\n");
  
  try {
    // Read the exported schema file
    const schemaPath = resolve(process.cwd(), '../../migrations/schema_export.sql');
    console.log(`Reading schema from: ${schemaPath}`);
    
    const schema = readFileSync(schemaPath, 'utf-8');
    
    // Execute the schema
    console.log("Executing schema...");
    await pool.query(schema);
    
    console.log("\n✅ Schema applied successfully!");
    console.log("\nYou can now run the data migration:");
    console.log("  npm run migrate");
    
  } catch (error: any) {
    console.error("\n❌ Error applying schema:", error.message);
    if (error.message.includes('already exists')) {
      console.log("\n⚠️  Some tables already exist. This is normal if you've run this before.");
      console.log("You can proceed with the data migration:");
      console.log("  npm run migrate");
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

applySchema();
