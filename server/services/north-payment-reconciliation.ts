import { hasAtLeastRole } from "../auth/roles";
import { calculateNextBillingCycleDate } from "../utils/membership-dates";
import { resolveCanonicalPaymentCredential } from "./payment-credential";
import {
  evaluateRecurringCycleEligibility,
  resolveBillingAnchorDay,
} from "./recurring-billing-cycle-policy";

/**
 * Billing Ops reconciliation of North (merchant portal) payments, per
 * docs/NORTH_BILLING_RECOVERY_PLAN_2026-10-01.md.
 *
 * Reuses the settled-cycle pattern already in production (cycle 2 / payment
 * 138): a `completed` recurring_billing_cycles row with payment_method_type
 * `External` and credential_source `manual_external_owner_confirmed`, linked
 * to a `succeeded` payment verified as `manual_admin` with
 * metadata.externalSettlement, and next_billing_date advanced past the cycle.
 *
 * Rules:
 * - Months are reconciled in order. Only the cycle at next_billing_date can be
 *   reconciled, so next_billing_date never moves past an unverified month. A
 *   later month (e.g. September while August is open) is refused and the open
 *   earlier cycles are surfaced for operator action.
 * - Platform-caused gaps can be waived (a `skipped` cycle, no payment). Cycles
 *   before COLLECTIBLE_GAP_START are surfaced as waivable; the policy allows at
 *   most one missing cycle from August 2026 on to be collected, which happens
 *   through the existing Pay Now flow, never here.
 * - Idempotent: the same month reconciled twice returns the existing record
 *   without new rows or a second advance.
 * - Never submits a charge, and never changes member status, billing mode, or
 *   payment credentials.
 *
 * No database import, so it can be tested with a fake client.
 */

export const SETTLED_CREDENTIAL_SOURCE = "manual_external_owner_confirmed";
export const WAIVED_CREDENTIAL_SOURCE = "platform_gap_waived";
export const COLLECTIBLE_GAP_START = "2026-08-01";
const SETTLED_RESPONSE_MESSAGE =
  "Owner-confirmed North merchant portal settlement; platform did not submit payment";
const WAIVED_RESPONSE_MESSAGE =
  "Platform-caused billing gap waived by operator; no payment collected";
const MAX_SCHEDULE_STEPS = 36;

export type ReconciliationDecision = "settled_external" | "waive_platform_gap";

export interface ReconciliationActor {
  id: string;
  email?: string | null;
  role?: string | null;
}

export interface QueryClient {
  query(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: any[]; rowCount?: number | null }>;
}

export class NorthReconciliationError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export interface ReconciliationInput {
  memberId: number;
  subscriptionId: number;
  cycleMonth: string;
  decision: ReconciliationDecision;
  paymentMethodType: "CreditCard" | "ACH" | null;
  northPaymentDate: string | null;
  amount: string | null;
  externalReference: string | null;
  authorizationCode: string | null;
  northTranId: string | null;
  note: string | null;
}

export interface ReconciliationResult {
  outcome: "reconciled" | "already_reconciled" | "preview";
  decision: ReconciliationDecision;
  memberId: number;
  subscriptionId: number;
  cycleDate: string;
  previousNextBillingDate: string | null;
  nextBillingDate: string | null;
  cycleId: number | null;
  paymentId: number | null;
  amount: string | null;
  amountMatchesSubscription: boolean | null;
  northPaymentDate: string | null;
  holdReleased: boolean;
  nextCycleEligibleForAutomaticBilling: boolean | null;
  memberEligibleForPaymentConfirmation: boolean;
  chargeSubmitted: false;
}

export function canReconcileNorthPayments(role: string | null | undefined): boolean {
  return hasAtLeastRole(role, "super_admin");
}

function bad(code: string, message: string): never {
  throw new NorthReconciliationError(400, code, message);
}

function optionalTrimmed(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return "\u0000invalid";
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/** Validates and normalizes operator input before any database access. */
export function parseReconciliationInput(raw: Record<string, unknown>): ReconciliationInput {
  const memberId = Number(raw.memberId);
  const subscriptionId = Number(raw.subscriptionId);
  if (!Number.isInteger(memberId) || memberId <= 0) bad("invalid_member", "A valid member ID is required");
  if (!Number.isInteger(subscriptionId) || subscriptionId <= 0) {
    bad("invalid_subscription", "A valid subscription ID is required");
  }

  const cycleMonth = typeof raw.cycleMonth === "string" ? raw.cycleMonth.trim() : "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(cycleMonth)) {
    bad("invalid_cycle_month", "Cycle month must be YYYY-MM");
  }

  const decision = raw.decision;
  if (decision !== "settled_external" && decision !== "waive_platform_gap") {
    bad("invalid_decision", "Decision must be settled_external or waive_platform_gap");
  }

  const note = optionalTrimmed(raw.note);
  if (note === "\u0000invalid" || (note && note.length > 500)) {
    bad("invalid_note", "Note must be text up to 500 characters");
  }

  if (decision === "waive_platform_gap") {
    if (!note || note.length < 5) {
      bad("waive_reason_required", "Waiving a platform gap requires a reason note");
    }
    return {
      memberId,
      subscriptionId,
      cycleMonth,
      decision,
      paymentMethodType: null,
      northPaymentDate: null,
      amount: null,
      externalReference: null,
      authorizationCode: null,
      northTranId: null,
      note,
    };
  }

  const paymentMethodType = raw.paymentMethodType;
  if (paymentMethodType !== "CreditCard" && paymentMethodType !== "ACH") {
    bad("invalid_payment_method_type", "Payment method type must be CreditCard or ACH");
  }

  const northPaymentDate =
    typeof raw.northPaymentDate === "string" ? raw.northPaymentDate.trim() : "";
  if (!isRealDate(northPaymentDate)) {
    bad("invalid_payment_date", "North payment date must be YYYY-MM-DD");
  }

  const amountText =
    typeof raw.amount === "number" ? raw.amount.toFixed(2) : String(raw.amount ?? "").trim();
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(amountText) || Number(amountText) <= 0) {
    bad("invalid_amount", "Amount must be a positive dollar amount");
  }

  const externalReference = optionalTrimmed(raw.externalReference);
  if (
    externalReference !== null &&
    !/^[A-Za-z0-9][A-Za-z0-9._\/-]{2,63}$/.test(externalReference)
  ) {
    bad("invalid_external_reference", "External reference must be 3-64 letters, digits, or . _ / -");
  }

  const authorizationCode = optionalTrimmed(raw.authorizationCode);
  if (authorizationCode !== null && !/^[A-Za-z0-9]{1,16}$/.test(authorizationCode)) {
    bad("invalid_authorization_code", "Authorization code must be up to 16 letters or digits");
  }

  let northTranId: string | null = null;
  if (raw.northTranId !== undefined && raw.northTranId !== null && raw.northTranId !== "") {
    const resolution = resolveCanonicalPaymentCredential(raw.northTranId);
    if (resolution.error) {
      bad("invalid_north_tran_id", "North Tran ID / BRIC is not a valid processor reference");
    }
    northTranId = resolution.credential;
  }

  if (!externalReference && !northTranId) {
    bad(
      "evidence_required",
      "Provide an external reference (invoice/order/North reference) or the North Tran ID / BRIC",
    );
  }

  return {
    memberId,
    subscriptionId,
    cycleMonth,
    decision,
    paymentMethodType,
    northPaymentDate,
    amount: Number(amountText).toFixed(2),
    externalReference,
    authorizationCode,
    northTranId,
    note,
  };
}

export function settledTransactionId(subscriptionId: number, cycleDate: string): string {
  return `NORTH-EXT-${subscriptionId}-${cycleDate.replace(/-/g, "")}`;
}

export function waivedProcessorReference(subscriptionId: number, cycleDate: string): string {
  return `NORTH-WAIVE-${subscriptionId}-${cycleDate.replace(/-/g, "")}`;
}

export function recommendedActionForOpenCycle(cycleDate: string): string {
  return cycleDate < COLLECTIBLE_GAP_START
    ? "waive_platform_gap"
    : "reconcile_or_waive_or_collect_one_cycle";
}

export async function reconcileNorthPaymentWithClient(
  client: QueryClient,
  input: ReconciliationInput & {
    actor: ReconciliationActor;
    businessDate: string;
    dryRun: boolean;
  },
): Promise<ReconciliationResult> {
  const subscriptionResult = await client.query(
    `SELECT s.id, s.member_id, s.status, s.billing_mode, s.amount,
            TO_CHAR(s.next_billing_date, 'YYYY-MM-DD') AS next_billing_date,
            m.status AS member_status, m.is_active AS member_is_active,
            m.first_payment_date, m.enrollment_date
     FROM subscriptions s
     JOIN members m ON m.id = s.member_id
     WHERE s.id = $1
     FOR UPDATE OF s`,
    [input.subscriptionId],
  );
  const subscription = subscriptionResult.rows[0];
  if (!subscription) {
    throw new NorthReconciliationError(404, "subscription_not_found", "Subscription not found");
  }
  if (Number(subscription.member_id) !== input.memberId) {
    throw new NorthReconciliationError(
      409,
      "member_subscription_mismatch",
      "The subscription does not belong to this member",
    );
  }
  if (String(subscription.member_status || "").toLowerCase() === "cancelled") {
    throw new NorthReconciliationError(
      409,
      "member_cancelled",
      "Cancelled members are not reconciled or reactivated through recovery work",
    );
  }
  if (String(subscription.status || "").toLowerCase() === "cancelled") {
    throw new NorthReconciliationError(409, "subscription_cancelled", "Subscription is cancelled");
  }
  const memberEligibleForPaymentConfirmation =
    input.decision === "settled_external" &&
    String(subscription.member_status || "").toLowerCase() === "active" &&
    subscription.member_is_active !== false;

  // Idempotency: an existing record for this month is returned, never duplicated.
  const monthStart = `${input.cycleMonth}-01`;
  const existingResult = await client.query(
    `SELECT id, TO_CHAR(cycle_date, 'YYYY-MM-DD') AS cycle_date, state,
            credential_source, payment_id, amount
     FROM recurring_billing_cycles
     WHERE subscription_id = $1 AND cycle_date >= $2::date
       AND cycle_date < ($2::date + INTERVAL '1 month')
     ORDER BY cycle_date, id
     FOR UPDATE`,
    [input.subscriptionId, monthStart],
  );
  const existing = existingResult.rows[0];
  if (existing) {
    const replay =
      (input.decision === "settled_external" &&
        existing.credential_source === SETTLED_CREDENTIAL_SOURCE &&
        existing.state === "completed") ||
      (input.decision === "waive_platform_gap" &&
        existing.credential_source === WAIVED_CREDENTIAL_SOURCE &&
        existing.state === "skipped");
    if (!replay) {
      throw new NorthReconciliationError(
        409,
        "cycle_already_recorded",
        "A billing cycle is already recorded for this month; resolve it in Billing Ops instead of reconciling it again",
        {
          cycleId: Number(existing.id),
          cycleDate: existing.cycle_date,
          state: existing.state,
          credentialSource: existing.credential_source,
        },
      );
    }
    const result: ReconciliationResult = {
      outcome: "already_reconciled",
      decision: input.decision,
      memberId: input.memberId,
      subscriptionId: input.subscriptionId,
      cycleDate: existing.cycle_date,
      previousNextBillingDate: subscription.next_billing_date,
      nextBillingDate: subscription.next_billing_date,
      cycleId: Number(existing.id),
      paymentId: existing.payment_id ? Number(existing.payment_id) : null,
      amount: existing.amount != null ? Number(existing.amount).toFixed(2) : null,
      amountMatchesSubscription: null,
      northPaymentDate: input.northPaymentDate,
      holdReleased: false,
      nextCycleEligibleForAutomaticBilling: null,
      memberEligibleForPaymentConfirmation,
      chargeSubmitted: false,
    };
    if (!input.dryRun) {
      await writeAudit(client, input, {
        outcome: "already_reconciled",
        cycleId: result.cycleId,
        paymentId: result.paymentId,
        cycleDate: result.cycleDate,
      });
    }
    return result;
  }

  const currentNext: string | null = subscription.next_billing_date;
  if (!currentNext) {
    throw new NorthReconciliationError(
      409,
      "no_next_billing_date",
      "Subscription has no next billing date to reconcile against",
    );
  }
  const anchorDay = resolveBillingAnchorDay(
    subscription.first_payment_date || subscription.enrollment_date,
    currentNext,
  );
  const next = (date: string) => calculateNextBillingCycleDate(date, anchorDay);
  const currentMonth = currentNext.slice(0, 7);

  if (input.cycleMonth < currentMonth) {
    throw new NorthReconciliationError(
      409,
      "month_already_covered",
      "next_billing_date is already past this month",
      { nextBillingDate: currentNext },
    );
  }
  if (input.cycleMonth > currentMonth) {
    // Never skip an unverified month: surface every open cycle before it.
    const unresolvedCycles: Array<{ cycleDate: string; recommendedAction: string }> = [];
    let cursor = currentNext;
    for (let i = 0; cursor.slice(0, 7) < input.cycleMonth && i < MAX_SCHEDULE_STEPS; i++) {
      unresolvedCycles.push({ cycleDate: cursor, recommendedAction: recommendedActionForOpenCycle(cursor) });
      cursor = next(cursor);
    }
    throw new NorthReconciliationError(
      409,
      "earlier_cycles_unresolved",
      `Earlier cycle(s) ${unresolvedCycles.map((c) => c.cycleDate).join(", ")} are not reconciled. Resolve them first; next_billing_date is never advanced past an unverified month.`,
      { nextBillingDate: currentNext, unresolvedCycles },
    );
  }

  const cycleDate = currentNext;
  if (cycleDate > input.businessDate) {
    throw new NorthReconciliationError(409, "cycle_not_due", "This cycle is not due yet", { cycleDate });
  }
  const followingCycleDate = next(cycleDate);
  if (input.decision === "waive_platform_gap" && followingCycleDate > input.businessDate) {
    throw new NorthReconciliationError(
      409,
      "cannot_waive_current_cycle",
      "The current cycle cannot be waived; reconcile it as paid or let normal billing collect it",
      { cycleDate },
    );
  }
  if (input.decision === "settled_external") {
    if (input.northPaymentDate! > input.businessDate) {
      throw new NorthReconciliationError(400, "payment_date_in_future", "North payment date is in the future");
    }
    if (input.northPaymentDate! < addDays(cycleDate, -31)) {
      throw new NorthReconciliationError(
        400,
        "payment_date_before_cycle",
        "North payment date is more than a month before this cycle",
        { cycleDate },
      );
    }
  }

  // Already represented on the platform? Never create a second record.
  if (input.decision === "settled_external") {
    const evidence = await client.query(
      `SELECT
         (SELECT p.id FROM payments p
          WHERE ($1::text IS NOT NULL AND (TRIM(p.transaction_id) = $1
                 OR p.metadata->'externalSettlement'->>'invoiceReference' = $1))
             OR ($2::text IS NOT NULL AND p.metadata->'externalSettlement'->>'northTranId' = $2)
          LIMIT 1) AS payment_id,
         (SELECT c.id FROM recurring_billing_cycles c
          WHERE $1::text IS NOT NULL AND c.processor_reference = $1
          LIMIT 1) AS cycle_id`,
      [input.externalReference, input.northTranId],
    );
    const found = evidence.rows[0] || {};
    if (found.payment_id || found.cycle_id) {
      throw new NorthReconciliationError(
        409,
        "external_reference_already_recorded",
        "This North payment evidence is already recorded on the platform",
        { paymentId: found.payment_id ?? null, cycleId: found.cycle_id ?? null },
      );
    }
  }
  const windowPayments = await client.query(
    `SELECT p.id FROM payments p
     WHERE p.member_id::text = $1::text
       AND p.status IN ('success', 'succeeded', 'completed')
       AND ($2::numeric IS NULL OR p.amount = $2::numeric)
       AND COALESCE(p.payment_transaction_at, p.created_at) >= $3::date
       AND COALESCE(p.payment_transaction_at, p.created_at) < $4::date
       AND COALESCE(p.metadata->>'transactionPurpose', '') <> 'payment_method_verification'
       AND NOT EXISTS (SELECT 1 FROM recurring_billing_cycles c WHERE c.payment_id = p.id)
     ORDER BY p.id
     LIMIT 5`,
    [input.memberId, input.amount, cycleDate, followingCycleDate],
  );
  if (windowPayments.rows.length > 0) {
    throw new NorthReconciliationError(
      409,
      "platform_payment_exists",
      "A successful platform payment already exists in this cycle period; review it instead of recording another",
      { paymentIds: windowPayments.rows.map((row) => Number(row.id)) },
    );
  }

  // Advance only through settled months: past this cycle and any later cycle
  // already recorded as completed or waived, never past an open one.
  const laterSettled = await client.query(
    `SELECT TO_CHAR(cycle_date, 'YYYY-MM-DD') AS cycle_date
     FROM recurring_billing_cycles
     WHERE subscription_id = $1 AND cycle_date > $2::date
       AND state IN ('completed', 'skipped')`,
    [input.subscriptionId, cycleDate],
  );
  const settledDates = new Set(laterSettled.rows.map((row) => row.cycle_date));
  let newNext = followingCycleDate;
  for (let i = 0; settledDates.has(newNext) && i < MAX_SCHEDULE_STEPS; i++) {
    newNext = next(newNext);
  }

  const wasEligible = evaluateRecurringCycleEligibility({
    cycleDate,
    anchorDay,
    businessDate: input.businessDate,
  }).eligible;
  const nowEligible = evaluateRecurringCycleEligibility({
    cycleDate: newNext,
    anchorDay,
    businessDate: input.businessDate,
  }).eligible;
  const subscriptionAmount = Number(subscription.amount);
  const result: ReconciliationResult = {
    outcome: input.dryRun ? "preview" : "reconciled",
    decision: input.decision,
    memberId: input.memberId,
    subscriptionId: input.subscriptionId,
    cycleDate,
    previousNextBillingDate: currentNext,
    nextBillingDate: newNext,
    cycleId: null,
    paymentId: null,
    amount:
      input.decision === "settled_external"
        ? input.amount
        : Number.isFinite(subscriptionAmount)
          ? subscriptionAmount.toFixed(2)
          : null,
    amountMatchesSubscription:
      input.decision === "settled_external"
        ? Number(input.amount).toFixed(2) === subscriptionAmount.toFixed(2)
        : null,
    northPaymentDate: input.northPaymentDate,
    holdReleased: !wasEligible && nowEligible,
    nextCycleEligibleForAutomaticBilling: nowEligible,
    memberEligibleForPaymentConfirmation,
    chargeSubmitted: false,
  };
  if (input.dryRun) return result;

  if (input.decision === "settled_external") {
    const transactionId = settledTransactionId(input.subscriptionId, cycleDate);
    const payment = await client.query(
      `INSERT INTO payments (
         member_id, subscription_id, amount, currency, status, transaction_id,
         payment_method, payment_method_type, payment_transaction_at,
         payment_confirmed_at, platform_verified_at, verification_method,
         metadata, created_at, updated_at
       ) VALUES (
         $1, $2, $3, 'USD', 'succeeded', $4, $5, $6,
         ($7::date + TIME '12:00') AT TIME ZONE 'America/Chicago',
         NOW(), NOW(), 'manual_admin', $8::jsonb, NOW(), NOW()
       )
       RETURNING id`,
      [
        input.memberId,
        input.subscriptionId,
        input.amount,
        transactionId,
        input.paymentMethodType === "ACH" ? "ach" : "card",
        input.paymentMethodType,
        input.northPaymentDate,
        JSON.stringify({
          note: input.note || "Owner-confirmed external payment; no processor call made by platform",
          source: "manual_external_reconciliation",
          externalSettlement: {
            method: input.paymentMethodType === "ACH" ? "ach" : "card",
            processor: "North merchant portal",
            recordedAt: new Date().toISOString(),
            recordedBy: input.actor.email || input.actor.id,
            recordedByUserId: input.actor.id,
            processedDate: input.northPaymentDate,
            cycleDate,
            invoiceReference: input.externalReference,
            authorizationReference: input.authorizationCode,
            northTranId: input.northTranId,
            billingModeAfterSettlement: subscription.billing_mode,
          },
        }),
      ],
    );
    result.paymentId = Number(payment.rows[0]?.id);
    if (!result.paymentId) throw new Error("Settlement payment insert returned no id");

    const cycle = await client.query(
      `INSERT INTO recurring_billing_cycles (
         subscription_id, member_id, cycle_date, processor_reference, amount,
         payment_method_type, credential_source, state, attempt_count,
         processor_auth_code, processor_response_message, payment_id,
         next_billing_date, completed_at, created_at, updated_at
       ) VALUES (
         $1, $2, $3::date, $4, $5, 'External', $6, 'completed', 0,
         $7, $8, $9, $10::date, NOW(), NOW(), NOW()
       )
       RETURNING id`,
      [
        input.subscriptionId,
        input.memberId,
        cycleDate,
        transactionId,
        input.amount,
        SETTLED_CREDENTIAL_SOURCE,
        input.authorizationCode,
        SETTLED_RESPONSE_MESSAGE,
        result.paymentId,
        newNext,
      ],
    );
    result.cycleId = Number(cycle.rows[0]?.id);
  } else {
    if (!Number.isFinite(subscriptionAmount) || subscriptionAmount <= 0) {
      throw new NorthReconciliationError(
        409,
        "invalid_subscription_amount",
        "Subscription has no billable amount to record for the waived cycle",
      );
    }
    const cycle = await client.query(
      `INSERT INTO recurring_billing_cycles (
         subscription_id, member_id, cycle_date, processor_reference, amount,
         payment_method_type, credential_source, state, attempt_count,
         skip_reason, processor_response_message, payment_id,
         next_billing_date, completed_at, created_at, updated_at
       ) VALUES (
         $1, $2, $3::date, $4, $5, 'External', $6, 'skipped', 0,
         'platform_gap_waived', $7, NULL, $8::date, NULL, NOW(), NOW()
       )
       RETURNING id`,
      [
        input.subscriptionId,
        input.memberId,
        cycleDate,
        waivedProcessorReference(input.subscriptionId, cycleDate),
        subscriptionAmount.toFixed(2),
        WAIVED_CREDENTIAL_SOURCE,
        WAIVED_RESPONSE_MESSAGE,
        newNext,
      ],
    );
    result.cycleId = Number(cycle.rows[0]?.id);
  }
  if (!result.cycleId) throw new Error("Reconciliation cycle insert returned no id");

  const advanced = await client.query(
    `UPDATE subscriptions
     SET next_billing_date = $3::date, current_period_start = $2::date,
         current_period_end = $3::date, updated_at = NOW()
     WHERE id = $1 AND TO_CHAR(next_billing_date, 'YYYY-MM-DD') = $2`,
    [input.subscriptionId, cycleDate, newNext],
  );
  if (advanced.rowCount !== 1) {
    throw new NorthReconciliationError(
      409,
      "subscription_changed",
      "Subscription billing date changed during reconciliation; reload and try again",
    );
  }

  await writeAudit(client, input, {
    outcome: "reconciled",
    cycleId: result.cycleId,
    paymentId: result.paymentId,
    cycleDate,
    previousNextBillingDate: currentNext,
    nextBillingDate: newNext,
    amount: result.amount,
    amountMatchesSubscription: result.amountMatchesSubscription,
    northPaymentDate: input.northPaymentDate,
    externalReference: input.externalReference,
    authorizationCode: input.authorizationCode,
    northTranId: input.northTranId,
    holdReleased: result.holdReleased,
  });
  return result;
}

async function writeAudit(
  client: QueryClient,
  input: ReconciliationInput & { actor: ReconciliationActor },
  details: Record<string, unknown>,
): Promise<void> {
  // Same table and shape as member-payment-method-service insertAudit.
  await client.query(
    `INSERT INTO enrollment_modifications (
       member_id, subscription_id, modified_by, change_type,
       change_details, created_at
     ) VALUES ($1, $2, $3, $4, $5::jsonb, NOW())`,
    [
      input.memberId,
      input.subscriptionId,
      input.actor.id,
      "billing_cycle_reconciled",
      JSON.stringify({
        ...details,
        decision: input.decision,
        cycleMonth: input.cycleMonth,
        note: input.note,
        chargeSubmitted: false,
        performedByEmail: input.actor.email || null,
        performedByRole: input.actor.role || null,
      }),
    ],
  );
}
