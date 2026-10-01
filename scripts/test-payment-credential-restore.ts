import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  canRestorePaymentCredential,
  PaymentCredentialRestoreError,
  restorePaymentCredentialWithClient,
  type QueryClient,
  type RestoreAuditEntry,
} from "../server/services/payment-credential-restore";

// Synthetic values only; never real processor references.
const RESTORED_BRIC = "0A1B2C3D4E5F6G7H8J9";
const OTHER_BRIC = "9Z8Y7X6W5V4U3T2S1R0";
const LEGACY_CIPHERTEXT = `${"a1".repeat(16)}:${"b2".repeat(16)}`;

type Token = {
  id: number;
  member_id: number | null;
  bric_token: string | null;
  original_network_trans_id: string | null;
  is_active: boolean;
  is_primary: boolean;
};
type Payment = { member_id: number | null; epx_auth_guid: string | null };

// Answers only the statements the restore is allowed to run. Anything else
// (payments/subscription/cycle writes, processor calls) throws.
class FakeDb implements QueryClient {
  statements: string[] = [];
  readonly untouched = {
    subscriptions: [{ id: 68, member_id: 63, next_billing_date: "2026-09-21" }],
    recurring_billing_cycles: [] as unknown[],
    paymentTransactionIds: ["TXN-1"],
  };

  constructor(
    public tokens: Token[],
    public payments: Payment[] = [],
  ) {}

  async query(sql: string, params: any[] = []) {
    this.statements.push(sql);
    if (/^SELECT id FROM members WHERE id = \$1 FOR UPDATE$/.test(sql)) {
      return { rows: [] };
    }
    if (/FROM payment_tokens\s+WHERE id = \$1 AND member_id = \$2 AND is_active = true AND is_primary = true\s+FOR UPDATE/.test(sql)) {
      const [id, memberId] = params;
      const token = this.tokens.find(
        (t) => t.id === id && t.member_id === memberId && t.is_active && t.is_primary,
      );
      return { rows: token ? [{ ...token }] : [] };
    }
    if (/^SELECT epx_auth_guid FROM payments/.test(sql)) {
      const row = [...this.payments]
        .reverse()
        .find(
          (p) =>
            String(p.member_id) === String(params[0]) &&
            p.epx_auth_guid &&
            p.epx_auth_guid.trim().length >= 8,
        );
      return { rows: row ? [{ epx_auth_guid: row.epx_auth_guid }] : [] };
    }
    if (/AS other_member_token/.test(sql)) {
      const [ref, memberId, tokenId] = params;
      return {
        rows: [
          {
            other_member_token: this.tokens.some(
              (t) =>
                t.member_id !== memberId &&
                (t.bric_token?.trim() === ref ||
                  t.original_network_trans_id?.trim() === ref),
            ),
            other_member_payment: this.payments.some(
              (p) =>
                String(p.member_id) !== String(memberId) &&
                p.epx_auth_guid?.trim() === ref,
            ),
            same_member_other_token: this.tokens.some(
              (t) =>
                t.member_id === memberId &&
                t.id !== tokenId &&
                t.bric_token?.trim() === ref,
            ),
          },
        ],
      };
    }
    if (/^UPDATE payment_tokens SET bric_token = \$3\s+WHERE id = \$1 AND member_id = \$2 AND bric_token IS NOT DISTINCT FROM \$4$/.test(sql)) {
      const [id, memberId, ref, expected] = params;
      const token = this.tokens.find(
        (t) => t.id === id && t.member_id === memberId && t.bric_token === expected,
      );
      if (!token) return { rows: [], rowCount: 0 };
      token.bric_token = ref;
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected SQL in credential restore: ${sql}`);
  }
}

const actor = { id: "super-admin-1", email: "ops@example.com", role: "super_admin" };

function defaultToken(overrides: Partial<Token> = {}): Token {
  return {
    id: 26,
    member_id: 63,
    bric_token: LEGACY_CIPHERTEXT,
    original_network_trans_id: null,
    is_active: true,
    is_primary: true,
    ...overrides,
  };
}

async function restore(db: FakeDb, northTranId: unknown, audits: RestoreAuditEntry[] = []) {
  return restorePaymentCredentialWithClient(
    db,
    { memberId: 63, paymentTokenId: 26, northTranId, actor },
    async (_client, entry) => {
      audits.push(entry);
    },
  );
}

async function expectRejected(
  promise: Promise<unknown>,
  status: number,
  code: string,
) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof PaymentCredentialRestoreError);
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    return true;
  });
}

const forbiddenSideEffects =
  /recurring_billing_cycles|subscriptions|transaction_id|processor_reference|next_billing_date|UPDATE payments|INSERT INTO payments|original_network_trans_id\s*=/i;

async function run() {
  // Authorization: super admin only.
  assert.equal(canRestorePaymentCredential("super_admin"), true);
  for (const role of ["admin", "agent", "member", "", null, undefined]) {
    assert.equal(canRestorePaymentCredential(role), false, `${role} must not restore`);
  }
  const route = fs.readFileSync(
    path.join(process.cwd(), "server/routes/payment-credential-restore.ts"),
    "utf8",
  );
  assert.ok(
    route.indexOf("canRestorePaymentCredential(req.user.role)") >= 0 &&
      route.indexOf("canRestorePaymentCredential(req.user.role)") <
        route.indexOf("restorePaymentCredentialFromNorthTranId({"),
    "the route must reject non-super-admins before any restore work",
  );
  assert.match(route, /status\(403\)/);

  // Valid restore replaces legacy ciphertext and nothing else.
  {
    const db = new FakeDb([defaultToken()]);
    const before = JSON.stringify(db.untouched);
    const audits: RestoreAuditEntry[] = [];
    const result = await restore(db, `  ${RESTORED_BRIC}  `, audits);
    assert.equal(db.tokens[0].bric_token, RESTORED_BRIC, "raw BRIC is stored trimmed");
    assert.equal(db.tokens[0].original_network_trans_id, null, "original_network_trans_id untouched");
    assert.equal(result.restoredReference, `****${RESTORED_BRIC.slice(-4)}`);
    assert.equal(audits.length, 1);
    assert.equal(audits[0].changeType, "payment_credential_restored");
    assert.equal(audits[0].memberId, 63);
    assert.deepEqual(audits[0].actor, actor);
    assert.equal(audits[0].details.paymentTokenId, 26);
    assert.equal(audits[0].details.previousCredentialState, "legacy_encrypted_credential_unavailable");
    assert.equal(audits[0].details.chargeSubmitted, false);
    assert.ok(typeof audits[0].details.restoredAt === "string");
    assert.ok(
      !JSON.stringify(audits[0]).includes(RESTORED_BRIC.slice(0, 8)),
      "audit must never contain the raw BRIC",
    );
    assert.equal(JSON.stringify(db.untouched), before, "no subscription, cycle, or payment changes");
    for (const sql of db.statements) {
      assert.doesNotMatch(sql, forbiddenSideEffects, "restore must not touch billing state");
    }
  }

  // Missing credential (empty bric_token) can also be restored.
  {
    const db = new FakeDb([defaultToken({ bric_token: null })]);
    const audits: RestoreAuditEntry[] = [];
    await restore(db, RESTORED_BRIC, audits);
    assert.equal(db.tokens[0].bric_token, RESTORED_BRIC);
    assert.equal(audits[0].details.previousCredentialState, "missing_payment_credential");
  }

  // Duplicate BRIC belonging to another member is rejected without writes.
  for (const [label, tokens, payments] of [
    ["other member token", [defaultToken(), defaultToken({ id: 40, member_id: 12, bric_token: RESTORED_BRIC })], []],
    ["other member original reference", [defaultToken(), defaultToken({ id: 41, member_id: 12, original_network_trans_id: RESTORED_BRIC })], []],
    ["group-owned token", [defaultToken(), defaultToken({ id: 42, member_id: null, bric_token: RESTORED_BRIC })], []],
    ["other member payment", [defaultToken()], [{ member_id: 12, epx_auth_guid: RESTORED_BRIC }]],
  ] as Array<[string, Token[], Payment[]]>) {
    const db = new FakeDb(tokens, payments);
    const audits: RestoreAuditEntry[] = [];
    await expectRejected(restore(db, RESTORED_BRIC, audits), 409, "cross_member_duplicate");
    assert.equal(db.tokens[0].bric_token, LEGACY_CIPHERTEXT, `${label}: token unchanged`);
    assert.equal(audits.length, 0, `${label}: no audit on rejection`);
    assert.ok(!db.statements.some((sql) => sql.startsWith("UPDATE")), `${label}: no write`);
  }
  {
    const db = new FakeDb([
      defaultToken(),
      defaultToken({ id: 27, is_active: false, is_primary: false, bric_token: RESTORED_BRIC }),
    ]);
    await expectRejected(restore(db, RESTORED_BRIC), 409, "same_member_duplicate");
  }

  // Malformed credentials are rejected before any database access.
  for (const malformed of ["", "   ", "short", "has spaces in it", "bad!chars#here", LEGACY_CIPHERTEXT, "x".repeat(129), 12345678, null]) {
    const db = new FakeDb([defaultToken()]);
    await assert.rejects(restore(db, malformed), (error: unknown) => {
      assert.ok(error instanceof PaymentCredentialRestoreError);
      assert.equal(error.status, 400);
      return true;
    });
    assert.equal(db.statements.length, 0, `malformed ${String(malformed)}: no queries`);
    assert.equal(db.tokens[0].bric_token, LEGACY_CIPHERTEXT);
  }

  // Never overwrite a usable credential or one billing would ignore.
  await expectRejected(
    restore(new FakeDb([defaultToken({ bric_token: OTHER_BRIC })]), RESTORED_BRIC),
    409,
    "credential_already_usable",
  );
  await expectRejected(
    restore(new FakeDb([defaultToken({ original_network_trans_id: OTHER_BRIC })]), RESTORED_BRIC),
    409,
    "billing_reference_already_present",
  );
  await expectRejected(
    restore(new FakeDb([defaultToken()], [{ member_id: 63, epx_auth_guid: OTHER_BRIC }]), RESTORED_BRIC),
    409,
    "billing_reference_already_present",
  );
  await expectRejected(
    restore(new FakeDb([defaultToken({ is_primary: false })]), RESTORED_BRIC),
    404,
    "default_token_not_found",
  );

  // No charge path is reachable from the restore module.
  const moduleSource = fs.readFileSync(
    path.join(process.cwd(), "server/services/payment-credential-restore.ts"),
    "utf8",
  );
  assert.doesNotMatch(
    moduleSource,
    /epx-payment-service|submitServerPost|durable-recurring-billing|processConfirmedPayment|EPXHostedCheckoutService/,
    "credential restore must not import any charge or billing path",
  );

  console.log("Payment credential restore tests passed");
}

void run().catch((error) => {
  console.error(error);
  process.exit(1);
});
