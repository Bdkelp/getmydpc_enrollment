import { Pool } from 'pg';

// Connect to PostgreSQL database using DATABASE_URL
// Supports Neon, Supabase, or any PostgreSQL provider
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL is not set. Please configure your database connection.');
  console.error('   For Supabase: Get from Project Settings > Database > Connection string (URI)');
  throw new Error('DATABASE_URL is not set');
}

console.log(`[Database] Connecting to: ${connectionString.split('@')[1]?.split('?')[0] || 'database'}`);

// Create a connection pool
export const neonPool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false // Required for hosted databases (Supabase, Neon, etc.)
  },
  max: 10, // Connection pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // 10 second timeout
  query_timeout: 30000, // 30 second query timeout
});

// Test the connection with retry logic
const testConnection = async (retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const client = await neonPool.connect();
      console.log('✅ [Database] Successfully connected to PostgreSQL database');
      client.release();
      return;
    } catch (err: any) {
      console.error(`❌ [Database] Connection attempt ${i + 1}/${retries} failed:`, err.message);
      
      // Check for common errors and provide helpful messages
      if (err.message.includes('endpoint') && err.message.includes('disabled')) {
        console.error('   ⚠️  Database endpoint is suspended. If using Neon, activate it in the console.');
        console.error('   💡 Consider switching to Supabase database (doesn\'t auto-suspend)');
      } else if (err.message.includes('authentication failed')) {
        console.error('   ⚠️  Database authentication failed. Check your DATABASE_URL credentials.');
      }
      
      if (i < retries - 1) {
        console.log(`   ⏳ Retrying connection in 2 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.error(`❌ [Database] Failed to connect after ${retries} attempts`);
        console.error('   The app will start but database operations will fail.');
        console.error('   Please check your DATABASE_URL environment variable.');
        // Don't throw - allow the app to start even if initial connection fails
      }
    }
  }
};

// Start connection test
testConnection();

// Helper function to execute queries
export async function query(text: string, params?: any[]) {
  try {
    const result = await neonPool.query(text, params);
    return result;
  } catch (error: any) {
    console.error('❌ [Database] Query error:', error.message);
    
    // Provide helpful error context
    if (error.message.includes('endpoint') && error.message.includes('disabled')) {
      console.error('   💡 Your database endpoint is suspended. See instructions above to reactivate.');
    }
    
    throw error;
  }
}

// Transaction helper
export async function transaction(callback: (client: any) => Promise<void>) {
  const client = await neonPool.connect();
  try {
    await client.query('BEGIN');
    await callback(client);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}