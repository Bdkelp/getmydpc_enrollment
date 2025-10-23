import pkg from "pg";
import dotenv from "dotenv";
import { resolve } from "path";
import { writeFileSync } from "fs";

const { Pool } = pkg;

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '../../.env') });

const NEON_URL = process.env.DATABASE_URL;

if (!NEON_URL) {
  console.error("❌ Missing DATABASE_URL");
  process.exit(1);
}

const neonPool = new Pool({ connectionString: NEON_URL });

async function exportSchema() {
  console.log("📦 Exporting schema from Neon database...\n");
  
  try {
    // Get all tables
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;
    
    const { rows: tables } = await neonPool.query(tablesQuery);
    console.log(`Found ${tables.length} tables\n`);
    
    let schema = `-- Generated Schema Export from Neon Database\n`;
    schema += `-- Date: ${new Date().toISOString()}\n\n`;
    schema += `-- Drop existing tables (in reverse order to handle foreign keys)\n`;
    
    for (let i = tables.length - 1; i >= 0; i--) {
      schema += `DROP TABLE IF EXISTS ${tables[i].table_name} CASCADE;\n`;
    }
    
    schema += `\n-- Create tables\n\n`;
    
    for (const table of tables) {
      const tableName = table.table_name;
      console.log(`Exporting: ${tableName}`);
      
      // Get table definition using pg_dump style
      const tableDefQuery = `
        SELECT 
          'CREATE TABLE ' || quote_ident(table_name) || ' (' ||
          string_agg(
            quote_ident(column_name) || ' ' || 
            column_type || 
            CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
            CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END,
            ', '
          ) || 
          ');' as create_statement
        FROM (
          SELECT 
            table_name,
            column_name,
            CASE 
              WHEN data_type = 'USER-DEFINED' THEN udt_name
              WHEN data_type = 'ARRAY' THEN udt_name
              WHEN character_maximum_length IS NOT NULL THEN 
                data_type || '(' || character_maximum_length || ')'
              WHEN numeric_precision IS NOT NULL THEN
                data_type || '(' || numeric_precision || 
                CASE WHEN numeric_scale IS NOT NULL THEN ',' || numeric_scale ELSE '' END || ')'
              ELSE data_type
            END as column_type,
            column_default,
            is_nullable,
            ordinal_position
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position
        ) cols
        GROUP BY table_name;
      `;
      
      const { rows: [tableDef] } = await neonPool.query(tableDefQuery, [tableName]);
      
      if (tableDef) {
        schema += `-- Table: ${tableName}\n`;
        schema += tableDef.create_statement + '\n\n';
      }
      
      // Get primary keys
      const pkQuery = `
        SELECT string_agg(quote_ident(column_name), ', ') as pk_columns
        FROM information_schema.key_column_usage
        WHERE table_schema = 'public' 
        AND table_name = $1
        AND constraint_name IN (
          SELECT constraint_name
          FROM information_schema.table_constraints
          WHERE table_schema = 'public'
          AND table_name = $1
          AND constraint_type = 'PRIMARY KEY'
        );
      `;
      
      const { rows: [pk] } = await neonPool.query(pkQuery, [tableName]);
      
      if (pk && pk.pk_columns) {
        schema += `ALTER TABLE ${tableName} ADD PRIMARY KEY (${pk.pk_columns});\n`;
      }
      
      schema += `\n`;
    }
    
    // Get indexes
    schema += `-- Indexes\n\n`;
    const indexQuery = `
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND indexname NOT LIKE '%_pkey'
      ORDER BY tablename, indexname;
    `;
    
    const { rows: indexes } = await neonPool.query(indexQuery);
    for (const index of indexes) {
      schema += `${index.indexdef};\n`;
    }
    
    // Save to file
    const filename = resolve(process.cwd(), '../../migrations/schema_export.sql');
    writeFileSync(filename, schema);
    
    console.log(`\n✅ Schema exported to: ${filename}`);
    console.log(`📝 You can now apply this schema to Supabase\n`);
    
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await neonPool.end();
  }
}

exportSchema();
