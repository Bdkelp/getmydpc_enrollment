// This script sets up the DATABASE_URL environment variable for Supabase
import * as fs from 'fs';

const SUPABASE_DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL?.replace(/^'|'$/g, '') || process.env.SUPABASE_URL;

if (!SUPABASE_DB_PASSWORD || !SUPABASE_URL) {
  console.error("❌ SUPABASE_DB_PASSWORD and SUPABASE_URL must be set");
  process.exit(1);
}

// Extract project reference from Supabase URL
const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0];
const DATABASE_URL = `postgres://postgres.${projectRef}:${SUPABASE_DB_PASSWORD}@aws-0-us-east-2.pooler.supabase.com:6543/postgres`;

console.log('✅ Supabase database URL configured');
console.log(`Project: ${projectRef}`);

// Set the environment variable for the current process
process.env.DATABASE_URL = DATABASE_URL;

// Export for use in other scripts
export { DATABASE_URL };

console.log('\nYou can now use the Supabase database with:');
console.log('- npm run db:push (to push schema changes)');
console.log('- The application will connect to Supabase automatically');