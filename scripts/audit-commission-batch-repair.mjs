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

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: 'public' },
});

const PAYABLE = new Set(['queued', 'paid']);
const NON_PAYABLE = new Set(['held', 'reversed']);

const money = (n) => Number(n || 0);

async function headCount(tableName) {
  const { count, error } = await supabase
    .from(tableName)
    .select('*', { head: true, count: 'exact' });

  return {
    count: Number(count || 0),
    error: error?.message || null,
  };
}

const run = async () => {
  const [ledgerHead, batchHead, eventsHead, commissionsHead] = await Promise.all([
    headCount('commission_ledger'),
    headCount('commission_payout_batches'),
    headCount('commission_ledger_events'),
    headCount('agent_commissions'),
  ]);

  const missingLedgerSchema =
    Boolean(ledgerHead.error?.includes("Could not find the table 'public.commission_ledger'")) ||
    Boolean(batchHead.error?.includes("Could not find the table 'public.commission_payout_batches'"));

  if (ledgerHead.error && !missingLedgerSchema) throw new Error(`Ledger query failed: ${ledgerHead.error}`);
  if (batchHead.error && !missingLedgerSchema) throw new Error(`Batch query failed: ${batchHead.error}`);
  if (eventsHead.error && !missingLedgerSchema) throw new Error(`Events query failed: ${eventsHead.error}`);

  let ledgerRows = [];
  let batches = [];
  let events = [];
  let commissionPaidIds = [];
  let commissionPendingIds = [];
  let commissionsQueryError = null;

  if (!missingLedgerSchema) {
    if (ledgerHead.count > 0) {
      const ledgerResult = await supabase
        .from('commission_ledger')
        .select('id, source_commission_id, payout_batch_id, status, commission_amount, agent_id, member_id, commission_type, created_at');
      if (ledgerResult.error) throw new Error(`Ledger detail query failed: ${ledgerResult.error.message}`);
      ledgerRows = ledgerResult.data || [];
    }

    if (batchHead.count > 0) {
      const batchResult = await supabase
        .from('commission_payout_batches')
        .select('id, batch_name, batch_type, cutoff_date, scheduled_pay_date, total_amount, total_agents, total_records, status, paid_at, created_at');
      if (batchResult.error) throw new Error(`Batch detail query failed: ${batchResult.error.message}`);
      batches = batchResult.data || [];
    }

    if (eventsHead.count > 0) {
      const eventsResult = await supabase
        .from('commission_ledger_events')
        .select('id, ledger_id, event_type, from_status, to_status, payout_batch_id, created_at')
        .in('event_type', ['batch_exported', 'status_transition', 'batch_assigned']);
      if (eventsResult.error) throw new Error(`Events detail query failed: ${eventsResult.error.message}`);
      events = eventsResult.data || [];
    }
  }

  if (!commissionsHead.error && commissionsHead.count > 0) {
    const paidResult = await supabase
      .from('agent_commissions')
      .select('id')
      .eq('payment_status', 'paid')
      .limit(50000);

    if (paidResult.error) {
      commissionsQueryError = paidResult.error.message;
    } else {
      commissionPaidIds = (paidResult.data || []).map((row) => row.id);
    }

    const pendingResult = await supabase
      .from('agent_commissions')
      .select('id')
      .eq('payment_status', 'pending')
      .limit(50000);

    if (pendingResult.error) {
      commissionsQueryError = commissionsQueryError || pendingResult.error.message;
    } else {
      commissionPendingIds = (pendingResult.data || []).map((row) => row.id);
    }
  }

  const rowsByBatch = new Map();
  for (const row of ledgerRows) {
    if (!row.payout_batch_id) continue;
    const list = rowsByBatch.get(row.payout_batch_id) || [];
    list.push(row);
    rowsByBatch.set(row.payout_batch_id, list);
  }

  const contaminatedRows = ledgerRows.filter((row) => row.payout_batch_id && NON_PAYABLE.has(String(row.status || '').toLowerCase()));

  const mismatchedBatches = [];
  for (const batch of batches) {
    const attached = rowsByBatch.get(batch.id) || [];
    const payableRows = attached.filter((row) => PAYABLE.has(String(row.status || '').toLowerCase()));
    const expectedTotalAmount = payableRows.reduce((sum, row) => sum + money(row.commission_amount), 0);
    const expectedTotalRecords = payableRows.length;
    const expectedTotalAgents = new Set(payableRows.map((row) => String(row.agent_id || 'unknown'))).size;

    const amountMismatch = Math.abs(expectedTotalAmount - money(batch.total_amount)) > 0.009;
    const recordsMismatch = Number(batch.total_records || 0) !== expectedTotalRecords;
    const agentsMismatch = Number(batch.total_agents || 0) !== expectedTotalAgents;

    if (amountMismatch || recordsMismatch || agentsMismatch) {
      mismatchedBatches.push({
        id: batch.id,
        batch_name: batch.batch_name,
        status: batch.status,
        stored: {
          total_amount: money(batch.total_amount),
          total_records: Number(batch.total_records || 0),
          total_agents: Number(batch.total_agents || 0),
        },
        expected: {
          total_amount: expectedTotalAmount,
          total_records: expectedTotalRecords,
          total_agents: expectedTotalAgents,
        },
      });
    }
  }

  const invalidExportRiskBatches = batches
    .filter((batch) => ['exported', 'paid'].includes(String(batch.status || '').toLowerCase()))
    .map((batch) => {
      const attached = rowsByBatch.get(batch.id) || [];
      const invalid = attached.filter((row) => NON_PAYABLE.has(String(row.status || '').toLowerCase()));
      if (invalid.length === 0) return null;
      return {
        id: batch.id,
        batch_name: batch.batch_name,
        status: batch.status,
        invalidRowCount: invalid.length,
        invalidStatuses: [...new Set(invalid.map((row) => row.status))],
      };
    })
    .filter(Boolean);

  const paidOutsideBatch = ledgerRows.filter((row) => String(row.status || '').toLowerCase() === 'paid' && !row.payout_batch_id);

  const sourcePaidMap = new Set(paidOutsideBatch.map((row) => String(row.source_commission_id || '')).filter(Boolean));
  const commissionPaidOutsideLedgerBatch = commissionPaidIds.filter((commissionId) => {
    if (missingLedgerSchema) return true;
    return !sourcePaidMap.has(String(commissionId));
  });

  const legacyBypassSignals = {
    ledgerPaidWithoutBatch: paidOutsideBatch.length,
    commissionPaidWithoutLedgerBatchSourceLink: commissionPaidOutsideLedgerBatch.length,
    legacyRouteStillReferenced: false,
    exportEventsCount: events.filter((e) => e.event_type === 'batch_exported').length,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    schema: {
      missingLedgerSchema,
      ledgerError: ledgerHead.error,
      batchError: batchHead.error,
      eventsError: eventsHead.error,
      commissionsError: commissionsQueryError,
    },
    summary: {
      ledgerRows: ledgerRows.length,
      batches: batches.length,
      legacyCommissionRows: commissionsHead.count,
      legacyPaidCommissionRows: commissionPaidIds.length,
      legacyPendingCommissionRows: commissionPendingIds.length,
      contaminatedRowsAttachedToBatch: contaminatedRows.length,
      mismatchedBatches: mismatchedBatches.length,
      invalidExportRiskBatches: invalidExportRiskBatches.length,
      directPaySignals: legacyBypassSignals,
    },
    findings: {
      contaminatedRows: contaminatedRows.slice(0, 500),
      mismatchedBatches,
      invalidExportRiskBatches,
      paidOutsideBatch: paidOutsideBatch.slice(0, 500),
      commissionPaidWithoutLedgerBatchSourceLink: commissionPaidOutsideLedgerBatch.slice(0, 500),
    },
  };

  const outDir = path.join(cwd, 'tmp');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'commission-batch-repair-review.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('\nCommission Batch Repair Review');
  console.log('==============================');
  if (missingLedgerSchema) {
    console.log('Schema status: ledger tables are missing in connected database (migration not applied there).');
  }
  console.log(`Report file: ${outPath}`);
  console.log(`Contaminated rows still attached: ${report.summary.contaminatedRowsAttachedToBatch}`);
  console.log(`Batches with totals mismatch: ${report.summary.mismatchedBatches}`);
  console.log(`Export-risk batches (exported/paid + invalid rows): ${report.summary.invalidExportRiskBatches}`);
  console.log(`Direct-pay signal (ledger paid without batch): ${legacyBypassSignals.ledgerPaidWithoutBatch}`);
  console.log(`Direct-pay signal (commission paid not linked to paid ledger source): ${legacyBypassSignals.commissionPaidWithoutLedgerBatchSourceLink}`);
};

run().catch((error) => {
  console.error('Audit failed:', error.message || error);
  process.exit(1);
});
