#!/usr/bin/env node
/**
 * Manage platform users in Supabase Auth + public.users.
 *
 * Commands:
 *   npm run user:status -- <email>
 *   npm run user:add -- <email> --first <First> --last <Last> --role <admin|agent|super_admin> --agent <MPP####> [--phone <value>] [--password <value>]
 *   npm run user:remove -- <email>
 *   npm run user:readd -- <email> --first <First> --last <Last> --role <admin|agent|super_admin> --agent <MPP####> [--phone <value>] [--password <value>]
 */

import crypto from 'crypto';
import 'dotenv/config';
import { neonPool } from '../lib/neonDb';
import { supabase } from '../lib/supabaseClient';

type Command = 'status' | 'add' | 'remove' | 'readd';

type CliFlags = {
  first?: string;
  last?: string;
  role?: 'admin' | 'agent' | 'super_admin';
  agent?: string;
  phone?: string;
  password?: string;
};

type DbUserRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone_value: string | null;
  role: string | null;
  agent_number: string | null;
  is_active: boolean | null;
  approval_status: string | null;
};

let resolvedPhoneColumn: 'phone_number' | 'phone' | null | undefined;
let usersColumnSet: Set<string> | undefined;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function usage(): never {
  console.error(`
Usage:
  npm run user:status -- <email>
  npm run user:add -- <email> --first <First> --last <Last> --role <admin|agent|super_admin> --agent <MPP####> [--phone <value>] [--password <value>]
  npm run user:remove -- <email>
  npm run user:readd -- <email> --first <First> --last <Last> --role <admin|agent|super_admin> --agent <MPP####> [--phone <value>] [--password <value>]
`);
  process.exit(1);
}

function parseArgs(argv: string[]): { command: Command; email: string; flags: CliFlags } {
  const command = (argv[2] || '').trim().toLowerCase() as Command;
  if (!command || !['status', 'add', 'remove', 'readd'].includes(command)) {
    usage();
  }

  const args = argv.slice(3);
  const positional: string[] = [];
  const flags: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    const current = args[i];
    if (!current.startsWith('--')) {
      positional.push(current);
      continue;
    }

    const key = current.slice(2).trim();
    const next = args[i + 1];
    if (!key || !next || next.startsWith('--')) {
      console.error(`Missing value for --${key}`);
      usage();
    }

    flags[key] = next;
    i += 1;
  }

  const email = positional[0] || '';
  if (!email.includes('@')) {
    console.error('A valid email is required as the first positional argument.');
    usage();
  }

  return {
    command,
    email: normalizeEmail(email),
    flags: {
      first: flags.first,
      last: flags.last,
      role: flags.role as CliFlags['role'],
      agent: flags.agent,
      phone: flags.phone,
      password: flags.password,
    },
  };
}

function generatePassword(): string {
  const adjectives = ['Brisk', 'Calm', 'Daring', 'Eager', 'Nimble', 'Mighty', 'Sharp', 'Solid', 'Swift', 'Wise'];
  const nouns = ['Falcon', 'Lion', 'Orca', 'Panther', 'Raven', 'Tiger', 'Viper', 'Wolf', 'Yak', 'Zebra'];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const digits = crypto.randomInt(10, 99);
  const symbol = ['!', '@', '#', '$', '%', '&'][crypto.randomInt(0, 6)];
  return `${adjective}${noun}${digits}${symbol}`;
}

async function findAuthUserByEmail(email: string): Promise<any | null> {
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await (supabase.auth.admin as any).listUsers({ page, perPage });
    if (error) {
      throw new Error(`Failed to list Supabase auth users: ${error.message}`);
    }

    const users = data?.users || [];
    const found = users.find((u: any) => String(u?.email || '').toLowerCase() === email);
    if (found) {
      return found;
    }

    if (users.length < perPage) {
      return null;
    }

    page += 1;
  }
}

async function getDbUserByEmail(email: string): Promise<DbUserRow | null> {
  const phoneColumn = await resolveUsersPhoneColumn();
  const phoneSelect = phoneColumn ? `${phoneColumn}::text AS phone_value` : 'NULL::text AS phone_value';

  const result = await neonPool.query(
    `SELECT id, email, first_name, last_name, ${phoneSelect}, role, agent_number, is_active, approval_status
     FROM public.users
     WHERE lower(email) = lower($1)
     LIMIT 1`,
    [email],
  );

  return (result.rows[0] as DbUserRow | undefined) || null;
}

async function resolveUsersPhoneColumn(): Promise<'phone_number' | 'phone' | null> {
  if (resolvedPhoneColumn !== undefined) {
    return resolvedPhoneColumn;
  }

  const names = await getUsersColumnSet();
  if (names.has('phone_number')) {
    resolvedPhoneColumn = 'phone_number';
  } else if (names.has('phone')) {
    resolvedPhoneColumn = 'phone';
  } else {
    resolvedPhoneColumn = null;
  }

  return resolvedPhoneColumn;
}

async function getUsersColumnSet(): Promise<Set<string>> {
  if (usersColumnSet) {
    return usersColumnSet;
  }

  const result = await neonPool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'users'`,
  );

  usersColumnSet = new Set((result.rows || []).map((row: any) => String(row.column_name)));
  return usersColumnSet;
}

function buildArchivedEmail(email: string): string {
  const [local, domain] = email.split('@');
  const suffix = `removed${Date.now()}`;
  if (!local || !domain) {
    return `${email}.${suffix}@removed.local`;
  }
  return `${local}+${suffix}@${domain}`;
}

async function removeDbUserByEmail(email: string): Promise<{ mode: 'deleted' | 'anonymized' | 'missing'; id?: string; archivedEmail?: string }> {
  try {
    const deleted = await neonPool.query(
      `DELETE FROM public.users
       WHERE lower(email) = lower($1)
       RETURNING id`,
      [email],
    );

    if (!deleted.rowCount) {
      return { mode: 'missing' };
    }

    return { mode: 'deleted', id: String(deleted.rows[0].id) };
  } catch (error: any) {
    // If FK constraints block delete, archive email so it can be re-used safely.
    if (String(error?.code) !== '23503') {
      throw error;
    }

    const archivedEmail = buildArchivedEmail(email);
    const archived = await neonPool.query(
      `UPDATE public.users
       SET email = $2,
           is_active = false,
           updated_at = now()
       WHERE lower(email) = lower($1)
       RETURNING id`,
      [email, archivedEmail],
    );

    if (!archived.rowCount) {
      return { mode: 'missing' };
    }

    return {
      mode: 'anonymized',
      id: String(archived.rows[0].id),
      archivedEmail,
    };
  }
}

async function deleteAuthUserByEmail(email: string): Promise<{ deleted: boolean; id?: string }> {
  const existing = await findAuthUserByEmail(email);
  if (!existing) {
    return { deleted: false };
  }

  const { error } = await supabase.auth.admin.deleteUser(existing.id);
  if (error) {
    throw new Error(`Failed deleting auth user ${email}: ${error.message}`);
  }

  return { deleted: true, id: existing.id };
}

function assertAddFields(flags: CliFlags): asserts flags is Required<Pick<CliFlags, 'first' | 'last' | 'role' | 'agent'>> & CliFlags {
  if (!flags.first || !flags.last || !flags.role || !flags.agent) {
    throw new Error('Missing required fields for add/readd. Required: --first --last --role --agent');
  }
  if (!['admin', 'agent', 'super_admin'].includes(flags.role)) {
    throw new Error('Invalid --role. Allowed values: admin, agent, super_admin');
  }
}

async function ensureAuthUser(
  email: string,
  flags: Required<Pick<CliFlags, 'first' | 'last' | 'role' | 'agent'>> & CliFlags,
): Promise<{ id: string; created: boolean; passwordUsed?: string }> {
  const existing = await findAuthUserByEmail(email);
  if (existing?.id) {
    return { id: existing.id, created: false };
  }

  const password = flags.password || generatePassword();
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      firstName: flags.first,
      lastName: flags.last,
      role: flags.role,
      agentNumber: flags.agent,
      createdByScript: 'manage-user.ts',
    },
  });

  if (error || !data?.user?.id) {
    throw new Error(`Failed creating auth user ${email}: ${error?.message || 'Unknown auth error'}`);
  }

  return {
    id: data.user.id,
    created: true,
    passwordUsed: password,
  };
}

async function upsertDbUser(
  email: string,
  authId: string,
  flags: Required<Pick<CliFlags, 'first' | 'last' | 'role' | 'agent'>> & CliFlags,
): Promise<'created' | 'updated'> {
  const existing = await getDbUserByEmail(email);
  const phoneColumn = await resolveUsersPhoneColumn();
  const usersColumns = await getUsersColumnSet();
  const phoneValue = flags.phone || null;

  if (existing && existing.id !== authId) {
    throw new Error(
      `Database row exists for ${email} with different id (${existing.id}). Run remove first to clear/release the record, then run add.`
    );
  }

  const now = new Date();

  if (existing) {
    const optionalUpdates: string[] = [];
    if (phoneColumn) optionalUpdates.push(`${phoneColumn} = $4`);
    if (usersColumns.has('approved_at')) optionalUpdates.push(`approved_at = now()`);
    if (usersColumns.has('email_verified')) optionalUpdates.push(`email_verified = true`);
    if (usersColumns.has('email_verified_at')) optionalUpdates.push(`email_verified_at = now()`);
    if (usersColumns.has('password_change_required')) optionalUpdates.push(`password_change_required = false`);
    const optionalSegment = optionalUpdates.length > 0 ? `${optionalUpdates.join(', ')},` : '';

    await neonPool.query(
      `UPDATE public.users
       SET first_name = $2,
           last_name = $3,
           ${optionalSegment}
           role = $5,
           agent_number = $6,
           is_active = true,
           approval_status = 'approved',
           updated_at = now()
       WHERE id = $1`,
      [authId, flags.first, flags.last, flags.phone || null, flags.role, flags.agent],
    );
    return 'updated';
  }

  const insertColumns = [
    'id',
    'email',
    'first_name',
    'last_name',
    'role',
    'agent_number',
    'is_active',
    'approval_status',
    'created_at',
    'updated_at',
  ];

  const insertValues: any[] = [
    authId,
    email,
    flags.first,
    flags.last,
    flags.role,
    flags.agent,
    true,
    'approved',
    now,
    now,
  ];

  if (usersColumns.has('approved_at')) {
    insertColumns.splice(insertColumns.length - 2, 0, 'approved_at');
    insertValues.splice(insertValues.length - 2, 0, now);
  }

  if (usersColumns.has('email_verified')) {
    insertColumns.splice(insertColumns.length - 2, 0, 'email_verified');
    insertValues.splice(insertValues.length - 2, 0, true);
  }

  if (usersColumns.has('email_verified_at')) {
    insertColumns.splice(insertColumns.length - 2, 0, 'email_verified_at');
    insertValues.splice(insertValues.length - 2, 0, now);
  }

  if (usersColumns.has('password_change_required')) {
    insertColumns.splice(insertColumns.length - 2, 0, 'password_change_required');
    insertValues.splice(insertValues.length - 2, 0, false);
  }

  if (phoneColumn) {
    insertColumns.splice(4, 0, phoneColumn);
    insertValues.splice(4, 0, phoneValue);
  }

  const placeholders = insertValues.map((_, index) => `$${index + 1}`).join(', ');

  await neonPool.query(
    `INSERT INTO public.users (${insertColumns.join(', ')}) VALUES (${placeholders})`,
    insertValues,
  );

  return 'created';
}

async function runStatus(email: string): Promise<void> {
  const [auth, db] = await Promise.all([findAuthUserByEmail(email), getDbUserByEmail(email)]);

  console.log(`\nStatus for ${email}`);
  console.log('='.repeat(72));
  console.log(`Auth user: ${auth ? `YES (${auth.id})` : 'NO'}`);
  console.log(
    `DB user:   ${db ? `YES (${db.id}) role=${db.role || 'unknown'} agent=${db.agent_number || 'none'} active=${String(db.is_active)}` : 'NO'}`,
  );
}

async function runRemove(email: string): Promise<void> {
  console.log(`\nRemoving user ${email}`);
  console.log('='.repeat(72));

  const authResult = await deleteAuthUserByEmail(email);
  const dbResult = await removeDbUserByEmail(email);

  console.log(`Auth deleted: ${authResult.deleted ? `YES (${authResult.id})` : 'NO (not found)'}`);

  if (dbResult.mode === 'deleted') {
    console.log(`DB row deleted: YES (${dbResult.id})`);
  } else if (dbResult.mode === 'anonymized') {
    console.log(`DB row deleted: NO (FK references exist)`);
    console.log(`DB row archived: YES (${dbResult.id}) -> ${dbResult.archivedEmail}`);
  } else {
    console.log('DB row deleted: NO (not found)');
  }
}

async function runAdd(email: string, flags: CliFlags): Promise<void> {
  assertAddFields(flags);

  console.log(`\nAdding user ${email}`);
  console.log('='.repeat(72));

  const auth = await ensureAuthUser(email, flags);
  const dbAction = await upsertDbUser(email, auth.id, flags);

  console.log(`Auth status: ${auth.created ? `CREATED (${auth.id})` : `EXISTS (${auth.id})`}`);
  if (auth.created && auth.passwordUsed) {
    console.log('Temporary password (share securely):');
    console.log(auth.passwordUsed);
  }
  console.log(`DB status: ${dbAction.toUpperCase()}`);
}

async function runReadd(email: string, flags: CliFlags): Promise<void> {
  console.log(`\nRe-adding user ${email}`);
  console.log('='.repeat(72));
  await runRemove(email);
  await runAdd(email, flags);
}

async function main() {
  const { command, email, flags } = parseArgs(process.argv);

  if (command === 'status') {
    await runStatus(email);
    return;
  }

  if (command === 'remove') {
    await runRemove(email);
    return;
  }

  if (command === 'add') {
    await runAdd(email, flags);
    return;
  }

  await runReadd(email, flags);
}

main()
  .catch((error) => {
    console.error('\nUser management failed:');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await neonPool.end();
  });
