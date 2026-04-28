#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const SUCCESS_PAYMENT_STATUSES = new Set(['succeeded', 'success', 'completed']);
const ACTIVE_STATUSES = new Set(['active']);
const REPORT_DIR = path.join(process.cwd(), 'scripts', 'output');

function normalizeEnvValue(value) {
  return String(value || '').replace(/["']/g, '').trim();
}

export function loadEnvFromDotEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

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

export function createSupabaseAdminClient() {
  const supabaseUrl = normalizeEnvValue(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const supabaseServiceKey = normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY');
  }

  return createPostgrestClient(supabaseUrl, supabaseServiceKey);
}

function createPostgrestClient(supabaseUrl, serviceRoleKey) {
  const baseUrl = String(supabaseUrl || '').replace(/\/+$/, '');

  function from(table) {
    return new PostgrestQuery(baseUrl, serviceRoleKey, table);
  }

  return { from };
}

class PostgrestQuery {
  constructor(baseUrl, serviceRoleKey, table) {
    this.baseUrl = baseUrl;
    this.serviceRoleKey = serviceRoleKey;
    this.table = table;
    this.operation = 'select';
    this.selectColumns = '*';
    this.returningColumns = null;
    this.filters = [];
    this.ordering = [];
    this.offset = null;
    this.limitCount = null;
    this.body = null;
    this.expect = null;
  }

  select(columns) {
    if (this.operation === 'insert' || this.operation === 'update') {
      this.returningColumns = columns || '*';
      return this;
    }

    this.operation = 'select';
    this.selectColumns = columns || '*';
    return this;
  }

  insert(payload) {
    this.operation = 'insert';
    this.body = payload;
    return this;
  }

  update(payload) {
    this.operation = 'update';
    this.body = payload;
    return this;
  }

  eq(column, value) {
    this.filters.push([column, `eq.${encodePostgrestValue(value)}`]);
    return this;
  }

  in(column, values) {
    const encodedValues = (Array.isArray(values) ? values : [])
      .map((value) => encodePostgrestValue(value))
      .join(',');
    this.filters.push([column, `in.(${encodedValues})`]);
    return this;
  }

  is(column, value) {
    const normalized = value === null ? 'null' : encodePostgrestValue(value);
    this.filters.push([column, `is.${normalized}`]);
    return this;
  }

  or(expression) {
    this.filters.push(['or', `(${expression})`]);
    return this;
  }

  order(column, options = {}) {
    const direction = options?.ascending === false ? 'desc' : 'asc';
    this.ordering.push(`${column}.${direction}`);
    return this;
  }

  range(from, to) {
    this.offset = Number.isFinite(from) ? Number(from) : 0;
    this.limitCount = Number.isFinite(to) && Number.isFinite(from)
      ? Number(to) - Number(from) + 1
      : null;
    return this;
  }

  limit(count) {
    this.limitCount = Number.isFinite(count) ? Number(count) : null;
    return this;
  }

  maybeSingle() {
    this.expect = 'maybeSingle';
    return this;
  }

  single() {
    this.expect = 'single';
    return this;
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  async execute() {
    const url = new URL(`${this.baseUrl}/rest/v1/${this.table}`);

    if (this.operation === 'select') {
      url.searchParams.set('select', this.selectColumns || '*');
    } else if (this.returningColumns) {
      url.searchParams.set('select', this.returningColumns);
    }

    for (const [key, value] of this.filters) {
      url.searchParams.append(key, value);
    }

    if (this.ordering.length > 0) {
      url.searchParams.set('order', this.ordering.join(','));
    }

    if (this.limitCount !== null) {
      url.searchParams.set('limit', String(this.limitCount));
    }

    if (this.offset !== null) {
      url.searchParams.set('offset', String(this.offset));
    }

    const headers = {
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: this.operation === 'select' ? '' : 'return=representation',
    };

    if (!headers.Prefer) {
      delete headers.Prefer;
    }

    const method = this.operation === 'insert'
      ? 'POST'
      : this.operation === 'update'
        ? 'PATCH'
        : 'GET';

    let response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: this.operation === 'select' ? undefined : JSON.stringify(this.body ?? {}),
      });
    } catch (error) {
      return {
        data: null,
        error: {
          message: error?.message || 'Network error calling Supabase PostgREST',
        },
      };
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const message = payload?.message || payload?.error_description || payload?.error || `HTTP ${response.status}`;
      return { data: null, error: { message } };
    }

    let data = payload;
    if (this.expect === 'single') {
      if (!Array.isArray(payload) || payload.length !== 1) {
        return {
          data: null,
          error: {
            message: !Array.isArray(payload)
              ? 'Expected single row but response was not an array'
              : payload.length === 0
                ? 'Expected single row but found none'
                : 'Expected single row but found multiple',
          },
        };
      }
      data = payload[0];
    } else if (this.expect === 'maybeSingle') {
      if (!Array.isArray(payload)) {
        return {
          data: null,
          error: { message: 'Expected array response for maybeSingle' },
        };
      }

      if (payload.length === 0) {
        data = null;
      } else if (payload.length === 1) {
        data = payload[0];
      } else {
        return {
          data: null,
          error: { message: 'Expected zero or one row but found multiple' },
        };
      }
    }

    return { data, error: null };
  }
}

function encodePostgrestValue(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const raw = String(value);
  if (/[,()\s]/.test(raw)) {
    return `"${raw.replace(/"/g, '\\"')}"`;
  }
  return raw;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIso(value) {
  if (!value) return null;
  try {
    return new Date(value).toISOString();
  } catch {
    return null;
  }
}

function paymentIsSuccessful(payment) {
  return SUCCESS_PAYMENT_STATUSES.has(String(payment?.status || '').trim().toLowerCase());
}

function compareDateAsc(a, b) {
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

function clampDayToMonth(year, monthZeroIndexed, day) {
  const maxDay = new Date(Date.UTC(year, monthZeroIndexed + 1, 0)).getUTCDate();
  return Math.min(day, maxDay);
}

function nextBillingDateFromAnchor(anchorDate, nowDate) {
  const anchor = parseDate(anchorDate);
  if (!anchor) return null;

  const now = new Date(nowDate);
  const anchorUtcDay = anchor.getUTCDate();
  const anchorUtcHour = anchor.getUTCHours();
  const anchorUtcMin = anchor.getUTCMinutes();
  const anchorUtcSec = anchor.getUTCSeconds();
  const anchorUtcMs = anchor.getUTCMilliseconds();

  let year = anchor.getUTCFullYear();
  let month = anchor.getUTCMonth() + 1;

  while (month > 11) {
    month -= 12;
    year += 1;
  }

  let safety = 0;
  while (safety < 240) {
    const day = clampDayToMonth(year, month, anchorUtcDay);
    const candidate = new Date(Date.UTC(year, month, day, anchorUtcHour, anchorUtcMin, anchorUtcSec, anchorUtcMs));
    if (candidate > now) return candidate;

    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
    safety += 1;
  }

  return null;
}

function paidThroughDateFromNextBillingDate(nextBillingDate) {
  const next = parseDate(nextBillingDate);
  if (!next) return null;
  const paidThrough = new Date(next);
  paidThrough.setUTCDate(paidThrough.getUTCDate() - 1);
  return paidThrough;
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function fetchAll(supabase, table, selectColumns, options = {}) {
  const pageSize = options.pageSize || 1000;
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    let query = supabase.from(table).select(selectColumns).range(from, to);

    if (options.orderBy) {
      query = query.order(options.orderBy, { ascending: options.ascending !== false });
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed loading ${table}: ${error.message}`);

    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

function normalizeCommissionLane(row) {
  const memberId = String(row.member_id || '').trim();
  const enrollmentId = String(row.enrollment_id || '').trim() || '__NO_ENROLLMENT__';
  const agentId = String(row.agent_id || '').trim();
  const commissionType = String(row.commission_type || '').trim() || 'direct';
  const overrideForAgentId = String(row.override_for_agent_id || '').trim() || '__NO_OVERRIDE__';
  return `${memberId}|${enrollmentId}|${agentId}|${commissionType}|${overrideForAgentId}`;
}

function buildManualReviewRecord(type, memberId, subscriptionId, reason, metadata = {}) {
  return {
    type,
    memberId: memberId ?? null,
    subscriptionId: subscriptionId ?? null,
    reason,
    metadata,
  };
}

export async function analyzeBackfillState(supabase) {
  const now = new Date();
  const staleThreshold = new Date(now);
  staleThreshold.setUTCDate(staleThreshold.getUTCDate() - 45);

  const [members, subscriptions, payments, commissions, plans] = await Promise.all([
    fetchAll(
      supabase,
      'members',
      'id,status,is_active,cancellation_date,first_payment_date,enrollment_date,enrolled_by_agent_id,agent_number,plan_id,total_monthly_price,member_type,coverage_type,add_rx_valet,created_at,updated_at',
      { orderBy: 'id' }
    ),
    fetchAll(
      supabase,
      'subscriptions',
      'id,member_id,status,amount,next_billing_date,end_date,pending_reason,pending_details,plan_id,created_at,updated_at',
      { orderBy: 'id' }
    ),
    fetchAll(
      supabase,
      'payments',
      'id,member_id,subscription_id,status,transaction_id,created_at,amount',
      { orderBy: 'id' }
    ),
    fetchAll(
      supabase,
      'agent_commissions',
      'id,member_id,enrollment_id,agent_id,agent_number,commission_amount,coverage_type,base_premium,status,payment_status,commission_type,override_for_agent_id,notes,created_at',
      { orderBy: 'created_at' }
    ),
    fetchAll(supabase, 'plans', 'id,name,price', { orderBy: 'id' }),
  ]);

  const membersById = new Map(members.map((m) => [Number(m.id), m]));
  const plansById = new Map(plans.map((p) => [Number(p.id), p]));

  const subscriptionsByMember = new Map();
  for (const sub of subscriptions) {
    const memberId = Number(sub.member_id);
    if (!Number.isFinite(memberId)) continue;
    if (!subscriptionsByMember.has(memberId)) subscriptionsByMember.set(memberId, []);
    subscriptionsByMember.get(memberId).push(sub);
  }

  const paymentsByMember = new Map();
  for (const payment of payments) {
    const memberId = Number(payment.member_id);
    if (!Number.isFinite(memberId)) continue;
    if (!paymentsByMember.has(memberId)) paymentsByMember.set(memberId, []);
    paymentsByMember.get(memberId).push(payment);
  }

  for (const paymentList of paymentsByMember.values()) {
    paymentList.sort(compareDateAsc);
  }

  const commissionsByMember = new Map();
  const laneCounts = new Map();

  for (const row of commissions) {
    const memberId = String(row.member_id || '').trim();
    if (!commissionsByMember.has(memberId)) commissionsByMember.set(memberId, []);
    commissionsByMember.get(memberId).push(row);

    const lane = normalizeCommissionLane(row);
    if (!laneCounts.has(lane)) laneCounts.set(lane, []);
    laneCounts.get(lane).push(row.id);
  }

  const duplicateCommissionLanes = [];
  for (const [laneKey, ids] of laneCounts.entries()) {
    if (ids.length > 1) {
      duplicateCommissionLanes.push({ laneKey, ids });
    }
  }

  const report = {
    generatedAt: now.toISOString(),
    totals: {
      members: members.length,
      subscriptions: subscriptions.length,
      payments: payments.length,
      agentCommissions: commissions.length,
    },
    dryRunSummary: {
      totalActiveMembers: 0,
      totalPendingPaymentMembers: 0,
      totalCancelledMembers: 0,
      activeSubscriptionsWithValidNextBillingDate: 0,
      activeSubscriptionsMissingNextBillingDate: 0,
      activeMembersWithoutVerifiedPayment: 0,
      cancelledMembersWithActiveSubscriptions: 0,
      activeMembersWithCancelledSubscriptions: 0,
      subscriptionsWithPastNextBillingDate: 0,
      subscriptionsWithStaleNextBillingDate: 0,
      commissionRecordsMissingForSuccessfulPayments: 0,
      possibleDuplicateCommissionRecords: duplicateCommissionLanes.length,
      recordsRequiringManualReview: 0,
    },
    proposedChanges: {
      nextBillingDateFixes: [],
      scheduledCancellationFixes: [],
      commissionBackfills: [],
    },
    manualReview: [],
    duplicateCommissionLanes,
  };

  for (const member of members) {
    const memberId = Number(member.id);
    const status = String(member.status || '').toLowerCase();

    if (status === 'active') report.dryRunSummary.totalActiveMembers += 1;
    if (status === 'pending_payment') report.dryRunSummary.totalPendingPaymentMembers += 1;
    if (status === 'cancelled') report.dryRunSummary.totalCancelledMembers += 1;

    const memberSubs = subscriptionsByMember.get(memberId) || [];
    const memberPayments = paymentsByMember.get(memberId) || [];
    const successfulPayments = memberPayments.filter(paymentIsSuccessful);
    const hasVerifiedPayment = successfulPayments.length > 0 || Boolean(parseDate(member.first_payment_date));

    if (status === 'active' && !hasVerifiedPayment) {
      report.dryRunSummary.activeMembersWithoutVerifiedPayment += 1;
      report.manualReview.push(
        buildManualReviewRecord(
          'active_without_verified_payment',
          memberId,
          null,
          'Member is active but has no successful payment and no first_payment_date',
          { firstPaymentDate: member.first_payment_date || null }
        )
      );
    }

    const activeSubs = memberSubs.filter((sub) => ACTIVE_STATUSES.has(String(sub.status || '').toLowerCase()));
    const cancelledSubs = memberSubs.filter((sub) => String(sub.status || '').toLowerCase() === 'cancelled');

    if (status === 'cancelled' && activeSubs.length > 0) {
      report.dryRunSummary.cancelledMembersWithActiveSubscriptions += 1;
      for (const sub of activeSubs) {
        report.manualReview.push(
          buildManualReviewRecord(
            'cancelled_member_with_active_subscription',
            memberId,
            Number(sub.id),
            'Cancelled member has an active subscription',
            {
              memberCancellationDate: toIso(member.cancellation_date),
              subscriptionStatus: sub.status,
            }
          )
        );
      }
    }

    if (status === 'active' && cancelledSubs.length > 0) {
      report.dryRunSummary.activeMembersWithCancelledSubscriptions += 1;
      for (const sub of cancelledSubs) {
        report.manualReview.push(
          buildManualReviewRecord(
            'active_member_with_cancelled_subscription',
            memberId,
            Number(sub.id),
            'Active member has a cancelled subscription',
            {
              memberStatus: member.status,
              subscriptionStatus: sub.status,
            }
          )
        );
      }
    }

    for (const sub of activeSubs) {
      const subId = Number(sub.id);
      const nextBillingDate = parseDate(sub.next_billing_date);

      if (!nextBillingDate) {
        report.dryRunSummary.activeSubscriptionsMissingNextBillingDate += 1;
      } else {
        report.dryRunSummary.activeSubscriptionsWithValidNextBillingDate += 1;
        if (nextBillingDate <= now) report.dryRunSummary.subscriptionsWithPastNextBillingDate += 1;
        if (nextBillingDate <= staleThreshold) report.dryRunSummary.subscriptionsWithStaleNextBillingDate += 1;
      }

      const planAmountRaw = toNumber(sub.amount);
      const memberAmountRaw = toNumber(member.total_monthly_price);
      const planFromMember = plansById.get(Number(member.plan_id));
      const planFromSub = plansById.get(Number(sub.plan_id));
      const planAmount = toNumber(planFromSub?.price ?? planFromMember?.price);
      const expectedAmount = memberAmountRaw ?? planAmount;

      if (planAmountRaw !== null && expectedAmount !== null && Math.abs(planAmountRaw - expectedAmount) > 0.01) {
        report.manualReview.push(
          buildManualReviewRecord(
            'plan_amount_mismatch',
            memberId,
            subId,
            'Subscription amount does not match member/plan expected amount',
            {
              subscriptionAmount: planAmountRaw,
              expectedAmount,
              memberAmount: memberAmountRaw,
              planAmount,
            }
          )
        );
      }

      const subSuccessPayments = successfulPayments.filter((payment) => {
        if (payment.subscription_id == null) return true;
        return Number(payment.subscription_id) === subId;
      });

      const firstSuccessfulPayment = subSuccessPayments[0] || successfulPayments[0] || null;
      const anchor = firstSuccessfulPayment?.created_at || member.first_payment_date || null;
      const shouldFixMissing = !nextBillingDate;
      const shouldFixStale = Boolean(nextBillingDate && nextBillingDate <= staleThreshold);

      if (shouldFixMissing || shouldFixStale) {
        if (anchor) {
          const derived = nextBillingDateFromAnchor(anchor, now);
          if (derived) {
            report.proposedChanges.nextBillingDateFixes.push({
              memberId,
              subscriptionId: subId,
              reason: shouldFixMissing ? 'missing_next_billing_date' : 'stale_next_billing_date',
              currentNextBillingDate: toIso(sub.next_billing_date),
              derivedNextBillingDate: derived.toISOString(),
              anchorPaymentId: firstSuccessfulPayment?.id || null,
              anchorDate: toIso(anchor),
            });
          } else {
            report.manualReview.push(
              buildManualReviewRecord(
                'unable_to_derive_next_billing_date',
                memberId,
                subId,
                'Could not derive next_billing_date from available payment anchor',
                {
                  anchorDate: toIso(anchor),
                }
              )
            );
          }
        } else {
          report.manualReview.push(
            buildManualReviewRecord(
              'missing_next_billing_date_no_anchor',
              memberId,
              subId,
              'Subscription has missing/stale next_billing_date but no successful payment anchor',
              {
                currentNextBillingDate: toIso(sub.next_billing_date),
              }
            )
          );
        }
      }

      const cancellationRequestedAt = parseDate(member.cancellation_date);
      const pendingReason = String(sub.pending_reason || '').trim().toLowerCase();
      const paidThroughDate = paidThroughDateFromNextBillingDate(nextBillingDate);

      if (
        String(member.status || '').toLowerCase() === 'active'
        && cancellationRequestedAt
        && String(sub.status || '').toLowerCase() === 'active'
        && pendingReason !== 'member_cancelled'
      ) {
        if (paidThroughDate && paidThroughDate >= now) {
          report.proposedChanges.scheduledCancellationFixes.push({
            memberId,
            subscriptionId: subId,
            currentEndDate: toIso(sub.end_date),
            newEndDate: paidThroughDate.toISOString(),
            pendingReason: 'member_cancelled',
            pendingDetails: `Cancellation requested ${cancellationRequestedAt.toISOString()} - end of paid period backfill`,
            cancellationRequestedAt: cancellationRequestedAt.toISOString(),
          });
        } else {
          report.manualReview.push(
            buildManualReviewRecord(
              'cancellation_request_unfinalized_but_paid_through_invalid',
              memberId,
              subId,
              'Cancellation requested, but paid_through_date is invalid/past for scheduling',
              {
                nextBillingDate: toIso(sub.next_billing_date),
                paidThroughDate: toIso(paidThroughDate),
              }
            )
          );
        }
      }

      const memberCommissionRows = commissionsByMember.get(String(memberId)) || [];
      const directLaneExists = memberCommissionRows.some((row) => {
        const commissionType = String(row.commission_type || '').trim().toLowerCase() || 'direct';
        const enrollmentId = String(row.enrollment_id || '').trim();
        return commissionType === 'direct' && enrollmentId === String(subId);
      });

      if (subSuccessPayments.length > 0 && !directLaneExists) {
        const enrollingAgentId = String(member.enrolled_by_agent_id || '').trim() || null;
        const template = memberCommissionRows.find((row) => {
          const cType = String(row.commission_type || '').trim().toLowerCase() || 'direct';
          return cType === 'direct';
        }) || null;

        if (enrollingAgentId && template) {
          report.proposedChanges.commissionBackfills.push({
            memberId,
            subscriptionId: subId,
            paymentId: Number(subSuccessPayments[0].id),
            paymentDate: toIso(subSuccessPayments[0].created_at),
            agentId: String(template.agent_id || enrollingAgentId),
            agentNumber: String(template.agent_number || member.agent_number || '').trim() || null,
            commissionAmount: toNumber(template.commission_amount) || 0,
            coverageType: template.coverage_type || member.coverage_type || member.member_type || 'other',
            basePremium: toNumber(template.base_premium) || toNumber(sub.amount) || 0,
            templateCommissionId: template.id,
          });
        } else {
          report.dryRunSummary.commissionRecordsMissingForSuccessfulPayments += 1;
          report.manualReview.push(
            buildManualReviewRecord(
              'missing_commission_for_successful_payment',
              memberId,
              subId,
              'Successful payment exists but no direct commission lane and no safe template to clone',
              {
                successfulPaymentId: Number(subSuccessPayments[0].id),
                enrollingAgentId,
                hasTemplate: Boolean(template),
              }
            )
          );
        }
      }
    }
  }

  report.dryRunSummary.commissionRecordsMissingForSuccessfulPayments += report.proposedChanges.commissionBackfills.length;
  report.dryRunSummary.recordsRequiringManualReview = report.manualReview.length;

  return report;
}

async function insertSystemAdminLog(supabase, payload) {
  const logPayload = {
    log_type: 'lifecycle_backfill',
    admin_id: 'system',
    admin_email: 'system-backfill@getmydpc',
    member_id: payload.memberId || null,
    action: payload.action,
    reason: payload.reason || null,
    metadata: payload.metadata || {},
  };

  const { error } = await supabase.from('admin_logs').insert(logPayload);
  if (!error) return;

  const msg = String(error.message || '').toLowerCase();
  const isMissingTable =
    msg.includes("could not find the table")
    || msg.includes('relation "admin_logs" does not exist')
    || msg.includes('schema cache');

  if (!isMissingTable) {
    throw new Error(`Failed to write admin log (${payload.action}): ${error.message}`);
  }

  // Fallback: persist lifecycle audit into admin_notifications when admin_logs is unavailable.
  const fallback = await supabase.from('admin_notifications').insert({
    type: 'lifecycle_backfill_audit',
    member_id: payload.memberId || null,
    subscription_id: payload.metadata?.subscriptionId ?? null,
    error_message: payload.reason || payload.action,
    metadata: {
      source: 'part10_backfill',
      action: payload.action,
      auditSink: 'admin_notifications_fallback',
      details: payload.metadata || {},
    },
    resolved: false,
    created_at: new Date().toISOString(),
  });

  if (fallback.error) {
    throw new Error(
      `Failed to write lifecycle audit fallback (${payload.action}): ${fallback.error.message}`
    );
  }
}

async function getCommissionLaneExists(supabase, backfill) {
  let query = supabase
    .from('agent_commissions')
    .select('id')
    .eq('member_id', String(backfill.memberId))
    .eq('agent_id', String(backfill.agentId))
    .eq('enrollment_id', String(backfill.subscriptionId))
    .or('commission_type.is.null,commission_type.eq.direct')
    .limit(1);

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Failed checking commission lane: ${error.message}`);
  return Boolean(data?.id);
}

export async function applyBackfillPlan(supabase, report) {
  const nowIso = new Date().toISOString();
  const applied = {
    startedAt: nowIso,
    nextBillingDateFixesApplied: [],
    scheduledCancellationFixesApplied: [],
    commissionBackfillsApplied: [],
    skipped: [],
    rollback: {
      subscriptions: [],
      commissionsCreated: [],
    },
  };

  for (const fix of report.proposedChanges.nextBillingDateFixes) {
    const { data: current, error: readErr } = await supabase
      .from('subscriptions')
      .select('id,next_billing_date')
      .eq('id', fix.subscriptionId)
      .maybeSingle();

    if (readErr || !current) {
      applied.skipped.push({ type: 'next_billing', subscriptionId: fix.subscriptionId, reason: readErr?.message || 'subscription_not_found' });
      continue;
    }

    const { error: updateErr } = await supabase
      .from('subscriptions')
      .update({
        next_billing_date: fix.derivedNextBillingDate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', fix.subscriptionId);

    if (updateErr) {
      applied.skipped.push({ type: 'next_billing', subscriptionId: fix.subscriptionId, reason: updateErr.message });
      continue;
    }

    applied.nextBillingDateFixesApplied.push(fix);
    applied.rollback.subscriptions.push({
      subscriptionId: fix.subscriptionId,
      previous: { next_billing_date: current.next_billing_date },
    });

    await insertSystemAdminLog(supabase, {
      memberId: fix.memberId,
      action: 'backfill_next_billing_date',
      reason: fix.reason,
      metadata: {
        subscriptionId: fix.subscriptionId,
        previousNextBillingDate: current.next_billing_date,
        newNextBillingDate: fix.derivedNextBillingDate,
        anchorPaymentId: fix.anchorPaymentId,
      },
    });
  }

  for (const fix of report.proposedChanges.scheduledCancellationFixes) {
    const { data: current, error: readErr } = await supabase
      .from('subscriptions')
      .select('id,status,end_date,pending_reason,pending_details')
      .eq('id', fix.subscriptionId)
      .maybeSingle();

    if (readErr || !current) {
      applied.skipped.push({ type: 'scheduled_cancel', subscriptionId: fix.subscriptionId, reason: readErr?.message || 'subscription_not_found' });
      continue;
    }

    if (String(current.status || '').toLowerCase() !== 'active') {
      applied.skipped.push({ type: 'scheduled_cancel', subscriptionId: fix.subscriptionId, reason: 'subscription_not_active' });
      continue;
    }

    const { error: updateErr } = await supabase
      .from('subscriptions')
      .update({
        end_date: fix.newEndDate,
        pending_reason: 'member_cancelled',
        pending_details: fix.pendingDetails,
        updated_at: new Date().toISOString(),
      })
      .eq('id', fix.subscriptionId)
      .eq('status', 'active');

    if (updateErr) {
      applied.skipped.push({ type: 'scheduled_cancel', subscriptionId: fix.subscriptionId, reason: updateErr.message });
      continue;
    }

    applied.scheduledCancellationFixesApplied.push(fix);
    applied.rollback.subscriptions.push({
      subscriptionId: fix.subscriptionId,
      previous: {
        end_date: current.end_date,
        pending_reason: current.pending_reason,
        pending_details: current.pending_details,
      },
    });

    await insertSystemAdminLog(supabase, {
      memberId: fix.memberId,
      action: 'backfill_member_cancelled_end_of_period',
      reason: 'part10_backfill',
      metadata: {
        subscriptionId: fix.subscriptionId,
        previousEndDate: current.end_date,
        newEndDate: fix.newEndDate,
        previousPendingReason: current.pending_reason,
        newPendingReason: 'member_cancelled',
      },
    });
  }

  for (const row of report.proposedChanges.commissionBackfills) {
    const laneExists = await getCommissionLaneExists(supabase, row);
    if (laneExists) {
      applied.skipped.push({
        type: 'commission_backfill',
        subscriptionId: row.subscriptionId,
        memberId: row.memberId,
        reason: 'commission_lane_already_exists',
      });
      continue;
    }

    const insertPayload = {
      agent_id: row.agentId,
      agent_number: row.agentNumber,
      member_id: String(row.memberId),
      enrollment_id: String(row.subscriptionId),
      commission_amount: row.commissionAmount,
      coverage_type: row.coverageType || 'other',
      status: 'pending',
      payment_status: 'unpaid',
      base_premium: row.basePremium,
      commission_type: 'direct',
      override_for_agent_id: null,
      notes: `Backfill from verified successful payment ${row.paymentId} (${row.paymentDate})`,
    };

    const { data: created, error: insertErr } = await supabase
      .from('agent_commissions')
      .insert(insertPayload)
      .select('id')
      .single();

    if (insertErr) {
      const msg = String(insertErr.message || '');
      if (msg.toLowerCase().includes('duplicate key') || msg.toLowerCase().includes('unique')) {
        applied.skipped.push({
          type: 'commission_backfill',
          subscriptionId: row.subscriptionId,
          memberId: row.memberId,
          reason: 'unique_constraint_noop',
        });
        continue;
      }

      applied.skipped.push({
        type: 'commission_backfill',
        subscriptionId: row.subscriptionId,
        memberId: row.memberId,
        reason: insertErr.message,
      });
      continue;
    }

    const createdId = created?.id ?? null;
    applied.commissionBackfillsApplied.push({ ...row, createdCommissionId: createdId });
    applied.rollback.commissionsCreated.push({ id: createdId, memberId: row.memberId, subscriptionId: row.subscriptionId });

    await insertSystemAdminLog(supabase, {
      memberId: row.memberId,
      action: 'backfill_missing_direct_commission',
      reason: 'part10_backfill',
      metadata: {
        subscriptionId: row.subscriptionId,
        paymentId: row.paymentId,
        createdCommissionId: createdId,
        agentId: row.agentId,
        templateCommissionId: row.templateCommissionId,
      },
    });
  }

  applied.completedAt = new Date().toISOString();
  return applied;
}

export function ensureReportDir() {
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
  return REPORT_DIR;
}

export function writeReportFile(prefix, data) {
  const reportDir = ensureReportDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(reportDir, `${prefix}-${timestamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}
