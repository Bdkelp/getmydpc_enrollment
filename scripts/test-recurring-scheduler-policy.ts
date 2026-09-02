import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  filterRecurringBillingSubscriptions,
  getNextRecurringBillingAttemptNumber,
  isRecurringBillingFailureRetryable,
  RECURRING_BILLING_ATTEMPT_STATUSES,
  RECURRING_BILLING_IDEMPOTENCY_STATUSES,
} from "../shared/recurringBillingPolicy";

assert(!RECURRING_BILLING_IDEMPOTENCY_STATUSES.includes("failed" as never));
assert(RECURRING_BILLING_ATTEMPT_STATUSES.includes("failed"));
assert.equal(getNextRecurringBillingAttemptNumber(0), 1);
assert.equal(getNextRecurringBillingAttemptNumber(1), 2);
assert.equal(getNextRecurringBillingAttemptNumber(2), 3);
assert.equal(isRecurringBillingFailureRetryable({ responseCode: "51" }), true);
assert.equal(isRecurringBillingFailureRetryable({ responseCode: "41" }), false);
assert.equal(isRecurringBillingFailureRetryable({ responseCode: "43" }), false);
assert.equal(
  isRecurringBillingFailureRetryable({
    failureReason:
      "Controlled retry pending Super Admin review: network/processor no-response",
  }),
  false,
);
assert.equal(
  isRecurringBillingFailureRetryable({
    failureReason:
      "Token decryption failed and no stored ORIG_AUTH_GUID was available",
  }),
  false,
);
assert.equal(
  isRecurringBillingFailureRetryable({
    failureReason: "EPX Server Post request failed: fetch failed",
  }),
  true,
);

const subscriptions = [
  { subscriptionId: 15 },
  { subscriptionId: 16 },
  { subscriptionId: 24 },
];
assert.deepEqual(
  filterRecurringBillingSubscriptions(subscriptions),
  subscriptions,
);
assert.deepEqual(filterRecurringBillingSubscriptions(subscriptions, [16, 15]), [
  { subscriptionId: 15 },
  { subscriptionId: 16 },
]);
assert.deepEqual(filterRecurringBillingSubscriptions(subscriptions, []), []);

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const storageSource = fs.readFileSync(
  path.join(repositoryRoot, "server", "storage.ts"),
  "utf8",
);
const schedulerSource = fs.readFileSync(
  path.join(
    repositoryRoot,
    "server",
    "services",
    "recurring-billing-scheduler.ts",
  ),
  "utf8",
);
const paymentDiagnosticSource = fs.readFileSync(
  path.join(repositoryRoot, "server", "routes", "payment-diagnostic.ts"),
  "utf8",
);
const legacyConverterSource = fs.readFileSync(
  path.join(repositoryRoot, "scripts", "convert-legacy-payment-tokens.ts"),
  "utf8",
);

assert.match(storageSource, /AND m\.status = 'active'/);
assert.match(storageSource, /COALESCE\(m\.is_active, true\) = true/);
assert.match(
  storageSource,
  /FROM recurring_billing_log rbl\s+WHERE rbl\.subscription_id = s\.id\s+AND rbl\.status <> 'dry_run'\s+ORDER BY rbl\.created_at DESC, rbl\.id DESC/,
  "retry gating must inspect the latest real billing outcome and ignore dry-run diagnostics",
);
assert.match(
  storageSource,
  /retry_gate\.status IS DISTINCT FROM 'failed'/,
  "only a latest failed outcome may apply the retry gate",
);
assert.match(
  storageSource,
  /OR s\.id = ANY\(\$6::int\[\]\)/,
  "an explicitly targeted controlled retry may bypass the non-retryable response gate",
);
assert.match(
  storageSource,
  /WHEN COALESCE\(rbl\.failure_reason, ''\) ILIKE ANY\(\$5::text\[\]\) THEN \([\s\S]*original_network_trans_id[\s\S]*p_auth\.epx_auth_guid[\s\S]*bric_token/,
  "a repaired readable processor reference must release an old credential failure",
);
assert.match(
  storageSource,
  /normalizeProcessorReference\(\s*input\.token,\s*"BRIC token",\s*16,\s*64/,
  "new BRIC references must be stored as normalized raw values",
);
assert.match(
  storageSource,
  /normalizeProcessorReference\(paymentData\.epxAuthGuid, "EPX AUTH_GUID"\)/,
  "new payment AUTH_GUID values must use the canonical raw reference policy",
);
assert.doesNotMatch(
  storageSource,
  /const encryptedToken = encryptPaymentToken\(input\.token\)/,
  "new BRIC references must not depend on a deployment encryption key",
);
assert.doesNotMatch(
  storageSource,
  /encryptSensitiveData\(input\.bankAccountNumber\)/,
  "new ACH account writes must remain readable by billing",
);
assert.doesNotMatch(
  storageSource,
  /process\.env\.ENCRYPTION_KEY \|\| crypto\.randomBytes/,
  "payment data must never use an ephemeral encryption key",
);
assert.doesNotMatch(
  storageSource,
  /encryptSensitiveData|decryptSensitiveData|encryptPaymentToken|decryptPaymentToken/,
  "storage must not expose encryption APIs for processor references or ACH accounts",
);
assert.doesNotMatch(
  schedulerSource,
  /\.from\("subscriptions"\)[\s\S]{0,200}cancelled_at:/,
);
assert.match(schedulerSource, /if \(!dryRun && !targetedRun\)/);
assert.match(schedulerSource, /const staleLogs = targetedRun\s+\? \[\]/);
assert.match(
  schedulerSource,
  /Controlled retries must be included in an explicit targeted subscription run/,
  "controlled retries must never widen into an automatic or untargeted run",
);
assert.match(
  paymentDiagnosticSource,
  /confirmedNoExternalCapture !== true[\s\S]*Controlled live retry requires confirmedNoExternalCapture=true/,
  "controlled live retries must attest that EPX/North did not capture the prior no-response attempt",
);
assert.match(
  schedulerSource,
  /Legacy ACH account migration required/,
  "legacy ACH ciphertext must remain explicitly separated from missing readable data",
);
assert.doesNotMatch(
  schedulerSource,
  /decryptSensitiveData|decryptPaymentToken/,
  "billing must consume readable processor references and ACH accounts directly",
);
assert.doesNotMatch(
  paymentDiagnosticSource,
  /member_payment_token|decryptPaymentToken/,
  "automatic repair must not trust members.payment_token or decrypt legacy tokens",
);
assert.match(
  legacyConverterSource,
  /createDecipheriv\(\s*"aes-256-cbc"/,
  "legacy payment decryption must remain isolated to the one-time converter",
);
assert.match(
  legacyConverterSource,
  /--confirm=CONVERT_LEGACY_EPX_REFERENCES/,
  "legacy conversion apply mode must require explicit confirmation",
);
assert.match(
  legacyConverterSource,
  /REPEATABLE READ READ ONLY/,
  "legacy conversion must default to a read-only dry run",
);
assert.doesNotMatch(
  legacyConverterSource,
  /runRecurringBillingCycleOnce|submitServerPostRecurringPayment/,
  "legacy conversion must never invoke billing",
);
assert.match(
  paymentDiagnosticSource,
  /payment_auth_conflict[\s\S]*bric_conflict/,
  "automatic repair must reject cross-member processor-reference conflicts",
);
assert.match(
  paymentDiagnosticSource,
  /mode === "live" && !commissionSchema\.ready[\s\S]*COMMISSION_SCHEMA_NOT_READY/,
  "operator live billing must stop before charging when commission schema is incomplete",
);
assert.match(
  schedulerSource,
  /if \(!dryRun\)[\s\S]*getHistoricalCutoverSchemaStatus\(\)[\s\S]*COMMISSION_SCHEMA_NOT_READY/,
  "automatic live billing must stop before charging when commission schema is incomplete",
);
assert.match(
  storageSource,
  /AS processor_reference_conflict/,
  "billing selection must identify cross-member processor-reference conflicts",
);
for (const previewColumn of [
  "member_id",
  "member_name",
  "source_type",
  "source_transaction_or_invoice",
  "source_amount",
  "subscription_amount",
  "amount_match",
  "payment_status",
  "payment_date",
  "mid_match_or_na",
  "repair_action",
  "auto_repair_allowed",
  "review_reason",
]) {
  assert.match(
    paymentDiagnosticSource,
    new RegExp(`${previewColumn}:`),
    `repair preview must include ${previewColumn}`,
  );
}
assert.match(
  paymentDiagnosticSource,
  /"verified" \| "not_available" \| "failed"/,
  "MID provenance must distinguish verified, unavailable, and failed",
);

const credentialResolverStart = schedulerSource.indexOf(
  "function resolveRecurringCardAuthGuid(",
);
const credentialResolverEnd = schedulerSource.indexOf(
  "async function finalizeScheduledMemberCancellations",
  credentialResolverStart,
);
assert(
  credentialResolverStart >= 0 &&
    credentialResolverEnd > credentialResolverStart,
);
const credentialResolver = schedulerSource.slice(
  credentialResolverStart,
  credentialResolverEnd,
);
assert.match(
  credentialResolver,
  /if \(sub\.processorReferenceConflict\)[\s\S]*Processor reference conflicts across member records/,
  "billing must reject cross-member processor-reference conflicts before resolving credentials",
);
assert.match(credentialResolver, /Missing recurring token for card charge/);
assert.match(
  credentialResolver,
  /Legacy encrypted processor reference requires migration/,
);

const credentialFailureStart = schedulerSource.indexOf(
  'if ("error" in cardAuthGuidResult) {',
);
const credentialFailureEnd = schedulerSource.indexOf(
  "authGuid = cardAuthGuidResult.authGuid;",
  credentialFailureStart,
);
assert(
  credentialFailureStart >= 0 && credentialFailureEnd > credentialFailureStart,
);
const credentialFailureBranch = schedulerSource.slice(
  credentialFailureStart,
  credentialFailureEnd,
);
assert.match(credentialFailureBranch, /status: "internal_error"/);
assert.match(
  credentialFailureBranch,
  /chargeAttemptResult: "failed_auth_guid_resolution"/,
);
assert.doesNotMatch(
  credentialFailureBranch,
  /submitServerPostRecurringPayment/,
  "missing or unreadable credentials must not call North",
);
assert.doesNotMatch(
  credentialFailureBranch,
  /createRecurringFailureAdminNotification/,
  "credential errors must not enter decline/failure alert policy",
);
assert.doesNotMatch(
  credentialFailureBranch,
  /applyRecurringFailureSuspensionPolicy/,
  "credential errors must not trigger suspension",
);
assert(
  !RECURRING_BILLING_ATTEMPT_STATUSES.includes("internal_error" as never),
  "credential errors must not increment the attempt/failure count",
);

const processorDeclineStart = schedulerSource.indexOf(
  "const failureResponseMessage =",
  schedulerSource.indexOf("if (result.success)"),
);
const processorDeclineEnd = schedulerSource.indexOf(
  "} catch (epxError:",
  processorDeclineStart,
);
assert(
  processorDeclineStart >= 0 && processorDeclineEnd > processorDeclineStart,
);
const processorDeclineBranch = schedulerSource.slice(
  processorDeclineStart,
  processorDeclineEnd,
);
assert.match(processorDeclineBranch, /status: "failed"/);
assert.match(processorDeclineBranch, /createRecurringFailureAdminNotification/);
assert.match(processorDeclineBranch, /applyRecurringFailureSuspensionPolicy/);
assert.match(processorDeclineBranch, /chargeAttemptResult: "declined"/);

console.log("Recurring billing scheduler policy tests passed.");
