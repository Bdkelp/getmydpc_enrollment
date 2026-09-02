import { randomUUID } from "node:crypto";

import { query } from "../lib/neonDb";
import {
  getSubscriptionsDueForBilling,
  type BillableSubscription,
} from "../storage";
import {
  calculateNextBillingCycleDate,
  formatPostgresDateOnly,
} from "../utils/membership-dates";
import { processConfirmedPayment } from "./payment-confirmed-service";
import { submitServerPostRecurringPayment } from "./epx-payment-service";
import {
  processClaimedBillingCycle,
  type DurableBillingCycle,
  type DurableCycleRepository,
  type ProcessorResult,
  type RecurringProcessorAdapter,
} from "./durable-recurring-billing-engine";

const BILLING_TIMEZONE = "America/Chicago";
const DEFAULT_CLAIM_LIMIT = 25;

export type DurableBillingRunSummary = {
  runId: number | null;
  mode: "dry_run" | "live";
  businessDate: string;
  workerId: string;
  selected: number;
  claimed: number;
  succeeded: number;
  declined: number;
  unknown: number;
  skipped: number;
  internalPending: number;
  internalRetried: number;
  amountByOutcome: {
    succeeded: string;
    declined: string;
    unknown: string;
  };
  candidates: Array<{
    subscriptionId: number;
    memberId: number;
    cycleDate: string;
    amount: string;
    paymentMethodType: string;
    credentialSource: string | null;
    exclusionReason: string | null;
  }>;
};

type ClaimedCycleRow = {
  id: string;
  subscription_id: number;
  member_id: number;
  cycle_date: string | Date;
  processor_reference: string;
  amount: string;
  payment_method_type: string;
  processor_auth_guid: string | null;
  lease_token: string;
  payment_id: number | null;
};

function envTrue(name: string): boolean {
  return String(process.env[name] || "").toLowerCase() === "true";
}

export function getBillingBusinessDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BILLING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function deterministicProcessorReference(
  subscriptionId: number,
  cycleDate: string,
): string {
  return `RECUR-${subscriptionId}-${cycleDate.replace(/-/g, "")}`;
}

function resolveCredential(subscription: BillableSubscription): {
  credential: string | null;
  source: string | null;
  error: string | null;
} {
  if (subscription.processorReferenceConflict) {
    return {
      credential: null,
      source: null,
      error: "processor_reference_conflict",
    };
  }

  const candidates: Array<[string, string | null]> = [
    [
      "payment_tokens.original_network_trans_id",
      subscription.tokenOriginalNetworkTransId,
    ],
    ["payments.epx_auth_guid", subscription.latestPaymentAuthGuid],
    ["payment_tokens.bric_token", subscription.bricToken],
  ];
  for (const [source, value] of candidates) {
    const credential = String(value || "").trim();
    if (/^[A-Za-z0-9-]{8,128}$/.test(credential)) {
      return { credential, source, error: null };
    }
  }
  return {
    credential: null,
    source: null,
    error: "missing_or_invalid_processor_reference",
  };
}

function mapClaimedCycle(row: ClaimedCycleRow): DurableBillingCycle {
  return {
    id: Number(row.id),
    subscriptionId: Number(row.subscription_id),
    memberId: Number(row.member_id),
    cycleDate: formatPostgresDateOnly(row.cycle_date),
    processorReference: row.processor_reference,
    amount: String(row.amount),
    paymentMethodType: row.payment_method_type,
    authGuid: row.processor_auth_guid || undefined,
    leaseToken: row.lease_token,
  };
}

class PostgresCycleRepository implements DurableCycleRepository {
  async markSubmitting(cycle: DurableBillingCycle): Promise<void> {
    await query("SELECT public.mark_recurring_cycle_submitting($1, $2::uuid)", [
      cycle.id,
      cycle.leaseToken,
    ]);
  }

  async markUnknown(cycle: DurableBillingCycle, reason: string): Promise<void> {
    await this.updateOwnedCycle(cycle, "unknown", reason, null);
  }

  async markDeclined(
    cycle: DurableBillingCycle,
    result: ProcessorResult,
  ): Promise<void> {
    const responseCode =
      String(result.responseFields.AUTH_RESP || "").trim() || null;
    const retryDays = responseCode === "51" ? 1 : 2;
    const updated = await query(
      `UPDATE public.recurring_billing_cycles
       SET state = 'declined', processor_response_code = $3,
           processor_response_message = $4, processor_auth_code = $5,
           processor_responded_at = NOW(), failure_classification = 'confirmed_decline',
           next_attempt_at = CASE WHEN attempt_count < $6 THEN NOW() + make_interval(days => $7) ELSE NULL END,
           lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL, updated_at = NOW()
       WHERE id = $1 AND lease_token = $2::uuid`,
      [
        cycle.id,
        cycle.leaseToken,
        responseCode,
        result.responseFields.AUTH_RESP_TEXT ||
          result.error ||
          "Processor declined",
        result.responseFields.AUTH_CODE || null,
        getMaxAttempts(),
        retryDays,
      ],
    );
    assertSingleCycleUpdate(updated.rowCount, cycle.id, "mark declined");
  }

  async finalizeProcessorSuccess(
    cycle: DurableBillingCycle,
    result: ProcessorResult,
  ): Promise<{ paymentId: number }> {
    const member = await query(
      `SELECT first_payment_date, enrollment_date
       FROM public.members WHERE id = $1`,
      [cycle.memberId],
    );
    const anchorSource =
      member.rows[0]?.first_payment_date || member.rows[0]?.enrollment_date;
    const anchorDate = anchorSource ? new Date(anchorSource) : null;
    const anchorDay = anchorDate
      ? Number(getBillingBusinessDate(anchorDate).slice(-2))
      : Number(cycle.cycleDate.slice(-2));
    const nextBillingDate = calculateNextBillingCycleDate(
      cycle.cycleDate,
      anchorDay,
    );
    const finalized = await query(
      `SELECT * FROM public.finalize_recurring_cycle_success(
         $1, $2, $3, $4, $5, $6, $7, $8
       )`,
      [
        cycle.id,
        cycle.processorReference,
        result.responseFields.AUTH_GUID || cycle.authGuid || null,
        result.responseFields.AUTH_CODE || null,
        result.responseFields.AUTH_RESP || null,
        result.responseFields.AUTH_RESP_TEXT || null,
        new Date().toISOString(),
        nextBillingDate,
      ],
    );
    const paymentId = Number(finalized.rows[0]?.payment_id);
    if (!paymentId)
      throw new Error("Atomic success finalizer returned no payment id");
    return { paymentId };
  }

  async completeInternalSync(cycle: DurableBillingCycle): Promise<void> {
    const updated = await query(
      `UPDATE public.recurring_billing_cycles
         SET state = 'completed', failure_classification = NULL, updated_at = NOW(),
           next_attempt_at = NULL, lease_owner = NULL, lease_token = NULL,
           lease_expires_at = NULL
       WHERE id = $1 AND state IN ('completed', 'internal_sync_pending')
         AND (lease_token IS NULL OR lease_token = $2::uuid)`,
      [cycle.id, cycle.leaseToken],
    );
    assertSingleCycleUpdate(
      updated.rowCount,
      cycle.id,
      "complete internal sync",
    );
  }

  async markInternalSyncPending(
    cycle: DurableBillingCycle,
    reason: string,
  ): Promise<void> {
    const updated = await query(
      `UPDATE public.recurring_billing_cycles
       SET state = 'internal_sync_pending', failure_classification = $2,
           next_attempt_at = NOW() + INTERVAL '5 minutes', lease_owner = NULL,
           lease_token = NULL, lease_expires_at = NULL, updated_at = NOW()
         WHERE id = $1 AND payment_id IS NOT NULL
         AND state IN ('completed', 'internal_sync_pending')
         AND (lease_token IS NULL OR lease_token = $3::uuid)`,
      [cycle.id, reason, cycle.leaseToken],
    );
    assertSingleCycleUpdate(
      updated.rowCount,
      cycle.id,
      "mark internal sync pending",
    );
  }

  private async updateOwnedCycle(
    cycle: DurableBillingCycle,
    state: "unknown",
    reason: string,
    nextAttemptAt: string | null,
  ): Promise<void> {
    const updated = await query(
      `UPDATE public.recurring_billing_cycles
       SET state = $3, failure_classification = $4, next_attempt_at = $5,
           lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL, updated_at = NOW()
       WHERE id = $1 AND lease_token = $2::uuid`,
      [cycle.id, cycle.leaseToken, state, reason, nextAttemptAt],
    );
    assertSingleCycleUpdate(updated.rowCount, cycle.id, `mark ${state}`);
  }
}

function assertSingleCycleUpdate(
  rowCount: number | null,
  cycleId: number,
  transition: string,
): void {
  if (rowCount !== 1) {
    throw new Error(
      `Failed to ${transition} for recurring billing cycle ${cycleId}: ownership or state changed`,
    );
  }
}

const processor: RecurringProcessorAdapter = {
  async submit(cycle) {
    return submitServerPostRecurringPayment({
      amount: Number(cycle.amount),
      authGuid: cycle.authGuid,
      transactionId: cycle.processorReference,
      tranType: "CCE1",
      description: `Recurring billing cycle ${cycle.cycleDate} subscription ${cycle.subscriptionId}`,
      metadata: { durableBillingCycleId: cycle.id },
    });
  },
};

function getMaxAttempts(): number {
  const parsed = Number.parseInt(
    process.env.RECURRING_BILLING_MAX_ATTEMPTS_PER_CYCLE || "3",
    10,
  );
  return Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 10)) : 3;
}

function assertLiveExecutionEnabled(): void {
  if (!envTrue("EXTERNAL_BILLING_ENABLED")) {
    throw new Error("EXTERNAL_BILLING_DISABLED");
  }
  if (process.env.EXTERNAL_BILLING_DRY_RUN !== "false") {
    throw new Error("EXTERNAL_BILLING_DRY_RUN_ENABLED");
  }
  if (envTrue("RECURRING_BILLING_KILL_SWITCH")) {
    throw new Error("RECURRING_BILLING_KILL_SWITCH_ACTIVE");
  }
  if (envTrue("EPX_SIMULATION_MODE") || envTrue("BILLING_SIMULATION_MODE")) {
    throw new Error("SIMULATION_MODE_CANNOT_RUN_LIVE_DURABLE_BILLING");
  }
}

async function synchronizeConfirmedPayment(paymentId: number): Promise<void> {
  const confirmation = await processConfirmedPayment({
    paymentId,
    confirmationSource: "recurring_billing",
    providerTransactionAt: new Date(),
  });
  if (confirmation.commissionSkippedReason) {
    throw new Error(confirmation.commissionSkippedReason);
  }
}

export async function runDurableRecurringBilling(options: {
  dryRun?: boolean;
  triggerSource: "supabase_cron" | "manual";
  scheduledAt?: string;
  subscriptionIds?: number[];
}): Promise<DurableBillingRunSummary> {
  const dryRun = options.dryRun !== false;
  if (!dryRun) assertLiveExecutionEnabled();

  const now = new Date();
  const businessDate = getBillingBusinessDate(now);
  const workerId = `${process.env.HOSTNAME || "worker"}:${randomUUID()}`;
  const subscriptionIds = Array.from(new Set(options.subscriptionIds || []));
  if (!dryRun && subscriptionIds.length === 0) {
    await query("SELECT public.finalize_due_scheduled_cancellations($1)", [
      now.toISOString(),
    ]);
  }
  const due = await getSubscriptionsDueForBilling(now, {
    includeACH: false,
    subscriptionIds,
  });
  const candidates = due.map((subscription) => {
    const credential = resolveCredential(subscription);
    return {
      subscription,
      credential,
      cycleDate: getBillingBusinessDate(new Date(subscription.nextBillingDate)),
    };
  });
  const summary: DurableBillingRunSummary = {
    runId: null,
    mode: dryRun ? "dry_run" : "live",
    businessDate,
    workerId,
    selected: candidates.length,
    claimed: 0,
    succeeded: 0,
    declined: 0,
    unknown: 0,
    skipped: candidates.filter((row) => Boolean(row.credential.error)).length,
    internalPending: 0,
    internalRetried: 0,
    amountByOutcome: { succeeded: "0.00", declined: "0.00", unknown: "0.00" },
    candidates: candidates.map(({ subscription, credential, cycleDate }) => ({
      subscriptionId: subscription.subscriptionId,
      memberId: subscription.memberId,
      cycleDate,
      amount: subscription.amount,
      paymentMethodType: subscription.paymentMethodType,
      credentialSource: credential.source,
      exclusionReason: credential.error,
    })),
  };

  if (dryRun) {
    const dryRunRecord = await query(
      `INSERT INTO public.recurring_billing_runs
         (trigger_source, scheduled_at, worker_id, mode, status, completed_at,
          selected_count, skipped_count, metadata)
       VALUES ($1, $2, $3, 'dry_run', 'completed', NOW(), $4, $5, $6::jsonb)
       RETURNING id`,
      [
        options.triggerSource,
        options.scheduledAt || null,
        workerId,
        summary.selected,
        summary.skipped,
        JSON.stringify({ businessDate, candidates: summary.candidates }),
      ],
    );
    summary.runId = Number(dryRunRecord.rows[0].id);
    return summary;
  }

  const run = await query(
    `INSERT INTO public.recurring_billing_runs
       (trigger_source, scheduled_at, worker_id, mode, selected_count, skipped_count)
     VALUES ($1, $2, $3, 'live', $4, $5) RETURNING id`,
    [
      options.triggerSource,
      options.scheduledAt || null,
      workerId,
      summary.selected,
      summary.skipped,
    ],
  );
  summary.runId = Number(run.rows[0].id);

  try {
    const pendingSync = await query(
      "SELECT * FROM public.claim_recurring_internal_sync_cycles($1, $2, $3, $4, $5::int[])",
      [
        workerId,
        summary.runId,
        DEFAULT_CLAIM_LIMIT,
        120,
        subscriptionIds.length ? subscriptionIds : null,
      ],
    );
    const repository = new PostgresCycleRepository();
    for (const row of pendingSync.rows as ClaimedCycleRow[]) {
      const cycle = mapClaimedCycle(row);
      try {
        await synchronizeConfirmedPayment(Number(row.payment_id));
        await repository.completeInternalSync(cycle);
        summary.internalRetried++;
      } catch (error: any) {
        await repository.markInternalSyncPending(
          cycle,
          `internal_financial_sync_retry:${error?.message || "unknown error"}`,
        );
        summary.internalPending++;
      }
    }

    for (const { subscription, credential, cycleDate } of candidates) {
      if (!credential.credential) continue;
      await query(
        `INSERT INTO public.recurring_billing_cycles
         (subscription_id, member_id, cycle_date, processor_reference, amount,
          payment_method_type, credential_source, processor_auth_guid, run_id)
       VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (subscription_id, cycle_date) DO NOTHING`,
        [
          subscription.subscriptionId,
          subscription.memberId,
          cycleDate,
          deterministicProcessorReference(
            subscription.subscriptionId,
            cycleDate,
          ),
          subscription.amount,
          subscription.paymentMethodType,
          credential.source,
          credential.credential,
          summary.runId,
        ],
      );
    }

    const claimed = await query(
      "SELECT * FROM public.claim_recurring_billing_cycles($1, $2, $3, $4, $5::int[])",
      [
        workerId,
        summary.runId,
        DEFAULT_CLAIM_LIMIT,
        120,
        subscriptionIds.length ? subscriptionIds : null,
      ],
    );
    summary.claimed = claimed.rows.length;
    const amounts = { succeeded: 0, declined: 0, unknown: 0 };
    for (const row of claimed.rows as ClaimedCycleRow[]) {
      const cycle = mapClaimedCycle(row);
      const outcome = await processClaimedBillingCycle({
        cycle,
        repository,
        processor,
        synchronizeFinancials: synchronizeConfirmedPayment,
      });
      if (outcome === "completed") {
        summary.succeeded++;
        amounts.succeeded += Number(cycle.amount);
      } else if (outcome === "declined") {
        summary.declined++;
        amounts.declined += Number(cycle.amount);
      } else if (outcome === "unknown") {
        summary.unknown++;
        amounts.unknown += Number(cycle.amount);
      } else {
        summary.internalPending++;
      }
    }

    summary.amountByOutcome = {
      succeeded: amounts.succeeded.toFixed(2),
      declined: amounts.declined.toFixed(2),
      unknown: amounts.unknown.toFixed(2),
    };
    const completedRun = await query(
      `UPDATE public.recurring_billing_runs
     SET completed_at = NOW(), status = 'completed', claimed_count = $2,
         succeeded_count = $3, declined_count = $4, unknown_count = $5,
         skipped_count = $6, internal_pending_count = $7,
         amount_succeeded = $8, amount_declined = $9, amount_unknown = $10
     WHERE id = $1`,
      [
        summary.runId,
        summary.claimed,
        summary.succeeded,
        summary.declined,
        summary.unknown,
        summary.skipped,
        summary.internalPending,
        summary.amountByOutcome.succeeded,
        summary.amountByOutcome.declined,
        summary.amountByOutcome.unknown,
      ],
    );
    if (completedRun.rowCount !== 1) {
      throw new Error(
        `Durable billing run ${summary.runId} completion update affected ${completedRun.rowCount} rows`,
      );
    }
    return summary;
  } catch (error: any) {
    await query(
      `UPDATE public.recurring_billing_runs
       SET completed_at = NOW(), status = 'failed', error_message = $2
       WHERE id = $1`,
      [summary.runId, error?.message || "Durable billing worker failed"],
    )
      .then((failedRun) => {
        if (failedRun.rowCount !== 1) {
          throw new Error(
            `failed-run update affected ${failedRun.rowCount} rows`,
          );
        }
      })
      .catch((updateError) => {
        console.error(
          "[Durable Billing] Failed to persist run failure",
          updateError,
        );
      });
    throw error;
  }
}

export function getDurableBillingConfiguration() {
  return {
    timezone: BILLING_TIMEZONE,
    enabled: envTrue("EXTERNAL_BILLING_ENABLED"),
    defaultDryRun: process.env.EXTERNAL_BILLING_DRY_RUN !== "false",
    killSwitchActive: envTrue("RECURRING_BILLING_KILL_SWITCH"),
    processorLookupAvailable: false,
  };
}
