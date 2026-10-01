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
assert.doesNotMatch(routes, /CCE0/);
assert.doesNotMatch(
  routes,
  /action === "pay_now" \? Number\(subscription\.amount\) : 0/,
);
assert.match(routes, /memberId && !isCredentialOnlyPaymentMethodSession/);
assert.match(routes, /paymentMethodType: requestedPaymentMethodType/);
assert.match(routes, /transactionPurpose = "payment_method_verification"/);
assert.match(routes, /excludeFromMembershipPayment = true/);
assert.match(routes, /manualReversalRequired = true/);
assert.match(routes, /"verification_succeeded"/);
assert.match(
  routes,
  /const isCredentialVerificationCompletion = Boolean\([\s\S]*paymentStatus: isCredentialVerificationCompletion[\s\S]*\? "verification_succeeded"[\s\S]*: "succeeded"/,
  "browser completion must never classify a credential verification as membership revenue",
);
const managedCheckoutRoute = routes.slice(
  routes.indexOf('"/api/members/:memberId/payment-methods/checkout"'),
  routes.indexOf(
    '"/api/members/:memberId/payment-methods/:paymentTokenId/default"',
  ),
);
assert.match(managedCheckoutRoute, /ACH_CREDENTIAL_VERIFICATION_UNVERIFIED/);
assert.match(
  managedCheckoutRoute,
  /requestedPaymentMethodType === "ACH" && action !== "pay_now"/,
);
assert.ok(
  managedCheckoutRoute.indexOf("ACH_CREDENTIAL_VERIFICATION_UNVERIFIED") <
    managedCheckoutRoute.indexOf("storage.getMember"),
  "unsupported ACH credential setup must return before member, payment, or hosted-session work",
);
assert.ok(
  managedCheckoutRoute.indexOf("ACH_CREDENTIAL_VERIFICATION_UNVERIFIED") <
    managedCheckoutRoute.indexOf("createHostedPaymentSessionHandler"),
  "unsupported ACH credential setup must not create a payment or checkout session",
);
assert.match(
  managedCheckoutRoute,
  /amount: action === "pay_now" \? Number\(subscription\.amount\) : 1/,
);
assert.doesNotMatch(managedCheckoutRoute, /amount:[^\n]*:\s*0/);
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
assert.match(service, /"verification_succeeded"/);
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

const managedCheckout = read("server/routes/member-payment-method-checkout.ts");
const serverIndex = read("server/index.ts");
assert.ok(
  serverIndex.indexOf('app.use("/", memberPaymentMethodCheckoutRoutes)') >= 0 &&
    serverIndex.indexOf('app.use("/", memberPaymentMethodCheckoutRoutes)') <
      serverIndex.indexOf('app.use("/", epxHostedRoutes)'),
  "managed payment-method checkout must stay mounted before the enrollment EPX router",
);
assert.match(
  managedCheckout,
  /status = ANY\(\$2::text\[\]\)[\s\S]*getManageableSubscriptionStatuses\(action\)/,
  "Add/Replace must not 404 for pending_payment or suspended members",
);
assert.doesNotMatch(managedCheckout, /status = 'active'\s*\n\s*ORDER BY id DESC/);
assert.match(
  service,
  /getManageableSubscriptionStatuses\(input\.action\)\.includes/,
  "activation must accept the same subscription statuses as checkout",
);
assert.match(
  service,
  /return action === "pay_now" \? \["active"\] : credentialOnlySubscriptionStatuses;/,
  "Pay Now must stay limited to active subscriptions",
);
const credentialOnlyStatuses = service.slice(
  service.indexOf("const credentialOnlySubscriptionStatuses"),
  service.indexOf("export function getManageableSubscriptionStatuses"),
);
for (const status of ["active", "pending_payment", "suspended"]) {
  assert.match(credentialOnlyStatuses, new RegExp(`"${status}"`));
}
assert.doesNotMatch(credentialOnlyStatuses, /cancelled/);

// Super-admin BRIC restoration from North Tran ID.
const restoreRoute = read("server/routes/payment-credential-restore.ts");
const restoreService = service.slice(
  service.indexOf("export async function restorePaymentCredentialFromNorthTranId"),
);
assert.ok(
  restoreRoute.indexOf('hasAtLeastRole(req.user.role, "super_admin")') >= 0 &&
    restoreRoute.indexOf('hasAtLeastRole(req.user.role, "super_admin")') <
      restoreRoute.indexOf("restorePaymentCredentialFromNorthTranId({"),
  "credential restore must be super-admin only and checked before any work",
);
assert.match(serverIndex, /app\.use\("\/", paymentCredentialRestoreRoutes\)/);
assert.match(restoreService, /resolveCanonicalPaymentCredential\(input\.northTranId\)/);
assert.match(
  restoreService,
  /is_active = true AND is_primary = true\s+FOR UPDATE/,
  "only the active default token can be restored",
);
assert.match(restoreService, /credential_already_usable/);
assert.match(restoreService, /billing_reference_already_present/);
assert.match(restoreService, /member_id IS DISTINCT FROM \$2/);
assert.match(restoreService, /cross_member_duplicate/);
assert.match(
  restoreService,
  /UPDATE payment_tokens SET bric_token = \$3\s+WHERE id = \$1 AND member_id = \$2 AND bric_token IS NOT DISTINCT FROM \$4/,
  "restore must only replace the bric_token it inspected",
);
assert.match(restoreService, /changeType: "payment_credential_restored"/);
assert.match(restoreService, /chargeSubmitted: false/);
assert.doesNotMatch(
  restoreService.slice(0, restoreService.indexOf("insertAudit(client")),
  /transaction_id|processor_reference|next_billing_date|recurring_billing_cycles|UPDATE subscriptions|UPDATE payments|submitServerPost|original_network_trans_id =/,
  "restore must not touch transaction IDs, processor references, dates, cycles, or submit a charge",
);
assert.doesNotMatch(restoreService, /restoredReference: reference\b/, "audit must store a masked reference");
assert.match(panel, /data\?\.canRestoreCredential && method\.is_active && method\.is_primary && method\.credential_usable === false/);
assert.doesNotMatch(panel, /apiClient\.post\([^)]*restore-credential/, "apiClient.post logs payloads; credentials must not be logged");

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
assert.match(panel, /Card Add\/Replace submits a \$1\.00 verification charge/);
assert.match(panel, /reverse that charge in the North portal/);
assert.match(
  panel,
  /amount=\{checkoutAction === "pay_now" \? effectiveMonthlyAmount : 1\}/,
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
