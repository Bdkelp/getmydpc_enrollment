#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    const val = line.slice(i + 1).trim().replace(/^"|"$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

const mod = await import('../server/lib/supabaseClient.ts');
const { supabase } = mod;

const tables = ['commission_ledger', 'commission_payout_batches', 'commission_ledger_events'];
for (const table of tables) {
  const { count, error } = await supabase.from(table).select('*', { head: true, count: 'exact' });
  console.log(`${table}: ${error ? `ERROR ${error.message}` : `OK ${count ?? 0}`}`);
}
