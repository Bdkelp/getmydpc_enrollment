#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const VERBOSE = args.has('--verbose');
const INCLUDE_TERMINATED = args.has('--include-terminated');

const normalizeEnvValue = (value) => (value || '').replace(/['"]/g, '').trim();
const supabaseUrl = normalizeEnvValue(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
const supabaseServiceKey = normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY in environment');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: 'public' },
});

const GROUP_COMMISSION_MATRIX = {
  base: { memberOnly: 59 },
  plus: { memberOnly: 99 },
  elite: { memberOnly: 119 },
};

const toObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return { ...value };
};

const toTrimmedOrNull = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
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
    toNumberOrNull(metadataPlanSelection?.pbmAmount)
    ?? toNumberOrNull(metadata?.pbmAmount)
    ?? toNumberOrNull(payloadPlanSelection?.pbmAmount)
    ?? toNumberOrNull(payload?.pbmAmount)
    ?? 0;

  return {
    planName,
    planTier,
    pbmEnabled,
    pbmAmount: Math.max(0, pbmAmount || 0),
    metadata,
    metadataPlanSelection,
    payload,
    payloadPlanSelection,
  };
};

const extractMissingColumnFromError = (error) => {
  const message = typeof error?.message === 'string' ? error.message : '';
  const details = typeof error?.details === 'string' ? error.details : '';
  const source = `${message} ${details}`;
  const explicit = source.match(/Could not find the '([^']+)' column of 'group_members'/i);
  return explicit?.[1] || null;
};

const updateMemberWithFallback = async (memberId, payload) => {
  let nextPayload = { ...payload };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { error } = await supabase
      .from('group_members')
      .update(nextPayload)
      .eq('id', memberId);

    if (!error) {
      return null;
    }

    const missingColumn = extractMissingColumnFromError(error);
    if (!missingColumn || !Object.prototype.hasOwnProperty.call(nextPayload, missingColumn)) {
      return error;
    }

    const fallbackPayload = { ...nextPayload };
    delete fallbackPayload[missingColumn];
    nextPayload = fallbackPayload;
  }

  return new Error('Exceeded retry limit updating group member');
};

async function main() {
  console.log('[Backfill:member-only] Starting...');
  console.log(`[Backfill:member-only] Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);

  const stats = {
    scanned: 0,
    memberOnlyCandidates: 0,
    changed: 0,
    unchanged: 0,
    skipped: 0,
    failed: 0,
  };

  const { data, error } = await supabase
    .from('group_members')
    .select('id, group_id, relationship, tier, payor_type, employer_amount, member_amount, discount_amount, total_amount, status, metadata, registration_payload')
    .order('id', { ascending: true });

  if (error) {
    throw new Error(`Failed to load group members: ${error.message}`);
  }

  const rows = data || [];
  stats.scanned = rows.length;

  for (const row of rows) {
    if (!INCLUDE_TERMINATED && String(row.status || '').toLowerCase() === 'terminated') {
      stats.skipped += 1;
      continue;
    }

    const planInfo = resolvePlanInfo(row);
    if (!planInfo.planName || !isMemberOnlyPlanName(planInfo.planName)) {
      stats.skipped += 1;
      continue;
    }

    stats.memberOnlyCandidates += 1;

    const matrixKey = toPlanTierMatrixKey(planInfo.planTier || derivePlanTierFromName(planInfo.planName));
    const baseAmount = GROUP_COMMISSION_MATRIX[matrixKey].memberOnly;
    const totalAmount = Number((baseAmount + (planInfo.pbmEnabled ? planInfo.pbmAmount : 0)).toFixed(2));

    const nextPayload = {
      relationship: 'primary',
      tier: 'member',
      total_amount: totalAmount,
      discount_amount: 0,
      updated_at: new Date().toISOString(),
    };

    const payorType = String(row.payor_type || '').toLowerCase();
    if (payorType === 'full') {
      nextPayload.employer_amount = totalAmount;
      nextPayload.member_amount = 0;
    } else if (payorType === 'member') {
      nextPayload.employer_amount = 0;
      nextPayload.member_amount = totalAmount;
    }

    const nextMetadata = toObject(planInfo.metadata) || {};
    const nextMetadataPlanSelection = toObject(nextMetadata.planSelection) || {};
    nextMetadata.planSelection = {
      ...nextMetadataPlanSelection,
      planTier: planInfo.planTier || derivePlanTierFromName(planInfo.planName),
    };
    nextMetadata.selectedPlanTier = planInfo.planTier || derivePlanTierFromName(planInfo.planName);

    const nextRegistrationPayload = toObject(planInfo.payload) || {};
    nextRegistrationPayload.relationship = 'primary';
    nextRegistrationPayload.planTier = planInfo.planTier || derivePlanTierFromName(planInfo.planName);
    nextRegistrationPayload.selectedPlanTier = planInfo.planTier || derivePlanTierFromName(planInfo.planName);

    nextPayload.metadata = nextMetadata;
    nextPayload.registration_payload = nextRegistrationPayload;

    const hasChanges =
      String(row.relationship || '').toLowerCase() !== 'primary'
      || String(row.tier || '').toLowerCase() !== 'member'
      || toNumberOrNull(row.total_amount) !== totalAmount
      || toNumberOrNull(row.discount_amount) !== 0
      || JSON.stringify(row.metadata || {}) !== JSON.stringify(nextMetadata)
      || JSON.stringify(row.registration_payload || {}) !== JSON.stringify(nextRegistrationPayload)
      || (payorType === 'full' && (toNumberOrNull(row.employer_amount) !== totalAmount || toNumberOrNull(row.member_amount) !== 0))
      || (payorType === 'member' && (toNumberOrNull(row.employer_amount) !== 0 || toNumberOrNull(row.member_amount) !== totalAmount));

    if (!hasChanges) {
      stats.unchanged += 1;
      continue;
    }

    if (VERBOSE) {
      console.log(`[Backfill:member-only] Member ${row.id} update`, {
        relationship: nextPayload.relationship,
        tier: nextPayload.tier,
        total_amount: nextPayload.total_amount,
        employer_amount: nextPayload.employer_amount,
        member_amount: nextPayload.member_amount,
      });
    }

    if (!APPLY) {
      stats.changed += 1;
      continue;
    }

    const updateError = await updateMemberWithFallback(row.id, nextPayload);
    if (updateError) {
      stats.failed += 1;
      console.error(`[Backfill:member-only] Failed updating member ${row.id}: ${updateError.message}`);
      continue;
    }

    stats.changed += 1;
  }

  console.log('[Backfill:member-only] Done.');
  console.log('[Backfill:member-only] Summary:', stats);
}

main().catch((error) => {
  console.error('[Backfill:member-only] Failed:', error.message);
  process.exit(1);
});
