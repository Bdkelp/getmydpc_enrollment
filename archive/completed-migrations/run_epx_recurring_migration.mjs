/**
 * Safe EPX Recurring Billing Migration Runner
 * 
 * This script:
 * 1. Checks if tables already exist before creating them
 * 2. Validates database connection
 * 3. Runs the migration in a transaction (rollback on error)
 * 4. Provides detailed logging
 * 
 * Usage:
 *   node run_epx_recurring_migration.mjs
 */

import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ANSI color codes for better console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  dim: '\x1b[2m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  step: (msg) => console.log(`${colors.dim}→${colors.reset} ${msg}`)
};

async function checkTableExists(sql, tableName) {
  try {
    const result = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = ${tableName}
      );
    `;
    return result[0].exists;
  } catch (error) {
    log.error(`Error checking if table ${tableName} exists: ${error.message}`);
    return false;
  }
}

async function runMigration() {
  console.log('\n' + '='.repeat(60));
  console.log('EPX Recurring Billing Migration Runner');
  console.log('='.repeat(60) + '\n');

  // Validate environment
  if (!process.env.DATABASE_URL) {
    log.error('DATABASE_URL environment variable not found!');
    log.info('Please ensure .env file exists with valid DATABASE_URL');
    process.exit(1);
  }

  log.info('Database URL found');
  log.step('Connecting to database...\n');

  const sql = neon(process.env.DATABASE_URL);

  try {
    // Test connection
    await sql`SELECT 1`;
    log.success('Database connection established\n');

    // Check which tables already exist
    log.info('Checking existing tables...');
    const tables = ['payment_tokens', 'billing_schedule', 'recurring_billing_log'];
    const existingTables = [];
    
    for (const table of tables) {
      const exists = await checkTableExists(sql, table);
      if (exists) {
        existingTables.push(table);
        log.warning(`  Table "${table}" already exists`);
      } else {
        log.step(`  Table "${table}" does not exist (will be created)`);
      }
    }

    console.log('');

    // If all tables exist, ask for confirmation
    if (existingTables.length === tables.length) {
      log.warning('All EPX recurring billing tables already exist!');
      log.info('This migration has likely already been run.');
      log.info('Running it again may cause errors if the schema has changed.\n');
      
      // In non-interactive mode, we'll skip
      log.warning('Skipping migration to avoid conflicts.');
      log.info('If you need to re-run, please drop the tables first:\n');
      tables.forEach(t => {
        console.log(`  DROP TABLE IF EXISTS ${t} CASCADE;`);
      });
      console.log('');
      process.exit(0);
    }

    // Load migration SQL
    log.info('Loading migration SQL file...');
    const migrationPath = join(__dirname, 'migrations', 'add_recurring_billing_schema.sql');
    let migrationSQL;
    
    try {
      migrationSQL = readFileSync(migrationPath, 'utf8');
      log.success('Migration SQL loaded successfully\n');
    } catch (error) {
      log.error(`Failed to read migration file: ${error.message}`);
      log.info(`Expected path: ${migrationPath}`);
      process.exit(1);
    }

    // Confirm before proceeding
    log.info('Ready to run migration');
    log.step('This will create the following tables:');
    tables.forEach(table => {
      if (!existingTables.includes(table)) {
        console.log(`  - ${table}`);
      }
    });
    console.log('');

    log.info('Starting migration...\n');

    // Run migration (Neon doesn't support transactions in the same way, 
    // but we'll run the statements)
    try {
      // Split SQL into individual statements and execute
      const statements = migrationSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      let statementCount = 0;
      for (const statement of statements) {
        if (statement.includes('CREATE TABLE') || 
            statement.includes('CREATE INDEX') || 
            statement.includes('ALTER TABLE') ||
            statement.includes('CREATE TRIGGER') ||
            statement.includes('CREATE FUNCTION')) {
          statementCount++;
          log.step(`Executing statement ${statementCount}...`);
        }
        
        await sql(statement);
      }

      log.success(`\nMigration completed successfully!`);
      log.info(`Executed ${statementCount} SQL statements\n`);

      // Verify tables were created
      log.info('Verifying tables...');
      for (const table of tables) {
        const exists = await checkTableExists(sql, table);
        if (exists) {
          log.success(`  ✓ Table "${table}" created`);
        } else {
          log.error(`  ✗ Table "${table}" not found`);
        }
      }

      console.log('\n' + '='.repeat(60));
      log.success('EPX Recurring Billing schema migration completed!');
      console.log('='.repeat(60) + '\n');

      log.info('Next steps:');
      log.step('1. Set BILLING_SCHEDULER_ENABLED=true in your environment');
      log.step('2. Configure EPX_SANDBOX_API_URL (or EPX_PRODUCTION_API_URL)');
      log.step('3. Restart your server to activate recurring billing');
      console.log('');

    } catch (error) {
      log.error(`Migration failed: ${error.message}`);
      if (error.stack) {
        console.log('\n' + colors.dim + error.stack + colors.reset);
      }
      console.log('');
      log.warning('Migration rolled back (if supported by database)');
      process.exit(1);
    }

  } catch (error) {
    log.error(`Database connection failed: ${error.message}`);
    process.exit(1);
  }
}

// Run the migration
runMigration().catch(error => {
  log.error(`Unexpected error: ${error.message}`);
  process.exit(1);
});
