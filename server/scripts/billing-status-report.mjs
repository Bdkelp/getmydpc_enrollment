#!/usr/bin/env node
/**
 * Read-only report: memberships with no payment on record, or whose most
 * recent billing attempt failed — with the failure reason/EPX response.
 *
 * Makes NO database writes. Safe to run any time.
 *
 * Scope: active, pending, and suspended member subscriptions (individual +
 * group-billed). For each subscription, looks at the latest recurring_billing_log
 * entry and the latest payments row to classify current billing health.
 *
 * Usage:
 *   node server/scripts/billing-status-report.mjs
 *   node server/scripts/billing-status-report.mjs --json   # also dump full JSON to scripts/output/
 */

import { Pool } from "pg";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_DIR = path.resolve(__dirname, "..", "..", "scripts", "output");

const args = new Set(process.argv.slice(2));
const DUMP_JSON = args.has("--json");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 3,
});

const QUERY = `
WITH member_ctx AS (
  SELECT
    s.id AS subscription_id,
    s.member_id,
    s.status AS sub_status,
    s.next_billing_date,
    s.amount,
    m.first_name,
    m.last_name,
    m.email,
    m.status AS member_status,
    m.is_active,
    CASE
      WHEN LOWER(COALESCE(NULLIF(group_ctx.payor_type, ''), NULLIF(group_ctx.group_payor_type, ''), '')) = 'full'
        THEN 'group'
      ELSE 'member'
    END AS payer_type,
    g.name AS group_name
  FROM subscriptions s
  INNER JOIN members m ON m.id = s.member_id
  LEFT JOIN LATERAL (
    SELECT gm.payor_type, g.payor_type AS group_payor_type, g.id, g.name
    FROM group_members gm
    INNER JOIN groups g ON g.id = gm.group_id
    WHERE gm.member_id = s.member_id
      AND COALESCE(gm.status, '') <> 'terminated'
    ORDER BY
      CASE
        WHEN LOWER(COALESCE(NULLIF(gm.payor_type, ''), NULLIF(g.payor_type, ''), '')) = 'full' THEN 0
        ELSE 1
      END,
      gm.updated_at DESC,
      gm.id DESC
    LIMIT 1
  ) group_ctx ON true
  LEFT JOIN groups g ON g.id = group_ctx.id
  WHERE s.status IN ('active', 'pending', 'suspended')
    AND s.member_id IS NOT NULL
),
latest_log AS (
  SELECT DISTINCT ON (rbl.subscription_id)
    rbl.subscription_id,
    rbl.status,
    rbl.failure_reason,
    rbl.epx_response_code,
    rbl.epx_response_message,
    rbl.billing_date,
    rbl.attempt_number,
    rbl.next_retry_date,
    rbl.created_at
  FROM recurring_billing_log rbl
  ORDER BY rbl.subscription_id, rbl.created_at DESC, rbl.id DESC
),
latest_payment AS (
  SELECT DISTINCT ON (p.subscription_id)
    p.subscription_id,
    p.status,
    p.created_at,
    p.amount
  FROM payments p
  WHERE p.subscription_id IS NOT NULL
  ORDER BY p.subscription_id, p.created_at DESC, p.id DESC
)
SELECT
  mc.*,
  ll.status AS log_status,
  ll.failure_reason,
  ll.epx_response_code,
  ll.epx_response_message,
  ll.billing_date AS log_billing_date,
  ll.next_retry_date,
  ll.attempt_number,
  lp.status AS payment_status,
  lp.created_at AS payment_created_at
FROM member_ctx mc
LEFT JOIN latest_log ll ON ll.subscription_id = mc.subscription_id
LEFT JOIN latest_payment lp ON lp.subscription_id = mc.subscription_id
ORDER BY mc.payer_type ASC, mc.next_billing_date ASC NULLS LAST, mc.subscription_id ASC
`;

function classify(row) {
  const hasSuccessfulPayment =
    row.payment_status &&
    ["succeeded", "success", "paid"].includes(
      String(row.payment_status).toLowerCase(),
    );
  const logStatus = row.log_status
    ? String(row.log_status).toLowerCase()
    : null;

  if (logStatus === "failed" || logStatus === "declined") {
    return "FAILED";
  }
  if (!row.log_status && !hasSuccessfulPayment) {
    return "NO_PAYMENT_ON_RECORD";
  }
  if (
    logStatus === "success" ||
    logStatus === "ach_test_success" ||
    hasSuccessfulPayment
  ) {
    return "OK";
  }
  if (logStatus === "pending") {
    return "PENDING";
  }
  return "OTHER";
}

function reasonFor(row) {
  const parts = [];
  if (row.failure_reason) parts.push(row.failure_reason);
  if (row.epx_response_code || row.epx_response_message) {
    parts.push(
      `EPX ${row.epx_response_code || "?"}: ${row.epx_response_message || "no message"}`,
    );
  }
  if (!parts.length && !row.log_status) {
    parts.push(
      row.payer_type === "group"
        ? "Group-billed — payments are processed manually outside the scheduler"
        : "No recurring_billing_log or payments entry found for this subscription",
    );
  }
  return parts.join(" | ") || "(no reason recorded)";
}

async function main() {
  const nowIso = new Date().toISOString();
  const result = await pool.query(QUERY);
  const rows = result.rows || [];

  const classified = rows.map((row) => ({
    ...row,
    classification: classify(row),
    reason: reasonFor(row),
  }));

  const problemRows = classified.filter(
    (r) =>
      r.classification === "FAILED" ||
      r.classification === "NO_PAYMENT_ON_RECORD",
  );

  const summary = classified.reduce(
    (acc, r) => {
      acc[r.classification] = (acc[r.classification] || 0) + 1;
      return acc;
    },
    { FAILED: 0, NO_PAYMENT_ON_RECORD: 0, OK: 0, PENDING: 0, OTHER: 0 },
  );

  console.log(`\nBilling status report — generated ${nowIso}`);
  console.log(
    `Total active/pending/suspended subscriptions checked: ${classified.length}`,
  );
  console.log(
    `  OK: ${summary.OK}  FAILED: ${summary.FAILED}  NO_PAYMENT_ON_RECORD: ${summary.NO_PAYMENT_ON_RECORD}  PENDING: ${summary.PENDING}  OTHER: ${summary.OTHER}\n`,
  );

  if (problemRows.length === 0) {
    console.log("No memberships found with a missing or failed payment.");
  } else {
    console.log("=".repeat(100));
    for (const r of problemRows) {
      const name =
        `${r.first_name || ""} ${r.last_name || ""}`.trim() || "(no name)";
      console.log(
        `[${r.classification}] Sub #${r.subscription_id} — Member #${r.member_id} ${name} <${r.email || "no email"}>`,
      );
      console.log(
        `  payer_type=${r.payer_type}${r.group_name ? ` (${r.group_name})` : ""}  sub_status=${r.sub_status}  member_status=${r.member_status}  amount=${r.amount}  next_billing_date=${r.next_billing_date}`,
      );
      if (r.log_status) {
        console.log(
          `  last attempt: status=${r.log_status} attempt#${r.attempt_number} billing_date=${r.log_billing_date} next_retry=${r.next_retry_date || "n/a"}`,
        );
      }
      console.log(`  reason: ${r.reason}`);
      console.log("-".repeat(100));
    }
  }

  if (DUMP_JSON) {
    if (!fs.existsSync(OUTPUT_DIR))
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const outFile = path.join(
      OUTPUT_DIR,
      `billing-status-report-${nowIso.replace(/[:.]/g, "-")}.json`,
    );
    fs.writeFileSync(
      outFile,
      JSON.stringify(
        { generatedAt: nowIso, summary, problemRows, allRows: classified },
        null,
        2,
      ),
    );
    console.log(`\nFull JSON report written to: ${outFile}`);
  }

  await pool.end();
}

main().catch(async (error) => {
  console.error("[billing-status-report] failed:", error);
  await pool.end();
  process.exit(1);
});
