#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';
import { Client } from 'pg';

const cwd = process.cwd();
dotenv.config();

const envPath = path.join(cwd, '.env');
if (fs.existsSync(envPath)) {
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

const connectionString = String(process.env.DATABASE_URL || '').trim().replace(/^"|"$/g, '');
if (!connectionString) {
  throw new Error('Missing DATABASE_URL');
}

const pgClient = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

function toNumber(value) {
  return Number(value || 0);
}

function formatDateOnly(dateInput) {
  const date = new Date(dateInput);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function firstFridayOnOrAfter(dateInput) {
  const raw = String(dateInput || '');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T00:00:00`)
    : new Date(raw);
  const day = date.getDay();
  const friday = 5;
  const delta = (friday - day + 7) % 7;
  date.setDate(date.getDate() + delta);
  return formatDateOnly(date);
}

function mapDisplayStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'earned') return 'pending';
  if (normalized === 'queued') return 'scheduled';
  if (normalized === 'carry_forward') return 'carry_forward';
  if (normalized === 'paid') return 'paid';
  if (normalized === 'held') return 'held';
  return 'reversed';
}

function parseQuickBooksTotal(csvText) {
  const lines = String(csvText || '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length <= 1) {
    return { lineCount: 0, total: 0 };
  }

  let total = 0;
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(',');
    const amount = Number(cols[6] || 0);
    total += Number.isFinite(amount) ? amount : 0;
  }

  return { lineCount: lines.length - 1, total };
}

function sampleCsvLines(csvText, maxLines = 10) {
  return String(csvText || '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .slice(0, maxLines);
}

function parseJsonFromOutput(output) {
  const text = String(output || '').trim();
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '{') continue;
    try {
      return JSON.parse(text.slice(i));
    } catch {
      // Keep scanning until we find a valid JSON object start.
    }
  }
  throw new Error('No JSON payload found in command output');
}

async function queryRows(sql, params = []) {
  const result = await pgClient.query(sql, params);
  return Array.isArray(result.rows) ? result.rows : [];
}

async function run() {
  const [{ formatLocalDate }, storageModule, ledgerModule, supabaseModule] = await Promise.all([
    import('../shared/localDate.ts'),
    import('../server/storage.ts'),
    import('../server/services/commission-ledger-service.ts'),
    import('../server/lib/supabaseClient.ts'),
  ]);

  const { getAllCommissionsNew } = storageModule;
  const {
    buildDraftPayoutBatches,
    buildQuickBooksCsvFromBatch,
    getBatchDetails,
    syncCommissionLedgerFromFeed,
  } = ledgerModule;
  const { supabase } = supabaseModule;

  await pgClient.connect();

  const all = await getAllCommissionsNew();
  const allCommissions = Array.isArray(all) ? all : [];

  const existingLedgerSources = await queryRows(
    `
      select distinct source_commission_id::text as source_commission_id
      from public.commission_ledger
      where source_commission_id is not null
    `
  );
  const existingSourceSet = new Set(
    existingLedgerSources
      .map((row) => String(row.source_commission_id || '').trim())
      .filter((value) => value.length > 0)
  );

  const usable = allCommissions
    .filter((item) => {
      const amount = Number(item?.commissionAmount || 0);
      return (
        item?.id
        && item?.agentId
        && item?.memberId
        && !existingSourceSet.has(String(item.id))
        && Number.isFinite(amount)
        && amount > 0
        && item?.isClawedBack !== true
      );
    })
    .sort((a, b) => new Date(String(a.createdAt || 0)).getTime() - new Date(String(b.createdAt || 0)).getTime());

  let rehearsalSlice = usable.slice(0, 2);
  if (rehearsalSlice.length === 0) {
    rehearsalSlice = allCommissions
      .filter((item) => {
        const amount = Number(item?.commissionAmount || 0);
        return (
          item?.id
          && item?.agentId
          && item?.memberId
          && Number.isFinite(amount)
          && amount > 0
          && item?.isClawedBack !== true
        );
      })
      .sort((a, b) => new Date(String(a.createdAt || 0)).getTime() - new Date(String(b.createdAt || 0)).getTime())
      .slice(0, 2);
  }
  if (rehearsalSlice.length === 0) {
    throw new Error('No eligible real commission rows found for rehearsal slice');
  }

  const sourceIds = rehearsalSlice.map((item) => String(item.id));
  const cutoffDate = formatLocalDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  const syncResult = await syncCommissionLedgerFromFeed(rehearsalSlice);
  const generatedBatches = await buildDraftPayoutBatches(cutoffDate);
  const rerunBatches = await buildDraftPayoutBatches(cutoffDate);

  const { data: ledgerRowsRaw, error: ledgerError } = await supabase
    .from('commission_ledger')
    .select('*')
    .in('source_commission_id', sourceIds)
    .order('created_at', { ascending: true });

  if (ledgerError) {
    throw new Error(`Failed loading rehearsal ledger rows: ${ledgerError.message}`);
  }

  const ledgerRows = Array.isArray(ledgerRowsRaw) ? ledgerRowsRaw : [];
  const rehearsalBatchId = ledgerRows.find((row) => row.payout_batch_id)?.payout_batch_id || null;

  if (!rehearsalBatchId) {
    throw new Error('No rehearsal batch rows were assigned; cannot produce statement/export sample');
  }

  const batchDetail = await getBatchDetails(rehearsalBatchId);
  const batchRows = Array.isArray(batchDetail?.rows) ? batchDetail.rows : [];
  const byAgent = Array.isArray(batchDetail?.byAgent) ? batchDetail.byAgent : [];

  if (byAgent.length === 0) {
    throw new Error('Batch has no agent rows for statement sample');
  }

  const sampleAgent = byAgent[0];
  const sampleAgentItems = Array.isArray(sampleAgent.items) ? sampleAgent.items : [];
  const sampleStatement = {
    agentId: sampleAgent.agentId,
    agentName: sampleAgent.agentName,
    writingNumber: sampleAgent.writingNumber,
    lineCount: sampleAgentItems.length,
    subtotal: sampleAgentItems
      .filter((row) => !['adjustment', 'reversal'].includes(String(row.commission_type || '').toLowerCase()))
      .reduce((sum, row) => sum + toNumber(row.commission_amount), 0),
    adjustments: sampleAgentItems
      .filter((row) => ['adjustment', 'reversal'].includes(String(row.commission_type || '').toLowerCase()))
      .reduce((sum, row) => sum + toNumber(row.commission_amount), 0),
    totalPayout: sampleAgentItems.reduce((sum, row) => sum + toNumber(row.commission_amount), 0),
    sampleLines: sampleAgentItems.slice(0, 5).map((row) => ({
      ledgerId: row.id,
      memberName: row.member_name,
      memberId: row.member_id,
      commissionAmount: toNumber(row.commission_amount),
      commissionType: row.commission_type,
      status: row.status,
      statementNumber: row.statement_number || null,
    })),
  };

  const quickBooksCsv = buildQuickBooksCsvFromBatch(batchDetail.batch, batchRows);
  const quickBooksParsed = parseQuickBooksTotal(quickBooksCsv);

  const agentViewRows = ledgerRows
    .filter((row) => String(row.agent_id || '') === String(sampleAgent.agentId || ''))
    .map((row) => ({
      ledgerId: row.id,
      memberId: row.member_id,
      memberName: row.member_name,
      commissionAmount: toNumber(row.commission_amount),
      rawStatus: row.status,
      displayStatus: mapDisplayStatus(row.status),
      payoutBatchId: row.payout_batch_id,
    }));

  const pendingCount = agentViewRows.filter((row) => row.displayStatus === 'pending').length;
  const scheduledCount = agentViewRows.filter((row) => row.displayStatus === 'scheduled').length;
  const carryForwardCount = agentViewRows.filter((row) => row.displayStatus === 'carry_forward').length;

  const duplicateRows = await queryRows(
    `
      with normalized as (
        select
          id,
          member_id,
          coalesce(nullif(enrollment_id, ''), '__NO_ENROLLMENT__') as enrollment_unit,
          agent_id,
          coalesce(nullif(commission_type, ''), 'direct') as lane,
          coalesce(override_for_agent_id, '__NO_OVERRIDE__') as override_lane
        from public.agent_commissions
      )
      select member_id, enrollment_unit, agent_id, lane, override_lane, count(*)::int as row_count
      from normalized
      group by member_id, enrollment_unit, agent_id, lane, override_lane
      having count(*) > 1
      order by row_count desc
      limit 200
    `
  );

  const sliceUnitViolations = await queryRows(
    `
      with target as (
        select unnest($1::text[]) as source_id
      ), normalized as (
        select
          ac.id,
          ac.id::text as source_commission_id,
          ac.member_id,
          coalesce(nullif(ac.enrollment_id, ''), '__NO_ENROLLMENT__') as enrollment_unit,
          ac.agent_id,
          coalesce(nullif(ac.commission_type, ''), 'direct') as lane,
          coalesce(ac.override_for_agent_id, '__NO_OVERRIDE__') as override_lane
        from public.agent_commissions ac
        join target t on t.source_id = ac.id::text
      )
      select member_id, enrollment_unit, agent_id, lane, override_lane, count(*)::int as row_count
      from normalized
      group by member_id, enrollment_unit, agent_id, lane, override_lane
      having count(*) > 1
      order by row_count desc
    `,
    [sourceIds]
  );

  const laneSummary = await queryRows(
    `
      with target as (
        select unnest($1::text[]) as source_id
      )
      select
        coalesce(nullif(ac.commission_type, ''), 'direct') as lane,
        count(*)::int as row_count
      from public.agent_commissions ac
      join target t on t.source_id = ac.id::text
      group by 1
      order by 2 desc
    `,
    [sourceIds]
  );

  const expectedScheduledDate = firstFridayOnOrAfter(batchDetail.batch.cutoff_date);
  const scheduledDateMatches = String(batchDetail.batch.scheduled_pay_date || '') === expectedScheduledDate;

  const batchTotal = batchRows.reduce((sum, row) => sum + toNumber(row.commission_amount), 0);
  const batchHeaderTotal = toNumber(batchDetail?.batch?.total_amount);
  const batchHeaderRecords = Number(batchDetail?.batch?.total_records || 0);
  const batchHeaderAgents = Number(batchDetail?.batch?.total_agents || 0);
  const recalculatedBatchRecords = batchRows.length;
  const recalculatedBatchAgents = byAgent.length;
  const batchHeaderMatchesRows = Math.abs(batchTotal - batchHeaderTotal) < 0.01
    && batchHeaderRecords === recalculatedBatchRecords
    && batchHeaderAgents === recalculatedBatchAgents;
  const statementAgentTotalFromByAgent = toNumber(sampleAgent.totalAmount);
  const statementMatches = Math.abs(sampleStatement.totalPayout - statementAgentTotalFromByAgent) < 0.01;
  const quickBooksMatchesBatch = Math.abs(batchTotal - quickBooksParsed.total) < 0.01;

  const headerMismatchScan = await queryRows(
    `
      with rollups as (
        select
          b.id as batch_id,
          coalesce(round(sum(case when l.status in ('queued','paid') then l.commission_amount else 0 end)::numeric, 2), 0)::numeric(12,2) as calc_total_amount,
          count(*) filter (where l.status in ('queued','paid'))::int as calc_total_records,
          count(distinct l.agent_id) filter (where l.status in ('queued','paid'))::int as calc_total_agents,
          b.total_amount as header_total_amount,
          b.total_records as header_total_records,
          b.total_agents as header_total_agents,
          b.status as batch_status
        from public.commission_payout_batches b
        left join public.commission_ledger l
          on l.payout_batch_id = b.id
        group by b.id, b.total_amount, b.total_records, b.total_agents, b.status
      )
      select *
      from rollups
      where abs(coalesce(calc_total_amount, 0)::numeric - coalesce(header_total_amount, 0)::numeric) > 0.009
         or coalesce(calc_total_records, 0) <> coalesce(header_total_records, 0)
         or coalesce(calc_total_agents, 0) <> coalesce(header_total_agents, 0)
      order by batch_id
      limit 200
    `
  );

  const thresholdInvariantViolations = await queryRows(
    `
      with agent_batch_totals as (
        select
          payout_batch_id,
          agent_id,
          round(sum(commission_amount)::numeric, 2) as net_total,
          count(*)::int as row_count,
          count(*) filter (where status = 'queued')::int as queued_count,
          count(*) filter (where status = 'carry_forward')::int as carry_forward_count
        from public.commission_ledger
        where payout_batch_id is not null
          and status in ('queued', 'carry_forward')
        group by payout_batch_id, agent_id
      )
      select *
      from agent_batch_totals
      where (net_total < 25 and queued_count > 0)
         or (net_total >= 25 and carry_forward_count > 0)
      order by payout_batch_id, agent_id
      limit 200
    `
  );

  let smokeLaneResult = null;
  try {
    const stdout = execFileSync('node', ['scripts/smoke-commission-unit-uniqueness.mjs'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    smokeLaneResult = parseJsonFromOutput(stdout);
  } catch (error) {
    smokeLaneResult = {
      ok: false,
      error: error?.message || String(error),
    };
  }

  execFileSync('node', ['scripts/audit-commission-batch-repair.mjs'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const repairAuditPath = path.join(cwd, 'tmp', 'commission-batch-repair-review.json');
  const repairAudit = fs.existsSync(repairAuditPath)
    ? JSON.parse(fs.readFileSync(repairAuditPath, 'utf8'))
    : null;

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'controlled-ledger-payout-rehearsal',
    rehearsalSlice: {
      requestedCount: 2,
      selectedCount: rehearsalSlice.length,
      sourceCommissionIds: sourceIds,
      records: rehearsalSlice.map((item) => ({
        id: item.id,
        agentId: item.agentId,
        agentName: item.agentName,
        memberId: item.memberId,
        memberName: item.memberName,
        commissionAmount: item.commissionAmount,
        commissionType: item.commissionType || 'direct',
        enrollmentId: item.enrollmentId || null,
        createdAt: item.createdAt,
      })),
    },
    execution: {
      syncResult,
      cutoffDate,
      generatedBatchCount: Array.isArray(generatedBatches) ? generatedBatches.length : 0,
      rerunBatchCount: Array.isArray(rerunBatches) ? rerunBatches.length : 0,
      rehearsalBatchId,
      autoPaid: false,
    },
    outputs: {
      sampleStatement,
      sampleQuickBooksExport: {
        lineCount: quickBooksParsed.lineCount,
        total: quickBooksParsed.total,
        previewLines: sampleCsvLines(quickBooksCsv, 10),
      },
      sampleAgentViewState: {
        agentId: sampleAgent.agentId,
        agentName: sampleAgent.agentName,
        pendingCount,
        scheduledCount,
        carryForwardCount,
        sampleRows: agentViewRows.slice(0, 10),
      },
    },
    validations: {
      noDuplicateCommissionRows: duplicateRows.length === 0,
      duplicateRows,
      oneEnrollmentOneCommissionUnitForSlice: sliceUnitViolations.length === 0,
      sliceUnitViolations,
      directAndOverrideLaneSummaryForSlice: laneSummary,
      directAndOverrideLaneBehaviorViaSmokeScript: smokeLaneResult,
      scheduledPayDate: {
        batchType: batchDetail.batch.batch_type,
        cutoffDate: batchDetail.batch.cutoff_date,
        scheduledPayDate: batchDetail.batch.scheduled_pay_date,
        expectedScheduledPayDate: expectedScheduledDate,
        matches: scheduledDateMatches,
      },
      totalsReconciliation: {
        batchTotal,
        batchHeaderTotal,
        batchHeaderRecords,
        batchHeaderAgents,
        recalculatedBatchRecords,
        recalculatedBatchAgents,
        batchHeaderMatchesRows,
        statementAgentTotalFromByAgent,
        statementAgentTotalFromLines: sampleStatement.totalPayout,
        statementMatches,
        quickBooksTotalFromCsv: quickBooksParsed.total,
        quickBooksMatchesBatch,
      },
      batchHeaderMismatchScan: {
        mismatchCount: headerMismatchScan.length,
        rows: headerMismatchScan,
      },
      payoutThresholdCarryForwardInvariant: {
        violationCount: thresholdInvariantViolations.length,
        rows: thresholdInvariantViolations,
      },
    },
    postRehearsalRepairAudit: repairAudit
      ? {
          summary: repairAudit.summary,
          contaminationCount: repairAudit.summary?.contaminatedRowsAttachedToBatch ?? null,
          mismatchCount: repairAudit.summary?.mismatchedBatches ?? null,
          exportRiskCount: repairAudit.summary?.invalidExportRiskBatches ?? null,
        }
      : null,
  };

  const outDir = path.join(cwd, 'tmp');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outPath = path.join(outDir, 'controlled-ledger-rehearsal.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`Report file: ${outPath}`);
  console.log(JSON.stringify(report, null, 2));
}

run().catch((error) => {
  console.error('Controlled rehearsal failed:', error.message || error);
  process.exit(1);
}).finally(async () => {
  try {
    await pgClient.end();
  } catch {
    // no-op
  }
});
