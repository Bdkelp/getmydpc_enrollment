import assert from "node:assert/strict";

import { EPXHostedCheckoutService } from "../server/services/epx-hosted-checkout-service";

const service = new EPXHostedCheckoutService({
  publicKey: "test-public-key",
  terminalProfileId: "test-terminal",
  environment: "sandbox",
});

const sharedCredential = "hosted-transaction-credential";
const callbackLogs: string[] = [];
const originalConsoleLog = console.log;
console.log = (...args: unknown[]) => {
  callbackLogs.push(JSON.stringify(args));
};

let result: ReturnType<EPXHostedCheckoutService["processCallback"]>;
let referencesOnly: ReturnType<EPXHostedCheckoutService["processCallback"]>;
try {
  result = service.processCallback({
    status: "approved",
    AUTH_GUID: sharedCredential,
    BRIC: sharedCredential,
    TransactionId: sharedCredential,
    transactionId: "processor-transaction-reference",
    orderNumber: "order-reference",
    invoiceNumber: "invoice-reference",
    AUTH_CODE: "approval-code",
    AUTH_RESP: "00",
    AUTH_TRAN_IDENT: "authorization-transaction-identifier",
  });

  referencesOnly = service.processCallback({
    status: "approved",
    orderNumber: "order-only",
    invoiceNumber: "invoice-only",
  });
} finally {
  console.log = originalConsoleLog;
}

assert.equal(result.isApproved, true);
assert.equal(result.authGuid, sharedCredential);
assert.equal(result.bricToken, sharedCredential);
assert.equal(result.transactionId, "processor-transaction-reference");
assert.equal(result.authCode, "approval-code");
assert.notEqual(result.authCode, "00");
assert.notEqual(result.authCode, "authorization-transaction-identifier");
assert.equal(
  callbackLogs.some((entry) => entry.includes(sharedCredential)),
  false,
);
assert.equal(
  callbackLogs.some((entry) => entry.includes('"hasAuthGuid":true')),
  true,
);
assert.equal(
  callbackLogs.some((entry) => entry.includes('"hasHostedTransactionId":true')),
  true,
);

assert.equal(referencesOnly.transactionId, undefined);
assert.equal(referencesOnly.authGuid, undefined);
assert.equal(referencesOnly.bricToken, undefined);

console.log("Hosted Checkout credential semantics tests passed");
