import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const APPLY_CONFIRMATION = "--confirm=CONVERT_LEGACY_EPX_REFERENCES";
const LEGACY_PATTERN = /^[0-9a-f]+:[0-9a-f]+$/i;
const REFERENCE_PATTERN = /^[A-Za-z0-9-]{16,64}$/;

if (APPLY && !process.argv.includes(APPLY_CONFIRMATION)) {
  throw new Error(`Apply mode requires ${APPLY_CONFIRMATION}`);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const keyHex =
  process.env.LEGACY_PAYMENT_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || "";
const legacyKey = /^[0-9a-f]{64}$/i.test(keyHex)
  ? Buffer.from(keyHex, "hex")
  : null;

function decryptLegacyReference(value: string): string | null {
  if (!legacyKey || !LEGACY_PATTERN.test(value)) return null;
  try {
    const [ivHex, ciphertextHex] = value.split(":");
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      legacyKey,
      Buffer.from(ivHex, "hex"),
    );
    return `${decipher.update(ciphertextHex, "hex", "utf8")}${decipher.final("utf8")}`.trim();
  } catch {
    return null;
  }
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(
    APPLY
      ? "BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE"
      : "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
  );

  const { rows } = await client.query(`
    SELECT
      pt.id AS token_id,
      pt.member_id,
      TRIM(CONCAT(COALESCE(m.first_name, ''), ' ', COALESCE(m.last_name, ''))) AS member_name,
      pt.bric_token,
      pt.is_active AS token_is_active,
      m.status AS member_status,
      COALESCE(m.is_active, true) AS member_is_active,
      EXISTS (
        SELECT 1 FROM subscriptions s
        WHERE s.member_id = m.id
          AND s.status = 'active'
          AND COALESCE(s.pending_reason, '') <> 'member_cancelled'
      ) AS has_active_subscription
    FROM payment_tokens pt
    INNER JOIN members m ON m.id = pt.member_id
    WHERE TRIM(pt.bric_token) ~ '^[0-9A-Fa-f]+:[0-9A-Fa-f]+$'
    ORDER BY pt.is_active DESC, member_name, pt.id
  `);

  const reportRows: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const activeAccount =
      row.token_is_active === true &&
      row.member_status === "active" &&
      row.member_is_active === true &&
      row.has_active_subscription === true;
    const canonicalReference = decryptLegacyReference(row.bric_token);
    const decryptable = canonicalReference !== null;
    const canonicalFormatValid =
      canonicalReference !== null && REFERENCE_PATTERN.test(canonicalReference);

    let duplicateConflict = false;
    if (canonicalFormatValid) {
      const duplicateResult = await client.query(
        `SELECT EXISTS (
           SELECT 1 FROM payment_tokens
           WHERE id <> $1 AND TRIM(bric_token) = $2
         ) AS conflict`,
        [row.token_id, canonicalReference],
      );
      duplicateConflict = duplicateResult.rows[0]?.conflict === true;
    }

    const convertible =
      activeAccount &&
      decryptable &&
      canonicalFormatValid &&
      !duplicateConflict;
    let action = convertible ? "would_convert" : "review_only";
    let schedulerReadableAfterConversion = convertible;

    if (APPLY && convertible) {
      const updateResult = await client.query(
        `UPDATE payment_tokens pt
         SET bric_token = $2,
             last_used_at = NOW()
         WHERE pt.id = $1
           AND pt.bric_token = $3
           AND pt.is_active = true
           AND EXISTS (
             SELECT 1 FROM members m
             WHERE m.id = pt.member_id
               AND m.status = 'active'
               AND COALESCE(m.is_active, true) = true
           )
           AND EXISTS (
             SELECT 1 FROM subscriptions s
             WHERE s.member_id = pt.member_id
               AND s.status = 'active'
               AND COALESCE(s.pending_reason, '') <> 'member_cancelled'
           )
         RETURNING bric_token`,
        [row.token_id, canonicalReference, row.bric_token],
      );
      const persistedReference = updateResult.rows[0]?.bric_token;
      schedulerReadableAfterConversion =
        typeof persistedReference === "string" &&
        REFERENCE_PATTERN.test(persistedReference);
      if (!schedulerReadableAfterConversion) {
        throw new Error(
          `Post-conversion verification failed for token ${row.token_id}`,
        );
      }
      action = "converted_and_verified";
    }

    const reviewReasons = [
      !activeAccount ? "inactive_cancelled_or_no_active_subscription" : null,
      !legacyKey ? "legacy_payment_encryption_key_not_configured" : null,
      legacyKey && !decryptable
        ? "legacy_value_not_decryptable_with_configured_key"
        : null,
      decryptable && !canonicalFormatValid
        ? "decrypted_value_is_not_a_canonical_epx_reference"
        : null,
      duplicateConflict ? "canonical_reference_duplicate_conflict" : null,
    ].filter(Boolean);

    reportRows.push({
      tokenId: row.token_id,
      memberId: row.member_id,
      memberName: row.member_name,
      tokenIsActive: row.token_is_active,
      memberStatus: row.member_status,
      memberIsActive: row.member_is_active,
      hasActiveSubscription: row.has_active_subscription,
      legacyValueDecryptable: decryptable,
      canonicalFormatValid,
      duplicateConflict,
      action,
      schedulerReadableAfterConversion,
      reviewReason: reviewReasons.length > 0 ? reviewReasons.join("; ") : null,
    });
  }

  if (APPLY) await client.query("COMMIT");
  else await client.query("ROLLBACK");

  const report = {
    generatedAt: new Date().toISOString(),
    mode: APPLY ? "apply" : "dry_run_no_writes_no_billing",
    keyConfigured: legacyKey !== null,
    summary: {
      legacyRows: reportRows.length,
      activeAffectedRows: reportRows.filter(
        (row) =>
          row.tokenIsActive &&
          row.memberStatus === "active" &&
          row.memberIsActive,
      ).length,
      convertibleRows: reportRows.filter(
        (row) => row.action === "would_convert",
      ).length,
      convertedRows: reportRows.filter(
        (row) => row.action === "converted_and_verified",
      ).length,
      reviewOnlyRows: reportRows.filter((row) => row.action === "review_only")
        .length,
    },
    rows: reportRows,
  };

  const outputPath = path.join(
    process.cwd(),
    "scripts",
    "output",
    "legacy-payment-token-conversion-latest.json",
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.error(
    `Legacy payment-token conversion report written to ${outputPath}`,
  );
} catch (error) {
  try {
    await client.query("ROLLBACK");
  } catch {}
  console.error(
    `LEGACY_PAYMENT_TOKEN_CONVERSION_FAILED: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
