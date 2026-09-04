import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  processClaimedBillingCycle,
  processJustInTimeBatch,
  type DurableBillingCycle,
  type DurableCycleRepository,
  type ProcessorResult,
  type RecurringProcessorAdapter,
} from "../server/services/durable-recurring-billing-engine";
import {
  calculateNextBillingCycleDate,
  calculateNextBillingDate,
  formatPostgresDateOnly,
} from "../server/utils/membership-dates";

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(
    root,
    "scripts/sql/2026-09-02_recurring_billing_durable_cycles.sql",
  ),
  "utf8",
);
const scheduleMigration = fs.readFileSync(
  path.join(
    root,
    "scripts/sql/2026-09-02b_recurring_billing_external_schedule.sql",
  ),
  "utf8",
);
const lifecycleMigration = fs.readFileSync(
  path.join(
    root,
    "scripts/sql/2026-09-02c_subscription_billing_mode_lifecycle.sql",
  ),
  "utf8",
);
const periodTerminationMigration = fs.readFileSync(
  path.join(
    root,
    "scripts/sql/2026-09-02d_subscription_period_termination_semantics.sql",
  ),
  "utf8",
);
const service = fs.readFileSync(
  path.join(root, "server/services/durable-recurring-billing-service.ts"),
  "utf8",
);
const storage = fs.readFileSync(path.join(root, "server/storage.ts"), "utf8");
const serverIndex = fs.readFileSync(path.join(root, "server/index.ts"), "utf8");
const reconciliationRoutes = fs.readFileSync(
  path.join(root, "server/routes/payment-reconciliation.ts"),
  "utf8",
);
const paymentDiagnosticRoutes = fs.readFileSync(
  path.join(root, "server/routes/payment-diagnostic.ts"),
  "utf8",
);
const mainRoutes = fs.readFileSync(path.join(root, "server/routes.ts"), "utf8");
const gitignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");

assert.match(migration, /UNIQUE \(subscription_id, cycle_date\)/);
assert.match(migration, /UNIQUE \(processor_reference\)/);
assert.match(migration, /FOR UPDATE SKIP LOCKED/);
assert.match(migration, /subscription\.billing_mode = 'automatic'/);
assert.match(migration, /FOR UPDATE OF subscription/);
assert.match(
  migration,
  /cycle\.state = 'declined'[\s\S]*cycle\.next_attempt_at IS NOT NULL[\s\S]*cycle\.next_attempt_at <= NOW\(\)/,
  "confirmed declines with a scheduled retry must be reclaimable",
);
assert.doesNotMatch(
  migration,
  /cycle\.state = 'submitting'[\s\S]{0,160}lease_expires_at/,
  "an expired lease must never automatically resubmit a cycle that reached submitting",
);
assert.match(
  migration,
  /ON CONFLICT \(transaction_id\)[\s\S]*WHERE transaction_id IS NOT NULL[\s\S]*status IN \('success', 'succeeded', 'completed'\)[\s\S]*DO NOTHING/,
);
assert.match(
  migration,
  /successful transaction id conflicts with another payment identity/,
);
assert.match(
  migration,
  /p_transaction_id IS DISTINCT FROM cycle\.processor_reference/,
);
assert.match(
  migration,
  /p_subscription_ids IS NULL OR cycle\.subscription_id = ANY\(p_subscription_ids\)/,
);
assert.match(migration, /claim_recurring_internal_sync_cycles/);
assert.match(
  migration,
  /normalized_next_billing_date := p_next_billing_date::timestamp/,
);
assert.match(migration, /current_due::date = cycle\.cycle_date/);
assert.match(migration, /next_billing_date timestamp without time zone/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(
  migration,
  /GRANT SELECT, INSERT, UPDATE, DELETE[\s\S]*TO service_role/,
);
assert.match(service, /updated_at = NOW\(\),[\s\S]*next_attempt_at = NULL/);
assert.match(service, /MAX_PROCESSOR_ATTEMPTS_PER_CYCLE = 2/);
assert.match(
  service,
  /WHEN attempt_count >= \$6 THEN 'decline_requires_attention'[\s\S]*WHEN attempt_count < \$6 THEN NOW\(\) \+ make_interval\(days => \$7\) ELSE NULL END/,
  "only the first decline may schedule a retry",
);
assert.match(service, /two_attempt_decline_limit_reached/);
assert.match(service, /requiresAttention: true/);
assert.match(service, /processorReference: cycle\.processorReference/);
assert.doesNotMatch(service, /RECURRING_BILLING_MAX_ATTEMPTS_PER_CYCLE/);
assert.match(storage, /s\.billing_mode = 'automatic'/);
assert.match(storage, /paymentTokenId: number \| null/);
assert.match(storage, /payment_token_id: entry\.paymentTokenId/);
assert.doesNotMatch(storage, /payment_token_id: entry\.paymentTokenId\s*\?\?/);
assert.match(
  storage,
  /TO_CHAR\(s\.next_billing_date, 'YYYY-MM-DD'\) AS next_billing_date/,
);
assert.match(
  storage,
  /s\.termination_effective_at IS NULL[\s\S]*s\.termination_effective_at > \$1::timestamptz/,
);
assert.doesNotMatch(storage, /s\.end_date IS NULL OR s\.end_date >/);
assert.doesNotMatch(service, /new Date\(subscription\.nextBillingDate\)/);
assert.match(service, /cycleDate: subscription\.nextBillingDate/);
assert.match(service, /claim_recurring_billing_cycles\(\$1, \$2, 1,/);
assert.match(service, /claim_recurring_internal_sync_cycles\(\$1, \$2, 1,/);
assert.match(service, /\[DurableBilling\]\[ALERT\] Due subscription skipped/);
assert.match(service, /upsertRecurringBillingExceptionNotification\(\{/);
assert.match(service, /resolveRecurringBillingExceptionNotifications\(\{/);
assert.match(
  storage,
  /error_message IS DISTINCT FROM \$3[\s\S]*resolved = false/,
);
assert.match(storage, /metadata->>'cycleDate' = \$2[\s\S]*error_message = \$3/);
assert.match(migration, /uq_recurring_billing_exception_unresolved/);
assert.match(service, /missing_payment_credentials/);
assert.match(service, /includeACH: true/);
assert.match(service, /cycle\.paymentMethodType === "ACH" \? "CKC2" : "CCE1"/);
assert.doesNotMatch(service, /unsupported_ach/);
assert.doesNotMatch(
  storage,
  /AND pt\.payment_method_type = ANY\(\$2::text\[\]\)/,
);
assert.doesNotMatch(
  storage,
  /gp\.payer_type = 'group' AND \(t_group\.id IS NOT NULL/,
);
const dryRunBranch = service.slice(
  service.indexOf("if (dryRun) {"),
  service.indexOf("const run = await query", service.indexOf("if (dryRun) {")),
);
assert.match(dryRunBranch, /INSERT INTO public\.recurring_billing_runs/);
assert.match(dryRunBranch, /'dry_run', 'completed'/);
assert.doesNotMatch(
  dryRunBranch,
  /recurring_billing_cycles|processor\.submit|claim_recurring/,
);
assert.doesNotMatch(serverIndex, /startRecurringBillingScheduler\s*\(/);
assert.doesNotMatch(reconciliationRoutes, /storage\.createPayment\s*\(/);
assert.match(reconciliationRoutes, /status\(410\)/);
assert.match(scheduleMigration, /VALUES \(true, false, 'dry_run', true\)/);
assert.match(
  scheduleMigration,
  /ALTER TABLE public\.recurring_billing_configuration ENABLE ROW LEVEL SECURITY/,
);
assert.match(
  scheduleMigration,
  /REVOKE ALL ON TABLE public\.recurring_billing_configuration FROM PUBLIC, anon, authenticated/,
);
const healthFunction = scheduleMigration.slice(
  scheduleMigration.indexOf("check_external_recurring_billing_health"),
);
assert.match(
  healthFunction,
  /IF NOT config\.enabled OR config\.kill_switch THEN RETURN NULL/,
);
assert.match(lifecycleMigration, /'automatic', 'manual_external', 'disabled'/);
assert.match(lifecycleMigration, /state = 'submitting'/);
assert.match(lifecycleMigration, /state IN \('ready', 'claimed', 'declined'\)/);
assert.match(lifecycleMigration, /AT TIME ZONE 'America\/Chicago'/);
assert.match(lifecycleMigration, /finalize_due_scheduled_cancellations/);
assert.match(lifecycleMigration, /GET DIAGNOSTICS [a-z_]+ = ROW_COUNT/);
assert.match(
  periodTerminationMigration,
  /ADD COLUMN IF NOT EXISTS termination_effective_at timestamptz/,
);
assert.match(
  periodTerminationMigration,
  /subscription_legacy_period_date_candidates/,
);
assert.match(
  periodTerminationMigration,
  /SET current_period_start = cycle\.cycle_date::timestamp,[\s\S]*current_period_end = normalized_next_billing_date,[\s\S]*next_billing_date = normalized_next_billing_date/,
);
assert.match(
  periodTerminationMigration,
  /pending_reason = 'member_cancelled',[\s\S]*termination_effective_at = v_effective_at/,
);
assert.match(
  periodTerminationMigration,
  /subscription\.termination_effective_at IS NOT NULL[\s\S]*subscription\.termination_effective_at <= p_now/,
);
assert.doesNotMatch(
  periodTerminationMigration,
  /SET[\s\S]{0,120}end_date = v_effective_at/,
);
assert.match(service, /finalize_due_scheduled_cancellations/);
assert.match(service, /claim_recurring_internal_sync_cycles/);
assert.match(service, /assertSingleCycleUpdate/);
assert.match(
  service,
  /Controlled retries must be included in an explicit targeted subscription run/,
);
assert.match(
  service,
  /getSubscriptionsDueForBilling\(now, \{[\s\S]*controlledRetrySubscriptionIds,[\s\S]*subscriptionIds,/,
);
assert.match(
  paymentDiagnosticRoutes,
  /controlledRetrySubscriptionIds:parseSubscriptionIds|controlledRetrySubscriptionIds = parseSubscriptionIds/,
);
const operatorWorkflowRoute = paymentDiagnosticRoutes.slice(
  paymentDiagnosticRoutes.indexOf(
    '"/api/admin/diagnostic/recurring-billing/operator-workflow"',
  ),
);
assert.match(operatorWorkflowRoute, /controlledRetrySubscriptionIds/);
assert.match(reconciliationRoutes, /missing_all_processor_references/);
assert.match(reconciliationRoutes, /group_payment_managed_separately/);
assert.match(reconciliationRoutes, /exceptions/);
const sensitiveRoute = mainRoutes.slice(
  mainRoutes.indexOf('"/api/admin/member/:memberId/sensitive"'),
  mainRoutes.indexOf(
    "auditLog:",
    mainRoutes.indexOf('"/api/admin/member/:memberId/sensitive"'),
  ),
);
assert.match(sensitiveRoute, /revealPayment \? paymentToken\?\.bric_token/);
assert.match(
  sensitiveRoute,
  /revealPayment[\s\S]*paymentReceipt\?\.epx_auth_guid/,
);
assert.match(sensitiveRoute, /routingNumber: revealBank \? rawRoutingNumber/);
assert.match(
  sensitiveRoute,
  /tokenRoutingNumber: revealBank \? rawTokenRoutingNumber/,
);
assert.doesNotMatch(sensitiveRoute, /routingNumberReadable/);
assert.match(gitignore, /^\.env$/m);
assert.match(gitignore, /^\.env\.\*$/m);

const cycle: DurableBillingCycle = {
  id: 11,
  subscriptionId: 22,
  memberId: 33,
  cycleDate: "2026-09-15",
  processorReference: "RECUR-22-20260915",
  amount: "49.00",
  paymentMethodType: "CreditCard",
  authGuid: "AUTH-GUID-12345678",
  leaseToken: "00000000-0000-4000-8000-000000000001",
};

class FakeRepository implements DurableCycleRepository {
  state = "claimed";
  paymentId = 700;
  events: string[] = [];

  async markSubmitting(): Promise<void> {
    assert.equal(this.state, "claimed");
    this.state = "submitting";
    this.events.push("submitting");
  }
  async markUnknown(
    _cycle: DurableBillingCycle,
    reason: string,
  ): Promise<void> {
    this.state = "unknown";
    this.events.push(`unknown:${reason}`);
  }
  async markDeclined(
    _cycle: DurableBillingCycle,
    _result: ProcessorResult,
  ): Promise<void> {
    this.state = "declined";
    this.events.push("declined");
  }
  async finalizeProcessorSuccess(): Promise<{ paymentId: number }> {
    assert.ok(["submitting", "internal_sync_pending"].includes(this.state));
    this.state = "completed";
    this.events.push("finalized");
    return { paymentId: this.paymentId };
  }
  async completeInternalSync(): Promise<void> {
    this.state = "completed";
    this.events.push("synced");
  }
  async markInternalSyncPending(
    _cycle: DurableBillingCycle,
    reason: string,
  ): Promise<void> {
    this.state = "internal_sync_pending";
    this.events.push(`internal_pending:${reason}`);
  }
}

async function run() {
  class FakeLeaseStore {
    state: "ready" | "claimed" | "submitting" = "ready";
    leaseToken: string | null = null;
    leaseExpiresAt = 0;
    payments = new Map<string, number>();

    claim(worker: string, now: number): string | null {
      const reclaimable =
        this.state === "ready" ||
        (this.state === "claimed" && this.leaseExpiresAt < now);
      if (!reclaimable) return null;
      this.state = "claimed";
      this.leaseToken = `${worker}-lease`;
      this.leaseExpiresAt = now + 10;
      return this.leaseToken;
    }

    markSubmitting(token: string): void {
      assert.equal(token, this.leaseToken);
      assert.equal(this.state, "claimed");
      this.state = "submitting";
    }

    finalize(reference: string): number {
      const existing = this.payments.get(reference);
      if (existing) return existing;
      const paymentId = this.payments.size + 1;
      this.payments.set(reference, paymentId);
      return paymentId;
    }
  }

  const leaseStore = new FakeLeaseStore();
  const competingClaims = await Promise.all([
    Promise.resolve().then(() => leaseStore.claim("worker-a", 0)),
    Promise.resolve().then(() => leaseStore.claim("worker-b", 0)),
  ]);
  assert.equal(competingClaims.filter(Boolean).length, 1);
  const restartedLease = leaseStore.claim("worker-restart", 11);
  assert.ok(
    restartedLease,
    "an expired pre-submit lease must survive worker restart",
  );
  leaseStore.markSubmitting(restartedLease);
  assert.equal(
    leaseStore.claim("worker-after-submit", 30),
    null,
    "a submitting cycle must never be reclaimed after lease expiry",
  );
  assert.equal(leaseStore.finalize(cycle.processorReference), 1);
  assert.equal(leaseStore.finalize(cycle.processorReference), 1);
  assert.equal(leaseStore.payments.size, 1);

  const leaseStates = ["ready", "ready"];
  let releaseSlowProcessor!: () => void;
  const slowProcessor = new Promise<void>((resolve) => {
    releaseSlowProcessor = resolve;
  });
  const slowBatchPromise = processJustInTimeBatch<number>({
    limit: 2,
    async claimOne() {
      const index = leaseStates.indexOf("ready");
      if (index < 0) return null;
      leaseStates[index] = "claimed";
      return index;
    },
    async processOne(index) {
      if (index === 0) await slowProcessor;
      leaseStates[index] = "completed";
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    leaseStates,
    ["claimed", "ready"],
    "the later cycle must remain unleased while the first processor call is slow",
  );
  releaseSlowProcessor();
  assert.equal(await slowBatchPromise, 2);
  assert.deepEqual(leaseStates, ["completed", "completed"]);

  const february = calculateNextBillingDate(
    new Date("2027-01-31T00:00:00.000Z"),
    31,
  );
  assert.equal(february.toISOString().slice(0, 10), "2027-02-28");
  const march = calculateNextBillingDate(february, 31);
  assert.equal(march.toISOString().slice(0, 10), "2027-03-31");
  assert.equal(calculateNextBillingCycleDate("2026-03-08", 8), "2026-04-08");
  assert.equal(calculateNextBillingCycleDate("2026-10-31", 31), "2026-11-30");
  assert.equal(calculateNextBillingCycleDate("2026-12-31", 31), "2027-01-31");
  assert.equal(formatPostgresDateOnly("2026-09-02T00:00:00Z"), "2026-09-02");
  assert.equal(formatPostgresDateOnly(new Date(2026, 8, 2)), "2026-09-02");

  let submissions = 0;
  const timeoutAfterAcceptance: RecurringProcessorAdapter = {
    async submit() {
      submissions++;
      throw new Error("socket timeout after request write");
    },
  };
  const unknownRepository = new FakeRepository();
  assert.equal(
    await processClaimedBillingCycle({
      cycle,
      repository: unknownRepository,
      processor: timeoutAfterAcceptance,
      async synchronizeFinancials() {},
    }),
    "unknown",
  );
  assert.equal(submissions, 1);
  assert.equal(unknownRepository.state, "unknown");

  const declineRepository = new FakeRepository();
  let declineFinancialSyncInvoked = false;
  assert.equal(
    await processClaimedBillingCycle({
      cycle,
      repository: declineRepository,
      processor: {
        async submit() {
          return {
            success: false,
            responseFields: { AUTH_RESP: "51", AUTH_RESP_TEXT: "DECLINED" },
          };
        },
      },
      async synchronizeFinancials() {
        declineFinancialSyncInvoked = true;
      },
    }),
    "declined",
  );
  assert.equal(declineRepository.state, "declined");
  assert.deepEqual(declineRepository.events, ["submitting", "declined"]);
  assert.equal(
    declineFinancialSyncInvoked,
    false,
    "declines must not create successful payment side effects",
  );

  const syncRepository = new FakeRepository();
  assert.equal(
    await processClaimedBillingCycle({
      cycle,
      repository: syncRepository,
      processor: {
        async submit() {
          return {
            success: true,
            responseFields: { AUTH_RESP: "00", AUTH_CODE: "APPROVED" },
          };
        },
      },
      async synchronizeFinancials() {
        throw new Error("commission unavailable");
      },
    }),
    "internal_sync_pending",
  );
  assert.equal(syncRepository.state, "internal_sync_pending");
  assert.deepEqual(syncRepository.events.slice(0, 2), [
    "submitting",
    "finalized",
  ]);

  console.log("Durable recurring billing behavioral tests passed.");
}

void run();
