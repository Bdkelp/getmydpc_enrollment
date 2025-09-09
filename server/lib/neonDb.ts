import { Pool } from 'pg';

// Connect directly to Neon database using DATABASE_URL
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

// Create a connection pool for Neon
export const neonPool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false // Required for Neon
  },
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test the connection
neonPool.connect((err, client, release) => {
  if (err) {
    console.error('[NeonDB] Error connecting to database:', err.stack);
  } else {
    console.log('[NeonDB] Successfully connected to Neon database');
    release();
  }
});

// Helper function to execute queries
export async function query(text: string, params?: any[]) {
  try {
    const result = await neonPool.query(text, params);
    return result;
  } catch (error: any) {
    console.error('[NeonDB] Query error:', error.message);
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