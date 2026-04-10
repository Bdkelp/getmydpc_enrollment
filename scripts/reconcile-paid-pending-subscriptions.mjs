#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const applyChanges = args.includes('--apply');

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

const normalize = (v) => String(v || '').replace(/["']/g, '').trim();
const supabaseUrl = normalize(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
const supabaseServiceKey = normalize(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: 'public' },
});

const SUCCESS_STATUSES = ['succeeded', 'success', 'completed'];

function safeLower(value) {
  return String(value || '').trim().toLowerCase();
}

function hasBricTokenInMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return false;
  const hostedCallback = metadata.hostedCallback;
  if (hostedCallback && typeof hostedCallback === 'object') {
    return Boolean(hostedCallback.hasBricToken === true);
  }
  return false;
}

function toObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

function normalizeEmail(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) return null;
  return normalized;
}

function resolveGroupBillingContact(groupRow) {
  const metadata = toObject(groupRow?.metadata) || {};
  const groupProfile = toObject(metadata.groupProfile) || {};
  const responsiblePerson = toObject(groupProfile.responsiblePerson) || {};
  const contactPerson = toObject(groupProfile.contactPerson) || {};

  const responsibleEmail = normalizeEmail(responsiblePerson.email);
  if (responsibleEmail) {
    return {
      resolved: true,
      source: 'responsible_person',
      email: responsibleEmail,
    };
  }

  const contactEmail = normalizeEmail(contactPerson.email);
  if (contactEmail) {
    return {
      resolved: true,
      source: 'contact_person',
      email: contactEmail,
    };
  }

  return {
    resolved: false,
    source: null,
    email: null,
  };
}

function getEffectivePayorMode(groupMemberRow, groupRow) {
  const memberPayorType = String(groupMemberRow?.payor_type || '').trim().toLowerCase();
  const groupPayorType = String(groupRow?.payor_type || '').trim().toLowerCase();
  const resolved = memberPayorType || groupPayorType;
  return resolved === 'full' ? 'full' : 'member';
}

function incrementReason(counter, reason) {
  const key = String(reason || 'unknown_reason');
  counter[key] = (counter[key] || 0) + 1;
}

function extractGroupIdFromPaymentMetadata(metadata) {
  const root = toObject(metadata);
  if (!root) return null;

  const groupPaymentContext = toObject(root.groupPaymentContext);
  const groupInvoiceContext = toObject(root.groupInvoiceContext);

  const groupId = groupPaymentContext?.groupId || groupInvoiceContext?.groupId || null;
  if (groupId === null || groupId === undefined) return null;
  return String(groupId);
}

function computeNextBillingDateIso() {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
}

async function run() {
  const { data: pendingSubs, error: subError } = await supabase
    .from('subscriptions')
    .select('id, member_id, status, created_at, next_billing_date, plan_id')
    .eq('status', 'pending_payment')
    .order('created_at', { ascending: false });

  if (subError) {
    throw new Error(`Failed loading pending subscriptions: ${subError.message}`);
  }

  const rows = pendingSubs || [];
  const memberIds = Array.from(new Set(rows.map((r) => Number(r.member_id)).filter((v) => Number.isFinite(v) && v > 0)));

  const { data: members, error: memberError } = await supabase
    .from('members')
    .select('id, status, payment_token, payment_method_type, first_payment_date')
    .in('id', memberIds);

  if (memberError) {
    throw new Error(`Failed loading members: ${memberError.message}`);
  }

  const memberById = new Map((members || []).map((m) => [Number(m.id), m]));

  const { data: groupMembershipRows, error: groupMembershipError } = await supabase
    .from('group_members')
    .select('id, member_id, group_id, payor_type, status, updated_at')
    .in('member_id', memberIds);

  if (groupMembershipError) {
    throw new Error(`Failed loading group_members: ${groupMembershipError.message}`);
  }

  const groupMembershipsByMember = new Map();
  const groupIds = new Set();

  for (const row of groupMembershipRows || []) {
    const memberId = Number(row.member_id);
    if (!Number.isFinite(memberId) || memberId <= 0) continue;
    const status = String(row.status || '').toLowerCase();
    if (status === 'terminated') continue;
    const list = groupMembershipsByMember.get(memberId) || [];
    list.push(row);
    groupMembershipsByMember.set(memberId, list);
    if (row.group_id !== null && row.group_id !== undefined) {
      groupIds.add(String(row.group_id));
    }
  }

  let groupsById = new Map();
  if (groupIds.size > 0) {
    const { data: groups, error: groupsError } = await supabase
      .from('groups')
      .select('id, name, payor_type, metadata')
      .in('id', [...groupIds]);

    if (groupsError) {
      throw new Error(`Failed loading groups: ${groupsError.message}`);
    }

    groupsById = new Map((groups || []).map((groupRow) => [String(groupRow.id), groupRow]));
  }

  const { data: payments, error: paymentError } = await supabase
    .from('payments')
    .select('id, member_id, subscription_id, status, transaction_id, created_at, metadata')
    .in('member_id', memberIds)
    .order('created_at', { ascending: false });

  if (paymentError) {
    throw new Error(`Failed loading payments: ${paymentError.message}`);
  }

  const paymentsByMember = new Map();
  for (const payment of payments || []) {
    const memberId = Number(payment.member_id);
    if (!Number.isFinite(memberId) || memberId <= 0) continue;
    if (!paymentsByMember.has(memberId)) paymentsByMember.set(memberId, []);
    paymentsByMember.get(memberId).push(payment);
  }

  let updatedSubscriptions = 0;
  let linkedPayments = 0;

  let nonGroupPendingSubscriptions = 0;
  let groupLinkedPendingSubscriptions = 0;
  let nonGroupEligible = 0;
  let groupEligible = 0;
  let nonGroupPromoted = 0;
  let groupPromoted = 0;

  const skipReasons = {};

  const safeCandidates = [];
  const manualReview = [];

  for (const sub of rows) {
    const memberId = Number(sub.member_id);
    const member = memberById.get(memberId) || null;
    const memberPayments = paymentsByMember.get(memberId) || [];
    const successfulPayments = memberPayments.filter((payment) => SUCCESS_STATUSES.includes(safeLower(payment.status)));

    const groupMemberships = groupMembershipsByMember.get(memberId) || [];
    const fullPayerMemberships = [];

    for (const membership of groupMemberships) {
      const groupId = String(membership.group_id || '');
      if (!groupId) continue;
      const group = groupsById.get(groupId) || null;
      if (!group) {
        fullPayerMemberships.push({ membership, group: null, missingGroup: true });
        continue;
      }

      const payorMode = getEffectivePayorMode(membership, group);
      if (payorMode === 'full') {
        fullPayerMemberships.push({ membership, group, missingGroup: false });
      }
    }

    const uniqueFullGroupIds = [...new Set(fullPayerMemberships.map((entry) => String(entry.membership.group_id)))];
    const isGroupLinked = uniqueFullGroupIds.length === 1;
    const hasAmbiguousGroupLinkage = uniqueFullGroupIds.length > 1;

    if (isGroupLinked) groupLinkedPendingSubscriptions += 1;
    else nonGroupPendingSubscriptions += 1;

    const groupLink = isGroupLinked
      ? fullPayerMemberships.find((entry) => String(entry.membership.group_id) === uniqueFullGroupIds[0]) || null
      : null;

    const resolvedGroupId = groupLink ? String(groupLink.membership.group_id) : null;
    const groupContact = groupLink?.group ? resolveGroupBillingContact(groupLink.group) : { resolved: false, source: null, email: null };

    const successfulLinkedPayment = successfulPayments.find((payment) => {
      if (payment.subscription_id == null) return false;
      return String(payment.subscription_id) === String(sub.id);
    });

    const successfulUnlinkedPayment = successfulPayments.find((payment) => payment.subscription_id == null);

    const successfulGroupPayments = resolvedGroupId
      ? successfulPayments.filter((payment) => extractGroupIdFromPaymentMetadata(payment.metadata) === resolvedGroupId)
      : [];

    const successfulLinkedGroupPayment = resolvedGroupId
      ? successfulGroupPayments.find((payment) => String(payment.subscription_id || '') === String(sub.id)) || null
      : null;

    const successfulUnlinkedGroupPayment = resolvedGroupId
      ? successfulGroupPayments.find((payment) => payment.subscription_id == null) || null
      : null;

    const memberHasToken = Boolean(String(member?.payment_token || '').trim());
    const hasBricTokenEvidence = successfulPayments.some((payment) => hasBricTokenInMetadata(payment.metadata));

    let safeToPromote = false;
    let skipReason = null;
    let paymentToLink = null;
    let reconciliationPath = 'non_group';

    if (hasAmbiguousGroupLinkage) {
      skipReason = 'ambiguous_group_linkage_multiple_full_payer_groups';
      reconciliationPath = 'group';
    } else if (isGroupLinked) {
      reconciliationPath = 'group';
      if (!groupLink || groupLink.missingGroup || !groupLink.group) {
        skipReason = 'group_link_missing_group_record';
      } else if (!groupContact.resolved || !groupContact.email) {
        skipReason = 'group_link_missing_billing_contact';
      } else if (!successfulLinkedGroupPayment && !successfulUnlinkedGroupPayment) {
        skipReason = successfulPayments.length === 0
          ? 'group_link_no_successful_payment'
          : 'group_link_success_not_tied_to_group_billing_path';
      } else {
        safeToPromote = true;
        paymentToLink = successfulLinkedGroupPayment || successfulUnlinkedGroupPayment;
      }
    } else {
      if (!(successfulLinkedPayment || successfulUnlinkedPayment)) {
        skipReason = 'non_group_no_successful_payment';
      } else if (!(memberHasToken || hasBricTokenEvidence)) {
        skipReason = 'non_group_missing_token_evidence';
      } else {
        safeToPromote = true;
        paymentToLink = successfulLinkedPayment || successfulUnlinkedPayment;
      }
    }

    const candidate = {
      subscriptionId: sub.id,
      memberId,
      reconciliationPath,
      groupId: resolvedGroupId,
      groupName: groupLink?.group?.name || null,
      groupPayorMode: groupLink?.group ? getEffectivePayorMode(groupLink.membership, groupLink.group) : null,
      groupContactResolved: groupContact.resolved,
      groupContactSource: groupContact.source,
      memberStatus: member?.status || null,
      memberHasPaymentToken: memberHasToken,
      successfulPaymentCount: successfulPayments.length,
      successfulLinkedPaymentId: successfulLinkedPayment?.id || null,
      successfulUnlinkedPaymentId: successfulUnlinkedPayment?.id || null,
      successfulGroupPaymentCount: successfulGroupPayments.length,
      successfulLinkedGroupPaymentId: successfulLinkedGroupPayment?.id || null,
      successfulUnlinkedGroupPaymentId: successfulUnlinkedGroupPayment?.id || null,
      hasBricTokenEvidence,
      latestSuccessfulPaymentId: successfulPayments[0]?.id || null,
      latestSuccessfulTransactionId: successfulPayments[0]?.transaction_id || null,
      nextBillingDateBefore: sub.next_billing_date || null,
      nextBillingDateAfter: null,
      applied: false,
      linkedPaymentId: null,
      errors: [],
    };

    if (!safeToPromote) {
      incrementReason(skipReasons, skipReason);
      manualReview.push({
        ...candidate,
        reason: skipReason || 'unspecified_skip_reason',
      });
      continue;
    }

    if (reconciliationPath === 'group') {
      groupEligible += 1;
    } else {
      nonGroupEligible += 1;
    }

    if (applyChanges) {
      const nextBillingDate = computeNextBillingDateIso();
      const { error: updateSubError } = await supabase
        .from('subscriptions')
        .update({
          status: 'active',
          next_billing_date: nextBillingDate,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sub.id)
        .eq('status', 'pending_payment');

      if (updateSubError) {
        candidate.errors.push(`Failed subscription update: ${updateSubError.message}`);
      } else {
        candidate.applied = true;
        candidate.nextBillingDateAfter = nextBillingDate;
        updatedSubscriptions += 1;
        if (reconciliationPath === 'group') {
          groupPromoted += 1;
        } else {
          nonGroupPromoted += 1;
        }
      }

      if (paymentToLink && paymentToLink.subscription_id == null) {
        const { error: linkPaymentError } = await supabase
          .from('payments')
          .update({
            subscription_id: String(sub.id),
            updated_at: new Date().toISOString(),
          })
          .eq('id', paymentToLink.id);

        if (linkPaymentError) {
          candidate.errors.push(`Failed linking payment ${paymentToLink.id}: ${linkPaymentError.message}`);
        } else {
          candidate.linkedPaymentId = paymentToLink.id;
          linkedPayments += 1;
        }
      }
    }

    safeCandidates.push(candidate);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    mode: applyChanges ? 'apply' : 'dry-run',
    totals: {
      pendingSubscriptions: rows.length,
      nonGroupPendingSubscriptions,
      groupLinkedPendingSubscriptions,
      safeCandidates: safeCandidates.length,
      nonGroupEligible,
      groupEligible,
      manualReview: manualReview.length,
      skipped: manualReview.length,
      skipReasons,
      updatedSubscriptions,
      nonGroupPromoted,
      groupPromoted,
      linkedPayments,
    },
    safeCandidates,
    manualReview,
  };

  const outputPath = path.join(cwd, 'tmp', `reconcile-paid-pending-subscriptions-${applyChanges ? 'apply' : 'dry-run'}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2), 'utf8');

  console.log(JSON.stringify({ ...summary.totals, outputPath }, null, 2));
}

run().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
