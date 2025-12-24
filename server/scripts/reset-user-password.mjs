#!/usr/bin/env node
import 'dotenv/config';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const [,, emailArg, passwordArg] = process.argv;
const targetEmail = (emailArg || process.env.SUPABASE_RESET_EMAIL || '').trim().toLowerCase();

if (!targetEmail) {
  console.error('Usage: node server/scripts/reset-user-password.mjs <email> [newPassword]');
  process.exit(1);
}

const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/['"]/g, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const adjectives = ['Brisk', 'Calm', 'Daring', 'Eager', 'Nimble', 'Mighty', 'Sharp', 'Solid', 'Swift', 'Wise'];
const nouns = ['Falcon', 'Lion', 'Orca', 'Panther', 'Raven', 'Tiger', 'Viper', 'Wolf', 'Yak', 'Zebra'];
const symbols = ['!', '@', '#', '$', '%', '&'];
const generatePassword = () => {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const digits = crypto.randomInt(10, 99);
  const symbol = symbols[crypto.randomInt(0, symbols.length)];
  return `${adjective}${noun}${digits}${symbol}`;
};

const newPassword = passwordArg || process.env.SUPABASE_RESET_PASSWORD || generatePassword();

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

try {
  console.log(`\n[Reset] Looking up Supabase user for: ${targetEmail}`);
  const authUser = await findUserByEmail(targetEmail);
  if (!authUser) {
    console.error('[Reset] No Supabase Auth user found for', targetEmail);
    process.exit(1);
  }

  console.log(`[Reset] Updating password for user ${authUser.id}`);
  const { error: updateError } = await supabase.auth.admin.updateUserById(authUser.id, {
    password: newPassword,
  });

  if (updateError) {
    console.error('[Reset] Failed to update password:', updateError.message);
    process.exit(1);
  }

  console.log('\n[Reset] Password updated successfully!');
  console.log('================ TEMP PASSWORD ================');
  console.log(newPassword);
  console.log('================================================');
  console.log('Share this password securely and ask the user to change it after signing in.');
} catch (error) {
  console.error('[Reset] Unexpected error:', error instanceof Error ? error.message : error);
  process.exit(1);
}
