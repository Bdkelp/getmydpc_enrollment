import { createClient } from '@supabase/supabase-js';

// Use SUPABASE_URL without VITE prefix for server-side, and remove any quotes
const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/['"]/g, '');
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables:', {
    hasUrl: !!supabaseUrl,
    hasServiceKey: !!supabaseServiceKey
  });
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: false
  },
  db: {
    schema: 'public'
  },
  global: {
    headers: {
      'x-connection-retry': 'true'
    }
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

// Test connection and retry if needed
supabase.from('plans').select('count', { count: 'exact', head: true })
  .then(({ error }) => {
    if (error) {
      console.warn('[Supabase] Initial connection test failed, retrying...', error.message);
    } else {
      console.log('[Supabase] Connection verified');
    }
  });