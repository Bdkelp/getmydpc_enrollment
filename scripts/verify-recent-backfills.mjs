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
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const normalizeEnvValue = (value) => (value || '').replace(/["']/g, '').trim();
const supabaseUrl = normalizeEnvValue(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
const supabaseServiceRoleKey = normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: 'public' },
});

const toObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value;
};

const toTrimmedOrNull = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toNumber = (value) => {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? '0'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const toBooleanOrNull = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return null;
};

const pickValue = (row, keys) => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key) && row[key] !== undefined) {
      return row[key];
    }
  }
  return null;
};

const toPlanTierMatrixKey = (value) => {
  const normalized = String(value || '').toLowerCase();
  if (normalized.includes('elite')) return 'elite';
  if (normalized.includes('plus')) return 'plus';
  return 'base';
};

const derivePlanTierFromName = (planName) => {
  const normalized = String(planName || '').toLowerCase();
  if (normalized.includes('elite')) return 'Elite';
  if (normalized.includes('plus') || normalized.includes('+')) return 'Plus';
  return 'Base';
};

const isMemberOnlyPlanName = (planName) => {
  const normalized = String(planName || '').toLowerCase();
  return normalized.includes('member only') || /\(ee\)|\bee\b/.test(normalized);
};

const normalizeStringArray = (value) => {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  const out = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }

  return out;
};

const toPositiveNumberOrZero = (value) => {
  const raw = typeof value === 'number' ? value : parseInt(String(value ?? '0'), 10);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw;
};

const resolvePlanInfo = (row) => {
  const metadata = toObject(row.metadata);
  const metadataPlanSelection = toObject(metadata?.planSelection);
  const payload = toObject(row.registration_payload);
  const payloadPlanSelection = toObject(payload?.planSelection);

  const planName =
    toTrimmedOrNull(metadataPlanSelection?.planName)
    || toTrimmedOrNull(metadata?.selectedPlanName)
    || toTrimmedOrNull(metadata?.planName)
    || toTrimmedOrNull(payloadPlanSelection?.planName)
    || toTrimmedOrNull(payload?.selectedPlanName)
    || toTrimmedOrNull(payload?.planName)
    || null;

  const planTier =
    toTrimmedOrNull(metadataPlanSelection?.planTier)
    || toTrimmedOrNull(metadata?.selectedPlanTier)
    || toTrimmedOrNull(metadata?.planTier)
    || toTrimmedOrNull(payloadPlanSelection?.planTier)
    || toTrimmedOrNull(payload?.selectedPlanTier)
    || toTrimmedOrNull(payload?.planTier)
    || (planName ? derivePlanTierFromName(planName) : null);

  const pbmEnabled =
    toBooleanOrNull(metadataPlanSelection?.pbmEnabled)
    ?? toBooleanOrNull(metadata?.pbmEnabled)
    ?? toBooleanOrNull(metadata?.pbm)
    ?? toBooleanOrNull(payloadPlanSelection?.pbmEnabled)
    ?? toBooleanOrNull(payload?.pbmEnabled)
    ?? toBooleanOrNull(payload?.pbm)
    ?? false;

  const pbmAmount =
    toNumber(metadataPlanSelection?.pbmAmount)
    || toNumber(metadata?.pbmAmount)
    || toNumber(payloadPlanSelection?.pbmAmount)
    || toNumber(payload?.pbmAmount)
    || 0;

  return {
    planName,
    planTier,
    pbmEnabled,
    pbmAmount: Math.max(0, pbmAmount),
  };
};

const expectedMemberOnlyAmount = (planTier, pbmEnabled, pbmAmount) => {
  const matrix = {
    base: 59,
    plus: 99,
    elite: 119,
  };

  const base = matrix[toPlanTierMatrixKey(planTier)] || matrix.base;
  return Number((base + (pbmEnabled ? pbmAmount : 0)).toFixed(2));
};

const normalizeAssignmentState = (metadata) => {
  const assignment = metadata.assignment && typeof metadata.assignment === 'object'
    ? metadata.assignment
    : {};

  const currentAssignedAgentId =
    toTrimmedOrNull(assignment.currentAssignedAgentId)
    ?? toTrimmedOrNull(metadata.assignedAgentId)
    ?? null;

  const originalAssignedAgentId =
    toTrimmedOrNull(assignment.originalAssignedAgentId)
    ?? toTrimmedOrNull(metadata.originalAssignedAgentId)
    ?? currentAssignedAgentId;

  const reassignmentCount = toPositiveNumberOrZero(
    assignment.reassignmentCount ?? metadata.reassignmentCount,
  );

  const readOnlyAgentIds = normalizeStringArray(
    assignment.readOnlyAgentIds ?? metadata.readOnlyAgentIds,
  ).filter((agentId) => agentId !== currentAssignedAgentId);

  return {
    currentAssignedAgentId,
    originalAssignedAgentId,
    reassignmentCount,
    readOnlyAgentIds,
    hasReassignmentHistory: reassignmentCount > 0,
  };
};

async function verifyMemberOnlyBackfill() {
  const { data, error } = await supabase
    .from('group_members')
    .select('*')
    .order('id', { ascending: true });

  if (error) {
    throw new Error(`Failed to load group_members: ${error.message}`);
  }

  const rows = data || [];
  let scanned = 0;
  let memberOnlyCandidates = 0;
  let needsBackfill = 0;
  const sampleIssues = [];

  for (const row of rows) {
    const rowStatus = String(pickValue(row, ['status']) || '').toLowerCase();
    if (rowStatus === 'terminated') {
      continue;
    }

    scanned += 1;
    const planInfo = resolvePlanInfo(row);
    if (!planInfo.planName || !isMemberOnlyPlanName(planInfo.planName)) {
      continue;
    }

    memberOnlyCandidates += 1;
    const expectedTotal = expectedMemberOnlyAmount(planInfo.planTier || derivePlanTierFromName(planInfo.planName), planInfo.pbmEnabled, planInfo.pbmAmount);

    const payorType = String(pickValue(row, ['payor_type', 'payorType']) || '').toLowerCase();
    const relationshipRaw = pickValue(row, ['relationship', 'relation', 'member_relationship']);
    const relationship = String(relationshipRaw || '').toLowerCase();
    const hasRelationshipField = ['relationship', 'relation', 'member_relationship']
      .some((key) => Object.prototype.hasOwnProperty.call(row, key));
    const tier = String(pickValue(row, ['tier', 'coverage_type', 'coverageType']) || '').toLowerCase();
    const totalAmount = pickValue(row, ['total_amount', 'totalAmount']);
    const discountAmount = pickValue(row, ['discount_amount', 'discountAmount']);
    const employerAmount = pickValue(row, ['employer_amount', 'employerAmount']);
    const memberAmount = pickValue(row, ['member_amount', 'memberAmount']);

    const relOk = !hasRelationshipField || relationship === 'primary';
    const tierOk = tier === 'member';
    const totalOk = toNumber(totalAmount) === expectedTotal;
    const discountOk = toNumber(discountAmount) === 0;
    const fullOk = payorType !== 'full' || (toNumber(employerAmount) === expectedTotal && toNumber(memberAmount) === 0);
    const memberOk = payorType !== 'member' || (toNumber(employerAmount) === 0 && toNumber(memberAmount) === expectedTotal);

    const isOk = relOk && tierOk && totalOk && discountOk && fullOk && memberOk;
    if (!isOk) {
      needsBackfill += 1;
      if (sampleIssues.length < 10) {
        sampleIssues.push({
          id: row.id,
          groupId: pickValue(row, ['group_id', 'groupId']),
          relationship,
          tier,
          totalAmount,
          expectedTotal,
          payorType,
        });
      }
    }
  }

  return {
    scanned,
    memberOnlyCandidates,
    needsBackfill,
    sampleIssues,
  };
}

async function verifyDependentZeroing() {
  const { data, error } = await supabase
    .from('group_members')
    .select('*');

  if (error) {
    throw new Error(`Failed to load group_members for dependent zeroing check: ${error.message}`);
  }

  const rows = data || [];
  let dependentRows = 0;
  let nonZeroDependents = 0;
  const sampleIssues = [];

  for (const row of rows) {
    const rowStatus = String(pickValue(row, ['status']) || '').toLowerCase();
    if (rowStatus === 'terminated') {
      continue;
    }

    const relationship = String(pickValue(row, ['relationship', 'relation', 'member_relationship']) || '').toLowerCase();
    const isDependent = relationship === 'spouse' || relationship === 'child' || relationship === 'dependent';
    if (!isDependent) {
      continue;
    }

    dependentRows += 1;
    const hasNonZero =
      toNumber(pickValue(row, ['employer_amount', 'employerAmount'])) !== 0
      || toNumber(pickValue(row, ['member_amount', 'memberAmount'])) !== 0
      || toNumber(pickValue(row, ['discount_amount', 'discountAmount'])) !== 0
      || toNumber(pickValue(row, ['total_amount', 'totalAmount'])) !== 0;

    if (hasNonZero) {
      nonZeroDependents += 1;
      if (sampleIssues.length < 10) {
        sampleIssues.push({
          id: row.id,
          groupId: pickValue(row, ['group_id', 'groupId']),
          relationship,
          employerAmount: pickValue(row, ['employer_amount', 'employerAmount']),
          memberAmount: pickValue(row, ['member_amount', 'memberAmount']),
          discountAmount: pickValue(row, ['discount_amount', 'discountAmount']),
          totalAmount: pickValue(row, ['total_amount', 'totalAmount']),
        });
      }
    }
  }

  return {
    dependentRows,
    nonZeroDependents,
    sampleIssues,
  };
}

async function verifyGroupMetadataBackfill() {
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, metadata, hosted_checkout_status')
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to load groups: ${error.message}`);
  }

  const groups = data || [];
  let needsBackfill = 0;
  const sampleIssues = [];

  for (const group of groups) {
    const metadata = group.metadata && typeof group.metadata === 'object' ? group.metadata : {};
    const assignment = normalizeAssignmentState(metadata);

    const hasAssignmentShape =
      metadata.assignment
      && typeof metadata.assignment === 'object'
      && Object.prototype.hasOwnProperty.call(metadata.assignment, 'currentAssignedAgentId')
      && Object.prototype.hasOwnProperty.call(metadata.assignment, 'originalAssignedAgentId')
      && Object.prototype.hasOwnProperty.call(metadata.assignment, 'reassignmentCount');

    const hasTopLevelFields =
      Object.prototype.hasOwnProperty.call(metadata, 'assignedAgentId')
      && Object.prototype.hasOwnProperty.call(metadata, 'originalAssignedAgentId')
      && Object.prototype.hasOwnProperty.call(metadata, 'reassignmentCount')
      && Object.prototype.hasOwnProperty.call(metadata, 'hasReassignmentHistory');

    const hostedStatusOk = Boolean(group.hosted_checkout_status);
    const assignmentConsistent =
      assignment.currentAssignedAgentId === (metadata.assignedAgentId ?? null)
      && assignment.originalAssignedAgentId === (metadata.originalAssignedAgentId ?? null)
      && assignment.reassignmentCount === (metadata.reassignmentCount ?? 0)
      && assignment.hasReassignmentHistory === Boolean(metadata.hasReassignmentHistory);

    const isOk = hasAssignmentShape && hasTopLevelFields && hostedStatusOk && assignmentConsistent;
    if (!isOk) {
      needsBackfill += 1;
      if (sampleIssues.length < 10) {
        sampleIssues.push({
          id: group.id,
          name: group.name,
          hostedCheckoutStatus: group.hosted_checkout_status,
          hasAssignmentShape,
          hasTopLevelFields,
          assignmentConsistent,
        });
      }
    }
  }

  return {
    totalGroups: groups.length,
    needsBackfill,
    sampleIssues,
  };
}

async function verifyIndividualMembershipSnapshot() {
  const { data, error } = await supabase
    .from('members')
    .select('id, status, is_active, total_monthly_price')
    .limit(50000);

  if (error) {
    return {
      unavailable: true,
      reason: error.message,
    };
  }

  const rows = data || [];
  const activeCount = rows.filter((row) => String(row.status || '').toLowerCase() === 'active').length;
  const activeRevenue = rows.reduce((sum, row) => {
    if (String(row.status || '').toLowerCase() !== 'active') return sum;
    return sum + toNumber(row.total_monthly_price);
  }, 0);

  return {
    unavailable: false,
    totalMembers: rows.length,
    activeCount,
    activeRevenue: Number(activeRevenue.toFixed(2)),
  };
}

async function main() {
  console.log('Verifying recent enrollment backfills (read-only)...');

  const memberOnly = await verifyMemberOnlyBackfill();
  const dependents = await verifyDependentZeroing();
  const groupMetadata = await verifyGroupMetadataBackfill();
  const individualSnapshot = await verifyIndividualMembershipSnapshot();

  console.log('\n=== Member-Only Backfill Check ===');
  console.log(JSON.stringify(memberOnly, null, 2));

  console.log('\n=== Dependent Zeroing Check ===');
  console.log(JSON.stringify(dependents, null, 2));

  console.log('\n=== Group Metadata Backfill Check ===');
  console.log(JSON.stringify(groupMetadata, null, 2));

  console.log('\n=== Individual Membership Snapshot ===');
  console.log(JSON.stringify(individualSnapshot, null, 2));

  const hasIssues =
    memberOnly.needsBackfill > 0
    || dependents.nonZeroDependents > 0
    || groupMetadata.needsBackfill > 0;

  if (hasIssues) {
    console.log('\nVerification result: ACTION NEEDED (backfill gaps detected).');
    process.exitCode = 2;
    return;
  }

  console.log('\nVerification result: OK (no backfill gaps detected by these checks).');
}

main().catch((error) => {
  console.error('Verification failed:', error.message);
  process.exit(1);
});
