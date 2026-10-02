import { transaction } from "../lib/neonDb";
import { processConfirmedPayment } from "./payment-confirmed-service";
import {
  parseReconciliationInput,
  reconcileNorthPaymentWithClient,
  type ReconciliationActor,
  type ReconciliationResult,
} from "./north-payment-reconciliation";
import { formatBillingBusinessDate } from "./recurring-billing-cycle-policy";

export type NorthReconciliationResponse = ReconciliationResult & {
  paymentConfirmation:
    | "not_applicable"
    | "processed"
    | "deferred_member_not_active"
    | "failed";
  paymentConfirmationError?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs a North payment reconciliation in one transaction. After commit, an
 * externally settled payment goes through PaymentConfirmedService (lineage
 * and commissions) only when the member is already active: that service sets
 * members.status = 'active', and reconciliation must never change member
 * status. The service is idempotent, so a replay retries a failed sync.
 */
export async function reconcileNorthPayment(
  raw: Record<string, unknown>,
  actor: ReconciliationActor,
  options: { dryRun: boolean },
): Promise<NorthReconciliationResponse> {
  const input = parseReconciliationInput(raw);
  const businessDate = formatBillingBusinessDate(new Date());

  let result!: ReconciliationResult;
  await transaction(async (client) => {
    result = await reconcileNorthPaymentWithClient(client, {
      ...input,
      actor,
      businessDate,
      dryRun: options.dryRun,
    });
  });

  if (options.dryRun || input.decision !== "settled_external" || !result.paymentId) {
    return { ...result, paymentConfirmation: "not_applicable" };
  }
  if (!result.memberEligibleForPaymentConfirmation) {
    return { ...result, paymentConfirmation: "deferred_member_not_active" };
  }
  try {
    await processConfirmedPayment({
      paymentId: result.paymentId,
      confirmationSource: "manual_admin",
      verifiedByUserId: UUID.test(actor.id) ? actor.id : null,
      providerTransactionAt: input.northPaymentDate
        ? `${input.northPaymentDate}T12:00:00-05:00`
        : null,
    });
    return { ...result, paymentConfirmation: "processed" };
  } catch (error: any) {
    return {
      ...result,
      paymentConfirmation: "failed",
      paymentConfirmationError: error?.message || "Payment confirmation failed",
    };
  }
}
