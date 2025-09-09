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
  max: 10, // Reduced pool size for stability
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Increased timeout to 10 seconds
  query_timeout: 30000, // 30 second query timeout
});

// Test the connection with retry logic
const testConnection = async (retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const client = await neonPool.connect();
      console.log('[NeonDB] Successfully connected to Neon database');
      client.release();
      return;
    } catch (err: any) {
      console.error(`[NeonDB] Connection attempt ${i + 1}/${retries} failed:`, err.message);
      if (i < retries - 1) {
        console.log('[NeonDB] Retrying connection in 2 seconds...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.error('[NeonDB] Failed to connect after', retries, 'attempts');
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