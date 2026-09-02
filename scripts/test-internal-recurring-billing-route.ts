import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import express from "express";

import { createInternalRecurringBillingRunHandler } from "../server/routes/internal-recurring-billing-run-handler";

const schedulerToken = "focused-route-test-token";
let billingServiceCalls = 0;

function createServer(environment: NodeJS.ProcessEnv) {
  const app = express();
  app.use(express.json());
  app.post(
    "/api/internal/recurring-billing/run",
    createInternalRecurringBillingRunHandler({
      environment: { BILLING_SCHEDULER_TOKEN: schedulerToken, ...environment },
      runBilling: async () => {
        billingServiceCalls += 1;
        throw new Error("billing service must not be called");
      },
      getConfiguration: () => {
        throw new Error("configuration service must not be called");
      },
    }),
  );
  return app.listen(0, "127.0.0.1");
}

async function request(
  environment: NodeJS.ProcessEnv,
  authorization: string,
): Promise<{ status: number; body: any }> {
  const server = createServer(environment);
  try {
    if (!server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
      });
    }
    const address = server.address();
    assert(address && typeof address === "object");
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/internal/recurring-billing/run`,
      {
        method: "POST",
        headers: { authorization, "content-type": "application/json" },
        body: JSON.stringify({ mode: "live" }),
      },
    );
    return { status: response.status, body: await response.json() };
  } finally {
    server.close();
  }
}

const invalidToken = await request(
  {
    EXTERNAL_BILLING_ENABLED: "false",
    EXTERNAL_BILLING_DRY_RUN: "true",
    RECURRING_BILLING_KILL_SWITCH: "true",
  },
  "Bearer invalid-token",
);
assert.equal(invalidToken.status, 401);
assert.equal(invalidToken.body.error, "Scheduler authentication required");

const disabled = await request(
  {
    EXTERNAL_BILLING_ENABLED: "false",
    EXTERNAL_BILLING_DRY_RUN: "true",
    RECURRING_BILLING_KILL_SWITCH: "false",
  },
  `Bearer ${schedulerToken}`,
);
assert.equal(disabled.status, 503);
assert.equal(disabled.body.error, "EXTERNAL_BILLING_DISABLED");

const killSwitched = await request(
  {
    EXTERNAL_BILLING_ENABLED: "true",
    EXTERNAL_BILLING_DRY_RUN: "true",
    RECURRING_BILLING_KILL_SWITCH: "true",
  },
  `Bearer ${schedulerToken}`,
);
assert.equal(killSwitched.status, 503);
assert.equal(killSwitched.body.error, "RECURRING_BILLING_KILL_SWITCH_ACTIVE");
assert.equal(billingServiceCalls, 0);

const handlerSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "server/routes/internal-recurring-billing-run-handler.ts",
  ),
  "utf8",
);
assert.doesNotMatch(handlerSource, /neonDb|commission|epx/i);

console.log("Internal recurring billing route safety tests passed.");
