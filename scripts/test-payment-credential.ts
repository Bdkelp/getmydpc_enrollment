import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PAYMENT_CREDENTIAL_ERROR,
  redactResolvedPaymentCredential,
  requireCanonicalPaymentCredential,
  resolveCanonicalPaymentCredential,
} from "../server/services/payment-credential";

const directCredential = "north-auth-guid-123456";
assert.deepEqual(resolveCanonicalPaymentCredential(directCredential), {
  credential: directCredential,
  error: null,
});
assert.equal(
  requireCanonicalPaymentCredential(directCredential),
  directCredential,
);

const legacyCiphertext = `${"a".repeat(32)}:${"b".repeat(64)}`;
assert.deepEqual(resolveCanonicalPaymentCredential(legacyCiphertext), {
  credential: null,
  error: PAYMENT_CREDENTIAL_ERROR.legacyEncrypted,
});
assert.throws(
  () => requireCanonicalPaymentCredential(legacyCiphertext),
  new RegExp(PAYMENT_CREDENTIAL_ERROR.legacyEncrypted),
);
assert.deepEqual(resolveCanonicalPaymentCredential(""), {
  credential: null,
  error: PAYMENT_CREDENTIAL_ERROR.missing,
});

const redacted = redactResolvedPaymentCredential({
  tokenId: 7,
  resolvedAuthGuid: directCredential,
  resolvedAuthGuidMasked: "nort****3456",
});
assert.deepEqual(redacted, {
  tokenId: 7,
  resolvedAuthGuidMasked: "nort****3456",
});
assert.equal("resolvedAuthGuid" in redacted, false);

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const readSource = (...segments: string[]) =>
  fs.readFileSync(path.join(repositoryRoot, ...segments), "utf8");
const storageSource = readSource("server", "storage.ts");
const durableBillingSource = readSource(
  "server",
  "services",
  "durable-recurring-billing-service.ts",
);
const diagnosticSource = readSource(
  "server",
  "routes",
  "payment-diagnostic.ts",
);

for (const functionName of [
  "upsertMemberPaymentToken",
  "upsertGroupPaymentToken",
]) {
  const functionStart = storageSource.indexOf(`function ${functionName}(`);
  const functionEnd = storageSource.indexOf("\nexport ", functionStart + 1);
  assert(functionStart >= 0 && functionEnd > functionStart);
  const functionSource = storageSource.slice(functionStart, functionEnd);
  assert.match(
    functionSource,
    /requireCanonicalPaymentCredential\(input\.token\)/,
  );
  assert.match(
    functionSource,
    /originalNetworkTransId !== credential[\s\S]+distinctOriginalNetworkTransId/,
  );
  assert.doesNotMatch(
    functionSource,
    /encryptPaymentToken|encryptSensitiveData\(input\.token\)/,
  );
}
assert.doesNotMatch(
  storageSource,
  /function encryptPaymentToken|function decryptPaymentToken/,
);

const resolverStart = durableBillingSource.indexOf(
  "function resolveCredential(",
);
const resolverEnd = durableBillingSource.indexOf(
  "function mapClaimedCycle",
  resolverStart,
);
const durableResolver = durableBillingSource.slice(resolverStart, resolverEnd);
assert.match(durableResolver, /processorReferenceConflict/);
assert.match(durableResolver, /tokenOriginalNetworkTransId/);
assert.match(durableResolver, /latestPaymentAuthGuid/);
assert.match(durableResolver, /bricToken/);
assert.doesNotMatch(durableResolver, /decrypt|ENCRYPTION_KEY/);

assert.doesNotMatch(diagnosticSource, /decryptPaymentToken/);
const previewProjectionStart = diagnosticSource.indexOf(
  "const previewTable = candidates.map",
);
const previewProjectionEnd = diagnosticSource.indexOf(
  'if (mode === "preview")',
  previewProjectionStart,
);
const previewProjection = diagnosticSource.slice(
  previewProjectionStart,
  previewProjectionEnd,
);
assert(
  previewProjectionStart >= 0 && previewProjectionEnd > previewProjectionStart,
);
assert.doesNotMatch(previewProjection, /resolvedAuthGuid\s*:/);
assert.match(diagnosticSource, /candidates: previewTable/);

console.log("Payment credential storage tests passed.");
