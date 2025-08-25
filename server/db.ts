
// Database connection using Supabase instead of Neon
// All database operations are now handled through the storage layer
// which uses Supabase client directly

export const db = null; // Deprecated - use storage functions instead
export const pool = null; // Deprecated - use storage functions instead

// Migration note: All database operations now go through server/storage.ts
// which uses Supabase client for better reliability and built-in auth integration
