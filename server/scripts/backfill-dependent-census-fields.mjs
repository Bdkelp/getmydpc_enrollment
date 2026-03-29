#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const INCLUDE_TERMINATED = args.has('--include-terminated');
const VERBOSE = args.has('--verbose');

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

const normalizeDateOfBirth = (value) => {
  const normalized = toTrimmedOrNull(value);
  if (!normalized) {
    return null;
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(normalized)) {
    const [monthRaw, dayRaw, yearRaw] = normalized.split('/');
    const month = monthRaw.padStart(2, '0');
    const day = dayRaw.padStart(2, '0');
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
    if (/^\d{4}$/.test(year)) {
      return `${month}${day}${year}`;
    }
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const [year, month, day] = normalized.split('-');
    return `${month}${day}${year}`;
  }

  const parsedDate = new Date(normalized);
  if (!Number.isNaN(parsedDate.getTime())) {
    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const day = String(parsedDate.getDate()).padStart(2, '0');
    const year = String(parsedDate.getFullYear());
    return `${month}${day}${year}`;
  }

  const digits = normalized.replace(/\D/g, '');
  if (/^\d{8}$/.test(digits)) {
    return digits;
  }

  return null;
};

const normalizeMemberRelationship = (value, fallbackTier) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'primary' || normalized === 'spouse' || normalized === 'dependent') {
      return normalized;
    }
    if (normalized === 'child') {
      return 'dependent';
    }
    if (
      normalized === 'employee'
      || normalized === 'member'
      || normalized === 'self'
      || normalized === 'subscriber'
    ) {
      return 'primary';
    }
  }

  const normalizedTier = typeof fallbackTier === 'string' ? fallbackTier.trim().toLowerCase() : '';
  if (normalizedTier === 'spouse') return 'spouse';
  if (normalizedTier === 'child') return 'dependent';
  return 'primary';
};

const relationshipToTier = (relationship) => {
  if (relationship === 'spouse') return 'spouse';
  if (relationship === 'dependent') return 'child';
  return 'member';
};

const getPayloadValue = (payload, keys) => {
  if (!payload) {
    return null;
  }

  for (const key of keys) {
    const direct = toTrimmedOrNull(payload[key]);
    if (direct) return direct;

    const normalizedTarget = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
    for (const [payloadKey, payloadValue] of Object.entries(payload)) {
      const normalizedPayloadKey = payloadKey.replace(/[^a-z0-9]/gi, '').toLowerCase();
      if (normalizedPayloadKey === normalizedTarget) {
        const matchValue = toTrimmedOrNull(payloadValue);
        if (matchValue) return matchValue;
      }
    }
  }

  return null;
};

const deriveDependentSex = (row) => {
  const metadata = toObject(row.metadata);
  const metadataEmployment = toObject(metadata?.employmentProfile);
  const payload = toObject(row.registration_payload);
  const payloadEmployment = toObject(payload?.employmentProfile);

  return (
    toTrimmedOrNull(metadataEmployment?.sex)
    || toTrimmedOrNull(metadataEmployment?.gender)
    || toTrimmedOrNull(payloadEmployment?.sex)
    || toTrimmedOrNull(payloadEmployment?.gender)
    || getPayloadValue(payload, ['sex', 'gender'])
  );
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
  console.log('[Backfill] Starting dependent census backfill...');
  console.log(`[Backfill] Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);

  const stats = {
    scanned: 0,
    dependentCandidates: 0,
    changed: 0,
    unchanged: 0,
    skipped: 0,
    failed: 0,
  };

  const { data, error } = await supabase
    .from('group_members')
    .select('*')
    .order('id', { ascending: true });

  if (error) {
    throw new Error(`Failed to load group members: ${error.message}`);
  }

  const rows = data || [];
  stats.scanned = rows.length;

  const relationshipProbe = await supabase
    .from('group_members')
    .select('id,relationship')
    .limit(1);

  const supportsRelationshipColumn = !relationshipProbe.error;
  if (!supportsRelationshipColumn) {
    console.warn('[Backfill] relationship column unavailable in this environment; skipping direct relationship writes.');
  }

  for (const row of rows) {
    const normalizedRelationship = normalizeMemberRelationship(row.relationship, row.tier);
    if (normalizedRelationship === 'primary') {
      stats.skipped += 1;
      continue;
    }

    if (!INCLUDE_TERMINATED && String(row.status || '').toLowerCase() === 'terminated') {
      stats.skipped += 1;
      continue;
    }

    stats.dependentCandidates += 1;

    const payload = toObject(row.registration_payload);
    const payloadRelationship = getPayloadValue(payload, [
      'relationship',
      'memberRelationship',
      'dependentRelationship',
      'dependent_relation',
      'member_relation',
    ]);

    const nextRelationship = normalizeMemberRelationship(payloadRelationship || row.relationship, row.tier);
    const currentTier = toTrimmedOrNull(row.tier)?.toLowerCase() || '';
    const nextTier = relationshipToTier(nextRelationship);
    const nextFirstName = toTrimmedOrNull(row.first_name) || getPayloadValue(payload, [
      'firstName', 'first_name', 'firstname', 'givenName', 'memberFirstName', 'employeeFirstName',
    ]);
    const nextLastName = toTrimmedOrNull(row.last_name) || getPayloadValue(payload, [
      'lastName', 'last_name', 'lastname', 'surname', 'familyName', 'memberLastName', 'employeeLastName',
    ]);
    const nextDateOfBirth = normalizeDateOfBirth(row.date_of_birth)
      || normalizeDateOfBirth(getPayloadValue(payload, ['dateOfBirth', 'date_of_birth', 'dob']));
    const nextSex = deriveDependentSex(row);

    const metadata = toObject(row.metadata) || {};
    const existingEmployment = toObject(metadata.employmentProfile) || {};

    const shouldSetSex = !toTrimmedOrNull(existingEmployment.sex) && Boolean(nextSex);
    const shouldSetGender = !toTrimmedOrNull(existingEmployment.gender) && Boolean(nextSex);

    const changes = {};

    if (supportsRelationshipColumn && toTrimmedOrNull(row.relationship) !== nextRelationship) {
      changes.relationship = nextRelationship;
    }

    if (nextTier && currentTier !== nextTier) {
      changes.tier = nextTier;
    }

    if (!toTrimmedOrNull(row.first_name) && nextFirstName) {
      changes.first_name = nextFirstName;
    }

    if (!toTrimmedOrNull(row.last_name) && nextLastName) {
      changes.last_name = nextLastName;
    }

    if (!normalizeDateOfBirth(row.date_of_birth) && nextDateOfBirth) {
      changes.date_of_birth = nextDateOfBirth;
    }

    if (shouldSetSex || shouldSetGender) {
      const nextEmployment = {
        ...existingEmployment,
        ...(shouldSetSex ? { sex: nextSex } : {}),
        ...(shouldSetGender ? { gender: nextSex } : {}),
      };

      changes.metadata = {
        ...metadata,
        employmentProfile: nextEmployment,
      };
    }

    if (Object.keys(changes).length === 0) {
      stats.unchanged += 1;
      continue;
    }

    changes.updated_at = new Date().toISOString();

    if (VERBOSE) {
      console.log(`[Backfill] Member ${row.id} changes:`, changes);
    }

    if (!APPLY) {
      stats.changed += 1;
      continue;
    }

    const updateError = await updateMemberWithFallback(row.id, changes);

    if (updateError) {
      stats.failed += 1;
      console.error(`[Backfill] Failed to update member ${row.id}: ${updateError.message}`);
      continue;
    }

    stats.changed += 1;
  }

  console.log('[Backfill] Done.');
  console.log('[Backfill] Summary:', stats);

  if (!APPLY) {
    console.log('[Backfill] DRY RUN ONLY. Re-run with --apply to persist changes.');
  }

  if (stats.failed > 0) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error('[Backfill] Failed:', error?.message || error);
  process.exit(1);
});
