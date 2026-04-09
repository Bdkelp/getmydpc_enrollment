#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const cwd = process.cwd();
const defaultEnvPath = path.join(cwd, '.env');
const envFileArg = process.argv.find((arg) => arg.startsWith('--env-file='));
const explicitEnvPath = envFileArg ? envFileArg.slice('--env-file='.length).trim() : '';
const shouldSkipEnvFile = process.argv.includes('--no-env-file');
const envPath = shouldSkipEnvFile
  ? null
  : (explicitEnvPath ? path.resolve(cwd, explicitEnvPath) : defaultEnvPath);

if (envPath && fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^"|"$/g, '');
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const normalize = (value) => String(value || '').replace(/["']/g, '').trim();
const supabaseUrl = normalize(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
const supabaseServiceKey = normalize(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials. Provide SUPABASE_URL and service key in env.');
  process.exit(1);
}

const url = new URL(supabaseUrl);
const projectRef = url.hostname.split('.')[0] || '(unknown)';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: 'public' },
});

const requiredTables = [
  'commission_ledger',
  'commission_payout_batches',
  'commission_ledger_events',
];

const migrationFile = 'migrations/20260408_create_commission_ledger_and_batches.sql';
const migrationFilename = '20260408_create_commission_ledger_and_batches.sql';

async function tableExists(tableName) {
  const { error } = await supabase.from(tableName).select('*').limit(1);
  return !error;
}

async function tableCount(tableName) {
  const { count, error } = await supabase.from(tableName).select('*', { head: true, count: 'exact' });
  if (error) {
    return { count: null, error: error.message };
  }
  return { count: Number(count || 0), error: null };
}

async function detectRuntimeEnvironment() {
  const { data, error } = await supabase
    .from('platform_settings')
    .select('key, value')
    .eq('key', 'payment_environment')
    .limit(1);

  if (error) {
    return { value: null, error: error.message };
  }

  const row = Array.isArray(data) ? data[0] : null;
  const envValue = row?.value && typeof row.value === 'object' ? row.value.environment : null;
  return { value: envValue || null, error: null };
}

async function detectMigrationHistorySignal() {
  const candidates = ['__drizzle_migrations', 'drizzle_migrations', 'schema_migrations'];
  const signals = [];

  for (const table of candidates) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .limit(500);

    if (error) {
      signals.push({ table, accessible: false, error: error.message, hasMigrationMarker: false });
      continue;
    }

    const payload = JSON.stringify(data || []);
    const hasMigrationMarker = payload.includes('20260408_create_commission_ledger_and_batches') || payload.includes(migrationFilename);
    signals.push({ table, accessible: true, error: null, hasMigrationMarker });
  }

  return signals;
}

async function runExecSql(sqlText) {
  return await supabase.rpc('exec_sql', { sql_query: sqlText });
}

function splitStatements(sqlText) {
  const lines = sqlText
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'));
  const cleaned = lines.join('\n');
  return cleaned
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => `${s};`);
}

async function applyMigrationIfNeeded() {
  const existsBefore = {};
  for (const table of requiredTables) {
    existsBefore[table] = await tableExists(table);
  }

  const missingBefore = requiredTables.filter((table) => !existsBefore[table]);
  if (missingBefore.length === 0) {
    return { applied: false, mode: 'not-needed', missingBefore, existsBefore, execSqlAvailable: true, applyError: null };
  }

  const migrationPath = path.join(cwd, migrationFile);
  const sqlText = fs.readFileSync(migrationPath, 'utf8');

  const initialExec = await runExecSql(sqlText);
  if (!initialExec.error) {
    await runExecSql("NOTIFY pgrst, 'reload schema';");
    return { applied: true, mode: 'single-rpc', missingBefore, existsBefore, execSqlAvailable: true, applyError: null };
  }

  if (String(initialExec.error.message || '').toLowerCase().includes('function') && String(initialExec.error.message || '').includes('exec_sql')) {
    return {
      applied: false,
      mode: 'exec-sql-missing',
      missingBefore,
      existsBefore,
      execSqlAvailable: false,
      applyError: initialExec.error.message,
    };
  }

  const statements = splitStatements(sqlText);
  for (const statement of statements) {
    const step = await runExecSql(statement);
    if (step.error) {
      return {
        applied: false,
        mode: 'split-rpc-failed',
        missingBefore,
        existsBefore,
        execSqlAvailable: true,
        applyError: step.error.message,
      };
    }
  }

  await runExecSql("NOTIFY pgrst, 'reload schema';");

  return { applied: true, mode: 'split-rpc', missingBefore, existsBefore, execSqlAvailable: true, applyError: null };
}

async function main() {
  const runtime = await detectRuntimeEnvironment();
  const migrationHistory = await detectMigrationHistorySignal();
  const applyResult = await applyMigrationIfNeeded();

  const existsAfter = {};
  for (const table of requiredTables) {
    existsAfter[table] = await tableExists(table);
  }

  const counts = {
    commission_ledger: await tableCount('commission_ledger'),
    commission_payout_batches: await tableCount('commission_payout_batches'),
    commission_ledger_events: await tableCount('commission_ledger_events'),
    agent_commissions: await tableCount('agent_commissions'),
  };

  const allRequiredTablesExist = requiredTables.every((table) => existsAfter[table]);

  let diagnosis = null;
  const historySaysApplied = migrationHistory.some((entry) => entry.accessible && entry.hasMigrationMarker);
  if (historySaysApplied && !allRequiredTablesExist) {
    diagnosis = 'Migration history indicates applied but schema objects are missing. Likely wrong database target, schema reset, or migration tracking drift.';
  }

  const report = {
    generatedAt: new Date().toISOString(),
    active: {
      supabaseUrlHost: url.hostname,
      projectRef,
      runtimePaymentEnvironment: runtime.value,
      runtimePaymentEnvironmentError: runtime.error,
    },
    migrationHistory,
    applyResult,
    existsAfter,
    allRequiredTablesExist,
    diagnosis,
    counts,
  };

  const outDir = path.join(cwd, 'tmp');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'commission-ledger-schema-ensure.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('\nCommission Ledger Schema Ensure');
  console.log('==============================');
  console.log(`Project ref: ${projectRef}`);
  console.log(`Runtime payment environment: ${runtime.value || '(unknown)'}${runtime.error ? ` (error: ${runtime.error})` : ''}`);
  console.log(`Required schema exists: ${allRequiredTablesExist ? 'YES' : 'NO'}`);
  console.log(`Apply mode: ${applyResult.mode}`);
  if (applyResult.applyError) {
    console.log(`Apply error: ${applyResult.applyError}`);
  }
  console.log(`Report file: ${outPath}`);
  console.log(`Counts: ledger=${counts.commission_ledger.count ?? 'n/a'}, batches=${counts.commission_payout_batches.count ?? 'n/a'}, events=${counts.commission_ledger_events.count ?? 'n/a'}, agent_commissions=${counts.agent_commissions.count ?? 'n/a'}`);
}

main().catch((error) => {
  console.error('Schema ensure failed:', error.message || error);
  process.exit(1);
});
