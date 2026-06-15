#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const cwd = process.cwd();
const defaultEnvPath = path.join(cwd, ".env");
const envFileArg = process.argv.find((arg) => arg.startsWith("--env-file="));
const envFilePath = envFileArg
  ? path.resolve(cwd, envFileArg.slice("--env-file=".length).trim())
  : defaultEnvPath;

if (fs.existsSync(envFilePath)) {
  const content = fs.readFileSync(envFilePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line
      .slice(idx + 1)
      .trim()
      .replace(/^"|"$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

const normalize = (value) =>
  String(value || "")
    .replace(/["']/g, "")
    .trim();
const argValue = (name) => {
  const arg = process.argv.find((entry) => entry.startsWith(`${name}=`));
  return arg ? arg.slice(name.length + 1).trim() : "";
};

const strict = process.argv.includes("--strict");
const memberIdArg = argValue("--member-id");
const paymentIdArg = argValue("--payment-id");
const writingAgentIdArg = normalize(argValue("--writing-agent-id"));
const uplineIdsArg = normalize(argValue("--upline-ids"));
const expectedUplineIds = uplineIdsArg
  ? uplineIdsArg
      .split(",")
      .map((entry) => normalize(entry))
      .filter(Boolean)
  : [];
const requireReassignmentEvidence = process.argv.includes(
  "--require-reassignment-evidence",
);

const supabaseUrl = normalize(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
);
const supabaseServiceKey = normalize(
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
);

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    "Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY in environment",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: "public" },
});

const checks = [];
const addCheck = (name, pass, details, required = true) => {
  checks.push({ name, pass: Boolean(pass), details, required });
};

const toIntOrNull = (value) => {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const hashSnapshotPayload = (snapshot) => {
  const payload = {
    id: snapshot.id,
    member_id: snapshot.member_id,
    payment_id: snapshot.payment_id,
    subscription_id: snapshot.subscription_id,
    enrolled_by_agent_id: snapshot.enrolled_by_agent_id,
    lineage_depth: snapshot.lineage_depth,
    lineage_path: snapshot.lineage_path,
    capture_source: snapshot.capture_source,
    idempotency_key: snapshot.idempotency_key,
    created_at: snapshot.created_at,
  };

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
};

const deriveCurrentLineagePath = async (startingAgentId) => {
  const lineage = [];
  const visited = new Set();
  let cursor = normalize(startingAgentId) || null;
  let depth = 0;

  while (cursor && depth < 64) {
    if (visited.has(cursor)) {
      break;
    }

    visited.add(cursor);
    const { data, error } = await supabase
      .from("users")
      .select("id, agent_number, role, is_active, upline_agent_id")
      .eq("id", cursor)
      .maybeSingle();

    if (error || !data) {
      break;
    }

    lineage.push({
      userId: String(data.id),
      agentNumber: data.agent_number ? String(data.agent_number) : null,
      role: data.role ? String(data.role) : null,
      isActive: Boolean(data.is_active),
      depth,
    });

    cursor = data.upline_agent_id ? String(data.upline_agent_id) : null;
    depth += 1;
  }

  return lineage;
};

async function resolveSnapshotContext() {
  const memberId = toIntOrNull(memberIdArg);
  const paymentId = toIntOrNull(paymentIdArg);

  let query = supabase
    .from("agent_lineage_snapshots")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);

  if (memberId !== null) query = query.eq("member_id", memberId);
  if (paymentId !== null) query = query.eq("payment_id", paymentId);

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed loading agent_lineage_snapshots: ${error.message}`);
  }

  const snapshot = Array.isArray(data) && data.length > 0 ? data[0] : null;
  return {
    snapshot,
    selectedBy:
      memberId !== null || paymentId !== null ? "explicit-args" : "latest",
  };
}

async function run() {
  console.log("Lineage Snapshot Sandbox Verification");
  console.log("====================================");
  console.log(`Mode: ${strict ? "strict" : "report-only"}`);

  const { snapshot, selectedBy } = await resolveSnapshotContext();

  if (!snapshot) {
    addCheck(
      "Snapshot row exists for selected context",
      false,
      `No snapshot found (selectedBy=${selectedBy})`,
    );
    printAndExit();
    return;
  }

  const memberId = Number(snapshot.member_id);
  const paymentId = Number(snapshot.payment_id);

  console.log(`Target snapshot: ${snapshot.id}`);
  console.log(
    `Context: member_id=${memberId}, payment_id=${paymentId}, selectedBy=${selectedBy}`,
  );

  addCheck(
    "Snapshot row creation",
    Boolean(snapshot.id),
    `snapshot_id=${snapshot.id}`,
  );

  const snapshotLineagePath = Array.isArray(snapshot.lineage_path)
    ? snapshot.lineage_path
    : [];
  const snapshotWritingAgentId = snapshotLineagePath[0]?.userId
    ? String(snapshotLineagePath[0].userId)
    : null;

  if (writingAgentIdArg) {
    addCheck(
      "Deterministic writing agent matches snapshot",
      snapshotWritingAgentId === writingAgentIdArg,
      `expected=${writingAgentIdArg}, actual=${snapshotWritingAgentId || "(none)"}`,
    );
  }

  if (expectedUplineIds.length > 0) {
    const actualUplineIds = snapshotLineagePath
      .slice(1)
      .map((node) => String(node?.userId || ""))
      .filter(Boolean)
      .slice(0, expectedUplineIds.length);

    const deterministicMatch =
      JSON.stringify(actualUplineIds) === JSON.stringify(expectedUplineIds);
    addCheck(
      "Deterministic upline chain matches snapshot",
      deterministicMatch,
      `expected=${expectedUplineIds.join(">")}, actual=${actualUplineIds.join(">") || "(none)"}`,
    );
  }

  const { count: duplicateCount, error: duplicateError } = await supabase
    .from("agent_lineage_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("member_id", memberId)
    .eq("payment_id", paymentId);

  if (duplicateError) {
    addCheck(
      "No duplicate snapshots for member/payment",
      false,
      duplicateError.message,
    );
  } else {
    addCheck(
      "No duplicate snapshots for member/payment",
      Number(duplicateCount || 0) === 1,
      `count=${duplicateCount || 0}`,
    );
  }

  const { count: idempotencyCount, error: idempotencyError } = await supabase
    .from("agent_lineage_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("idempotency_key", String(snapshot.idempotency_key || ""));

  if (idempotencyError) {
    addCheck("Idempotency key uniqueness", false, idempotencyError.message);
  } else {
    addCheck(
      "Idempotency key uniqueness",
      Number(idempotencyCount || 0) === 1,
      `count=${idempotencyCount || 0}, key=${snapshot.idempotency_key}`,
    );
  }

  const { data: commissions, error: commissionsError } = await supabase
    .from("agent_commissions")
    .select("id, member_id, lineage_snapshot_id, created_at")
    .eq("member_id", String(memberId));

  if (commissionsError) {
    addCheck(
      "Commission lineage snapshot attachment",
      false,
      commissionsError.message,
    );
  } else {
    const rows = commissions || [];
    const missing = rows.filter((row) => !row.lineage_snapshot_id).length;
    const matching = rows.filter(
      (row) => String(row.lineage_snapshot_id || "") === String(snapshot.id),
    ).length;
    addCheck(
      "Commission records receive lineage_snapshot_id",
      rows.length > 0 && missing === 0,
      `rows=${rows.length}, missing=${missing}, matchingTargetSnapshot=${matching}`,
    );
  }

  const commissionIds = (commissions || [])
    .map((row) => String(row.id))
    .filter(Boolean);
  let ledgerQuery = supabase
    .from("commission_ledger")
    .select("id, member_id, source_commission_id, lineage_snapshot_id");

  if (commissionIds.length > 0) {
    ledgerQuery = ledgerQuery.or(
      `member_id.eq.${memberId},source_commission_id.in.(${commissionIds.join(",")})`,
    );
  } else {
    ledgerQuery = ledgerQuery.eq("member_id", String(memberId));
  }

  const { data: ledgerRows, error: ledgerError } = await ledgerQuery;

  if (ledgerError) {
    addCheck(
      "Ledger lineage snapshot attachment where applicable",
      false,
      ledgerError.message,
    );
  } else {
    const rows = ledgerRows || [];
    const applicableRows = rows.filter(
      (row) =>
        row.member_id === String(memberId) ||
        (row.source_commission_id &&
          commissionIds.includes(String(row.source_commission_id))),
    );
    const missing = applicableRows.filter(
      (row) => !row.lineage_snapshot_id,
    ).length;
    addCheck(
      "Ledger records receive lineage_snapshot_id where applicable",
      applicableRows.length === 0 || missing === 0,
      `rows=${rows.length}, applicable=${applicableRows.length}, missing=${missing}`,
      false,
    );
  }

  const { data: memberRow, error: memberError } = await supabase
    .from("members")
    .select("id, enrolled_by_agent_id")
    .eq("id", memberId)
    .maybeSingle();

  if (memberError || !memberRow) {
    addCheck(
      "Snapshot immutability check",
      false,
      memberError?.message || "Member not found",
    );
  } else {
    const beforeHash = hashSnapshotPayload(snapshot);

    const nodeIds = Array.isArray(snapshot.lineage_path)
      ? snapshot.lineage_path
          .map((node) => String(node?.userId || ""))
          .filter(Boolean)
      : [];

    let hierarchyEvents = [];
    if (nodeIds.length > 0) {
      const { data: events, error: eventsError } = await supabase
        .from("agent_hierarchy_history")
        .select("id, agent_id, changed_at")
        .in("agent_id", nodeIds)
        .gt("changed_at", snapshot.created_at)
        .order("changed_at", { ascending: false })
        .limit(25);

      if (eventsError) {
        addCheck(
          "Hierarchy reassignment evidence query",
          false,
          eventsError.message,
          false,
        );
      } else {
        hierarchyEvents = events || [];
      }
    }

    const currentLineage = await deriveCurrentLineagePath(
      memberRow.enrolled_by_agent_id,
    );
    const currentLineageUserIds = currentLineage.map((node) => node.userId);
    const snapshotUserIds = Array.isArray(snapshot.lineage_path)
      ? snapshot.lineage_path
          .map((node) => String(node?.userId || ""))
          .filter(Boolean)
      : [];

    const { data: snapshotReload, error: snapshotReloadError } = await supabase
      .from("agent_lineage_snapshots")
      .select("*")
      .eq("id", snapshot.id)
      .single();

    if (snapshotReloadError || !snapshotReload) {
      addCheck(
        "Snapshot immutability check",
        false,
        snapshotReloadError?.message || "Unable to reload snapshot",
      );
    } else {
      const afterHash = hashSnapshotPayload(snapshotReload);
      const lineageDiffersNow =
        JSON.stringify(snapshotUserIds) !==
        JSON.stringify(currentLineageUserIds);
      const hasReassignmentEvidence = hierarchyEvents.length > 0;
      const immutable = beforeHash === afterHash;

      const reassignmentConditionPass = requireReassignmentEvidence
        ? hasReassignmentEvidence && lineageDiffersNow
        : true;

      addCheck(
        "Hierarchy reassignment after enrollment does not mutate snapshot",
        immutable && reassignmentConditionPass,
        `immutable=${immutable}, hierarchyEventsAfterSnapshot=${hierarchyEvents.length}, lineageDiffersNow=${lineageDiffersNow}, requireReassignmentEvidence=${requireReassignmentEvidence}`,
      );
    }
  }

  printAndExit();
}

function printAndExit() {
  const required = checks.filter((check) => check.required);
  const warnings = checks.filter((check) => !check.required);
  const failedRequired = required.filter((check) => !check.pass);
  const failedWarnings = warnings.filter((check) => !check.pass);

  console.log("");
  for (const check of checks) {
    const badge = check.pass ? "PASS" : check.required ? "FAIL" : "WARN";
    console.log(`[${badge}] ${check.name} :: ${check.details}`);
  }

  console.log("");
  console.log(`Required failures: ${failedRequired.length}`);
  console.log(`Warnings: ${failedWarnings.length}`);

  if (failedRequired.length > 0) {
    process.exit(1);
  }

  if (strict && failedWarnings.length > 0) {
    process.exit(1);
  }

  process.exit(0);
}

run().catch((error) => {
  console.error(
    "Lineage snapshot sandbox verification failed:",
    error.message || error,
  );
  process.exit(1);
});
