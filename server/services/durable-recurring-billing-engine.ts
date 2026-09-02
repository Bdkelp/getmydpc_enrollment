export type DurableCycleState =
  | "ready"
  | "claimed"
  | "submitting"
  | "processor_succeeded"
  | "completed"
  | "declined"
  | "unknown"
  | "internal_sync_pending"
  | "cancelled"
  | "skipped";

export type DurableBillingCycle = {
  id: number;
  subscriptionId: number;
  memberId: number;
  cycleDate: string;
  processorReference: string;
  amount: string;
  paymentMethodType: string;
  authGuid?: string;
  leaseToken: string;
};

export type ProcessorResult = {
  success: boolean;
  responseFields: Record<string, string>;
  error?: string;
};

export interface DurableCycleRepository {
  markSubmitting(cycle: DurableBillingCycle): Promise<void>;
  markUnknown(cycle: DurableBillingCycle, reason: string): Promise<void>;
  markDeclined(
    cycle: DurableBillingCycle,
    result: ProcessorResult,
  ): Promise<void>;
  finalizeProcessorSuccess(
    cycle: DurableBillingCycle,
    result: ProcessorResult,
  ): Promise<{ paymentId: number }>;
  completeInternalSync(cycle: DurableBillingCycle): Promise<void>;
  markInternalSyncPending(
    cycle: DurableBillingCycle,
    reason: string,
  ): Promise<void>;
}

export interface RecurringProcessorAdapter {
  submit(cycle: DurableBillingCycle): Promise<ProcessorResult>;
  lookup?(
    processorReference: string,
  ): Promise<
    | { outcome: "succeeded"; result: ProcessorResult }
    | { outcome: "declined" | "absent"; result?: ProcessorResult }
    | { outcome: "unknown" }
  >;
}

export type DurableCycleOutcome =
  | "completed"
  | "declined"
  | "unknown"
  | "internal_sync_pending";

function hasVerifiableProcessorResponse(result: ProcessorResult): boolean {
  return Boolean(
    String(result.responseFields.AUTH_RESP || "").trim() ||
    String(result.responseFields.AUTH_CODE || "").trim(),
  );
}

export async function processClaimedBillingCycle(options: {
  cycle: DurableBillingCycle;
  repository: DurableCycleRepository;
  processor: RecurringProcessorAdapter;
  synchronizeFinancials(paymentId: number): Promise<void>;
}): Promise<DurableCycleOutcome> {
  const { cycle, repository, processor } = options;
  await repository.markSubmitting(cycle);

  let result: ProcessorResult;
  try {
    result = await processor.submit(cycle);
  } catch (error: any) {
    await repository.markUnknown(
      cycle,
      `processor_transport_unknown:${error?.message || "unknown error"}`,
    );
    return "unknown";
  }

  if (!hasVerifiableProcessorResponse(result)) {
    await repository.markUnknown(
      cycle,
      `processor_response_unverifiable:${result.error || "missing processor response identifiers"}`,
    );
    return "unknown";
  }

  if (!result.success) {
    await repository.markDeclined(cycle, result);
    return "declined";
  }

  const { paymentId } = await repository.finalizeProcessorSuccess(
    cycle,
    result,
  );
  try {
    await options.synchronizeFinancials(paymentId);
    await repository.completeInternalSync(cycle);
    return "completed";
  } catch (error: any) {
    await repository.markInternalSyncPending(
      cycle,
      `internal_financial_sync:${error?.message || "unknown error"}`,
    );
    return "internal_sync_pending";
  }
}

export async function reconcileUnknownBillingCycle(options: {
  cycle: DurableBillingCycle;
  repository: DurableCycleRepository;
  processor: RecurringProcessorAdapter;
  synchronizeFinancials(paymentId: number): Promise<void>;
}): Promise<DurableCycleOutcome | "confirmed_absent"> {
  if (!options.processor.lookup) return "unknown";

  const lookup = await options.processor.lookup(
    options.cycle.processorReference,
  );
  if (lookup.outcome === "unknown") return "unknown";
  if (lookup.outcome === "absent") return "confirmed_absent";
  if (lookup.outcome === "declined") {
    await options.repository.markDeclined(
      options.cycle,
      lookup.result || {
        success: false,
        responseFields: { AUTH_RESP: "DECLINED" },
      },
    );
    return "declined";
  }
  if (lookup.outcome !== "succeeded") return "unknown";

  const { paymentId } = await options.repository.finalizeProcessorSuccess(
    options.cycle,
    lookup.result,
  );
  try {
    await options.synchronizeFinancials(paymentId);
    await options.repository.completeInternalSync(options.cycle);
    return "completed";
  } catch (error: any) {
    await options.repository.markInternalSyncPending(
      options.cycle,
      `internal_financial_sync:${error?.message || "unknown error"}`,
    );
    return "internal_sync_pending";
  }
}
