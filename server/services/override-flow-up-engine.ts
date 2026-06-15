export type OverrideFlowReasonCode =
  | "inactive_override_recipient_flow_up"
  | "no_eligible_upline_for_flow_up"
  | "duplicate_override_recipient_retained";

export interface HierarchyNode {
  agentId: string;
  role?: string | null;
  isActive: boolean;
}

export interface OverridePolicyConfig {
  policyVersion: string;
  overridePoolAmount: number;
  levelSplit: number[];
  maxOverrideLevels?: number;
}

export interface CommissionAllocation {
  commissionType: "direct" | "override";
  amount: number;
  originalRecipientAgentId: string | null;
  finalRecipientAgentId: string | null;
  originalLevel: number;
  finalPaidLevel: number | null;
  flowUpReasonCode: OverrideFlowReasonCode | null;
}

export interface CommissionFlowResult {
  direct: CommissionAllocation;
  overrides: CommissionAllocation[];
  policyVersion: string;
  levelSplitApplied: number[];
  overridePoolApplied: number;
  maxOverrideLevels: number;
}

const DEFAULT_MAX_OVERRIDE_LEVELS = 3;
const DEFAULT_LEVEL_SPLIT = [1, 0, 0];

function toMoneyCents(value: unknown): number {
  return Math.round(Number(value || 0) * 100);
}

function toMoney(valueInCents: number): number {
  return valueInCents / 100;
}

function normalizeMoney(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return toMoney(toMoneyCents(numeric));
}

function normalizeLevelSplit(levelSplit: unknown, maxLevels: number): number[] {
  const source = Array.isArray(levelSplit) ? levelSplit : DEFAULT_LEVEL_SPLIT;
  const output: number[] = [];

  for (let i = 0; i < maxLevels; i += 1) {
    const raw = Number(source[i] ?? 0);
    output.push(Number.isFinite(raw) && raw > 0 ? raw : 0);
  }

  const total = output.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return DEFAULT_LEVEL_SPLIT.slice(0, maxLevels).concat(
      Array(Math.max(0, maxLevels - DEFAULT_LEVEL_SPLIT.length)).fill(0),
    );
  }

  if (total <= 1) {
    return output;
  }

  return output.map((value) => value / total);
}

function splitPoolInCents(
  poolCents: number,
  split: number[],
): { levelAmountsCents: number[]; retainedOutsideWindowCents: number } {
  if (poolCents <= 0) {
    return {
      levelAmountsCents: split.map(() => 0),
      retainedOutsideWindowCents: 0,
    };
  }

  const provisional = split.map((weight) => poolCents * weight);
  const floors = provisional.map((value) => Math.floor(Math.max(0, value)));
  let allocated = floors.reduce((sum, value) => sum + value, 0);
  const remainder = Math.max(0, poolCents - allocated);

  const fractionalIndexes = provisional
    .map((value, index) => ({ index, fractional: value - floors[index] }))
    .sort((a, b) => b.fractional - a.fractional);

  for (let i = 0; i < remainder; i += 1) {
    const target =
      fractionalIndexes[i % Math.max(1, fractionalIndexes.length)]?.index;
    if (typeof target === "number") {
      floors[target] += 1;
      allocated += 1;
    }
  }

  return {
    levelAmountsCents: floors,
    retainedOutsideWindowCents: Math.max(0, poolCents - allocated),
  };
}

function isEligibleOverrideRecipient(
  node: HierarchyNode | null | undefined,
): boolean {
  if (!node || !node.agentId || !node.isActive) {
    return false;
  }

  const role = String(node.role || "").toLowerCase();
  return role !== "admin" && role !== "super_admin";
}

function findNextEligibleOverrideRecipient(
  uplineChain: HierarchyNode[],
  startIndexExclusive: number,
): { node: HierarchyNode; paidLevel: number } | null {
  for (let i = startIndexExclusive + 1; i < uplineChain.length; i += 1) {
    const candidate = uplineChain[i];
    if (isEligibleOverrideRecipient(candidate)) {
      return {
        node: candidate,
        paidLevel: i + 1,
      };
    }
  }

  return null;
}

export function computeCommissionFlowAllocations(input: {
  writingAgentId: string;
  writingAgentIsActive: boolean;
  writingAgentRole?: string | null;
  directCommissionAmount: number;
  uplineChain: HierarchyNode[];
  policy: OverridePolicyConfig;
}): CommissionFlowResult {
  const maxOverrideLevels = Number.isFinite(
    Number(input.policy.maxOverrideLevels),
  )
    ? Math.max(1, Math.floor(Number(input.policy.maxOverrideLevels)))
    : DEFAULT_MAX_OVERRIDE_LEVELS;

  const normalizedPool = normalizeMoney(input.policy.overridePoolAmount);
  const normalizedDirectAmount = normalizeMoney(input.directCommissionAmount);
  const split = normalizeLevelSplit(input.policy.levelSplit, maxOverrideLevels);
  const { levelAmountsCents, retainedOutsideWindowCents } = splitPoolInCents(
    toMoneyCents(normalizedPool),
    split,
  );

  // Registration rejects inactive writing agents. Keep a defensive no-payout shape
  // so no commission rows can be generated if this function is called unexpectedly.
  if (!input.writingAgentIsActive) {
    return {
      direct: {
        commissionType: "direct",
        amount: 0,
        originalRecipientAgentId: input.writingAgentId,
        finalRecipientAgentId: null,
        originalLevel: 0,
        finalPaidLevel: null,
        flowUpReasonCode: "no_eligible_upline_for_flow_up",
      },
      overrides: [],
      policyVersion: String(input.policy.policyVersion || "wp03-v1"),
      levelSplitApplied: split,
      overridePoolApplied: normalizedPool,
      maxOverrideLevels,
    };
  }

  const direct: CommissionAllocation = {
    commissionType: "direct",
    amount: normalizedDirectAmount,
    originalRecipientAgentId: input.writingAgentId,
    finalRecipientAgentId: input.writingAgentId,
    originalLevel: 0,
    finalPaidLevel: 0,
    flowUpReasonCode: null,
  };

  const overrides: CommissionAllocation[] = [];
  const paidOverrideRecipients = new Set<string>();

  // Reserve standard recipients from the physical 1..N levels so flow-up does not
  // stack onto an upline that already has its own scheduled level payout.
  const scheduledRecipientsByLevel = Array.from(
    { length: maxOverrideLevels },
    (_, idx) => {
      const intended = input.uplineChain[idx];
      return isEligibleOverrideRecipient(intended) ? intended!.agentId : null;
    },
  );

  const isReservedForAnotherLevel = (
    agentId: string,
    currentLevel: number,
  ): boolean => {
    return scheduledRecipientsByLevel.some(
      (scheduledAgentId, scheduledIdx) =>
        scheduledAgentId === agentId && scheduledIdx + 1 !== currentLevel,
    );
  };

  for (let idx = 0; idx < maxOverrideLevels; idx += 1) {
    const amount = toMoney(levelAmountsCents[idx] || 0);
    if (amount <= 0) {
      continue;
    }

    const level = idx + 1;
    const intended = input.uplineChain[idx];

    if (!intended?.agentId) {
      overrides.push({
        commissionType: "override",
        amount,
        originalRecipientAgentId: null,
        finalRecipientAgentId: null,
        originalLevel: level,
        finalPaidLevel: null,
        flowUpReasonCode: "no_eligible_upline_for_flow_up",
      });
      continue;
    }

    if (isEligibleOverrideRecipient(intended)) {
      if (paidOverrideRecipients.has(intended.agentId)) {
        overrides.push({
          commissionType: "override",
          amount,
          originalRecipientAgentId: intended.agentId,
          finalRecipientAgentId: null,
          originalLevel: level,
          finalPaidLevel: null,
          flowUpReasonCode: "duplicate_override_recipient_retained",
        });
        continue;
      }

      overrides.push({
        commissionType: "override",
        amount,
        originalRecipientAgentId: intended.agentId,
        finalRecipientAgentId: intended.agentId,
        originalLevel: level,
        finalPaidLevel: level,
        flowUpReasonCode: null,
      });
      paidOverrideRecipients.add(intended.agentId);
      continue;
    }

    if (!intended.isActive) {
      const flowUpRecipient = findNextEligibleOverrideRecipient(
        input.uplineChain,
        idx,
      );
      if (flowUpRecipient) {
        const flowUpAgentId = flowUpRecipient.node.agentId;
        if (
          paidOverrideRecipients.has(flowUpAgentId) ||
          isReservedForAnotherLevel(flowUpAgentId, level)
        ) {
          overrides.push({
            commissionType: "override",
            amount,
            originalRecipientAgentId: intended.agentId,
            finalRecipientAgentId: null,
            originalLevel: level,
            finalPaidLevel: null,
            flowUpReasonCode: "duplicate_override_recipient_retained",
          });
          continue;
        }

        overrides.push({
          commissionType: "override",
          amount,
          originalRecipientAgentId: intended.agentId,
          finalRecipientAgentId: flowUpAgentId,
          originalLevel: level,
          finalPaidLevel: flowUpRecipient.paidLevel,
          flowUpReasonCode: "inactive_override_recipient_flow_up",
        });
        paidOverrideRecipients.add(flowUpAgentId);
      } else {
        overrides.push({
          commissionType: "override",
          amount,
          originalRecipientAgentId: intended.agentId,
          finalRecipientAgentId: null,
          originalLevel: level,
          finalPaidLevel: null,
          flowUpReasonCode: "no_eligible_upline_for_flow_up",
        });
      }
      continue;
    }

    // Recipient exists but is role-ineligible (e.g., admin hierarchy node): retain with MPP.
    overrides.push({
      commissionType: "override",
      amount,
      originalRecipientAgentId: intended.agentId,
      finalRecipientAgentId: null,
      originalLevel: level,
      finalPaidLevel: null,
      flowUpReasonCode: "no_eligible_upline_for_flow_up",
    });
  }

  const retainedOutsideWindowAmount = toMoney(retainedOutsideWindowCents);
  if (retainedOutsideWindowAmount > 0) {
    overrides.push({
      commissionType: "override",
      amount: retainedOutsideWindowAmount,
      originalRecipientAgentId: null,
      finalRecipientAgentId: null,
      originalLevel: maxOverrideLevels + 1,
      finalPaidLevel: null,
      flowUpReasonCode: "no_eligible_upline_for_flow_up",
    });
  }

  return {
    direct,
    overrides,
    policyVersion: String(input.policy.policyVersion || "wp03-v1"),
    levelSplitApplied: split,
    overridePoolApplied: normalizedPool,
    maxOverrideLevels,
  };
}
