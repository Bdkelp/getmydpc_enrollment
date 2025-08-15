import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from "@shared/schema";

// Build Supabase database URL
const SUPABASE_DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL?.replace(/^'|'$/g, '') || process.env.SUPABASE_URL;

if (!SUPABASE_DB_PASSWORD || !SUPABASE_URL) {
  throw new Error(
    "SUPABASE_DB_PASSWORD and SUPABASE_URL must be set. Did you forget to configure Supabase?",
  );
}

// Extract project reference from Supabase URL
const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0];
// Using transaction pooler for better serverless compatibility
const DATABASE_URL = `postgres://postgres.${projectRef}:${SUPABASE_DB_PASSWORD}@aws-0-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true`;

// For migrations and direct queries
export const migrationClient = postgres(DATABASE_URL, { max: 1 });

// For the application
const queryClient = postgres(DATABASE_URL);
export const db = drizzle(queryClient, { schema });

// Export pool for compatibility
export const pool = {
  query: async (text: string, params?: any[]) => {
    const result = await queryClient.unsafe(text, params);
    return { rows: result };
  },
  end: async () => {
    await queryClient.end();
  }
};