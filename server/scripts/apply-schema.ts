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
    
    let schema = readFileSync(schemaPath, 'utf-8');
    
    // Fix common pg_dump issues
    console.log("Fixing schema syntax...");
    schema = schema
      .replace(/integer\(\d+,\d+\)/g, 'SERIAL')  // Replace integer with auto-increment SERIAL
      .replace(/DEFAULT nextval\([^)]+\)/g, '')  // Remove nextval references (handled by SERIAL)
      .replace(/character\((\d+)\)/g, 'char($1)')  // Fix character(n) -> char(n)
      .replace(/character varying/g, 'varchar')    // Normalize to varchar
      .replace(/timestamp without time zone/g, 'timestamp'); // Simplify timestamp
    
    // Split into individual statements
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));
    
    console.log(`Found ${statements.length} SQL statements to execute\n`);
    
    // Execute each statement
    let executed = 0;
    for (const statement of statements) {
      if (!statement) continue;
      
      try {
        await pool.query(statement);
        executed++;
        if (executed % 5 === 0) {
          process.stdout.write(`\rExecuted: ${executed}/${statements.length}`);
        }
      } catch (error: any) {
        if (error.message.includes('already exists')) {
          console.log(`\n⚠️  Skipping: ${error.message.split(':')[0]}`);
        } else {
          throw error;
        }
      }
    }
    
    console.log(`\n\n✅ Schema applied successfully! (${executed} statements)`);
    console.log("\nYou can now run the data migration:");
    console.log("  npm run migrate");
    
  } catch (error: any) {
    console.error("\n❌ Error applying schema:", error.message);
    console.error("\nFull error:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

applySchema();
