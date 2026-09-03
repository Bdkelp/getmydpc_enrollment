import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const routes = read("server/routes/epx-hosted-routes.ts");
const service = read("server/services/member-payment-method-service.ts");
const storage = read("server/storage.ts");
const panel = read("client/src/components/PaymentMethodsPanel.tsx");
const agentDashboard = read("client/src/pages/agent-dashboard.tsx");
const enrollmentDetails = read("client/src/pages/enrollment-details.tsx");
const manualTransactions = read(
  "client/src/components/admin/ManualEPXTransactionCard.tsx",
);
const migration = read(
  "scripts/sql/2026-09-03_member_payment_method_default.sql",
);

assert.match(routes, /paymentMetadata\.paymentMethodManagement/);
assert.match(routes, /awaitingVerifiedCallback:\s*true/);
assert.match(routes, /activateHostedPaymentMethod\(\{/);
assert.match(routes, /isCredentialOnlyPaymentMethodSession \? "CCE0" : "CCE1"/);
assert.match(routes, /action === "pay_now" \? Number\(subscription\.amount\) : 0/);
assert.match(
  routes,
  /existingPaymentMetadata\?\.paymentMethodManagement[\s\S]*!isManagedPaymentMethodSession/,
  "browser completion must not block managed verified callback activation",
);
assert.match(
  routes,
  /paymentMethodManagementContext\.action !== "pay_now"[\s\S]*activated: true/,
  "credential-only callbacks must exit before normal purchase processing",
);

assert.match(service, /member\.enrolledByAgentId === actor\.id/);
assert.doesNotMatch(service, /getCommissionByUserId/);
assert.match(service, /payment_method_default_changed/);
assert.match(service, /payment_method_removed/);
assert.match(service, /payment_method_activated/);
assert.match(service, /switchToManualBilling/);
assert.match(service, /billing_mode = 'manual_external'/);
assert.match(service, /change_details->>'paymentId' = \$2/);
assert.match(
  service,
  /metadata->'paymentMethodManagement'[\s\S]*\|\| \$2::jsonb/,
  "activation must preserve trusted intent metadata for duplicate callbacks",
);
assert.match(service, /token\.is_primary && input\.switchToManualBilling/);
assert.match(service, /input\.action === "pay_now"/);
assert.match(service, /state IN \('declined', 'unknown'\)/);
assert.match(service, /cycle_date = \$4::date/);
assert.match(service, /next_billing_date = \$3::date/);
assert.match(service, /billing_mode = 'automatic'/);
assert.match(service, /CASE[\s\S]*LEFT\(bric_token, 4\)[\s\S]*RIGHT\(bric_token, 4\)/);
assert.doesNotMatch(
  service.slice(
    service.indexOf("export async function listMemberPaymentMethods"),
    service.indexOf("async function insertAudit"),
  ),
  /^\s*bric_token\s*(?:,|AS\b)/m,
  "the list API must not expose the full recurring credential",
);

assert.match(storage, /AND pt\.is_active = true\s+AND pt\.is_primary = true/);
assert.match(
  migration,
  /CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_tokens_member_active_primary[\s\S]*WHERE member_id IS NOT NULL[\s\S]*is_active = true[\s\S]*is_primary = true/,
);
assert.match(panel, /Pay Now & Use for Recurring/);
assert.match(panel, /Make Default/);
assert.match(panel, /Switch to Manual & Remove/);
assert.match(panel, /Auth GUID:/);
assert.match(panel, /BRIC:/);
assert.match(panel, /Last used:/);
assert.doesNotMatch(panel, /const activeMethods =/);
assert.match(
  routes,
  /if \(paymentMethodManagementContext\)[\s\S]*Unable to safely record the payment method session before checkout/,
);
assert.match(agentDashboard, /<PaymentMethodsPanel/);
assert.match(enrollmentDetails, /<PaymentMethodsPanel/);
assert.match(manualTransactions, /<PaymentMethodsPanel/);

console.log("Member payment methods contract tests passed");