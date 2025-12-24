#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const [, , emailArg] = process.argv;
const targetEmail = (emailArg || process.env.SUPABASE_DELETE_EMAIL || '').trim().toLowerCase();

if (!targetEmail) {
  console.error('Usage: node server/scripts/delete-supabase-user.mjs <email>');
  process.exit(1);
}

const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/['"]/g, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function findUserByEmail(email) {
  const normalizedEmail = email.toLowerCase();
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(error.message);
    }

    const match = data.users?.find((user) => user.email?.toLowerCase() === normalizedEmail);
    if (match) return match;

    if (!data.users || data.users.length < perPage) {
      return null;
    }

    page += 1;
  }
}

async function main() {
  console.log(`\n[Delete] Looking for Supabase auth user: ${targetEmail}`);
  const authUser = await findUserByEmail(targetEmail);

  if (authUser) {
    console.log(`[Delete] Removing auth user ${authUser.id}`);
    const { error: deleteError } = await supabase.auth.admin.deleteUser(authUser.id);
    if (deleteError) {
      console.error('[Delete] Failed to delete auth user:', deleteError.message);
      process.exit(1);
    }
  } else {
    console.log('[Delete] No Supabase auth record found.');
  }

  console.log('[Delete] Removing row from public.users');
  const { error: dbError } = await supabase.from('users').delete().eq('email', targetEmail);
  if (dbError) {
    console.error('[Delete] Failed to delete database user:', dbError.message);
    process.exit(1);
  }

  console.log('\n[Delete] Cleanup complete. User/email fully removed.');
}

main().catch((error) => {
  console.error('[Delete] Unexpected error:', error instanceof Error ? error.message : error);
  process.exit(1);
});
