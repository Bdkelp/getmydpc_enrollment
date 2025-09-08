
// All database operations now use Supabase via server/storage.ts
// This file is maintained for compatibility but all exports are null/deprecated

export const db = null; // Deprecated - use storage functions instead
export const pool = null; // Deprecated - use storage functions instead

// Migration complete: All database operations now go through Supabase
console.log('[Database] Using Supabase for all database operations');
