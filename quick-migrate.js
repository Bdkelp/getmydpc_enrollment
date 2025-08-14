const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');

// Configuration
const NEON_DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

console.log('Starting Supabase migration...');
console.log('Supabase URL:', SUPABASE_URL);

// Initialize connections
const neonPool = new Pool({ connectionString: NEON_DATABASE_URL });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

async function createTablesAndMigrate() {
  try {
    // First, let's check what we have in Neon
    console.log('\n📊 Current data in Neon database:');
    const userCount = await neonPool.query('SELECT COUNT(*) FROM users');
    const leadCount = await neonPool.query('SELECT COUNT(*) FROM leads');
    const planCount = await neonPool.query('SELECT COUNT(*) FROM plans');
    
    console.log('  Users:', userCount.rows[0].count);
    console.log('  Leads:', leadCount.rows[0].count);
    console.log('  Plans:', planCount.rows[0].count);
    
    console.log('\n🔄 Starting migration to Supabase...');
    console.log('Note: Please make sure you have created the tables in Supabase first!');
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

createTablesAndMigrate();
