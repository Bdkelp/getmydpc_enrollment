import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  canReconcileNorthPayments,
  NorthReconciliationError,
  parseReconciliationInput,
  reconcileNorthPaymentWithClient,
  SETTLED_CREDENTIAL_SOURCE,
  WAIVED_CREDENTIAL_SOURCE,
  type QueryClient,
} from "../server/services/north-payment-reconciliation";
import { evaluateRecurringCycleEligibility } from "../server/services/recurring-billing-cycle-policy";

// Synthetic values only.
const BUSINESS_DATE = "2026-10-01";
const SYNTHETIC_TRAN_ID = "SYNTHETICBRIC0000001";
const actor = { id: "11111111-2222-3333-4444-555555555555", email: "ops@example.com", role: "super_admin" };

type Cycle = {
  id: number;
  subscription_id: number;
  member_id: number;
  cycle_date: string;
  processor_reference: string;
  amount: string;
  payment_method_type: string;
  credential_source: string | null;
  state: string;
  attempt_count: number;
  skip_reason: string | null;
  processor_auth_code: string | null;
  processor_response_message: string | null;
  payment_id: number | null;
  next_billing_date: string | null;
};
type Payment = {
  id: number;
  member_id: number;
  subscription_id: number | null;
  amount: string;
  status: string;
  transaction_id: string | null;
  payment_method: string | null;
  payment_method_type: string | null;
  payment_transaction_at: string | null;
  verification_method: string | null;
  metadata: any;
};

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function monthEnd(monthStart: string): string {
  const d = new Date(`${monthStart}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

// Answers only the statements reconciliation may run; anything else throws.
class FakeDb implements QueryClient {
  statements: string[] = [];
  cycles: Cycle[] = [];
  payments: Payment[] = [];
  audits: Array<{ member_id: number; subscription_id: number; modified_by: string; change_type: string; details: any }> = [];
  private ids = { cycle: 500, payment: 9000 };

  constructor(
    public subscription: {
      id: number;
      member_id: number;
      status: string;
      billing_mode: string;
      amount: string;
      next_billing_date: string | null;
      current_period_start: string | null;
      current_period_end: string | null;
    },
    public member: { status: string; is_active: boolean; first_payment_date: Date | null; enrollment_date: Date | null },
  ) {}

  async query(sql: string, params: any[] = []) {
    this.statements.push(sql);
    const s = this.subscription;
    if (/FROM subscriptions s\s+JOIN members m ON m\.id = s\.member_id\s+WHERE s\.id = \$1\s+FOR UPDATE OF s/.test(sql)) {
      if (params[0] !== s.id) return { rows: [] };
      return {
        rows: [{
          id: s.id, member_id: s.member_id, status: s.status, billing_mode: s.billing_mode, amount: s.amount,
          next_billing_date: s.next_billing_date, member_status: this.member.status, member_is_active: this.member.is_active,
          first_payment_date: this.member.first_payment_date, enrollment_date: this.member.enrollment_date,
        }],
      };
    }
    if (/WHERE subscription_id = \$1 AND cycle_date >= \$2::date\s+AND cycle_date < \(\$2::date \+ INTERVAL '1 month'\)/.test(sql)) {
      const [subId, monthStart] = params;
      const end = monthEnd(monthStart);
      return {
        rows: this.cycles
          .filter((c) => c.subscription_id === subId && c.cycle_date >= monthStart && c.cycle_date < end)
          .sort((a, b) => a.cycle_date.localeCompare(b.cycle_date))
          .map((c) => ({ ...c })),
      };
    }
    if (/AS payment_id,\s+\(SELECT c\.id FROM recurring_billing_cycles c/.test(sql)) {
      const [ref, tranId] = params;
      const payment = this.payments.find(
        (p) =>
          (ref !== null && (p.transaction_id?.trim() === ref || p.metadata?.externalSettlement?.invoiceReference === ref)) ||
          (tranId !== null && p.metadata?.externalSettlement?.northTranId === tranId),
      );
      const cycle = ref !== null ? this.cycles.find((c) => c.processor_reference === ref) : undefined;
      return { rows: [{ payment_id: payment?.id ?? null, cycle_id: cycle?.id ?? null }] };
    }
    if (/AND \(\$2::numeric IS NULL OR p\.amount = \$2::numeric\)/.test(sql)) {
      const [memberId, amount, from, to] = params;
      const rows = this.payments.filter(
        (p) =>
          String(p.member_id) === String(memberId) &&
          ["success", "succeeded", "completed"].includes(p.status) &&
          (amount === null || Number(p.amount) === Number(amount)) &&
          (p.payment_transaction_at || "") >= from &&
          (p.payment_transaction_at || "") < to &&
          p.metadata?.transactionPurpose !== "payment_method_verification" &&
          !this.cycles.some((c) => c.payment_id === p.id),
      );
      return { rows: rows.map((p) => ({ id: p.id })) };
    }
    if (/WHERE subscription_id = \$1 AND cycle_date > \$2::date\s+AND state IN \('completed', 'skipped'\)/.test(sql)) {
      const [subId, after] = params;
      return {
        rows: this.cycles
          .filter((c) => c.subscription_id === subId && c.cycle_date > after && ["completed", "skipped"].includes(c.state))
          .map((c) => ({ cycle_date: c.cycle_date })),
      };
    }
    if (/^INSERT INTO payments \(/.test(sql)) {
      const [memberId, subId, amount, transactionId, method, methodType, paidDate, metadata] = params;
      if (this.payments.some((p) => p.transaction_id === transactionId)) {
        throw new Error("duplicate key value violates unique constraint payments_transaction_id_unique");
      }
      assert.match(sql, /'succeeded'/);
      assert.match(sql, /'manual_admin'/);
      const id = this.ids.payment++;
      this.payments.push({
        id, member_id: memberId, subscription_id: subId, amount, status: "succeeded", transaction_id: transactionId,
        payment_method: method, payment_method_type: methodType, payment_transaction_at: paidDate,
        verification_method: "manual_admin", metadata: JSON.parse(metadata),
      });
      return { rows: [{ id }], rowCount: 1 };
    }
    if (/^INSERT INTO recurring_billing_cycles \(/.test(sql)) {
      const settled = /'External', \$6, 'completed', 0/.test(sql);
      const waived = /'External', \$6, 'skipped', 0/.test(sql);
      assert.ok(settled || waived, "only completed External or skipped External cycles may be inserted");
      const [subId, memberId, cycleDate, reference, amount, source] = params;
      if (this.cycles.some((c) => c.subscription_id === subId && c.cycle_date === cycleDate)) {
        throw new Error("duplicate key value violates unique constraint (subscription_id, cycle_date)");
      }
      if (this.cycles.some((c) => c.processor_reference === reference)) {
        throw new Error("duplicate key value violates unique constraint processor_reference");
      }
      const id = this.ids.cycle++;
      this.cycles.push({
        id, subscription_id: subId, member_id: memberId, cycle_date: cycleDate, processor_reference: reference, amount,
        payment_method_type: "External", credential_source: source, state: settled ? "completed" : "skipped",
        attempt_count: 0, skip_reason: waived ? "platform_gap_waived" : null,
        processor_auth_code: settled ? params[6] : null,
        processor_response_message: settled ? params[7] : params[6],
        payment_id: settled ? params[8] : null,
        next_billing_date: settled ? params[9] : params[7],
      });
      return { rows: [{ id }], rowCount: 1 };
    }
    if (/^UPDATE subscriptions\s+SET next_billing_date = \$3::date, current_period_start = \$2::date,\s+current_period_end = \$3::date, updated_at = NOW\(\)\s+WHERE id = \$1 AND TO_CHAR\(next_billing_date, 'YYYY-MM-DD'\) = \$2$/.test(sql)) {
      const [subId, expected, newNext] = params;
      if (subId !== s.id || s.next_billing_date !== expected) return { rows: [], rowCount: 0 };
      s.next_billing_date = newNext;
      s.current_period_start = expected;
      s.current_period_end = newNext;
      return { rows: [], rowCount: 1 };
    }
    if (/^INSERT INTO enrollment_modifications \(/.test(sql)) {
      const [memberId, subId, modifiedBy, changeType, details] = params;
      this.audits.push({ member_id: memberId, subscription_id: subId, modified_by: modifiedBy, change_type: changeType, details: JSON.parse(details) });
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected SQL in reconciliation: ${sql}`);
  }

  writes() {
    return this.statements.filter((sql) => /^(INSERT|UPDATE|DELETE)/.test(sql.trim()));
  }
}

const anchor = (day: number) => new Date(`2026-04-${String(day).padStart(2, "0")}T17:00:00Z`);

function db(nextBillingDate: string | null, anchorDay: number, overrides: { memberStatus?: string; subscriptionStatus?: string; amount?: string } = {}) {
  return new FakeDb(
    {
      id: 68,
      member_id: 63,
      status: overrides.subscriptionStatus || "active",
      billing_mode: "automatic",
      amount: overrides.amount || "123.76",
      next_billing_date: nextBillingDate,
      current_period_start: null,
      current_period_end: null,
    },
    { status: overrides.memberStatus || "active", is_active: true, first_payment_date: anchor(anchorDay), enrollment_date: null },
  );
}

function settledInput(overrides: Record<string, unknown> = {}) {
  return parseReconciliationInput({
    memberId: 63,
    subscriptionId: 68,
    cycleMonth: "2026-09",
    decision: "settled_external",
    paymentMethodType: "CreditCard",
    northPaymentDate: "2026-09-21",
    amount: "123.76",
    externalReference: "INV-TEST-0001",
    authorizationCode: "123456",
    northTranId: SYNTHETIC_TRAN_ID,
    ...overrides,
  });
}

function waiveInput(cycleMonth: string, overrides: Record<string, unknown> = {}) {
  return parseReconciliationInput({
    memberId: 63,
    subscriptionId: 68,
    cycleMonth,
    decision: "waive_platform_gap",
    note: "Platform failed to bill this month",
    ...overrides,
  });
}

async function run(fake: FakeDb, input: ReturnType<typeof parseReconciliationInput>, dryRun = false) {
  return reconcileNorthPaymentWithClient(fake, { ...input, actor, businessDate: BUSINESS_DATE, dryRun });
}

async function expectRejected(promise: Promise<unknown>, status: number, code: string) {
  let caught: NorthReconciliationError | null = null;
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof NorthReconciliationError, String(error));
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    caught = error;
    return true;
  });
  return caught as unknown as NorthReconciliationError;
}

const forbiddenSql =
  /payment_tokens|UPDATE members|billing_mode\s*=|mark_recurring_cycle_submitting|finalize_recurring_cycle_success|claim_recurring|UPDATE payments|DELETE /i;

function assertNoForbiddenSql(fake: FakeDb, label: string) {
  for (const sql of fake.statements) {
    assert.doesNotMatch(sql, forbiddenSql, `${label}: reconciliation must not touch credentials, member status, billing mode, or processor flows`);
  }
}

async function testInputValidationAndAuthorization() {
  assert.equal(canReconcileNorthPayments("super_admin"), true);
  for (const role of ["admin", "agent", "member", "", null, undefined]) {
    assert.equal(canReconcileNorthPayments(role), false, `${role} must not reconcile`);
  }
  const route = fs.readFileSync(path.join(process.cwd(), "server/routes/north-payment-reconciliation.ts"), "utf8");
  assert.ok(
    route.indexOf("canReconcileNorthPayments(req.user.role)") >= 0 &&
      route.indexOf("canReconcileNorthPayments(req.user.role)") < route.indexOf("await reconcileNorthPayment("),
    "the route must reject non-super-admins before any work",
  );
  assert.match(route, /mode \|\| "preview"/, "preview is the default mode");

  const invalid: Array<[Record<string, unknown>, string]> = [
    [{ cycleMonth: "2026-9" }, "invalid_cycle_month"],
    [{ cycleMonth: "2026-13" }, "invalid_cycle_month"],
    [{ decision: "charge" }, "invalid_decision"],
    [{ paymentMethodType: "Savings" }, "invalid_payment_method_type"],
    [{ northPaymentDate: "2026-02-30" }, "invalid_payment_date"],
    [{ amount: "0" }, "invalid_amount"],
    [{ amount: "-5" }, "invalid_amount"],
    [{ amount: "12.345" }, "invalid_amount"],
    [{ externalReference: "a b" }, "invalid_external_reference"],
    [{ authorizationCode: "12-34" }, "invalid_authorization_code"],
    [{ northTranId: "bad id!" }, "invalid_north_tran_id"],
    [{ externalReference: "", northTranId: "" }, "evidence_required"],
    [{ memberId: 0 }, "invalid_member"],
  ];
  for (const [override, code] of invalid) {
    assert.throws(() => settledInput(override), (error: unknown) => {
      assert.ok(error instanceof NorthReconciliationError);
      assert.equal(error.status, 400);
      assert.equal(error.code, code, JSON.stringify(override));
      return true;
    });
  }
  assert.throws(() => waiveInput("2026-06", { note: "" }), /reason note/);
  // Evidence: the North Tran ID / BRIC alone is enough.
  assert.equal(settledInput({ externalReference: "" }).northTranId, SYNTHETIC_TRAN_ID);
}

async function testExternallySettledCycleCreation() {
  const fake = db("2026-09-21", 21);
  const result = await run(fake, settledInput());

  assert.equal(result.outcome, "reconciled");
  assert.equal(result.cycleDate, "2026-09-21");
  assert.equal(result.previousNextBillingDate, "2026-09-21");
  assert.equal(result.nextBillingDate, "2026-10-21");
  assert.equal(result.chargeSubmitted, false);
  assert.equal(result.memberEligibleForPaymentConfirmation, true);
  assert.equal(result.amountMatchesSubscription, true);

  assert.equal(fake.payments.length, 1);
  const [payment] = fake.payments;
  assert.deepEqual(
    {
      status: payment.status,
      transaction_id: payment.transaction_id,
      payment_method: payment.payment_method,
      payment_method_type: payment.payment_method_type,
      verification_method: payment.verification_method,
      payment_transaction_at: payment.payment_transaction_at,
      amount: payment.amount,
      subscription_id: payment.subscription_id,
    },
    {
      status: "succeeded",
      transaction_id: "NORTH-EXT-68-20260921",
      payment_method: "card",
      payment_method_type: "CreditCard",
      verification_method: "manual_admin",
      payment_transaction_at: "2026-09-21",
      amount: "123.76",
      subscription_id: 68,
    },
  );
  assert.equal(payment.metadata.source, "manual_external_reconciliation");
  assert.equal(payment.metadata.externalSettlement.processor, "North merchant portal");
  assert.equal(payment.metadata.externalSettlement.invoiceReference, "INV-TEST-0001");
  assert.equal(payment.metadata.externalSettlement.authorizationReference, "123456");
  assert.equal(payment.metadata.externalSettlement.northTranId, SYNTHETIC_TRAN_ID);
  assert.equal(payment.metadata.externalSettlement.cycleDate, "2026-09-21");
  assert.equal(payment.metadata.externalSettlement.billingModeAfterSettlement, "automatic");

  assert.equal(fake.cycles.length, 1);
  const [cycle] = fake.cycles;
  assert.deepEqual(
    {
      state: cycle.state,
      payment_method_type: cycle.payment_method_type,
      credential_source: cycle.credential_source,
      processor_reference: cycle.processor_reference,
      processor_auth_code: cycle.processor_auth_code,
      payment_id: cycle.payment_id,
      attempt_count: cycle.attempt_count,
      next_billing_date: cycle.next_billing_date,
    },
    {
      state: "completed",
      payment_method_type: "External",
      credential_source: SETTLED_CREDENTIAL_SOURCE,
      processor_reference: "NORTH-EXT-68-20260921",
      processor_auth_code: "123456",
      payment_id: payment.id,
      attempt_count: 0,
      next_billing_date: "2026-10-21",
    },
  );
  assert.match(String(cycle.processor_response_message), /platform did not submit payment/);

  assert.equal(fake.subscription.next_billing_date, "2026-10-21");
  assert.equal(fake.subscription.current_period_start, "2026-09-21");
  assert.equal(fake.subscription.current_period_end, "2026-10-21");
  assert.equal(fake.subscription.billing_mode, "automatic", "billing mode unchanged");
  assert.equal(fake.subscription.status, "active");
  assert.equal(fake.member.status, "active", "member status unchanged");

  assert.equal(fake.audits.length, 1);
  assert.equal(fake.audits[0].change_type, "billing_cycle_reconciled");
  assert.equal(fake.audits[0].modified_by, actor.id);
  assert.equal(fake.audits[0].details.decision, "settled_external");
  assert.equal(fake.audits[0].details.chargeSubmitted, false);
  assert.equal(fake.audits[0].details.nextBillingDate, "2026-10-21");
  // The full North Tran ID / BRIC stays in payment metadata; the audit is masked.
  assert.equal(fake.audits[0].details.northTranId, `****${SYNTHETIC_TRAN_ID.slice(-4)}`);
  assertNoForbiddenSql(fake, "settled");

  // ACH evidence records an ach payment method.
  const ach = db("2026-09-21", 21);
  await run(ach, settledInput({ paymentMethodType: "ACH" }));
  assert.equal(ach.payments[0].payment_method, "ach");
  assert.equal(ach.payments[0].payment_method_type, "ACH");

  // A different external amount is recorded and flagged, not blocked.
  const partial = db("2026-09-21", 21);
  const partialResult = await run(partial, settledInput({ amount: "119.00" }));
  assert.equal(partialResult.amountMatchesSubscription, false);
  assert.equal(partial.payments[0].amount, "119.00");

  // Preview never writes.
  const preview = db("2026-09-21", 21);
  const previewResult = await run(preview, settledInput(), true);
  assert.equal(previewResult.outcome, "preview");
  assert.equal(previewResult.nextBillingDate, "2026-10-21");
  assert.deepEqual(preview.writes(), []);
}

async function testDuplicatePrevention() {
  // Same reconciliation twice: one payment, one cycle, one advance.
  const fake = db("2026-09-21", 21);
  await run(fake, settledInput());
  const replay = await run(fake, settledInput());
  assert.equal(replay.outcome, "already_reconciled");
  assert.equal(replay.paymentId, fake.payments[0].id);
  assert.equal(fake.payments.length, 1);
  assert.equal(fake.cycles.length, 1);
  assert.equal(fake.subscription.next_billing_date, "2026-10-21", "no second advance");
  // A replay with different evidence still cannot duplicate the month.
  const replayDifferent = await run(fake, settledInput({ externalReference: "INV-TEST-0099", amount: "50.00" }));
  assert.equal(replayDifferent.outcome, "already_reconciled");
  assert.equal(fake.payments.length, 1);
  assert.equal(fake.audits.length, 3, "every reconciliation action is audited");
  assert.equal(fake.audits[2].details.outcome, "already_reconciled");
  // No audit entry, first write or replay, ever contains the raw North Tran ID / BRIC.
  for (const audit of fake.audits) {
    const serialized = JSON.stringify(audit);
    assert.ok(!serialized.includes(SYNTHETIC_TRAN_ID), "audit JSON must never contain the raw North Tran ID / BRIC");
    assert.ok(!serialized.includes(SYNTHETIC_TRAN_ID.slice(0, -4)), "audit JSON may carry only the last four characters");
  }

  // The same North evidence cannot settle a second month.
  const twoMonths = db("2026-08-17", 17);
  await run(twoMonths, settledInput({ cycleMonth: "2026-08", northPaymentDate: "2026-08-17", amount: "123.76" }));
  assert.equal(twoMonths.subscription.next_billing_date, "2026-09-17");
  await expectRejected(
    run(twoMonths, settledInput({ cycleMonth: "2026-09", northPaymentDate: "2026-09-17" })),
    409,
    "external_reference_already_recorded",
  );
  await expectRejected(
    run(twoMonths, settledInput({ cycleMonth: "2026-09", northPaymentDate: "2026-09-17", externalReference: "INV-TEST-0002" })),
    409,
    "external_reference_already_recorded",
  );
  assert.equal(twoMonths.payments.length, 1);

  // Evidence already recorded by the earlier manual repair pattern.
  const legacy = db("2026-09-21", 21);
  legacy.payments.push({
    id: 138, member_id: 29, subscription_id: 35, amount: "119.00", status: "succeeded", transaction_id: "MPP-TEST-0828",
    payment_method: "card", payment_method_type: "CreditCard", payment_transaction_at: "2026-08-28", verification_method: "manual_admin",
    metadata: { externalSettlement: { invoiceReference: "MPP-TEST-0828" } },
  });
  await expectRejected(run(legacy, settledInput({ externalReference: "MPP-TEST-0828" })), 409, "external_reference_already_recorded");

  // A month already billed by the platform is not recorded again.
  const platformBilled = db("2026-09-21", 21);
  platformBilled.cycles.push({
    id: 7, subscription_id: 68, member_id: 63, cycle_date: "2026-09-21", processor_reference: "RECUR-68-20260921", amount: "123.76",
    payment_method_type: "CreditCard", credential_source: "payment_tokens.bric_token", state: "completed", attempt_count: 1,
    skip_reason: null, processor_auth_code: "A1", processor_response_message: null, payment_id: 77, next_billing_date: "2026-10-21",
  });
  const recorded = await expectRejected(run(platformBilled, settledInput()), 409, "cycle_already_recorded");
  assert.equal(recorded.details?.state, "completed");
  assert.deepEqual(platformBilled.writes(), []);

  // A matching successful platform payment in the cycle period is already represented.
  const represented = db("2026-09-21", 21);
  represented.payments.push({
    id: 61, member_id: 63, subscription_id: 68, amount: "123.76", status: "succeeded", transaction_id: "HOSTED-1",
    payment_method: "card", payment_method_type: "CreditCard", payment_transaction_at: "2026-09-25", verification_method: null, metadata: {},
  });
  const exists = await expectRejected(run(represented, settledInput()), 409, "platform_payment_exists");
  assert.deepEqual(exists.details?.paymentIds, [61]);
  // $1 card verifications and payments already tied to a cycle don't count.
  const verificationOnly = db("2026-09-21", 21);
  verificationOnly.payments.push({
    id: 62, member_id: 63, subscription_id: 68, amount: "123.76", status: "succeeded", transaction_id: "VERIFY-1",
    payment_method: "card", payment_method_type: "CreditCard", payment_transaction_at: "2026-09-25", verification_method: null,
    metadata: { transactionPurpose: "payment_method_verification" },
  });
  await run(verificationOnly, settledInput());
  assert.equal(verificationOnly.payments.length, 2);
}

async function testDateAdvancement() {
  // September paid, August open: refuse, surface August, write nothing.
  const fake = db("2026-08-17", 17);
  const surfaced = await expectRejected(
    run(fake, settledInput({ cycleMonth: "2026-09", northPaymentDate: "2026-09-17" })),
    409,
    "earlier_cycles_unresolved",
  );
  assert.deepEqual(surfaced.details?.unresolvedCycles, [
    { cycleDate: "2026-08-17", recommendedAction: "reconcile_or_waive_or_collect_one_cycle" },
  ]);
  assert.match(surfaced.message, /2026-08-17/);
  assert.deepEqual(fake.writes(), []);
  assert.equal(fake.subscription.next_billing_date, "2026-08-17", "never advanced past an unverified month");

  // A month before next_billing_date is already covered.
  await expectRejected(run(fake, settledInput({ cycleMonth: "2026-07", northPaymentDate: "2026-07-17" })), 409, "month_already_covered");

  // Advancing stops at the next open cycle.
  await run(fake, settledInput({ cycleMonth: "2026-08", northPaymentDate: "2026-08-18" }));
  assert.equal(fake.subscription.next_billing_date, "2026-09-17");

  // Advancing passes later cycles already recorded as settled, and no further.
  const skipSettled = db("2026-08-17", 17);
  skipSettled.cycles.push({
    id: 8, subscription_id: 68, member_id: 63, cycle_date: "2026-09-17", processor_reference: "RECUR-68-20260917", amount: "123.76",
    payment_method_type: "CreditCard", credential_source: "payment_tokens.bric_token", state: "completed", attempt_count: 1,
    skip_reason: null, processor_auth_code: "A2", processor_response_message: null, payment_id: 88, next_billing_date: "2026-10-17",
  });
  const passed = await run(skipSettled, settledInput({ cycleMonth: "2026-08", northPaymentDate: "2026-08-17" }));
  assert.equal(passed.nextBillingDate, "2026-10-17");
  assert.equal(skipSettled.subscription.next_billing_date, "2026-10-17");

  // Not-yet-due cycles and implausible payment dates are refused.
  await expectRejected(run(db("2026-10-21", 21), settledInput({ cycleMonth: "2026-10", northPaymentDate: "2026-09-30" })), 409, "cycle_not_due");
  await expectRejected(run(db("2026-09-21", 21), settledInput({ northPaymentDate: "2026-10-02" })), 400, "payment_date_in_future");
  await expectRejected(run(db("2026-09-21", 21), settledInput({ northPaymentDate: "2026-08-01" })), 400, "payment_date_before_cycle");

  // A billing date changed mid-reconciliation is not overwritten.
  const raced = db("2026-09-21", 21);
  const originalQuery = raced.query.bind(raced);
  raced.query = async (sql: string, params: any[] = []) => {
    if (/^UPDATE subscriptions/.test(sql)) raced.subscription.next_billing_date = "2026-09-30";
    return originalQuery(sql, params);
  };
  await expectRejected(run(raced, settledInput()), 409, "subscription_changed");
}

async function testHistoricalHoldRelease() {
  // Months behind: June/July platform gaps, August paid in North, September current.
  const fake = db("2026-06-03", 3, { amount: "61.36" });
  const anchorDay = 3;
  assert.equal(
    evaluateRecurringCycleEligibility({ cycleDate: "2026-06-03", anchorDay, businessDate: BUSINESS_DATE }).eligible,
    false,
    "starts held by the historical-cycle policy",
  );

  // Asking for September surfaces every open month with its policy action.
  const surfaced = await expectRejected(
    run(fake, settledInput({ cycleMonth: "2026-09", northPaymentDate: "2026-09-03", amount: "61.36" })),
    409,
    "earlier_cycles_unresolved",
  );
  assert.deepEqual(surfaced.details?.unresolvedCycles, [
    { cycleDate: "2026-06-03", recommendedAction: "waive_platform_gap" },
    { cycleDate: "2026-07-03", recommendedAction: "waive_platform_gap" },
    { cycleDate: "2026-08-03", recommendedAction: "reconcile_or_waive_or_collect_one_cycle" },
  ]);

  const june = await run(fake, waiveInput("2026-06"));
  assert.equal(june.holdReleased, false);
  assert.equal(june.nextCycleEligibleForAutomaticBilling, false, "still held while July and August are open");
  assert.equal(fake.subscription.next_billing_date, "2026-07-03");

  // A platform payment in July means July cannot be waived.
  fake.payments.push({
    id: 70, member_id: 63, subscription_id: 68, amount: "61.36", status: "succeeded", transaction_id: "JULY-1",
    payment_method: "card", payment_method_type: "CreditCard", payment_transaction_at: "2026-07-10", verification_method: null, metadata: {},
  });
  await expectRejected(run(fake, waiveInput("2026-07")), 409, "platform_payment_exists");
  fake.payments.pop();

  const july = await run(fake, waiveInput("2026-07"));
  assert.equal(july.holdReleased, false);
  assert.equal(fake.subscription.next_billing_date, "2026-08-03");

  const august = await run(fake, settledInput({ cycleMonth: "2026-08", northPaymentDate: "2026-08-04", amount: "61.36" }));
  assert.equal(august.holdReleased, true, "hold released once only the current cycle remains");
  assert.equal(august.nextCycleEligibleForAutomaticBilling, true);
  assert.equal(fake.subscription.next_billing_date, "2026-09-03");
  assert.equal(
    evaluateRecurringCycleEligibility({ cycleDate: "2026-09-03", anchorDay, businessDate: BUSINESS_DATE }).eligible,
    true,
    "normal one-cycle billing resumes with September only",
  );

  // The current cycle cannot be waived; it is billed normally or reconciled as paid.
  await expectRejected(run(fake, waiveInput("2026-09")), 409, "cannot_waive_current_cycle");

  const waived = fake.cycles.filter((c) => c.credential_source === WAIVED_CREDENTIAL_SOURCE);
  assert.equal(waived.length, 2);
  for (const cycle of waived) {
    assert.equal(cycle.state, "skipped");
    assert.equal(cycle.skip_reason, "platform_gap_waived");
    assert.equal(cycle.payment_id, null);
    assert.match(cycle.processor_reference, /^NORTH-WAIVE-68-20260[67]03$/);
    assert.equal(cycle.amount, "61.36");
  }
  assert.equal(fake.payments.length, 1, "waivers create no payment");
  assert.equal(fake.audits.length, 3);
  assertNoForbiddenSql(fake, "hold release");

  // Replaying a waiver is idempotent.
  const replay = await run(fake, waiveInput("2026-06"));
  assert.equal(replay.outcome, "already_reconciled");
  assert.equal(fake.cycles.length, 3);
}

async function testNoChargeAndStatusSideEffects() {
  // Cancelled members and subscriptions are not reconciled or reactivated.
  const cancelled = db("2026-09-21", 21, { memberStatus: "cancelled" });
  await expectRejected(run(cancelled, settledInput()), 409, "member_cancelled");
  assert.deepEqual(cancelled.writes(), []);
  await expectRejected(run(db("2026-09-21", 21, { subscriptionStatus: "cancelled" }), settledInput()), 409, "subscription_cancelled");
  await expectRejected(run(db("2026-09-21", 21), settledInput({ memberId: 99 })), 409, "member_subscription_mismatch");
  await expectRejected(run(db("2026-09-21", 21), settledInput({ subscriptionId: 5 })), 404, "subscription_not_found");

  // Suspended members are reconciled without any member change, and
  // commission processing (which would set status active) is deferred.
  const suspended = db("2026-09-21", 21, { memberStatus: "suspended" });
  const result = await run(suspended, settledInput());
  assert.equal(result.outcome, "reconciled");
  assert.equal(result.memberEligibleForPaymentConfirmation, false);
  assert.equal(suspended.member.status, "suspended");
  assertNoForbiddenSql(suspended, "suspended");

  const wrapper = fs.readFileSync(path.join(process.cwd(), "server/services/north-payment-reconciliation-service.ts"), "utf8");
  assert.ok(
    wrapper.indexOf("if (!result.memberEligibleForPaymentConfirmation)") >= 0 &&
      wrapper.indexOf("if (!result.memberEligibleForPaymentConfirmation)") < wrapper.indexOf("await processConfirmedPayment("),
    "payment confirmation (which sets member status active) runs only for already-active members",
  );
  assert.match(wrapper, /options\.dryRun \|\| input\.decision !== "settled_external"/, "previews and waivers never run payment confirmation");

  const core = fs.readFileSync(path.join(process.cwd(), "server/services/north-payment-reconciliation.ts"), "utf8");
  assert.doesNotMatch(
    core,
    /epx-payment-service|submitServerPost|durable-recurring-billing|payment-confirmed-service|EPXHostedCheckoutService|neonDb|storage"/,
    "reconciliation must not import any charge, billing, or direct database path",
  );
  for (const file of ["server/services/north-payment-reconciliation-service.ts", "server/routes/north-payment-reconciliation.ts"]) {
    assert.doesNotMatch(
      fs.readFileSync(path.join(process.cwd(), file), "utf8"),
      /submitServerPost|runDurableRecurringBilling|EPXHostedCheckoutService/,
      `${file} must not reach a processor charge path`,
    );
  }
}

async function main() {
  await testInputValidationAndAuthorization();
  await testExternallySettledCycleCreation();
  await testDuplicatePrevention();
  await testDateAdvancement();
  await testHistoricalHoldRelease();
  await testNoChargeAndStatusSideEffects();
  console.log("North payment reconciliation tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
