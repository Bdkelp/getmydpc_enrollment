import { createClient } from '@supabase/supabase-js';

// Use SUPABASE_URL without VITE prefix for server-side, and remove any quotes
const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/['"]/g, '');

const normalizeEnvValue = (value?: string): string => (value || '').replace(/['"]/g, '').trim();

const parseJwtPayload = (token: string): Record<string, any> | null => {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = payloadB64.length % 4;
    const padded = payloadB64 + (pad ? '='.repeat(4 - pad) : '');
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
};

const isServiceRoleKey = (value: string): boolean => {
  if (!value) return false;
  const payload = parseJwtPayload(value);
  return payload?.role === 'service_role';
};

const serviceRoleCandidate = normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
const serviceKeyCandidate = normalizeEnvValue(process.env.SUPABASE_SERVICE_KEY);

const selectedSource = isServiceRoleKey(serviceRoleCandidate)
  ? 'SUPABASE_SERVICE_ROLE_KEY'
  : isServiceRoleKey(serviceKeyCandidate)
    ? 'SUPABASE_SERVICE_KEY'
    : null;

const supabaseServiceKey = isServiceRoleKey(serviceRoleCandidate)
  ? serviceRoleCandidate
  : isServiceRoleKey(serviceKeyCandidate)
    ? serviceKeyCandidate
    : '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables:', {
    hasUrl: !!supabaseUrl,
    hasServiceRoleKey: !!serviceRoleCandidate,
    hasServiceKey: !!serviceKeyCandidate,
    serviceRoleKeyLooksValid: isServiceRoleKey(serviceRoleCandidate),
    serviceKeyLooksValid: isServiceRoleKey(serviceKeyCandidate)
  });
  throw new Error('Missing valid Supabase service-role key. Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY with a service_role JWT.');
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  },
  db: {
    schema: 'public'
  }
});

export const getSupabaseClientDiagnostics = () => {
  const selectedPayload = supabaseServiceKey ? parseJwtPayload(supabaseServiceKey) : null;
  return {
    hasUrl: Boolean(supabaseUrl),
    hasServiceRoleKeyEnv: Boolean(serviceRoleCandidate),
    hasServiceKeyEnv: Boolean(serviceKeyCandidate),
    serviceRoleKeyLooksValid: isServiceRoleKey(serviceRoleCandidate),
    serviceKeyLooksValid: isServiceRoleKey(serviceKeyCandidate),
    selectedKeySource: selectedSource,
    selectedRole: selectedPayload?.role || null,
  };
};

export const isSupabaseServiceRoleReady = (): boolean => {
  const diagnostics = getSupabaseClientDiagnostics();
  return diagnostics.selectedRole === 'service_role';
};