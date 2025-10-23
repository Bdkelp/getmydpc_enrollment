import pkg from "pg";
import dotenv from "dotenv";
import { resolve } from "path";

const { Pool } = pkg;

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '../../.env') });

const NEON_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_DATABASE_URL;

if (!NEON_URL || !SUPABASE_URL) {
  console.error("❌ Missing environment variables!");
  console.error("   DATABASE_URL (Neon):", NEON_URL ? "✓" : "✗");
  console.error("   SUPABASE_DATABASE_URL:", SUPABASE_URL ? "✓" : "✗");
  console.error("\n📖 Please follow MIGRATION_GUIDE.md to get your Supabase database URL");
  process.exit(1);
}

const neonPool = new Pool({ connectionString: NEON_URL });
const supabasePool = new Pool({ connectionString: SUPABASE_URL });

const TABLES_TO_MIGRATE = [
  'users',
  'members', 
  'plans',
  'subscriptions',
  'payments',
  'family_members',
  'commissions',
  'sessions',
  'leads'
];

async function migrateTable(tableName: string) {
  console.log(`\n📦 Migrating table: ${tableName}`);
  
  try {
    // Get all data from Neon
    const { rows } = await neonPool.query(`SELECT * FROM ${tableName}`);
    console.log(`   Found ${rows.length} rows in Neon`);
    
    if (rows.length === 0) {
      console.log(`   ⏭️  Skipping (empty table)`);
      return { table: tableName, migrated: 0, skipped: 0, errors: 0 };
    }

    // Get column names
    const columns = Object.keys(rows[0]);
    
    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    // Migrate each row
    for (const row of rows) {
      try {
        // Check if row already exists (by id if available)
        if (row.id) {
          const existing = await supabasePool.query(
            `SELECT id FROM ${tableName} WHERE id = $1`,
            [row.id]
          );
          
          if (existing.rows.length > 0) {
            skipped++;
            continue;
          }
        }

        // Prepare insert statement
        const values = columns.map(col => row[col]);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const columnList = columns.join(', ');
        
        await supabasePool.query(
          `INSERT INTO ${tableName} (${columnList}) VALUES (${placeholders})`,
          values
        );
        
        migrated++;
        
        if (migrated % 10 === 0) {
          process.stdout.write(`\r   Migrated: ${migrated}/${rows.length}`);
        }
      } catch (err: any) {
        errors++;
        if (errors <= 3) {
          console.error(`\n   ⚠️  Error migrating row:`, err.message);
        }
      }
    }
    
    console.log(`\n   ✅ Migrated: ${migrated}, Skipped: ${skipped}, Errors: ${errors}`);
    return { table: tableName, migrated, skipped, errors };
    
  } catch (err: any) {
    console.error(`   ❌ Error: ${err.message}`);
    return { table: tableName, migrated: 0, skipped: 0, errors: 1 };
  }
}

async function verifyMigration() {
  console.log("\n" + "=".repeat(80));
  console.log("🔍 VERIFICATION - Comparing row counts");
  console.log("=".repeat(80));
  
  for (const table of TABLES_TO_MIGRATE) {
    try {
      const neonCount = await neonPool.query(`SELECT COUNT(*) FROM ${table}`);
      const supabaseCount = await supabasePool.query(`SELECT COUNT(*) FROM ${table}`);
      
      const neonRows = parseInt(neonCount.rows[0].count);
      const supabaseRows = parseInt(supabaseCount.rows[0].count);
      
      const status = neonRows === supabaseRows ? '✅' : '⚠️';
      console.log(`${status} ${table.padEnd(25)} Neon: ${neonRows}, Supabase: ${supabaseRows}`);
    } catch (err: any) {
      console.log(`❌ ${table.padEnd(25)} Error: ${err.message}`);
    }
  }
}

async function migrate() {
  console.log("🚀 Starting Neon → Supabase Migration");
  console.log("=".repeat(80));
  console.log(`Source: ${NEON_URL.split('@')[1].split('/')[0]}`);
  console.log(`Target: ${SUPABASE_URL.split('@')[1].split('/')[0]}`);
  console.log("=".repeat(80));

  const results = [];

  for (const table of TABLES_TO_MIGRATE) {
    const result = await migrateTable(table);
    results.push(result);
  }

  await verifyMigration();

  console.log("\n" + "=".repeat(80));
  console.log("📊 MIGRATION SUMMARY");
  console.log("=".repeat(80));
  
  const totalMigrated = results.reduce((sum, r) => sum + r.migrated, 0);
  const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);
  
  console.log(`Total Rows Migrated: ${totalMigrated}`);
  console.log(`Total Rows Skipped: ${totalSkipped}`);
  console.log(`Total Errors: ${totalErrors}`);
  console.log("=".repeat(80));
  
  if (totalErrors === 0) {
    console.log("\n🎉 Migration completed successfully!");
    console.log("\n📝 Next steps:");
    console.log("1. Update Railway environment variable:");
    console.log("   DATABASE_URL → Use your SUPABASE_DATABASE_URL");
    console.log("2. Restart your Railway deployment");
    console.log("3. Test your application");
    console.log("4. Once verified, you can remove the Neon database");
  } else {
    console.log("\n⚠️  Migration completed with errors. Please review the output above.");
  }
}

// Run migration
migrate()
  .then(async () => {
    await neonPool.end();
    await supabasePool.end();
    console.log("\n✨ Migration script finished");
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("\n💥 Migration failed:", error);
    await neonPool.end();
    await supabasePool.end();
    process.exit(1);
  });
