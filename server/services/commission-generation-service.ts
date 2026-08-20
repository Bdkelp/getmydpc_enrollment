/**
 * Commission Generation Service
 *
 * Phase 1 extraction: this module is the SINGLE authoritative implementation of
 * the WP-03 lineage-snapshot + override-flow-up commission allocation engine.
 *
 * This logic previously lived as module-private functions inside
 * server/routes/epx-hosted-routes.ts. It is extracted here, unchanged in
 * business behavior, so that:
 *   - server/services/payment-confirmed-service.ts (the new authoritative
 *     PaymentConfirmedService) can call it, and
 *   - server/routes/epx-hosted-routes.ts continues to import it instead of
 *     defining a second copy.
 *
 * Additive changes made during Phase 1 (do not change existing behavior for
 * historical rows, only add new capabilities):
 *   - `sourcePaymentId` is now accepted and persisted on every generated
 *     commission row (`agent_commissions.source_payment_id`), giving a direct
 *     FK from a commission back to the exact payment that produced it.
 *   - `commission_event_key` is computed and persisted for each row, and is
 *     protected by a database-level unique index (see
 *     scripts/sql/2026-08-19_payment_confirmed_service_phase1.sql). This is
 *     the deterministic idempotency key requested by the Phase 1 spec: one
 *     successful payment cannot generate the same compensation entitlement
 *     (same recipient + commission type + override-for-agent + level) twice,
 *     enforced by Postgres, not just by a prior SELECT in Node.
 */

import { supabase } from "../lib/supabaseClient";
import { storage, getPlatformSetting } from "../storage";
import { logEPX } from "./epx-payment-logger";
import { calculateCommission } from "../commissionCalculator";
import {
  computeCommissionFlowAllocations,
  type HierarchyNode,
  type OverridePolicyConfig,
} from "./override-flow-up-engine";

export type PaymentRecord = {
  id: number | string;
  member_id?: number | string | null;
  subscription_id?: number | string | null;
  transaction_id?: string | null;
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
  metadata?: Record<string, any> | null;
  amount?: number | string | null;
  status?: string | null;
} & Record<string, any>;

const lineageSnapshotsEnabled =
  process.env.ENABLE_LINEAGE_SNAPSHOTS !== "false";

type LineageNode = {
  userId: string;
  agentNumber: string | null;
  role: string | null;
  isActive: boolean;
  depth: number;
};

export async function collectLineagePath(
  enrolledByAgentId: string | null,
): Promise<LineageNode[]> {
  if (!enrolledByAgentId) {
    return [];
  }

  const lineage: LineageNode[] = [];
  const visited = new Set<string>();
  let cursorId: string | null = String(enrolledByAgentId || "").trim() || null;
  let depth = 0;

  while (cursorId && depth < 64) {
    if (visited.has(cursorId)) {
      break;
    }

    visited.add(cursorId);

    const { data: userRow, error: userError } = await supabase
      .from("users")
      .select("id, agent_number, role, is_active, upline_agent_id")
      .eq("id", cursorId)
      .maybeSingle();

    if (userError || !userRow) {
      break;
    }

    lineage.push({
      userId: String(userRow.id),
      agentNumber: userRow.agent_number ? String(userRow.agent_number) : null,
      role: userRow.role ? String(userRow.role) : null,
      isActive: Boolean(userRow.is_active),
      depth,
    });

    cursorId = userRow.upline_agent_id ? String(userRow.upline_agent_id) : null;
    depth += 1;
  }

  return lineage;
}

export async function ensureLineageSnapshotForPayment(options: {
  memberId: number;
  paymentRecord: PaymentRecord;
  phase: string;
}): Promise<string | null> {
  if (!lineageSnapshotsEnabled) {
    return null;
  }

  const paymentId = Number(options.paymentRecord?.id);
  if (!Number.isFinite(paymentId)) {
    return null;
  }

  const member = await storage.getMember(options.memberId);
  if (!member) {
    return null;
  }

  const enrolledByAgentId =
    String(
      (member as any).enrolledByAgentId || (member as any).enrolled_by_agent_id || "",
    ).trim() || null;
  const lineagePath = await collectLineagePath(enrolledByAgentId);
  const idempotencyKey = `member:${options.memberId}:payment:${paymentId}`;

  const payload = {
    member_id: options.memberId,
    payment_id: paymentId,
    subscription_id: options.paymentRecord?.subscription_id
      ? Number(options.paymentRecord.subscription_id)
      : null,
    enrolled_by_agent_id: enrolledByAgentId,
    lineage_depth: lineagePath.length,
    lineage_path: lineagePath,
    capture_source: options.phase,
    idempotency_key: idempotencyKey,
  };

  const { data, error } = await supabase
    .from("agent_lineage_snapshots")
    .upsert(payload, { onConflict: "member_id,payment_id" })
    .select("id")
    .single();

  if (error) {
    logEPX({
      level: "warn",
      phase: options.phase,
      message: "Failed to capture lineage snapshot",
      data: {
        memberId: options.memberId,
        paymentId,
        error: error.message,
      },
    });
    return null;
  }

  return data?.id ? String(data.id) : null;
}

export async function attachLineageSnapshotToCommissionAndLedger(options: {
  memberId: number;
  snapshotId: string | null;
  phase: string;
}): Promise<void> {
  if (!options.snapshotId) {
    return;
  }

  const memberKey = String(options.memberId);
  const { data: updatedCommissions, error: updateCommissionsError } =
    await supabase
      .from("agent_commissions")
      .update({ lineage_snapshot_id: options.snapshotId })
      .eq("member_id", memberKey)
      .is("lineage_snapshot_id", null)
      .select("id");

  if (updateCommissionsError) {
    logEPX({
      level: "warn",
      phase: options.phase,
      message: "Failed attaching lineage snapshot to commissions",
      data: {
        memberId: options.memberId,
        snapshotId: options.snapshotId,
        error: updateCommissionsError.message,
      },
    });
    return;
  }

  const sourceCommissionIds = (updatedCommissions || [])
    .map((row: any) => String(row.id))
    .filter(Boolean);

  const { error: ledgerByMemberError } = await supabase
    .from("commission_ledger")
    .update({ lineage_snapshot_id: options.snapshotId })
    .eq("member_id", memberKey)
    .is("lineage_snapshot_id", null);

  if (ledgerByMemberError) {
    logEPX({
      level: "warn",
      phase: options.phase,
      message: "Failed attaching lineage snapshot to ledger rows by member",
      data: {
        memberId: options.memberId,
        snapshotId: options.snapshotId,
        error: ledgerByMemberError.message,
      },
    });
  }

  if (sourceCommissionIds.length > 0) {
    const { error: ledgerBySourceError } = await supabase
      .from("commission_ledger")
      .update({ lineage_snapshot_id: options.snapshotId })
      .in("source_commission_id", sourceCommissionIds)
      .is("lineage_snapshot_id", null);

    if (ledgerBySourceError) {
      logEPX({
        level: "warn",
        phase: options.phase,
        message:
          "Failed attaching lineage snapshot to ledger rows by source commission",
        data: {
          memberId: options.memberId,
          snapshotId: options.snapshotId,
          error: ledgerBySourceError.message,
        },
      });
    }
  }
}

function parsePositiveNumber(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.round(parsed * 100) / 100;
}

function parseLevelSplit(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry) && entry >= 0);

  if (normalized.length === 0) {
    return null;
  }

  return normalized;
}

function normalizePolicyFragment(value: any): Partial<OverridePolicyConfig> {
  const source = value && typeof value === "object" ? value : {};

  const overridePoolAmount = parsePositiveNumber(
    source.overridePoolAmount ??
      source.override_pool_amount ??
      source.poolAmount ??
      source.pool_amount,
  );
  const levelSplit = parseLevelSplit(
    source.levelSplit ??
      source.overrideLevelSplit ??
      source.override_level_split,
  );
  const maxOverrideLevelsRaw = Number(
    source.maxOverrideLevels ??
      source.max_override_levels ??
      source.overrideWindowLevels ??
      source.override_window_levels,
  );
  const maxOverrideLevels = Number.isFinite(maxOverrideLevelsRaw)
    ? Math.max(1, Math.floor(maxOverrideLevelsRaw))
    : undefined;
  const policyVersion =
    source.policyVersion || source.policy_version || undefined;

  return {
    ...(overridePoolAmount ? { overridePoolAmount } : {}),
    ...(levelSplit ? { levelSplit } : {}),
    ...(maxOverrideLevels ? { maxOverrideLevels } : {}),
    ...(policyVersion ? { policyVersion: String(policyVersion) } : {}),
  };
}

export async function getUplineChainForOverrideFlow(
  agentId: string,
  maxDepth = 12,
): Promise<HierarchyNode[]> {
  const chain: HierarchyNode[] = [];
  const visited = new Set<string>();

  let cursorId: string | null = String(agentId || "").trim() || null;
  for (let depth = 0; cursorId && depth < maxDepth; depth += 1) {
    if (visited.has(cursorId)) {
      break;
    }
    visited.add(cursorId);

    const { data: userRow, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", cursorId)
      .maybeSingle();

    if (error || !userRow) {
      break;
    }

    if (depth > 0) {
      chain.push({
        agentId: String(userRow.id),
        role: userRow.role ? String(userRow.role) : null,
        isActive: Boolean(userRow.is_active),
      });
    }

    cursorId = userRow.upline_agent_id ? String(userRow.upline_agent_id) : null;
  }

  return chain;
}

export async function resolveOverridePolicyConfig(options: {
  writingAgentRecord: any;
  planRecord: any | null;
}): Promise<OverridePolicyConfig> {
  const fallbackPool =
    parsePositiveNumber(
      options.writingAgentRecord?.override_pool_amount ??
        options.writingAgentRecord?.overridePoolAmount ??
        options.writingAgentRecord?.override_commission_rate ??
        options.writingAgentRecord?.overrideCommissionRate,
    ) || 0;

  const globalSetting = await getPlatformSetting<any>("override_policy");
  const globalPolicy = normalizePolicyFragment(globalSetting?.value || {});

  const writingAgentAny = options.writingAgentRecord || {};
  const agentPolicy = normalizePolicyFragment(
    writingAgentAny.override_policy ?? writingAgentAny.overridePolicy ?? {},
  );

  const agencyId =
    writingAgentAny.agency_id || writingAgentAny.agencyId || null;
  let agencyPolicy: Partial<OverridePolicyConfig> = {};
  if (agencyId) {
    const agencySetting = await getPlatformSetting<any>(
      `override_policy_agency_${String(agencyId)}`,
    );
    agencyPolicy = normalizePolicyFragment(agencySetting?.value || {});
  }

  const planAny = options.planRecord || {};
  const planPolicy = normalizePolicyFragment(
    planAny.override_policy ??
      planAny.overridePolicy ??
      planAny.features?.overridePolicy ??
      {},
  );

  const merged = {
    ...globalPolicy,
    ...agencyPolicy,
    ...planPolicy,
    ...agentPolicy,
  };

  return {
    policyVersion: String(merged.policyVersion || "wp03-v1"),
    overridePoolAmount:
      parsePositiveNumber(merged.overridePoolAmount) || fallbackPool,
    levelSplit:
      Array.isArray(merged.levelSplit) && merged.levelSplit.length > 0
        ? merged.levelSplit
        : [1, 0, 0],
    maxOverrideLevels: Number.isFinite(Number(merged.maxOverrideLevels))
      ? Number(merged.maxOverrideLevels)
      : 3,
  };
}

export async function insertCommissionRowWithWp03Fallback(
  payload: any,
): Promise<{ data: any; error: any }> {
  const { data, error } = await supabase
    .from("agent_commissions")
    .insert(payload)
    .select()
    .single();

  if (!error) {
    return { data, error: null };
  }

  if (
    !String(error.message || "")
      .toLowerCase()
      .includes("column")
  ) {
    return { data: null, error };
  }

  const legacyPayload = { ...payload };
  delete legacyPayload.original_recipient_agent_id;
  delete legacyPayload.final_recipient_agent_id;
  delete legacyPayload.original_level;
  delete legacyPayload.final_paid_level;
  delete legacyPayload.flow_up_reason_code;
  delete legacyPayload.policy_version;
  delete legacyPayload.override_pool_amount;
  delete legacyPayload.override_level_split;
  delete legacyPayload.override_window_levels;
  // Additive Phase 1 columns — fall back to omitting them too if the target
  // database has not yet run the Phase 1 migration.
  delete legacyPayload.source_payment_id;
  delete legacyPayload.commission_event_key;

  const legacyInsert = await supabase
    .from("agent_commissions")
    .insert(legacyPayload)
    .select()
    .single();

  return {
    data: legacyInsert.data,
    error: legacyInsert.error,
  };
}

/**
 * Build the deterministic idempotency key for one commission entitlement.
 * Same payment + same final recipient + same commission type + same
 * override-for-agent + same paid level => same key, so a database unique
 * index can reject a second insert attempt for the identical entitlement.
 *
 * Returns null when no sourcePaymentId is available (legacy/manual call
 * sites that cannot prove a specific payment) — such rows are NOT protected
 * by the unique index (Postgres allows multiple NULLs), matching the
 * "do not fabricate financial relationships" requirement.
 */
export function buildCommissionEventKey(options: {
  sourcePaymentId: number | string | null | undefined;
  finalRecipientAgentId: string | null;
  commissionType: "direct" | "override";
  overrideForAgentId: string | null;
  finalPaidLevel: number | null;
}): string | null {
  if (options.sourcePaymentId === null || options.sourcePaymentId === undefined) {
    return null;
  }

  const recipient = options.finalRecipientAgentId || "unassigned";
  const overrideFor = options.overrideForAgentId || "none";
  const level =
    options.finalPaidLevel === null || options.finalPaidLevel === undefined
      ? "na"
      : String(options.finalPaidLevel);

  return `payment:${options.sourcePaymentId}:recipient:${recipient}:type:${options.commissionType}:overridefor:${overrideFor}:level:${level}`;
}

export async function createWp03CommissionsForSuccessfulPayment(options: {
  phase: string;
  memberId: number;
  writingAgentId: string;
  writingAgentRecord: any;
  planRecord: any | null;
  planName: string;
  coverageType: string;
  hasRxValet: boolean;
  paymentRecord: PaymentRecord;
  lineageSnapshotId: string | null;
  /**
   * The exact payment row this commission set is generated from. Persisted
   * as `agent_commissions.source_payment_id` and used to compute each row's
   * `commission_event_key`. Optional for backward compatibility with any
   * remaining callers that have not yet been updated to pass it — such rows
   * simply will not carry the new FK/idempotency key.
   */
  sourcePaymentId?: number | string | null;
}): Promise<{ createdRows: number; retainedRows: number }> {
  const commissionResult = calculateCommission(
    options.planName,
    options.coverageType,
    options.hasRxValet,
  );
  if (!commissionResult) {
    return { createdRows: 0, retainedRows: 0 };
  }

  const policy = await resolveOverridePolicyConfig({
    writingAgentRecord: options.writingAgentRecord,
    planRecord: options.planRecord,
  });

  const uplineChain = await getUplineChainForOverrideFlow(
    options.writingAgentId,
    16,
  );

  const flow = computeCommissionFlowAllocations({
    writingAgentId: options.writingAgentId,
    writingAgentIsActive: Boolean(
      options.writingAgentRecord?.isActive ??
      options.writingAgentRecord?.is_active,
    ),
    writingAgentRole: options.writingAgentRecord?.role || null,
    directCommissionAmount: commissionResult.commission,
    uplineChain,
    policy,
  });

  const recipientAgentNumbers = new Map<string, string>();
  const allRecipientIds = [
    ...new Set(
      [
        flow.direct.finalRecipientAgentId,
        ...flow.overrides.map((o) => o.finalRecipientAgentId),
      ].filter((entry): entry is string =>
        Boolean(entry && String(entry).trim()),
      ),
    ),
  ];

  if (allRecipientIds.length > 0) {
    const { data: recipientRows } = await supabase
      .from("users")
      .select("id, agent_number")
      .in("id", allRecipientIds);

    for (const row of recipientRows || []) {
      recipientAgentNumbers.set(
        String(row.id),
        String(row.agent_number || "HOUSE"),
      );
    }
  }

  const allocations = [flow.direct, ...flow.overrides];
  let createdRows = 0;
  let retainedRows = 0;
  const sourcePaymentId = options.sourcePaymentId ?? options.paymentRecord?.id ?? null;

  for (const allocation of allocations) {
    if (
      !Number.isFinite(Number(allocation.amount)) ||
      Number(allocation.amount) <= 0
    ) {
      continue;
    }

    const finalRecipientAgentId = allocation.finalRecipientAgentId
      ? String(allocation.finalRecipientAgentId)
      : null;
    const agentId = finalRecipientAgentId || "HOUSE";
    const agentNumber = finalRecipientAgentId
      ? recipientAgentNumbers.get(finalRecipientAgentId) || "HOUSE"
      : "HOUSE";
    const overrideForAgentId =
      allocation.commissionType === "override" ? options.writingAgentId : null;

    if (!finalRecipientAgentId) {
      retainedRows += 1;
    }

    const commissionEventKey = buildCommissionEventKey({
      sourcePaymentId,
      finalRecipientAgentId,
      commissionType: allocation.commissionType,
      overrideForAgentId,
      finalPaidLevel: allocation.finalPaidLevel,
    });

    const payload = {
      agent_id: agentId,
      agent_number: agentNumber,
      member_id: options.memberId.toString(),
      enrollment_id: options.paymentRecord.subscription_id
        ? options.paymentRecord.subscription_id.toString()
        : null,
      lineage_snapshot_id: options.lineageSnapshotId,
      source_payment_id: sourcePaymentId ?? null,
      commission_event_key: commissionEventKey,
      commission_amount: Number(allocation.amount),
      coverage_type: "other" as const,
      status: "pending" as const,
      payment_status: "unpaid" as const,
      payment_captured: true,
      payment_captured_at: new Date().toISOString(),
      commission_type: allocation.commissionType,
      override_for_agent_id: overrideForAgentId,
      base_premium: commissionResult.totalCost,
      original_recipient_agent_id: allocation.originalRecipientAgentId,
      final_recipient_agent_id: allocation.finalRecipientAgentId,
      original_level: allocation.originalLevel,
      final_paid_level: allocation.finalPaidLevel,
      flow_up_reason_code: allocation.flowUpReasonCode,
      policy_version: flow.policyVersion,
      override_pool_amount: flow.overridePoolApplied,
      override_level_split: flow.levelSplitApplied,
      override_window_levels: flow.maxOverrideLevels,
      notes: `Commission via ${options.phase} - type=${allocation.commissionType}; plan=${options.planName}; coverage=${options.coverageType}; policy=${flow.policyVersion}; reason=${allocation.flowUpReasonCode || "none"}${options.hasRxValet ? "; rx_valet=true" : ""}`,
    };

    const { error } = await insertCommissionRowWithWp03Fallback(payload);
    if (error) {
      // Unique-violation on commission_event_key means this exact entitlement
      // was already created (race with another confirming process) — treat
      // as an idempotent no-op rather than an error.
      const isUniqueViolation =
        error.code === "23505" ||
        String(error.message || "")
          .toLowerCase()
          .includes("duplicate key");
      if (isUniqueViolation) {
        logEPX({
          level: "info",
          phase: options.phase,
          message:
            "Commission entitlement already exists for this payment (idempotency key conflict) — skipping",
          data: { memberId: options.memberId, sourcePaymentId, commissionEventKey },
        });
        continue;
      }

      throw new Error(
        `Failed creating ${allocation.commissionType} commission row: ${error.message}`,
      );
    }

    createdRows += 1;
  }

  return { createdRows, retainedRows };
}
