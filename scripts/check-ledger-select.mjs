#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const envPath = path.join(process.cwd(), '.env');
const raw = fs.readFileSync(envPath, 'utf8');
for (const line of raw.split(/\r?\n/)) {
  if (!line || line.trim().startsWith('#')) continue;
  const i = line.indexOf('=');
  if (i <= 0) continue;
  const k = line.slice(0, i).trim();
  const v = line.slice(i + 1).trim().replace(/^"|"$/g, '');
  if (!process.env[k]) process.env[k] = v;
}
const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/["']/g,'').trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '').replace(/["']/g,'').trim();

const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false }, db: { schema: 'public' } });

const q1 = await sb.from('commission_ledger').select('*').limit(1);
console.log('select * limit 1 =>', q1.error ? q1.error.message : `ok rows=${(q1.data||[]).length}`);

const qHead = await sb.from('commission_ledger').select('*', { head: true, count: 'exact' });
console.log('head count =>', qHead.error ? qHead.error.message : `ok count=${qHead.count ?? 0}`);

const q2 = await sb.from('commission_ledger').select('*').is('payout_batch_id', null).in('status', ['earned','queued','carry_forward']).order('commission_period_end', { ascending: true }).limit(1);
console.log('select with filters =>', q2.error ? q2.error.message : `ok rows=${(q2.data||[]).length}`);
