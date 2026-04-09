#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

const cwd = process.cwd();
const envPath = path.join(cwd, '.env');

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^"|"$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}

const normalize = (value) => String(value || '').replace(/["']/g, '').trim();
const connectionString = normalize(process.env.DATABASE_URL);

if (!connectionString) {
  console.error('Missing DATABASE_URL in environment/.env');
  process.exit(1);
}

const migrationPath = path.join(cwd, 'migrations', '20260408_create_commission_ledger_and_batches.sql');
const migrationSql = fs.readFileSync(migrationPath, 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function run() {
  await client.connect();
  await client.query('BEGIN');
  await client.query(migrationSql);
  await client.query("NOTIFY pgrst, 'reload schema'");
  await client.query('COMMIT');

  console.log('Ledger schema migration applied (idempotent) and schema reload notified.');
}

run()
  .catch(async (error) => {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Direct migration apply failed:', error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await client.end(); } catch {}
  });
