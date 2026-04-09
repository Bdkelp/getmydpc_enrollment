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

const { formatLocalDate } = await import('../shared/localDate.ts');
const ledger = await import('../server/services/commission-ledger-service.ts');
const supabaseModule = await import('../server/lib/supabaseClient.ts');
console.log('supabase diagnostics:', supabaseModule.getSupabaseClientDiagnostics());

try {
  const batches = await ledger.buildDraftPayoutBatches(formatLocalDate(new Date()));
  console.log('buildDraftPayoutBatches ok:', Array.isArray(batches) ? batches.length : 'n/a');
} catch (error) {
  console.log('buildDraftPayoutBatches error:', error?.message || error);
  console.log('buildDraftPayoutBatches stack:', error?.stack || '(no stack)');
}

try {
  const sync = await ledger.syncCommissionLedgerFromFeed([]);
  console.log('sync empty ok:', JSON.stringify(sync));
} catch (error) {
  console.log('sync empty error:', error?.message || error);
}
