/**
 * PaymentConfirmedService — Phase 1
 *
 * The single authoritative entry point for "a payment has been confirmed
 * successful, now do everything MPP needs to do about it." Every trigger
 * that can learn a payment succeeded (EPX server callback, EPX browser
 * completion, manual admin verification, and — in later phases —
 * reconciliation/recurring billing) should call `processConfirmedPayment()`
 * instead of independently re-implementing member activation + commission
 * creation.
 *
 * This does NOT change anything about how EPX is contacted, how the hosted
 * checkout session is created, or how EPX's response is parsed/validated.
 * Callers are responsible for establishing that a payment is genuinely
 * successful (EPX approval, admin authorization, etc.) BEFORE calling this
 * service. This service itself re-validates payment status as a safety net,
 * but does not talk to EPX.
 *
 * See docs/PAYMENT_CONFIRMED_SERVICE_PHASE1_REPORT.md for the full design
 * writeup, remaining gaps, and test results.
 */

import { transaction } from "../lib/neonDb";
import { storage } from "../storage";
import { supabase } from "../lib/supabaseClient";
import { logEPX } from "./epx-payment-logger";
import {
  isSuccessfulPaymentStatus,
  type PaymentConfirmationSource,
} from "../utils/payment-status";
import { syncLedgerEntriesForPayment } from "./commission-ledger-service";
import { updateFinancialProcessingState } from "./financial-processing-state";
import {
  ensureLineageSnapshotForPayment,
  attachLineageSnapshotToCommissionAndLedger,
  createWp03CommissionsForSuccessfulPayment,
  type PaymentRecord,
} from "./commission-generation-service";

export interface ProcessConfirmedPaymentOptions {
  paymentId: number | string;
  confirmationSource: PaymentConfirmationSource;
  /** Authenticated admin user id, for manual_admin confirmations. */
  verifiedByUserId?: string | null;
  /**
   * When the payment PROVIDER (EPX) actually processed the transaction, if
   * known/trustworthy. Never invented when unavailable — pass null/undefined.
   */
  providerTransactionAt?: Date | string | null;
  /** When MPP processed this confirmation event. Defaults to now(). */
  platformVerifiedAt?: Date | string | null;
}

export interface ProcessConfirmedPaymentResult {
  ok: boolean;
  /** True when this payment was already confirmed by an earlier call. */
  alreadyConfirmed: boolean;
  paymentId: number;
  memberId: number;
  commissionsCreated: number;
  overridesRetained: number;
  lineageSnapshotId: string | null;
  /** Populated when commission generation could not run (e.g. no enrolling agent). */
  commissionSkippedReason?: string;
}

export class PaymentConfirmationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentConfirmationError";
  }
}

function extractPlanName(rawPlanName: string | null | undefined): string {
  const name = rawPlanName || "MyPremierPlan Base";
  return name.includes(" - ") ? name.split(" - ")[0].trim() : name;
}

/**
 * Load the payment row via raw SQL so we see the Phase 1 columns
 * (payment_confirmed_at, etc.) that storage.getPaymentById also returns
 * (SELECT * ...), without depending on storage's update-field allowlist.
 */
async function loadPaymentRecord(paymentId: number): Promise<PaymentRecord | undefined> {
  return storage.getPaymentById(paymentId) as unknown as Promise<PaymentRecord | undefined>;
}

export async function processConfirmedPayment(
  options: ProcessConfirmedPaymentOptions,
): Promise<ProcessConfirmedPaymentResult> {
  const paymentId = Number(options.paymentId);
  if (!Number.isFinite(paymentId) || paymentId <= 0) {
    throw new PaymentConfirmationError(
      "processConfirmedPayment requires a valid numeric paymentId",
    );
  }

  const paymentRecord = await loadPaymentRecord(paymentId);
  if (!paymentRecord) {
    throw new PaymentConfirmationError(
      `processConfirmedPayment: payment ${paymentId} not found`,
    );
  }

  // Never generate compensation from anything other than a genuinely
  // successful payment. Enrollment status alone is never sufficient.
  if (!isSuccessfulPaymentStatus(paymentRecord.status)) {
    throw new PaymentConfirmationError(
      `processConfirmedPayment: payment ${paymentId} is not successful (status=${paymentRecord.status}). Refusing to process.`,
    );
  }

  const memberIdRaw = (paymentRecord as any).member_id;
  const memberId = memberIdRaw ? Number(memberIdRaw) : NaN;
  if (!Number.isFinite(memberId) || memberId <= 0) {
    throw new PaymentConfirmationError(
      `processConfirmedPayment: payment ${paymentId} has no member linkage`,
    );
  }

  const alreadyConfirmed = Boolean((paymentRecord as any).payment_confirmed_at);
  const nowIso = new Date().toISOString();
  const providerTransactionAtIso = options.providerTransactionAt
    ? new Date(options.providerTransactionAt).toISOString()
    : null;
  const platformVerifiedAtIso = options.platformVerifiedAt
    ? new Date(options.platformVerifiedAt).toISOString()
    : nowIso;
  // Dedicated, authoritative "this member's first payment was actually
  // confirmed successful" timestamp — see scripts/sql/2026-08-20_member_first_successful_payment_at.sql.
  // members.first_payment_date is NOT proof of payment: it is set at
  // registration time (equal to enrollmentDate), before any payment occurs,
  // so it is intentionally left untouched here (COALESCE below preserves its
  // pre-existing, non-authoritative value rather than repurposing it).
  const firstSuccessfulPaymentAtIso = providerTransactionAtIso || platformVerifiedAtIso;

  logEPX({
    level: "info",
    phase: "payment-confirmed-service",
    message: alreadyConfirmed
      ? "processConfirmedPayment invoked for already-confirmed payment (idempotent re-check)"
      : "processConfirmedPayment invoked — first confirmation",
    data: {
      paymentId,
      memberId,
      confirmationSource: options.confirmationSource,
      alreadyConfirmed,
    },
  });

  try {
    await updateFinancialProcessingState({
      paymentId,
      commissionStatus: "pending",
      ledgerStatus: "pending",
      commissionError: null,
      ledgerError: null,
    });
  } catch (stateError: any) {
    logEPX({
      level: "warn",
      phase: "payment-confirmed-service",
      message: "Could not persist initial financial processing state",
      data: { paymentId, error: stateError?.message },
    });
  }

  // --- Step 1: transactional payment + member bookkeeping -----------------
  // These two tables live on the same Postgres connection (server/lib/neonDb.ts),
  // so they share one real DB transaction. `payment_confirmed_at`,
  // `payment_transaction_at`, `platform_verified_at`, `verification_method`,
  // and `verified_by_user_id` are all first-write-wins (COALESCE) so a later
  // duplicate/no-op confirmation from any source can never overwrite the
  // original confirmation record.
  //
  // KNOWN GAP: lineage snapshot + agent_commissions writes below go through
  // the Supabase REST client (a separate connection) and cannot join this
  // transaction. See docs/PAYMENT_CONFIRMED_SERVICE_PHASE1_REPORT.md §8.
  await transaction(async (client) => {
    await client.query(
      `UPDATE payments
       SET status = 'succeeded',
           payment_transaction_at = COALESCE(payment_transaction_at, $2),
           payment_confirmed_at = COALESCE(payment_confirmed_at, $3),
           platform_verified_at = COALESCE(platform_verified_at, $3),
           verification_method = COALESCE(verification_method, $4),
           verified_by_user_id = COALESCE(verified_by_user_id, $5),
           updated_at = NOW()
       WHERE id = $1`,
      [
        paymentId,
        providerTransactionAtIso,
        platformVerifiedAtIso,
        options.confirmationSource,
        options.verifiedByUserId || null,
      ],
    );

    await client.query(
      `UPDATE members
       SET status = 'active',
           is_active = true,
           first_payment_date = COALESCE(first_payment_date, $2),
           first_successful_payment_at = COALESCE(first_successful_payment_at, $3),
           updated_at = NOW()
       WHERE id = $1`,
      [memberId, nowIso, firstSuccessfulPaymentAtIso],
    );
  });

  // --- Step 2: lineage snapshot + WP-03 commission/override generation ----
  // Idempotent by construction: existence check by source_payment_id PLUS a
  // database unique index on commission_event_key (see
  // scripts/sql/2026-08-19_payment_confirmed_service_phase1.sql). Safe to
  // re-run on every confirmation, including duplicates.
  let lineageSnapshotId: string | null = null;
  let commissionsCreated = 0;
  let overridesRetained = 0;
  let commissionSkippedReason: string | undefined;
  let ledgerSyncError: string | undefined;
  let commissionSetFound = false;

  try {
    lineageSnapshotId = await ensureLineageSnapshotForPayment({
      memberId,
      paymentRecord,
      phase: options.confirmationSource,
    });

    const { data: existingForThisPayment, error: existingError } = await supabase
      .from("agent_commissions")
      .select("id")
      .eq("source_payment_id", paymentId)
      .limit(1);

    if (existingError) {
      throw new Error(
        `Failed checking existing commissions for payment ${paymentId}: ${existingError.message}`,
      );
    }

    if (existingForThisPayment && existingForThisPayment.length > 0) {
      commissionSetFound = true;
      logEPX({
        level: "info",
        phase: "payment-confirmed-service",
        message: "Commission(s) already exist for this exact payment — skipping generation",
        data: { paymentId, memberId },
      });
      await attachLineageSnapshotToCommissionAndLedger({
        memberId,
        snapshotId: lineageSnapshotId,
        phase: options.confirmationSource,
      });
    } else {
      const memberRecord = await storage.getMember(memberId);
      const agentId =
        (memberRecord as any)?.enrolledByAgentId ||
        (memberRecord as any)?.enrolled_by_agent_id ||
        null;

      if (!agentId) {
        commissionSkippedReason = "member has no enrolling agent";
        logEPX({
          level: "warn",
          phase: "payment-confirmed-service",
          message: "Cannot generate commission — member has no enrolling agent",
          data: { paymentId, memberId },
        });
      } else {
        const agentRecord = await storage.getUser(agentId);
        const planIdFromMember =
          (memberRecord as any)?.planId || (memberRecord as any)?.plan_id;
        let planRecord: any | null = null;
        if (planIdFromMember) {
          try {
            planRecord = await storage.getPlan(String(planIdFromMember));
          } catch (planError: any) {
            logEPX({
              level: "warn",
              phase: "payment-confirmed-service",
              message: "Could not load plan for commission calculation",
              data: { error: planError?.message, planIdFromMember },
            });
          }
        }
        const planName = extractPlanName(planRecord?.name);
        const coverageType =
          (memberRecord as any)?.coverageType ||
          (memberRecord as any)?.coverage_type ||
          (memberRecord as any)?.memberType ||
          (memberRecord as any)?.member_type ||
          "Member Only";
        const hasRxValet = Boolean(
          (memberRecord as any)?.addRxValet || (memberRecord as any)?.add_rx_valet,
        );

        const createResult = await createWp03CommissionsForSuccessfulPayment({
          phase: options.confirmationSource,
          memberId,
          writingAgentId: String(agentId),
          writingAgentRecord: agentRecord || {},
          planRecord,
          planName,
          coverageType,
          hasRxValet,
          paymentRecord,
          lineageSnapshotId,
          sourcePaymentId: paymentId,
        });

        commissionsCreated = createResult.createdRows;
        overridesRetained = createResult.retainedRows;
        commissionSetFound = commissionsCreated + overridesRetained > 0;

        await attachLineageSnapshotToCommissionAndLedger({
          memberId,
          snapshotId: lineageSnapshotId,
          phase: options.confirmationSource,
        });

      }

    }

    // Automatic ledger sync is deliberately outside the payment transaction,
    // but it is retryable and its durable state is queryable.
    const memberRecordForLedger = await storage.getMember(memberId);
    const ledgerSyncResult = await syncLedgerEntriesForPayment({
      paymentId,
      memberId,
      effectiveDate:
        (memberRecordForLedger as any)?.membershipStartDate ||
        (memberRecordForLedger as any)?.membership_start_date ||
        null,
    });
    if ("error" in ledgerSyncResult) {
      ledgerSyncError = ledgerSyncResult.error;
      logEPX({
        level: "warn",
        phase: "payment-confirmed-service",
        message: "Automatic commission_ledger sync failed after commission creation",
        data: { paymentId, memberId, error: ledgerSyncError },
      });
    }
  } catch (error: any) {
    // Payment/member state is already durably recorded above. Commission
    // generation failing here does not roll that back — it is safe to
    // re-invoke processConfirmedPayment() later (e.g. via a future
    // reconciliation job) because the source_payment_id existence check and
    // the DB unique index make this step idempotent and retry-safe.
    commissionSkippedReason = error?.message || "unknown error generating commission";
    ledgerSyncError = ledgerSyncError || `Commission processing aborted before ledger sync: ${commissionSkippedReason}`;
    logEPX({
      level: "error",
      phase: "payment-confirmed-service",
      message: "Commission generation failed after payment was confirmed",
      data: { paymentId, memberId, error: commissionSkippedReason },
    });
  }

  try {
    await updateFinancialProcessingState({
      paymentId,
      commissionStatus: commissionSkippedReason ? "failed" : (commissionSetFound ? "complete" : "skipped"),
      ledgerStatus: ledgerSyncError ? "failed" : "complete",
      commissionError: commissionSkippedReason || null,
      ledgerError: ledgerSyncError || null,
    });
  } catch (stateError: any) {
    logEPX({
      level: "warn",
      phase: "payment-confirmed-service",
      message: "Could not persist final financial processing state",
      data: { paymentId, error: stateError?.message },
    });
  }

  // --- Step 3: audit trail --------------------------------------------------
  try {
    await storage.createAdminNotification({
      type: "payment_confirmed_processed",
      memberId,
      metadata: {
        paymentId,
        confirmationSource: options.confirmationSource,
        verifiedByUserId: options.verifiedByUserId || null,
        alreadyConfirmed,
        commissionsCreated,
        overridesRetained,
        commissionSkippedReason: commissionSkippedReason || null,
        processedAt: nowIso,
      },
    });
  } catch (auditError: any) {
    logEPX({
      level: "warn",
      phase: "payment-confirmed-service",
      message: "Failed to write audit notification for confirmed payment",
      data: { paymentId, memberId, error: auditError?.message },
    });
  }

  return {
    ok: true,
    alreadyConfirmed,
    paymentId,
    memberId,
    commissionsCreated,
    overridesRetained,
    lineageSnapshotId,
    commissionSkippedReason,
  };
}
