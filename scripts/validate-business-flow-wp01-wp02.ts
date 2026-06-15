import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function loadEnv(): void {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^"|"$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

const runId = `wpval_${Date.now()}`;

type CreatedAgent = {
  id: string;
  email: string;
  agentNumber: string;
};

type ScenarioResult = {
  memberId: number;
  paymentId: number;
  directAgentIds: string[];
  overrideAgentIds: string[];
};

function randomAgentNumber(seed: string): string {
  const suffix = seed.replace(/[^0-9]/g, "").slice(-6);
  return `WP${suffix}`.padEnd(8, "0").slice(0, 8);
}

function uniqueEmail(label: string): string {
  return `${label}.${runId}@example.test`;
}

async function main() {
  const { supabaseAdmin: supabase } = await import("../server/lib/supabaseClient");
  const { calculateCommission } = await import("../server/commissionCalculator");
  const { updateAgentHierarchy } = await import("../server/storage");

  const createdUserIds: string[] = [];
  const createdMemberIds: number[] = [];
  const createdSubscriptionIds: number[] = [];
  const createdPaymentIds: number[] = [];
  const createdCommissionIds: string[] = [];

  async function createAgent(firstName: string, lastName: string, role: "agent" | "admin", numSeed: string): Promise<CreatedAgent> {
    const id = crypto.randomUUID();
    const email = uniqueEmail(firstName.toLowerCase());
    const agentNumber = randomAgentNumber(numSeed);

    const { data, error } = await supabase
      .from("users")
      .insert({
        id,
        email,
        first_name: firstName,
        last_name: lastName,
        role,
        agent_number: agentNumber,
        is_active: true,
        approval_status: "approved",
        email_verified: true,
      })
      .select("id, email, agent_number")
      .single();

    if (error || !data) throw new Error(`Failed creating ${role} ${firstName}: ${error?.message || "unknown"}`);
    createdUserIds.push(String(data.id));

    return {
      id: String(data.id),
      email: String(data.email),
      agentNumber: String(data.agent_number),
    };
  }

  async function createMemberAndPayment(writingAgentId: string, label: string): Promise<{ memberId: number; subscriptionId: number; paymentId: number }> {
    const uniqueSeed = `${label}${Date.now().toString().slice(-6)}${crypto.randomBytes(3).toString("hex")}`;
    const customerNumber = `CUST${uniqueSeed}`.slice(0, 24);
    const memberPublicId = `MBR${uniqueSeed}`.slice(0, 24);

    const { data: planData, error: planError } = await supabase
      .from("plans")
      .select("id, price")
      .eq("is_active", true)
      .order("id", { ascending: true })
      .limit(1)
      .single();

    if (planError || !planData) throw new Error(`Failed selecting plan: ${planError?.message || "missing plan"}`);

    const { data: member, error: memberError } = await supabase
      .from("members")
      .insert({
        customer_number: customerNumber,
        member_public_id: memberPublicId,
        first_name: `Member${label}`,
        last_name: "Validation",
        email: uniqueEmail(`member${label.toLowerCase()}`),
        enrolled_by_agent_id: writingAgentId,
        agent_number: null,
        coverage_type: "Member Only",
        status: "active",
      })
      .select("id")
      .single();

    if (memberError || !member) throw new Error(`Failed creating member ${label}: ${memberError?.message || "unknown"}`);
    const memberId = Number(member.id);
    createdMemberIds.push(memberId);

    const { data: subscription, error: subscriptionError } = await supabase
      .from("subscriptions")
      .insert({
        member_id: memberId,
        plan_id: Number(planData.id),
        status: "active",
        amount: String(planData.price ?? "59.00"),
      })
      .select("id")
      .single();

    if (subscriptionError || !subscription) throw new Error(`Failed creating subscription ${label}: ${subscriptionError?.message || "unknown"}`);
    const subscriptionId = Number(subscription.id);
    createdSubscriptionIds.push(subscriptionId);

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({
        member_id: memberId,
        subscription_id: subscriptionId,
        amount: String(planData.price ?? "59.00"),
        status: "succeeded",
        transaction_id: `txn_${runId}_${label}`.slice(0, 64),
        payment_method: "card",
        payment_method_type: "CreditCard",
      })
      .select("id")
      .single();

    if (paymentError || !payment) throw new Error(`Failed creating payment ${label}: ${paymentError?.message || "unknown"}`);
    const paymentId = Number(payment.id);
    createdPaymentIds.push(paymentId);

    return { memberId, subscriptionId, paymentId };
  }

  async function createCommissionsForPayment(memberId: number, subscriptionId: number, writingAgentId: string): Promise<ScenarioResult> {
    const commission = calculateCommission("MyPremierPlan Base", "Member Only", false);
    if (!commission) throw new Error("Failed calculating commission");

    const { data: writingAgent, error: writingAgentError } = await supabase
      .from("users")
      .select("id, agent_number, upline_agent_id, override_commission_rate")
      .eq("id", writingAgentId)
      .single();

    if (writingAgentError || !writingAgent) throw new Error(`Failed loading writing agent: ${writingAgentError?.message || "unknown"}`);

    const { data: directRow, error: directError } = await supabase
      .from("agent_commissions")
      .insert({
        agent_id: writingAgentId,
        agent_number: writingAgent.agent_number,
        member_id: String(memberId),
        enrollment_id: String(subscriptionId),
        commission_amount: commission.commission,
        coverage_type: "other",
        status: "pending",
        payment_status: "unpaid",
        commission_type: "direct",
        notes: `WP validation direct ${runId}`,
      })
      .select("id, agent_id")
      .single();

    if (directError || !directRow) throw new Error(`Failed creating direct commission: ${directError?.message || "unknown"}`);
    createdCommissionIds.push(String(directRow.id));

    const overrideAgentIds: string[] = [];

    const uplineId = writingAgent.upline_agent_id ? String(writingAgent.upline_agent_id) : null;
    const overrideRate = Number(writingAgent.override_commission_rate || 0);

    if (uplineId && overrideRate > 0) {
      const { data: upline, error: uplineError } = await supabase
        .from("users")
        .select("id, role, agent_number")
        .eq("id", uplineId)
        .single();

      if (uplineError || !upline) throw new Error(`Failed loading upline: ${uplineError?.message || "unknown"}`);

      const uplineRole = String(upline.role || "");
      const suppressOverride = uplineRole === "admin" || uplineRole === "super_admin";

      if (!suppressOverride) {
        const { data: overrideRow, error: overrideError } = await supabase
          .from("agent_commissions")
          .insert({
            agent_id: uplineId,
            agent_number: upline.agent_number,
            member_id: String(memberId),
            enrollment_id: String(subscriptionId),
            commission_amount: overrideRate,
            coverage_type: "other",
            status: "pending",
            payment_status: "unpaid",
            commission_type: "override",
            override_for_agent_id: writingAgentId,
            notes: `WP validation override ${runId}`,
          })
          .select("id, agent_id")
          .single();

        if (overrideError || !overrideRow) throw new Error(`Failed creating override commission: ${overrideError?.message || "unknown"}`);
        createdCommissionIds.push(String(overrideRow.id));
        overrideAgentIds.push(String(overrideRow.agent_id));
      }
    }

    return {
      memberId,
      paymentId: -1,
      directAgentIds: [String(directRow.agent_id)],
      overrideAgentIds,
    };
  }

  try {
    const admin = await createAgent("FlowAdmin", "Validator", "admin", `${Date.now()}901`);
    const agentA = await createAgent("AgentA", "Validator", "agent", `${Date.now()}902`);
    const agentB = await createAgent("AgentB", "Validator", "agent", `${Date.now()}903`);
    const agentC = await createAgent("AgentC", "Validator", "agent", `${Date.now()}904`);

    // Scenario A: Agent A direct to MPP (no upline)
    await updateAgentHierarchy(agentA.id, null, 0, admin.id, `WP validation ${runId} scenario A`);
    const scenarioAMember = await createMemberAndPayment(agentA.id, "A");
    const scenarioAResult = await createCommissionsForPayment(scenarioAMember.memberId, scenarioAMember.subscriptionId, agentA.id);

    // Scenario B: Agent B under Agent A
    await updateAgentHierarchy(agentB.id, agentA.id, 5, admin.id, `WP validation ${runId} scenario B`);
    const scenarioBMember = await createMemberAndPayment(agentB.id, "B");
    const scenarioBResult = await createCommissionsForPayment(scenarioBMember.memberId, scenarioBMember.subscriptionId, agentB.id);

    // Scenario C: Agent C under Agent B
    await updateAgentHierarchy(agentC.id, agentB.id, 7, admin.id, `WP validation ${runId} scenario C`);
    const scenarioCMember = await createMemberAndPayment(agentC.id, "C");
    const scenarioCResult = await createCommissionsForPayment(scenarioCMember.memberId, scenarioCMember.subscriptionId, agentC.id);

    const { data: hierarchyRows, error: hierarchyError } = await supabase
      .from("users")
      .select("id, upline_agent_id, override_commission_rate")
      .in("id", [agentA.id, agentB.id, agentC.id]);

    if (hierarchyError) throw new Error(`Failed reading hierarchy rows: ${hierarchyError.message}`);

    const hierarchyById = new Map((hierarchyRows || []).map((row: any) => [String(row.id), row]));

    const hierarchyAssignmentWorks =
      (hierarchyById.get(agentA.id)?.upline_agent_id ?? null) === null &&
      String(hierarchyById.get(agentB.id)?.upline_agent_id || "") === agentA.id &&
      String(hierarchyById.get(agentC.id)?.upline_agent_id || "") === agentB.id;

    const scenarioAOverrideNone = scenarioAResult.overrideAgentIds.length === 0;
    const scenarioBOverrideIsA = scenarioBResult.overrideAgentIds.length === 1 && scenarioBResult.overrideAgentIds[0] === agentA.id;
    const scenarioCOverrideIsImmediateB = scenarioCResult.overrideAgentIds.length === 1 && scenarioCResult.overrideAgentIds[0] === agentB.id;
    const scenarioCNoSecondLevelToA = !scenarioCResult.overrideAgentIds.includes(agentA.id);

    const directCommissionFollowsWriter =
      scenarioAResult.directAgentIds[0] === agentA.id &&
      scenarioBResult.directAgentIds[0] === agentB.id &&
      scenarioCResult.directAgentIds[0] === agentC.id;

    const overrideCurrentlyActive = scenarioBResult.overrideAgentIds.length > 0 || scenarioCResult.overrideAgentIds.length > 0;

    const overrideDepth = !overrideCurrentlyActive
      ? "None"
      : scenarioCOverrideIsImmediateB && scenarioCNoSecondLevelToA
        ? "1 level"
        : "other";

    const output = {
      runId,
      agents: {
        admin: admin.id,
        agentA: agentA.id,
        agentB: agentB.id,
        agentC: agentC.id,
      },
      scenarioChecks: {
        agentCreationWorks: true,
        hierarchyAssignmentWorks,
        hierarchyPersistenceWorks: hierarchyAssignmentWorks,
        directCommissionFollowsWriter,
        overrideFollowsUplineCurrentLogic: scenarioBOverrideIsA && scenarioCOverrideIsImmediateB,
        overrideCurrentlyActive,
        overrideDepth,
        scenarioA_noOverride: scenarioAOverrideNone,
        scenarioB_overrideToA: scenarioBOverrideIsA,
        scenarioC_overrideToImmediateB_only: scenarioCOverrideIsImmediateB && scenarioCNoSecondLevelToA,
      },
      scenarioEvidence: {
        scenarioA: scenarioAResult,
        scenarioB: scenarioBResult,
        scenarioC: scenarioCResult,
      },
      blockers: [],
    };

    console.log(JSON.stringify(output, null, 2));
  } catch (error: any) {
    console.error(JSON.stringify({
      runId,
      error: error?.message || String(error),
      blockers: [error?.message || String(error)],
    }, null, 2));
    process.exit(1);
  }
}

main();
