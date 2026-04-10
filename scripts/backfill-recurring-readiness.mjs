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

const args = process.argv.slice(2);
const applyMode = args.includes('--apply');
const dryRun = !applyMode;

const limitArg = args.find((arg) => arg.startsWith('--limit='));
const scanLimit = limitArg ? Math.max(1, parseInt(limitArg.split('=')[1], 10)) : null;

const BILLING_READY_SUBSCRIPTION_STATUSES = ['active'];

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function isSameLocalDate(first, second) {
  return first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate();
}

function nthWeekdayOfMonth(year, month, weekday, nth) {
  const first = new Date(year, month, 1);
  const firstWeekdayOffset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + firstWeekdayOffset + (nth - 1) * 7);
}

function lastWeekdayOfMonth(year, month, weekday) {
  const last = new Date(year, month + 1, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month, last.getDate() - offset);
}

function observedHoliday(actualDate) {
  const day = actualDate.getDay();
  if (day === 6) return addDays(actualDate, -1);
  if (day === 0) return addDays(actualDate, 1);
  return actualDate;
}

function getObservedUsBankHolidays(year) {
  const holidays = [
    observedHoliday(new Date(year, 0, 1)),
    nthWeekdayOfMonth(year, 0, 1, 3),
    nthWeekdayOfMonth(year, 1, 1, 3),
    lastWeekdayOfMonth(year, 4, 1),
    observedHoliday(new Date(year, 5, 19)),
    observedHoliday(new Date(year, 6, 4)),
    nthWeekdayOfMonth(year, 8, 1, 1),
    nthWeekdayOfMonth(year, 9, 1, 2),
    observedHoliday(new Date(year, 10, 11)),
    nthWeekdayOfMonth(year, 10, 4, 4),
    observedHoliday(new Date(year, 11, 25)),
  ];
  return holidays.map(startOfLocalDay);
}

function isUsBankHoliday(date) {
  const year = date.getFullYear();
  const holidays = getObservedUsBankHolidays(year);
  return holidays.some((holiday) => isSameLocalDate(holiday, date));
}

function shiftToPreviousBusinessDay(date) {
  let current = startOfLocalDay(date);
  while (isUsBankHoliday(current) || isWeekend(current)) {
    current = addDays(current, -1);
  }
  return current;
}

function adjustAnchorForBusinessCalendar(anchor) {
  const day = anchor.getDay();
  if (day === 6) return shiftToPreviousBusinessDay(addDays(anchor, -1));
  if (day === 0) return shiftToPreviousBusinessDay(addDays(anchor, -1));
  if (isUsBankHoliday(anchor)) return shiftToPreviousBusinessDay(addDays(anchor, -1));
  return startOfLocalDay(anchor);
}

function getNextBillingAnchorDate(afterDate) {
  const baseline = startOfLocalDay(afterDate);
  const billingAnchorDays = [1, 15];

  for (let monthOffset = 0; monthOffset < 24; monthOffset += 1) {
    const monthStart = new Date(baseline.getFullYear(), baseline.getMonth() + monthOffset, 1);
    for (const anchorDay of billingAnchorDays) {
      const anchor = new Date(monthStart.getFullYear(), monthStart.getMonth(), anchorDay);
      if (anchor <= baseline) continue;
      return anchor;
    }
  }

  return new Date(baseline.getFullYear(), baseline.getMonth() + 1, billingAnchorDays[0]);
}

function calculateNextBillingDate(billingDate) {
  const nextAnchor = getNextBillingAnchorDate(billingDate);
  return adjustAnchorForBusinessCalendar(nextAnchor);
}

function toTrimmedOrNull(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeEmail(value) {
  const trimmed = toTrimmedOrNull(value);
  return trimmed ? trimmed.toLowerCase() : null;
}

function resolveGroupBillingContact(groupRow) {
  const metadata = (groupRow && typeof groupRow.metadata === 'object' && groupRow.metadata) || {};
  const groupProfile = (metadata.groupProfile && typeof metadata.groupProfile === 'object' && metadata.groupProfile) || {};

  const responsibleEmail = normalizeEmail(groupProfile?.responsiblePerson?.email);
  if (responsibleEmail) {
    return {
      email: responsibleEmail,
      source: 'responsible_person',
      resolved: true,
    };
  }

  const contactEmail = normalizeEmail(groupProfile?.contactPerson?.email);
  if (contactEmail) {
    return {
      email: contactEmail,
      source: 'contact_person',
      resolved: true,
    };
  }

  return {
    email: null,
    source: null,
    resolved: false,
  };
}

function dateValueOrNull(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isoOrNull(date) {
  if (!date) return null;
  try {
    return date.toISOString();
  } catch {
    return null;
  }
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function incrementReason(counter, reason) {
  counter[reason] = (counter[reason] || 0) + 1;
}

async function loadBillingReadySubscriptions(limit) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('subscriptions')
      .select('id, member_id, status, amount, start_date, next_billing_date, created_at, updated_at')
      .in('status', BILLING_READY_SUBSCRIPTION_STATUSES)
      .order('id', { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Failed loading billing-ready subscriptions: ${error.message}`);
    }

    const page = Array.isArray(data) ? data : [];
    rows.push(...page);

    if (limit && rows.length >= limit) {
      return rows.slice(0, limit);
    }

    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function loadMembers(memberIds) {
  const result = new Map();
  for (const ids of chunk(memberIds, 500)) {
    const { data, error } = await supabase
      .from('members')
      .select('id, email, first_name, last_name, enrollment_date, membership_start_date, first_payment_date')
      .in('id', ids);

    if (error) {
      throw new Error(`Failed loading members: ${error.message}`);
    }

    for (const row of data || []) {
      result.set(Number(row.id), row);
    }
  }
  return result;
}

function selectBestToken(tokens) {
  return [...tokens]
    .sort((a, b) => {
      const apri = a.is_primary ? 1 : 0;
      const bpri = b.is_primary ? 1 : 0;
      if (apri !== bpri) return bpri - apri;
      const alast = dateValueOrNull(a.last_used_at || a.created_at)?.getTime() || 0;
      const blast = dateValueOrNull(b.last_used_at || b.created_at)?.getTime() || 0;
      if (alast !== blast) return blast - alast;
      return Number(b.id || 0) - Number(a.id || 0);
    })[0];
}

async function loadTokens(memberIds) {
  const byMember = new Map();

  for (const ids of chunk(memberIds, 500)) {
    const { data, error } = await supabase
      .from('payment_tokens')
      .select('id, member_id, is_active, is_primary, payment_method_type, created_at, last_used_at')
      .in('member_id', ids)
      .eq('is_active', true)
      .in('payment_method_type', ['CreditCard', 'ACH']);

    if (error) {
      throw new Error(`Failed loading active payment tokens: ${error.message}`);
    }

    for (const row of data || []) {
      const memberId = Number(row.member_id);
      const list = byMember.get(memberId) || [];
      list.push(row);
      byMember.set(memberId, list);
    }
  }

  const selected = new Map();
  for (const [memberId, tokens] of byMember.entries()) {
    const best = selectBestToken(tokens);
    if (best) selected.set(memberId, best);
  }
  return selected;
}

async function loadGroupMemberships(memberIds) {
  const groupMembershipsByMember = new Map();
  const groupIds = new Set();

  for (const ids of chunk(memberIds, 500)) {
    const { data, error } = await supabase
      .from('group_members')
      .select('id, member_id, group_id, payor_type, status, updated_at')
      .in('member_id', ids);

    if (error) {
      throw new Error(`Failed loading group_members: ${error.message}`);
    }

    for (const row of data || []) {
      const status = String(row.status || '').toLowerCase();
      if (status === 'terminated') continue;
      const memberId = Number(row.member_id);
      const list = groupMembershipsByMember.get(memberId) || [];
      list.push(row);
      groupMembershipsByMember.set(memberId, list);
      if (row.group_id !== null && row.group_id !== undefined) {
        groupIds.add(String(row.group_id));
      }
    }
  }

  return { groupMembershipsByMember, groupIds: [...groupIds] };
}

async function loadGroups(groupIds) {
  const groupsById = new Map();

  for (const ids of chunk(groupIds, 500)) {
    const { data, error } = await supabase
      .from('groups')
      .select('id, name, payor_type, metadata')
      .in('id', ids);

    if (error) {
      throw new Error(`Failed loading groups: ${error.message}`);
    }

    for (const row of data || []) {
      groupsById.set(String(row.id), row);
    }
  }

  return groupsById;
}

function getEffectivePayorMode(groupMemberRow, groupRow) {
  const gmPayorType = String(groupMemberRow?.payor_type || '').trim().toLowerCase();
  const groupPayorType = String(groupRow?.payor_type || '').trim().toLowerCase();
  const resolved = gmPayorType || groupPayorType;
  return resolved === 'full' ? 'full' : 'member';
}

async function loadLatestSuccessfulPaymentsBySubscription(subscriptionIds) {
  const paymentStatusSuccess = ['succeeded', 'success', 'paid', 'completed'];
  const latestBySubscription = new Map();
  const latestByMember = new Map();

  for (const ids of chunk(subscriptionIds.map((id) => String(id)), 200)) {
    const { data, error } = await supabase
      .from('payments')
      .select('id, member_id, subscription_id, status, payment_date, created_at')
      .in('subscription_id', ids)
      .in('status', paymentStatusSuccess)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed loading payments by subscription: ${error.message}`);
    }

    for (const row of data || []) {
      const subscriptionId = row.subscription_id === null || row.subscription_id === undefined
        ? null
        : Number(row.subscription_id);
      const memberId = row.member_id === null || row.member_id === undefined
        ? null
        : Number(row.member_id);
      const date = dateValueOrNull(row.payment_date || row.created_at);
      if (!date) continue;

      if (subscriptionId !== null) {
        const prev = latestBySubscription.get(subscriptionId);
        if (!prev || date > prev) latestBySubscription.set(subscriptionId, date);
      }
      if (memberId !== null) {
        const prev = latestByMember.get(memberId);
        if (!prev || date > prev) latestByMember.set(memberId, date);
      }
    }
  }

  return { latestBySubscription, latestByMember };
}

function resolvePayerContext({ subscription, member, groupMemberships, groupsById }) {
  const fullPayerCandidates = [];

  for (const gm of groupMemberships) {
    const groupId = String(gm.group_id);
    const group = groupsById.get(groupId);
    if (!group) {
      fullPayerCandidates.push({ gm, group: null, missingGroup: true });
      continue;
    }

    const mode = getEffectivePayorMode(gm, group);
    if (mode === 'full') {
      fullPayerCandidates.push({ gm, group, missingGroup: false });
    }
  }

  const uniqueFullGroupIds = [...new Set(fullPayerCandidates.map((c) => String(c.gm.group_id)))];

  if (uniqueFullGroupIds.length > 1) {
    return { errorReason: 'ambiguous_payer_mapping' };
  }

  if (uniqueFullGroupIds.length === 1) {
    const selected = fullPayerCandidates.find((candidate) => String(candidate.gm.group_id) === uniqueFullGroupIds[0]);
    if (!selected || selected.missingGroup || !selected.group) {
      return { errorReason: 'missing_required_group_linkage' };
    }

    const groupContact = resolveGroupBillingContact(selected.group);
    if (!groupContact.resolved || !groupContact.email) {
      return { errorReason: 'missing_group_contact' };
    }

    return {
      payerType: 'group',
      payerId: String(selected.group.id),
      groupId: String(selected.group.id),
      groupName: selected.group.name || null,
      billingContactEmail: groupContact.email,
      billingContactSource: groupContact.source,
    };
  }

  const memberEmail = normalizeEmail(member?.email);
  if (!memberEmail) {
    return { errorReason: 'missing_member_billing_contact' };
  }

  return {
    payerType: 'member',
    payerId: String(subscription.member_id),
    groupId: null,
    groupName: null,
    billingContactEmail: memberEmail,
    billingContactSource: 'member_email',
  };
}

function deriveNextBillingDate({ subscription, latestBySubscription, latestByMember }) {
  const existing = dateValueOrNull(subscription.next_billing_date);
  if (existing) {
    return {
      needsUpdate: false,
      existingNextBillingDate: existing,
      derivedNextBillingDate: existing,
      derivedFrom: 'existing_next_billing_date',
    };
  }

  const subscriptionId = Number(subscription.id);
  const memberId = Number(subscription.member_id);
  const sourcePaymentDate = latestBySubscription.get(subscriptionId) || latestByMember.get(memberId) || null;

  if (!sourcePaymentDate) {
    return {
      needsUpdate: false,
      errorReason: 'missing_next_billing_date_and_no_successful_payment_history',
    };
  }

  const derived = calculateNextBillingDate(sourcePaymentDate);
  const derivedIso = isoOrNull(derived);
  if (!derivedIso) {
    return {
      needsUpdate: false,
      errorReason: 'unable_to_derive_next_billing_date',
    };
  }

  return {
    needsUpdate: true,
    existingNextBillingDate: null,
    derivedNextBillingDate: derived,
    derivedNextBillingDateIso: derivedIso,
    sourcePaymentDate,
    derivedFrom: latestBySubscription.get(subscriptionId)
      ? 'latest_successful_payment_for_subscription'
      : 'latest_successful_payment_for_member',
  };
}

async function run() {
  const startedAt = new Date();
  const billingReadySubscriptions = await loadBillingReadySubscriptions(scanLimit);

  const scanned = billingReadySubscriptions.length;
  const memberIds = [...new Set(billingReadySubscriptions.map((sub) => Number(sub.member_id)).filter((id) => Number.isFinite(id)) )];

  const [membersById, selectedTokenByMember, groupData, paymentData] = await Promise.all([
    loadMembers(memberIds),
    loadTokens(memberIds),
    loadGroupMemberships(memberIds),
    loadLatestSuccessfulPaymentsBySubscription(billingReadySubscriptions.map((sub) => Number(sub.id))),
  ]);

  const groupsById = await loadGroups(groupData.groupIds);

  const summary = {
    totalScanned: scanned,
    totalUpdated: 0,
    totalSkipped: 0,
    totalAlreadyReady: 0,
    skipReasonsByCategory: {},
    selfPayReadyCount: 0,
    groupPayReadyCount: 0,
  };

  const sampleUpdatedRows = [];
  const manualCleanupRecords = [];

  for (const subscription of billingReadySubscriptions) {
    const subscriptionId = Number(subscription.id);
    const memberId = Number(subscription.member_id);

    if (!Number.isFinite(memberId)) {
      summary.totalSkipped += 1;
      incrementReason(summary.skipReasonsByCategory, 'missing_required_member_linkage');
      manualCleanupRecords.push({
        subscriptionId,
        memberId: subscription.member_id,
        reason: 'missing_required_member_linkage',
      });
      continue;
    }

    const member = membersById.get(memberId);
    if (!member) {
      summary.totalSkipped += 1;
      incrementReason(summary.skipReasonsByCategory, 'missing_member_record');
      manualCleanupRecords.push({
        subscriptionId,
        memberId,
        reason: 'missing_member_record',
      });
      continue;
    }

    const token = selectedTokenByMember.get(memberId);
    if (!token) {
      summary.totalSkipped += 1;
      incrementReason(summary.skipReasonsByCategory, 'missing_active_payment_token');
      manualCleanupRecords.push({
        subscriptionId,
        memberId,
        reason: 'missing_active_payment_token',
      });
      continue;
    }

    const groupMemberships = groupData.groupMembershipsByMember.get(memberId) || [];
    const payerContext = resolvePayerContext({
      subscription,
      member,
      groupMemberships,
      groupsById,
    });

    if (payerContext.errorReason) {
      summary.totalSkipped += 1;
      incrementReason(summary.skipReasonsByCategory, payerContext.errorReason);
      manualCleanupRecords.push({
        subscriptionId,
        memberId,
        reason: payerContext.errorReason,
      });
      continue;
    }

    const derived = deriveNextBillingDate({
      subscription,
      latestBySubscription: paymentData.latestBySubscription,
      latestByMember: paymentData.latestByMember,
    });

    if (derived.errorReason) {
      summary.totalSkipped += 1;
      incrementReason(summary.skipReasonsByCategory, derived.errorReason);
      manualCleanupRecords.push({
        subscriptionId,
        memberId,
        payerType: payerContext.payerType,
        payerId: payerContext.payerId,
        reason: derived.errorReason,
      });
      continue;
    }

    if (!derived.needsUpdate) {
      summary.totalAlreadyReady += 1;
      if (payerContext.payerType === 'group') summary.groupPayReadyCount += 1;
      else summary.selfPayReadyCount += 1;
      continue;
    }

    let updated = false;
    let updateError = null;

    if (!dryRun) {
      const { data, error } = await supabase
        .from('subscriptions')
        .update({
          next_billing_date: derived.derivedNextBillingDateIso,
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscriptionId)
        .is('next_billing_date', null)
        .select('id, next_billing_date')
        .single();

      if (error) {
        updated = false;
        updateError = error.message;
      } else if (data?.next_billing_date) {
        updated = true;
      }
    } else {
      updated = true;
    }

    if (!updated) {
      summary.totalSkipped += 1;
      incrementReason(summary.skipReasonsByCategory, 'apply_update_failed_or_conflicted');
      manualCleanupRecords.push({
        subscriptionId,
        memberId,
        payerType: payerContext.payerType,
        payerId: payerContext.payerId,
        reason: 'apply_update_failed_or_conflicted',
        details: updateError,
      });
      continue;
    }

    summary.totalUpdated += 1;
    if (payerContext.payerType === 'group') summary.groupPayReadyCount += 1;
    else summary.selfPayReadyCount += 1;

    if (sampleUpdatedRows.length < 50) {
      sampleUpdatedRows.push({
        subscriptionId,
        memberId,
        payerType: payerContext.payerType,
        payerId: payerContext.payerId,
        groupId: payerContext.groupId,
        billingContactTarget: payerContext.billingContactEmail,
        billingContactSource: payerContext.billingContactSource,
        paymentTokenId: Number(token.id),
        paymentMethodType: token.payment_method_type,
        previousNextBillingDate: subscription.next_billing_date || null,
        repairedNextBillingDate: derived.derivedNextBillingDateIso,
        derivedFrom: derived.derivedFrom,
        sourcePaymentDate: isoOrNull(derived.sourcePaymentDate || null),
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    runMode: dryRun ? 'dry-run' : 'apply',
    notes: [
      'Recurring readiness backfill only: no payment records, recurring billing charge logs, or payouts are created by this script.',
      'Only subscriptions.next_billing_date is repaired (when null and derivable from successful payment history).',
      `Billing-ready subscription statuses included in scan: ${BILLING_READY_SUBSCRIPTION_STATUSES.join(', ')}.`,
      'Payer context and billing contact are derived/validated using current selector business rules.',
      'Script is idempotent: reruns do not duplicate records and only attempt null next_billing_date repairs.',
    ],
    summary,
    sampleUpdatedRows,
    manualCleanupRecords,
    scannedWindow: {
      requestedLimit: scanLimit,
      scannedCount: scanned,
    },
    durationMs: Date.now() - startedAt.getTime(),
  };

  const outDir = path.join(cwd, 'tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'backfill-recurring-readiness-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('\nRecurring Readiness Backfill');
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`Scanned: ${summary.totalScanned}`);
  console.log(`Updated: ${summary.totalUpdated}`);
  console.log(`Already ready: ${summary.totalAlreadyReady}`);
  console.log(`Skipped: ${summary.totalSkipped}`);
  console.log(`Self-pay ready rows: ${summary.selfPayReadyCount}`);
  console.log(`Group-pay ready rows: ${summary.groupPayReadyCount}`);
  console.log(`Report: ${outPath}`);

  if (summary.totalSkipped > 0) {
    console.log('Skip reasons:', JSON.stringify(summary.skipReasonsByCategory, null, 2));
  }
}

run().catch((error) => {
  console.error('Recurring readiness backfill failed:', error?.message || error);
  process.exit(1);
});
