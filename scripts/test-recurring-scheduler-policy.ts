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

assert.match(storageSource, /AND m\.status = 'active'/);
assert.match(storageSource, /COALESCE\(m\.is_active, true\) = true/);
assert.doesNotMatch(
  schedulerSource,
  /\.from\("subscriptions"\)[\s\S]{0,200}cancelled_at:/,
);
assert.match(schedulerSource, /if \(!dryRun && !targetedRun\)/);
assert.match(schedulerSource, /const staleLogs = targetedRun\s+\? \[\]/);

console.log("Recurring billing scheduler policy tests passed.");
