/**
 * Export Database Schema and Data from Neon
 * This script exports the current database structure and data to SQL files
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Use the DATABASE_URL from environment only
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required.');
}

console.log('Connecting to:', DATABASE_URL.replace(/:[^:@]+@/, ':****@'));

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function exportSchema() {
  console.log('📦 Exporting database schema and data...\n');
  
  try {
    // Get all tables
    const tablesResult = await pool.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);
    
    const tables = tablesResult.rows.map(r => r.tablename);
    console.log(`✓ Found ${tables.length} tables:`, tables.join(', '), '\n');
    
    let fullExport = '-- Database Export from Neon\n';
    fullExport += `-- Exported: ${new Date().toISOString()}\n`;
    fullExport += '-- Tables: ' + tables.join(', ') + '\n\n';
    fullExport += 'BEGIN;\n\n';
    
    // Export each table
    for (const table of tables) {
      console.log(`Exporting table: ${table}...`);
      
      // Get CREATE TABLE statement
      const createResult = await pool.query(`
        SELECT 
          'CREATE TABLE ' || quote_ident(tablename) || ' (' ||
          string_agg(
            quote_ident(attname) || ' ' || 
            pg_catalog.format_type(atttypid, atttypmod) ||
            CASE WHEN attnotnull THEN ' NOT NULL' ELSE '' END,
            ', '
          ) || ');' as create_statement
        FROM pg_attribute a
        JOIN pg_class c ON a.attrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relname = $1
          AND n.nspname = 'public'
          AND a.attnum > 0
          AND NOT a.attisdropped
        GROUP BY tablename;
      `, [table]);
      
      if (createResult.rows.length > 0) {
        fullExport += `-- Table: ${table}\n`;
        fullExport += `DROP TABLE IF EXISTS ${table} CASCADE;\n`;
        fullExport += createResult.rows[0].create_statement + '\n\n';
      }
      
      // Get row count
      const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
      const rowCount = parseInt(countResult.rows[0].count);
      console.log(`  └─ ${rowCount} rows`);
      
      // Export data if table has rows
      if (rowCount > 0) {
        const dataResult = await pool.query(`SELECT * FROM ${table}`);
        
        if (dataResult.rows.length > 0) {
          // Get column names
          const columns = Object.keys(dataResult.rows[0]);
          
          fullExport += `-- Data for ${table}\n`;
          
          for (const row of dataResult.rows) {
            const values = columns.map(col => {
              const val = row[col];
              if (val === null) return 'NULL';
              if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
              if (val instanceof Date) return `'${val.toISOString()}'`;
              if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
              if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
              return val;
            });
            
            fullExport += `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
          }
          
          fullExport += '\n';
        }
      }
      
      fullExport += '\n';
    }
    
    // Get sequences
    const seqResult = await pool.query(`
      SELECT sequencename 
      FROM pg_sequences 
      WHERE schemaname = 'public';
    `);
    
    for (const seq of seqResult.rows) {
      const seqName = seq.sequencename;
      const currVal = await pool.query(`SELECT last_value FROM ${seqName}`);
      fullExport += `SELECT setval('${seqName}', ${currVal.rows[0].last_value}, true);\n`;
    }
    
    fullExport += '\nCOMMIT;\n';
    
    // Save to file
    const exportPath = path.join(__dirname, 'neon_database_export.sql');
    fs.writeFileSync(exportPath, fullExport);
    
    console.log(`\n✅ Export complete!`);
    console.log(`📁 Saved to: ${exportPath}`);
    console.log(`📊 Total size: ${(fullExport.length / 1024).toFixed(2)} KB\n`);
    
    return exportPath;
    
  } catch (error) {
    console.error('❌ Export failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run export
exportSchema()
  .then((filePath) => {
    console.log('🎉 Ready to import into Supabase!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Export failed:', error);
    process.exit(1);
  });
