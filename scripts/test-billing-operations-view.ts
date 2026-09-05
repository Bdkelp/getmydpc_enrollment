import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const routes = await readFile(
  new URL("../server/routes/financial-exceptions.ts", import.meta.url),
  "utf8",
);
const page = await readFile(
  new URL("../client/src/pages/admin-financial-operations.tsx", import.meta.url),
  "utf8",
);

const routeStart = routes.indexOf("'/api/admin/billing-operations'");
const nextRoute = routes.indexOf("router.get('/api/admin/financial-exceptions'", routeStart);
assert.ok(routeStart >= 0, "billing operations endpoint must exist");
assert.ok(nextRoute > routeStart, "billing operations endpoint must be isolated before financial exception routes");

const billingRoute = routes.slice(routeStart, nextRoute);
assert.match(billingRoute, /authenticateToken/);
assert.match(billingRoute, /requireAdmin\(req, res\)/);
assert.match(billingRoute, /recurring_billing_configuration/);
assert.match(billingRoute, /recurring_billing_runs/);
assert.match(billingRoute, /recurring_billing_cycles/);
assert.match(billingRoute, /credential_status/);
assert.match(billingRoute, /This endpoint is read-only/);
assert.doesNotMatch(billingRoute, /submitServerPostRecurringPayment/);
assert.doesNotMatch(billingRoute, /runDurableRecurringBilling/);
assert.doesNotMatch(billingRoute, /mark_recurring_cycle_submitting/);
assert.doesNotMatch(billingRoute, /finalize_recurring_cycle_success/);
assert.doesNotMatch(billingRoute, /INSERT\s+INTO\s+public\.payments/i);
assert.doesNotMatch(billingRoute, /UPDATE\s+public\.recurring_billing_cycles/i);

assert.match(page, /Billing command center/);
assert.match(page, /\/api\/admin\/billing-operations/);
assert.match(page, /Due subscription snapshot/);
assert.match(page, /Billing cycles requiring attention/);
assert.match(page, /Recent scheduled runs/);
assert.match(page, /does not submit or retry processor charges/);
assert.doesNotMatch(page, /operator-workflow/);
assert.doesNotMatch(page, /run-once/);

console.log("Billing operations view safety contract passed.");
