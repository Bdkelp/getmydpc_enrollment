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

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing Supabase environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const toTrimmedOrNull = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

const normalizeAssignmentState = (metadata) => {
  const assignment = metadata.assignment && typeof metadata.assignment === 'object'
    ? metadata.assignment
    : {};

  const currentAssignedAgentId =
    toTrimmedOrNull(assignment.currentAssignedAgentId) ??
    toTrimmedOrNull(metadata.assignedAgentId) ??
    null;

  const originalAssignedAgentId =
    toTrimmedOrNull(assignment.originalAssignedAgentId) ??
    toTrimmedOrNull(metadata.originalAssignedAgentId) ??
    currentAssignedAgentId;

  const reassignmentCount = toPositiveNumberOrZero(
    assignment.reassignmentCount ?? metadata.reassignmentCount,
  );

  const readOnlyAgentIds = normalizeStringArray(
    assignment.readOnlyAgentIds ?? metadata.readOnlyAgentIds,
  ).filter((agentId) => agentId !== currentAssignedAgentId);

  const hasReassignmentHistory = reassignmentCount > 0;

  return {
    currentAssignedAgentId,
    originalAssignedAgentId,
    readOnlyAgentIds,
    reassignmentCount,
    hasReassignmentHistory,
    lastReassignedAt: toTrimmedOrNull(assignment.lastReassignedAt ?? metadata.lastReassignedAt),
    lastReassignmentEffectiveDate: toTrimmedOrNull(
      assignment.lastReassignmentEffectiveDate ?? metadata.lastReassignmentEffectiveDate,
    ),
    previousAssignedAgentId: toTrimmedOrNull(
      assignment.previousAssignedAgentId ?? metadata.previousAssignedAgentId,
    ),
    previousAgentKeepsReadOnlyAccess:
      typeof assignment.previousAgentKeepsReadOnlyAccess === 'boolean'
        ? assignment.previousAgentKeepsReadOnlyAccess
        : typeof metadata.previousAgentKeepsReadOnlyAccess === 'boolean'
          ? metadata.previousAgentKeepsReadOnlyAccess
          : undefined,
  };
};

const withBackfilledMetadata = (metadata, assignment) => ({
  ...metadata,
  assignedAgentId: assignment.currentAssignedAgentId,
  originalAssignedAgentId: assignment.originalAssignedAgentId,
  readOnlyAgentIds: assignment.readOnlyAgentIds,
  reassignmentCount: assignment.reassignmentCount,
  hasReassignmentHistory: assignment.hasReassignmentHistory,
  ...(assignment.lastReassignedAt ? { lastReassignedAt: assignment.lastReassignedAt } : {}),
  ...(assignment.lastReassignmentEffectiveDate
    ? { lastReassignmentEffectiveDate: assignment.lastReassignmentEffectiveDate }
    : {}),
  ...(assignment.previousAssignedAgentId ? { previousAssignedAgentId: assignment.previousAssignedAgentId } : {}),
  ...(typeof assignment.previousAgentKeepsReadOnlyAccess === 'boolean'
    ? { previousAgentKeepsReadOnlyAccess: assignment.previousAgentKeepsReadOnlyAccess }
    : {}),
  assignment: {
    currentAssignedAgentId: assignment.currentAssignedAgentId,
    originalAssignedAgentId: assignment.originalAssignedAgentId,
    readOnlyAgentIds: assignment.readOnlyAgentIds,
    reassignmentCount: assignment.reassignmentCount,
    hasReassignmentHistory: assignment.hasReassignmentHistory,
    ...(assignment.lastReassignedAt ? { lastReassignedAt: assignment.lastReassignedAt } : {}),
    ...(assignment.lastReassignmentEffectiveDate
      ? { lastReassignmentEffectiveDate: assignment.lastReassignmentEffectiveDate }
      : {}),
    ...(assignment.previousAssignedAgentId ? { previousAssignedAgentId: assignment.previousAssignedAgentId } : {}),
    ...(typeof assignment.previousAgentKeepsReadOnlyAccess === 'boolean'
      ? { previousAgentKeepsReadOnlyAccess: assignment.previousAgentKeepsReadOnlyAccess }
      : {}),
  },
});

async function main() {
  console.log('Starting group enrollment backfill...');

  const { data, error } = await supabase
    .from('groups')
    .select('id, name, status, hosted_checkout_status, metadata')
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to load groups: ${error.message}`);
  }

  const groups = data || [];
  if (groups.length === 0) {
    console.log('No groups found. Nothing to backfill.');
    return;
  }

  let updatedCount = 0;

  for (const group of groups) {
    const metadata = group.metadata && typeof group.metadata === 'object'
      ? { ...group.metadata }
      : {};

    const assignment = normalizeAssignmentState(metadata);
    const nextMetadata = withBackfilledMetadata(metadata, assignment);
    const nextHostedCheckoutStatus = group.hosted_checkout_status || 'not-started';

    const metadataChanged = JSON.stringify(metadata) !== JSON.stringify(nextMetadata);
    const hostedStatusChanged = nextHostedCheckoutStatus !== group.hosted_checkout_status;

    if (!metadataChanged && !hostedStatusChanged) {
      continue;
    }

    const { error: updateError } = await supabase
      .from('groups')
      .update({
        metadata: nextMetadata,
        hosted_checkout_status: nextHostedCheckoutStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', group.id);

    if (updateError) {
      throw new Error(`Failed to update group ${group.id} (${group.name}): ${updateError.message}`);
    }

    updatedCount += 1;
    console.log(`Backfilled: ${group.name} (${group.id})`);
  }

  console.log(`Backfill complete. Updated ${updatedCount} of ${groups.length} group(s).`);
}

main().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
