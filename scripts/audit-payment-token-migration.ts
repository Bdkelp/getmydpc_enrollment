import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const LEGACY_CIPHERTEXT_PATTERN = /^[0-9a-f]+:[0-9a-f]+$/i;
const PROCESSOR_REFERENCE_PATTERN = /^[A-Za-z0-9-]+$/;
const ACTION_BUCKETS = {
  BILLABLE: "1. No outreach — can still bill because original auth exists.",
  MANUALLY_HANDLED: "2. No outreach — already handled manually/outside system.",
  FUTURE_RISK:
    "3. Future risk — not failed yet, but missing usable auth before next cycle.",
  CONTACT:
    "4. Contact member / collect payment — encrypted or unusable credential caused payment to fail or skip and cannot be repaired internally.",
  MISSING_TOKEN:
    "5. Separate issue — missing token row, not encrypted-token issue.",
} as const;

function isUsableReference(value: unknown, minimumLength = 16): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  return (
    normalized.length >= minimumLength &&
    normalized.length <= 128 &&
    PROCESSOR_REFERENCE_PATTERN.test(normalized)
  );
}

function normalizeName(value: unknown): string {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function isCredentialFailure(value: unknown): boolean {
  const reason = String(value || "").toLowerCase();
  return [
    "token decryption failed",
    "legacy encrypted processor reference",
    "missing recurring token",
    "missing auth_guid",
    "missing orig_auth_guid",
    "resolved orig_auth_guid",
  ].some((fragment) => reason.includes(fragment));
}

function classifyCredential(row: Record<string, unknown>): {
  credentialStatus: string;
  resolverSource: string | null;
} {
  if (isUsableReference(row.original_network_trans_id)) {
    return {
      credentialStatus: "readable_processor_reference",
      resolverSource: "payment_tokens.original_network_trans_id",
    };
  }
  if (isUsableReference(row.latest_payment_auth_guid, 8)) {
    return {
      credentialStatus: "readable_processor_reference",
      resolverSource: "payments.epx_auth_guid",
    };
  }

  const token = String(row.bric_token || "").trim();
  if (!token) {
    return { credentialStatus: "missing_token", resolverSource: null };
  }
  if (LEGACY_CIPHERTEXT_PATTERN.test(token)) {
    return {
      credentialStatus: "legacy_encrypted_blocked",
      resolverSource: null,
    };
  }
  if (isUsableReference(token)) {
    return {
      credentialStatus: "readable_processor_reference",
      resolverSource: "payment_tokens.bric_token",
    };
  }
  return {
    credentialStatus: "invalid_processor_reference",
    resolverSource: null,
  };
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(
    "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
  );

  const { rows } = await client.query(`
    SELECT
      pt.id AS token_id,
      pt.member_id,
      TRIM(CONCAT(m.first_name, ' ', m.last_name)) AS member_name,
      m.status AS member_status,
      COALESCE(m.is_active, true) AS member_is_active,
      pt.is_active AS token_is_active,
      pt.is_primary AS token_is_primary,
      pt.payment_method_type,
      pt.bric_token,
      pt.original_network_trans_id,
      s.id AS subscription_id,
      s.amount,
      s.status AS subscription_status,
      s.next_billing_date::date::text AS next_billing_date,
      s.pending_reason,
      payment_auth.latest_payment_auth_guid,
      payment_history.latest_success_date,
      failed_billing.status AS latest_failed_billing_status,
      failed_billing.billing_date::date::text AS latest_failed_billing_date,
      failed_billing.failure_reason AS latest_failed_billing_reason
    FROM payment_tokens pt
    INNER JOIN members m ON m.id = pt.member_id
    LEFT JOIN LATERAL (
      SELECT id, amount, status, next_billing_date, pending_reason
      FROM subscriptions
      WHERE member_id = m.id
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    ) s ON true
    LEFT JOIN LATERAL (
      SELECT p.epx_auth_guid AS latest_payment_auth_guid
      FROM payments p
      WHERE p.member_id = m.id
        AND NULLIF(TRIM(p.epx_auth_guid), '') IS NOT NULL
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT 1
    ) payment_auth ON true
    LEFT JOIN LATERAL (
      SELECT MAX(COALESCE(p.payment_transaction_at, p.created_at))::date::text AS latest_success_date
      FROM payments p
      WHERE p.member_id = m.id
        AND LOWER(COALESCE(p.status, '')) IN ('success', 'succeeded', 'completed')
    ) payment_history ON true
    LEFT JOIN LATERAL (
      SELECT status, billing_date, failure_reason
      FROM recurring_billing_log
      WHERE subscription_id = s.id
        AND LOWER(status) IN ('failed', 'internal_error')
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    ) failed_billing ON true
    WHERE TRIM(pt.bric_token) ~ '^[0-9A-Fa-f]+:[0-9A-Fa-f]+$'
      AND pt.is_active = true
      AND m.status = 'active'
      AND COALESCE(m.is_active, true) = true
      AND s.status = 'active'
      AND COALESCE(s.pending_reason, '') <> 'member_cancelled'
    ORDER BY pt.is_active DESC, member_name, pt.id
  `);

  const activeAccounts = rows.map((row) => {
    const credential = classifyCredential(row);
    const credentialFailureOccurred = isCredentialFailure(
      row.latest_failed_billing_reason,
    );
    const manuallyHandled =
      credential.credentialStatus === "legacy_encrypted_blocked" &&
      credentialFailureOccurred &&
      row.latest_failed_billing_date &&
      row.next_billing_date &&
      new Date(String(row.next_billing_date)).getTime() -
        new Date(String(row.latest_failed_billing_date)).getTime() >
        32 * 24 * 60 * 60 * 1000;

    const finalActionBucket =
      credential.credentialStatus === "missing_token"
        ? ACTION_BUCKETS.MISSING_TOKEN
        : credential.credentialStatus === "readable_processor_reference"
          ? ACTION_BUCKETS.BILLABLE
          : manuallyHandled
            ? ACTION_BUCKETS.MANUALLY_HANDLED
            : credentialFailureOccurred
              ? ACTION_BUCKETS.CONTACT
              : ACTION_BUCKETS.FUTURE_RISK;

    return {
      member_id: row.member_id,
      member_name: normalizeName(row.member_name),
      subscription_id: row.subscription_id,
      amount: row.amount,
      next_billing_date: row.next_billing_date,
      original_network_trans_id_exists: isUsableReference(
        row.original_network_trans_id,
      ),
      auth_guid_exists: isUsableReference(row.latest_payment_auth_guid, 8),
      encrypted_reference_failure_or_skip_occurred: credentialFailureOccurred,
      last_successful_payment_date: row.latest_success_date,
      last_failed_billing_date: row.latest_failed_billing_date,
      last_failed_billing_reason: row.latest_failed_billing_reason || null,
      internally_repairable:
        credential.credentialStatus === "readable_processor_reference",
      member_outreach_required: finalActionBucket === ACTION_BUCKETS.CONTACT,
      final_action_bucket: finalActionBucket,
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "read_only_no_billing",
    summary: {
      activeAccounts: activeAccounts.length,
      noOutreachBillable: activeAccounts.filter(
        (row) => row.final_action_bucket === ACTION_BUCKETS.BILLABLE,
      ).length,
      noOutreachManuallyHandled: activeAccounts.filter(
        (row) => row.final_action_bucket === ACTION_BUCKETS.MANUALLY_HANDLED,
      ).length,
      futureRisk: activeAccounts.filter(
        (row) => row.final_action_bucket === ACTION_BUCKETS.FUTURE_RISK,
      ).length,
      contactMember: activeAccounts.filter(
        (row) => row.final_action_bucket === ACTION_BUCKETS.CONTACT,
      ).length,
      separateMissingTokenIssue: activeAccounts.filter(
        (row) => row.final_action_bucket === ACTION_BUCKETS.MISSING_TOKEN,
      ).length,
    },
    activeAccounts,
  };

  const outputPath = path.join(
    process.cwd(),
    "scripts",
    "output",
    "payment-token-migration-audit-latest.json",
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.error(`Read-only migration audit written to ${outputPath}`);
  await client.query("ROLLBACK");
} catch (error) {
  try {
    await client.query("ROLLBACK");
  } catch {}
  console.error(
    `PAYMENT_TOKEN_MIGRATION_AUDIT_FAILED: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
