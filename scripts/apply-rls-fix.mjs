#!/usr/bin/env node
/**
 * Apply agent_commissions RLS fix
 * Run with: npm run apply-rls-fix
 * 
 * This script requires POSTGRES_URL to be set in .env
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ Missing POSTGRES_URL or DATABASE_URL environment variable');
  console.error('\n📝 To fix this:');
  console.error('   1. Go to Supabase Dashboard → Project Settings → Database');
  console.error('   2. Copy the connection string (Transaction mode)');
  console.error('   3. Add to .env: POSTGRES_URL=postgresql://...');
  console.error('\n   OR run the SQL manually in Supabase SQL Editor:');
  console.error('   migrations/20260219_fix_agent_commissions_rls.sql\n');
  process.exit(1);
}

console.log('🔧 Applying RLS fix for agent_commissions table...\n');

const client = new pg.Client({ connectionString });

try {
  await client.connect();
  console.log('✅ Connected to database\n');

  // Read migration file
  const migrationPath = join(__dirname, '..', 'migrations', '20260219_fix_agent_commissions_rls.sql');
  const migrationSQL = readFileSync(migrationPath, 'utf8');
  
  console.log('📄 Executing migration...\n');

  // Execute the SQL
  await client.query(migrationSQL);

  console.log('✅ Migration applied successfully!');
  console.log('✅ agent_commissions table now allows service_role access');
  console.log('\n💡 You can now create commissions via the Admin Tools.');

} catch (error) {
  console.error('❌ Error applying migration:', error.message);
  console.error('\n📝 Alternative: Run the SQL manually in Supabase SQL Editor:');
  console.error('   migrations/20260219_fix_agent_commissions_rls.sql\n');
  process.exit(1);
} finally {
  await client.end();
}
