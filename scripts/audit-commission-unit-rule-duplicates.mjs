#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const cwd = process.cwd();
const envPath = path.join(cwd, '.env');

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^"|"$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

const normalizeEnvValue = (value) => String(value || '').replace(/["']/g, '').trim();
const supabaseUrl = normalizeEnvValue(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
const supabaseServiceKey = normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: 'public' },
});

function isoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizePeriodFromDate(rawDate) {
  const base = rawDate ? new Date(rawDate) : new Date();
  if (Number.isNaN(base.getTime())) {
    return { start: null, end: null, derived: false };
  }

  const year = base.getUTCFullYear();
  const month = base.getUTCMonth();
  const day = base.getUTCDate();

  if (day <= 15) {
    return {
      start: isoDate(new Date(Date.UTC(year, month, 1))),
      end: isoDate(new Date(Date.UTC(year, month, 15))),
      derived: true,
    };
  }

  return {
    start: isoDate(new Date(Date.UTC(year, month, 16))),
    end: isoDate(new Date(Date.UTC(year, month + 1, 0))),
    derived: true,
  };
}

function toLaneFromLegacyCommission(row) {
  const commissionType = String(row?.commission_type || '').toLowerCase();
  if (commissionType === 'override') return 'override';
  return 'direct';
}

function normalizeList(values) {
  return [...new Set((values || []).filter((v) => v !== null && v !== undefined && String(v).trim() !== '').map((v) => String(v)))];
}

function buildEnrollmentUnitKey({ enrollmentId, memberId, sourceCommissionId, fallbackRowId }) {
  const enrollment = String(enrollmentId || '').trim();
  if (enrollment) {
    return { key: `enrollment:${enrollment}`, identityTier: 'enrollment' };
  }

  const member = String(memberId || '').trim();
  if (member) {
    return { key: `member:${member}`, identityTier: 'member' };
  }

  const source = String(sourceCommissionId || '').trim();
  if (source) {
    return { key: `source:${source}`, identityTier: 'source' };
  }

  return { key: `fallback:${String(fallbackRowId || '').trim()}`, identityTier: 'fallback' };
}

async function fetchAllRows({ table, select, orderColumn }) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];

  while (true) {
    const to = from + pageSize - 1;
    const query = supabase
      .from(table)
      .select(select)
      .order(orderColumn, { ascending: true })
      .range(from, to);

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed reading ${table}: ${error.message}`);
    }

    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function fetchAgentNames(agentIds) {
  const names = new Map();
  const ids = normalizeList(agentIds);
  if (ids.length === 0) return names;

  const chunkSize = 500;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('users')
      .select('id, first_name, last_name, email')
      .in('id', chunk);

    if (error) {
      throw new Error(`Failed reading users for agent names: ${error.message}`);
    }

    for (const row of data || []) {
      const fullName = `${row.first_name || ''} ${row.last_name || ''}`.trim();
      names.set(String(row.id), fullName || row.email || null);
    }
  }

  return names;
}

function classifySeverity(group) {
  const statuses = (group.statuses || []).map((s) => String(s || '').toLowerCase());
  const hasPaid = statuses.includes('paid') || (group.paymentStatuses || []).some((s) => String(s || '').toLowerCase() === 'paid');
  const hasBatched = (group.payoutBatchIds || []).length > 0;
  const ambiguous = group.identityTier !== 'enrollment';

  let base;
  if (hasPaid) {
    base = 'duplicate in same lane, same period, already paid';
  } else if (hasBatched) {
    base = 'duplicate in same lane, same period, already batched';
  } else {
    base = 'duplicate in same lane, same period, unpaid';
  }

  if (ambiguous) {
    return `${base}; ambiguous because enrollment identity missing`;
  }
  return base;
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function writeCsvReport(pathname, suspectGroups) {
  const header = [
    'table_name',
    'agent_id',
    'agent_name',
    'lane',
    'identity_tier',
    'enrollment_unit_key',
    'commission_period_start',
    'commission_period_end',
    'row_count',
    'severity',
    'row_ids',
    'member_ids',
    'source_commission_ids',
    'commission_amounts',
    'statuses',
    'payment_statuses',
    'payout_batch_ids',
    'created_at_values',
  ];

  const lines = [header.map(csvEscape).join(',')];

  for (const g of suspectGroups) {
    const row = [
      g.tableName,
      g.agentId,
      g.agentName || '',
      g.lane,
      g.identityTier,
      g.enrollmentUnitKey,
      g.commissionPeriodStart,
      g.commissionPeriodEnd,
      String(g.rowCount),
      g.severity,
      (g.rowIds || []).join('|'),
      (g.memberIds || []).join('|'),
      (g.sourceCommissionIds || []).join('|'),
      (g.commissionAmounts || []).join('|'),
      (g.statuses || []).join('|'),
      (g.paymentStatuses || []).join('|'),
      (g.payoutBatchIds || []).join('|'),
      (g.createdAtValues || []).join('|'),
    ];
    lines.push(row.map(csvEscape).join(','));
  }

  fs.writeFileSync(pathname, lines.join('\n'), 'utf8');
}

function summarizeBy(items, keySelector) {
  const out = {};
  for (const item of items) {
    const key = keySelector(item);
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

async function run() {
  const startedAt = Date.now();

  const ledgerRows = await fetchAllRows({
    table: 'commission_ledger',
    select: 'id, agent_id, agent_name, member_id, source_commission_id, commission_period_start, commission_period_end, commission_amount, status, payout_batch_id, created_at, commission_type',
    orderColumn: 'id',
  });

  const legacyRows = await fetchAllRows({
    table: 'agent_commissions',
    select: 'id, agent_id, member_id, enrollment_id, commission_amount, status, payment_status, created_at, commission_type, override_for_agent_id',
    orderColumn: 'id',
  });

  const sourceIds = normalizeList(ledgerRows.map((r) => r.source_commission_id));
  const sourceCommissionMap = new Map();

  if (sourceIds.length > 0) {
    const chunkSize = 500;
    for (let i = 0; i < sourceIds.length; i += chunkSize) {
      const chunk = sourceIds.slice(i, i + chunkSize);
      const { data, error } = await supabase
        .from('agent_commissions')
        .select('id, enrollment_id, member_id, commission_type, override_for_agent_id')
        .in('id', chunk);

      if (error) {
        throw new Error(`Failed reading source commission rows for ledger map: ${error.message}`);
      }

      for (const row of data || []) {
        sourceCommissionMap.set(String(row.id), row);
      }
    }
  }

  const allAgentIds = normalizeList([
    ...ledgerRows.map((r) => r.agent_id),
    ...legacyRows.map((r) => r.agent_id),
  ]);
  const agentNameMap = await fetchAgentNames(allAgentIds);

  const normalizedRows = [];

  for (const row of ledgerRows) {
    const source = sourceCommissionMap.get(String(row.source_commission_id || '')) || null;
    const lane = source ? toLaneFromLegacyCommission(source) : 'unknown';
    const unit = buildEnrollmentUnitKey({
      enrollmentId: source?.enrollment_id || null,
      memberId: row.member_id || source?.member_id || null,
      sourceCommissionId: row.source_commission_id || null,
      fallbackRowId: row.id,
    });

    normalizedRows.push({
      tableName: 'commission_ledger',
      rowId: String(row.id),
      agentId: String(row.agent_id || ''),
      agentName: row.agent_name || agentNameMap.get(String(row.agent_id || '')) || null,
      enrollmentUnitKey: unit.key,
      identityTier: unit.identityTier,
      commissionPeriodStart: String(row.commission_period_start || ''),
      commissionPeriodEnd: String(row.commission_period_end || ''),
      lane,
      memberId: row.member_id !== null && row.member_id !== undefined ? String(row.member_id) : null,
      sourceCommissionId: row.source_commission_id !== null && row.source_commission_id !== undefined ? String(row.source_commission_id) : null,
      commissionAmount: Number(row.commission_amount || 0),
      status: row.status || null,
      paymentStatus: null,
      payoutBatchId: row.payout_batch_id || null,
      createdAt: row.created_at || null,
    });
  }

  for (const row of legacyRows) {
    const lane = toLaneFromLegacyCommission(row);
    const unit = buildEnrollmentUnitKey({
      enrollmentId: row.enrollment_id || null,
      memberId: row.member_id || null,
      sourceCommissionId: row.id || null,
      fallbackRowId: row.id,
    });

    const derivedPeriod = normalizePeriodFromDate(row.created_at);

    normalizedRows.push({
      tableName: 'agent_commissions',
      rowId: String(row.id),
      agentId: String(row.agent_id || ''),
      agentName: agentNameMap.get(String(row.agent_id || '')) || null,
      enrollmentUnitKey: unit.key,
      identityTier: unit.identityTier,
      commissionPeriodStart: derivedPeriod.start || 'unknown',
      commissionPeriodEnd: derivedPeriod.end || 'unknown',
      lane,
      memberId: row.member_id !== null && row.member_id !== undefined ? String(row.member_id) : null,
      sourceCommissionId: String(row.id),
      commissionAmount: Number(row.commission_amount || 0),
      status: row.status || null,
      paymentStatus: row.payment_status || null,
      payoutBatchId: null,
      createdAt: row.created_at || null,
      periodDerivedFromCreatedAt: true,
    });
  }

  const grouped = new Map();

  for (const row of normalizedRows) {
    const key = [
      row.tableName,
      row.agentId || 'unknown_agent',
      row.enrollmentUnitKey,
      row.commissionPeriodStart || 'unknown_start',
      row.commissionPeriodEnd || 'unknown_end',
      row.lane || 'unknown_lane',
    ].join('|');

    const existing = grouped.get(key) || {
      tableName: row.tableName,
      agentId: row.agentId,
      agentName: row.agentName,
      enrollmentUnitKey: row.enrollmentUnitKey,
      identityTier: row.identityTier,
      commissionPeriodStart: row.commissionPeriodStart,
      commissionPeriodEnd: row.commissionPeriodEnd,
      lane: row.lane,
      rows: [],
    };

    existing.rows.push(row);
    grouped.set(key, existing);
  }

  const suspectGroups = [];

  for (const group of grouped.values()) {
    if (group.rows.length <= 1) continue;

    const rowIds = normalizeList(group.rows.map((r) => r.rowId));
    const memberIds = normalizeList(group.rows.map((r) => r.memberId));
    const sourceCommissionIds = normalizeList(group.rows.map((r) => r.sourceCommissionId));
    const commissionAmounts = group.rows.map((r) => Number(r.commissionAmount || 0));
    const statuses = normalizeList(group.rows.map((r) => r.status));
    const paymentStatuses = normalizeList(group.rows.map((r) => r.paymentStatus));
    const payoutBatchIds = normalizeList(group.rows.map((r) => r.payoutBatchId));
    const createdAtValues = normalizeList(group.rows.map((r) => r.createdAt));

    const payload = {
      tableName: group.tableName,
      agentId: group.agentId,
      agentName: group.agentName,
      enrollmentUnitKey: group.enrollmentUnitKey,
      identityTier: group.identityTier,
      commissionPeriodStart: group.commissionPeriodStart,
      commissionPeriodEnd: group.commissionPeriodEnd,
      lane: group.lane,
      rowCount: rowIds.length,
      rowIds,
      memberIds,
      sourceCommissionIds,
      commissionAmounts,
      statuses,
      paymentStatuses,
      payoutBatchIds,
      createdAtValues,
    };

    payload.severity = classifySeverity(payload);
    suspectGroups.push(payload);
  }

  suspectGroups.sort((a, b) => b.rowCount - a.rowCount);

  const suspectRows = suspectGroups.reduce((sum, g) => sum + Number(g.rowCount || 0), 0);
  const totalRowsScanned = normalizedRows.length;

  const summary = {
    totalRowsScanned,
    totalSuspectDuplicateGroups: suspectGroups.length,
    totalSuspectRows: suspectRows,
    scannedByTable: {
      commission_ledger: ledgerRows.length,
      agent_commissions: legacyRows.length,
    },
    suspectGroupsByTable: summarizeBy(suspectGroups, (g) => g.tableName),
    suspectRowsByTable: summarizeBy(suspectGroups.flatMap((g) => Array.from({ length: g.rowCount }, () => ({ tableName: g.tableName }))), (x) => x.tableName),
    suspectGroupsByLane: summarizeBy(suspectGroups, (g) => g.lane),
    suspectRowsByLane: summarizeBy(suspectGroups.flatMap((g) => Array.from({ length: g.rowCount }, () => ({ lane: g.lane }))), (x) => x.lane),
    suspectGroupsByPeriod: summarizeBy(
      suspectGroups,
      (g) => `${g.commissionPeriodStart}..${g.commissionPeriodEnd}`,
    ),
  };

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'read-only-audit',
    safety: {
      writesPerformed: false,
      migrationsPerformed: false,
      repairsPerformed: false,
      notes: [
        'This script only performs SELECT queries and local file output.',
        'No database mutations are executed.',
      ],
    },
    scope: {
      tables: ['commission_ledger', 'agent_commissions'],
      duplicateRule: 'same agent + enrollment unit + commission period + lane with row_count > 1',
      laneRule: 'direct and override are separate lanes; duplicates are only flagged within same lane',
      enrollmentUnitKeyPreference: ['enrollment', 'member', 'source', 'fallback'],
      agentCommissionsPeriodRule: 'derived from created_at using 1st-15th and 16th-end-of-month windows',
    },
    summary,
    duplicateGroups: suspectGroups,
    runtime: {
      durationMs: Date.now() - startedAt,
    },
  };

  const outDir = path.join(cwd, 'tmp');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const jsonPath = path.join(outDir, 'commission-unit-rule-duplicate-audit.json');
  const csvPath = path.join(outDir, 'commission-unit-rule-duplicate-audit.csv');

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  writeCsvReport(csvPath, suspectGroups);

  console.log('\nCommission Unit Rule Duplicate Audit (READ-ONLY)');
  console.log('================================================');
  console.log(`Rows scanned: ${summary.totalRowsScanned}`);
  console.log(`Suspect duplicate groups: ${summary.totalSuspectDuplicateGroups}`);
  console.log(`Suspect rows: ${summary.totalSuspectRows}`);
  console.log(`Scanned by table: ledger=${summary.scannedByTable.commission_ledger}, legacy=${summary.scannedByTable.agent_commissions}`);
  console.log(`Suspect groups by table: ${JSON.stringify(summary.suspectGroupsByTable)}`);
  console.log(`Suspect groups by lane: ${JSON.stringify(summary.suspectGroupsByLane)}`);
  console.log(`JSON report: ${jsonPath}`);
  console.log(`CSV report: ${csvPath}`);

  if (suspectGroups.length > 0) {
    const top = suspectGroups.slice(0, 5).map((g) => ({
      table: g.tableName,
      agentId: g.agentId,
      lane: g.lane,
      unit: g.enrollmentUnitKey,
      period: `${g.commissionPeriodStart}..${g.commissionPeriodEnd}`,
      rowCount: g.rowCount,
      severity: g.severity,
    }));

    console.log('Top suspect groups (first 5):');
    for (const row of top) {
      console.log(`- ${JSON.stringify(row)}`);
    }
  } else {
    console.log('No duplicate groups detected under the configured lane-aware unit rule.');
  }
}

run().catch((error) => {
  console.error('Audit failed:', error?.message || error);
  process.exit(1);
});
