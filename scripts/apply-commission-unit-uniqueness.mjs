#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config();

const connectionString = String(process.env.DATABASE_URL || '').trim().replace(/^"|"$/g, '');
if (!connectionString) {
  console.error('Missing DATABASE_URL');
  process.exit(1);
}

const migrationPath = path.join(
  process.cwd(),
  'migrations',
  '20260409_add_agent_commission_unit_uniqueness.sql'
);

const sql = fs.readFileSync(migrationPath, 'utf8');
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function run() {
  await client.connect();
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('Applied migration: 20260409_add_agent_commission_unit_uniqueness.sql');
}

run()
  .catch(async (error) => {
    try {
      await client.query('ROLLBACK');
    } catch {
      // no-op
    }
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await client.end();
    } catch {
      // no-op
    }
  });
