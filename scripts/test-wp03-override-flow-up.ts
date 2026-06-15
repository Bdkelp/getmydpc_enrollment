import assert from "node:assert/strict";
import {
  computeCommissionFlowAllocations,
  type HierarchyNode,
  type OverridePolicyConfig,
} from "../server/services/override-flow-up-engine";

const defaultPolicy: OverridePolicyConfig = {
  policyVersion: "wp03-test",
  overridePoolAmount: 30,
  levelSplit: [0.5, 0.3, 0.2],
  maxOverrideLevels: 3,
};

function makeNode(
  agentId: string,
  isActive = true,
  role = "agent",
): HierarchyNode {
  return { agentId, isActive, role };
}

function totalOverridePaid(
  result: ReturnType<typeof computeCommissionFlowAllocations>,
): number {
  return Number(
    result.overrides
      .reduce((sum, row) => sum + Number(row.amount || 0), 0)
      .toFixed(2),
  );
}

function testNoUpline(): void {
  const result = computeCommissionFlowAllocations({
    writingAgentId: "writer",
    writingAgentIsActive: true,
    directCommissionAmount: 20,
    uplineChain: [],
    policy: defaultPolicy,
  });

  assert.equal(result.direct.finalRecipientAgentId, "writer");
  assert.equal(
    result.overrides.filter((r) => r.finalRecipientAgentId).length,
    0,
  );
}

function testOneUpline(): void {
  const result = computeCommissionFlowAllocations({
    writingAgentId: "writer",
    writingAgentIsActive: true,
    directCommissionAmount: 20,
    uplineChain: [makeNode("u1")],
    policy: defaultPolicy,
  });

  const paid = result.overrides.filter((r) => r.finalRecipientAgentId === "u1");
  assert.equal(paid.length, 1);
  assert.equal(paid[0].originalLevel, 1);
}

function testTwoUplines(): void {
  const result = computeCommissionFlowAllocations({
    writingAgentId: "writer",
    writingAgentIsActive: true,
    directCommissionAmount: 20,
    uplineChain: [makeNode("u1"), makeNode("u2")],
    policy: defaultPolicy,
  });

  assert.equal(
    result.overrides.some(
      (r) => r.finalRecipientAgentId === "u1" && r.originalLevel === 1,
    ),
    true,
  );
  assert.equal(
    result.overrides.some(
      (r) => r.finalRecipientAgentId === "u2" && r.originalLevel === 2,
    ),
    true,
  );
}

function testThreeUplines(): void {
  const result = computeCommissionFlowAllocations({
    writingAgentId: "writer",
    writingAgentIsActive: true,
    directCommissionAmount: 20,
    uplineChain: [makeNode("u1"), makeNode("u2"), makeNode("u3")],
    policy: defaultPolicy,
  });

  assert.equal(
    result.overrides.some(
      (r) => r.finalRecipientAgentId === "u3" && r.originalLevel === 3,
    ),
    true,
  );
}

function testFourPlusUplinesOutsideWindowRetained(): void {
  const result = computeCommissionFlowAllocations({
    writingAgentId: "writer",
    writingAgentIsActive: true,
    directCommissionAmount: 20,
    uplineChain: [
      makeNode("u1"),
      makeNode("u2"),
      makeNode("u3"),
      makeNode("u4"),
    ],
    policy: defaultPolicy,
  });

  assert.equal(result.maxOverrideLevels, 3);
  assert.equal(
    result.overrides.some(
      (r) => r.originalLevel > 3 && !r.finalRecipientAgentId,
    ),
    false,
  );
}

function testInactiveWritingAgentProducesNoCommissionAllocations(): void {
  const result = computeCommissionFlowAllocations({
    writingAgentId: "writer",
    writingAgentIsActive: false,
    directCommissionAmount: 20,
    uplineChain: [makeNode("u1"), makeNode("u2")],
    policy: defaultPolicy,
  });

  assert.equal(result.direct.amount, 0);
  assert.equal(result.direct.finalRecipientAgentId, null);
  assert.equal(result.overrides.length, 0);
}

function testInactiveLevel1FlowUp(): void {
  const result = computeCommissionFlowAllocations({
    writingAgentId: "writer",
    writingAgentIsActive: true,
    directCommissionAmount: 20,
    uplineChain: [
      makeNode("u1", false),
      makeNode("u2", true),
      makeNode("u3", true),
    ],
    policy: defaultPolicy,
  });

  const level1 = result.overrides.find((r) => r.originalLevel === 1);
  const level2 = result.overrides.find((r) => r.originalLevel === 2);
  assert.ok(level1);
  assert.ok(level2);
  assert.equal(level1!.finalRecipientAgentId, null);
  assert.equal(
    level1!.flowUpReasonCode,
    "duplicate_override_recipient_retained",
  );
  assert.equal(level2!.finalRecipientAgentId, "u2");
}

function testInactiveLevel2FlowUp(): void {
  const result = computeCommissionFlowAllocations({
    writingAgentId: "writer",
    writingAgentIsActive: true,
    directCommissionAmount: 20,
    uplineChain: [
      makeNode("u1", true),
      makeNode("u2", false),
      makeNode("u3", true),
    ],
    policy: defaultPolicy,
  });

  const level2 = result.overrides.find((r) => r.originalLevel === 2);
  const level3 = result.overrides.find((r) => r.originalLevel === 3);
  assert.ok(level2);
  assert.ok(level3);
  assert.equal(level2!.finalRecipientAgentId, null);
  assert.equal(
    level2!.flowUpReasonCode,
    "duplicate_override_recipient_retained",
  );
  assert.equal(level3!.finalRecipientAgentId, "u3");
}

function testInactiveLevel3FlowUp(): void {
  const result = computeCommissionFlowAllocations({
    writingAgentId: "writer",
    writingAgentIsActive: true,
    directCommissionAmount: 20,
    uplineChain: [
      makeNode("u1", true),
      makeNode("u2", true),
      makeNode("u3", false),
      makeNode("u4", true),
    ],
    policy: defaultPolicy,
  });

  const level3 = result.overrides.find((r) => r.originalLevel === 3);
  assert.ok(level3);
  assert.equal(level3!.finalRecipientAgentId, "u4");
  assert.equal(level3!.finalPaidLevel, 4);
  assert.equal(level3!.flowUpReasonCode, "inactive_override_recipient_flow_up");
}

function testNoDuplicateOverrideRecipientPerEnrollment(): void {
  const result = computeCommissionFlowAllocations({
    writingAgentId: "writer",
    writingAgentIsActive: true,
    directCommissionAmount: 20,
    uplineChain: [
      makeNode("u1", false),
      makeNode("u2", true),
      makeNode("u3", true),
    ],
    policy: defaultPolicy,
  });

  const paidRecipients = result.overrides
    .map((row) => row.finalRecipientAgentId)
    .filter((id): id is string => Boolean(id));
  const uniqueRecipients = new Set(paidRecipients);
  assert.equal(paidRecipients.length, uniqueRecipients.size);
}

function testMissingLevelRemainsWithMpp(): void {
  const result = computeCommissionFlowAllocations({
    writingAgentId: "writer",
    writingAgentIsActive: true,
    directCommissionAmount: 20,
    uplineChain: [makeNode("u1", true)],
    policy: defaultPolicy,
  });

  const level2 = result.overrides.find((r) => r.originalLevel === 2);
  const level3 = result.overrides.find((r) => r.originalLevel === 3);
  assert.ok(level2);
  assert.ok(level3);
  assert.equal(level2!.finalRecipientAgentId, null);
  assert.equal(level3!.finalRecipientAgentId, null);
}

function testNoEligibleFlowUpRecipient(): void {
  const result = computeCommissionFlowAllocations({
    writingAgentId: "writer",
    writingAgentIsActive: true,
    directCommissionAmount: 20,
    uplineChain: [
      makeNode("u1", false),
      makeNode("u2", false),
      makeNode("u3", false),
    ],
    policy: defaultPolicy,
  });

  const level1 = result.overrides.find((r) => r.originalLevel === 1);
  assert.ok(level1);
  assert.equal(level1!.finalRecipientAgentId, null);
  assert.equal(level1!.flowUpReasonCode, "no_eligible_upline_for_flow_up");
}

function testTotalPayoutNeverExceedsPool(): void {
  const result = computeCommissionFlowAllocations({
    writingAgentId: "writer",
    writingAgentIsActive: true,
    directCommissionAmount: 20,
    uplineChain: [makeNode("u1"), makeNode("u2"), makeNode("u3")],
    policy: {
      ...defaultPolicy,
      overridePoolAmount: 17,
      levelSplit: [0.34, 0.33, 0.33],
    },
  });

  assert.ok(totalOverridePaid(result) <= 17);
}

function run(): void {
  testNoUpline();
  testOneUpline();
  testTwoUplines();
  testThreeUplines();
  testFourPlusUplinesOutsideWindowRetained();
  testInactiveWritingAgentProducesNoCommissionAllocations();
  testInactiveLevel1FlowUp();
  testInactiveLevel2FlowUp();
  testInactiveLevel3FlowUp();
  testNoDuplicateOverrideRecipientPerEnrollment();
  testMissingLevelRemainsWithMpp();
  testNoEligibleFlowUpRecipient();
  testTotalPayoutNeverExceedsPool();
  console.log("WP-03 override flow-up tests passed");
}

run();
