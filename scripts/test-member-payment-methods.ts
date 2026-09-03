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
const hostedPayment = read("client/src/components/EPXHostedPayment.tsx");
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
assert.match(
  routes,
  /action === "pay_now" \? Number\(subscription\.amount\) : 0/,
);
assert.match(routes, /memberId && !isCredentialOnlyPaymentMethodSession/);
assert.match(routes, /paymentMethodType: requestedPaymentMethodType/);
const managedCheckoutRoute = routes.slice(
  routes.indexOf('"/api/members/:memberId/payment-methods/checkout"'),
  routes.indexOf(
    '"/api/members/:memberId/payment-methods/:paymentTokenId/default"',
  ),
);
assert.match(managedCheckoutRoute, /ACH_ZERO_DOLLAR_SETUP_UNVERIFIED/);
assert.match(
  managedCheckoutRoute,
  /requestedPaymentMethodType === "ACH" && action !== "pay_now"/,
);
assert.ok(
  managedCheckoutRoute.indexOf("ACH_ZERO_DOLLAR_SETUP_UNVERIFIED") <
    managedCheckoutRoute.indexOf("storage.getMember"),
  "unsupported zero-dollar ACH must return before member, payment, or hosted-session work",
);
assert.ok(
  managedCheckoutRoute.indexOf("ACH_ZERO_DOLLAR_SETUP_UNVERIFIED") <
    managedCheckoutRoute.indexOf("createHostedPaymentSessionHandler"),
  "unsupported zero-dollar ACH must not create a payment or checkout session",
);
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
assert.match(
  service.slice(
    service.indexOf("export async function listMemberPaymentMethods"),
    service.indexOf("async function insertAudit"),
  ),
  /bric_token AS bric_reference/,
  "authorized payment-method operators must receive the BRIC reference",
);
assert.match(service, /paymentMethodType: "CreditCard" \| "ACH"/);
assert.match(service, /bank_account_last_four, bank_account_type/);
assert.doesNotMatch(
  service.slice(
    service.indexOf("export async function activateHostedPaymentMethod"),
  ),
  /bank_account_number|bank_routing_number/,
  "managed ACH activation must not persist raw account or routing numbers",
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
assert.match(panel, /paymentMethodType=\{checkoutMethodType\}/);
assert.match(panel, /Bank Account/);
assert.match(panel, /disabled=\{checkoutAction !== "pay_now"\}/);
assert.match(panel, /Zero-dollar ACH Add\/Replace is not yet verified/);
assert.match(
  panel,
  /existing payment method and billing mode will remain unchanged/,
);
assert.match(hostedPayment, /paymentMethodType,/);
assert.match(hostedPayment, /Payment form unavailable/);
assert.match(hostedPayment, /initializationFailed \|\| !sessionData/);
assert.doesNotMatch(panel, /const activeMethods =/);
assert.match(
  routes,
  /if \(paymentMethodManagementContext\)[\s\S]*Unable to safely record the payment method session before checkout/,
);
assert.match(agentDashboard, /<PaymentMethodsPanel/);
assert.match(enrollmentDetails, /<PaymentMethodsPanel/);
assert.match(manualTransactions, /<PaymentMethodsPanel/);

console.log("Member payment methods contract tests passed");
