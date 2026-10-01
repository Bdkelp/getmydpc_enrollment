import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  canRestorePaymentCredential,
  createPaymentTokenFromNorthTranIdWithClient,
  PaymentCredentialRestoreError,
  restorePaymentCredentialWithClient,
  type QueryClient,
  type RestoreAuditEntry,
} from "../server/services/payment-credential-restore";

// Synthetic placeholders only. Never put real North Tran IDs / BRICs here.
const RESTORED_BRIC = "SYNTHETICBRIC0000001";
const OTHER_BRIC = "SYNTHETICBRIC0000002";
const LEGACY_CIPHERTEXT = `${"a1".repeat(16)}:${"b2".repeat(16)}`;

type Token = {
  id: number;
  member_id: number | null;
  payment_method_type?: string;
  bric_token: string | null;
  original_network_trans_id: string | null;
  is_active: boolean;
  is_primary: boolean;
};
type Payment = { member_id: number | null; epx_auth_guid: string | null };

// Answers only the statements the restore/create paths may run. Anything else
// (member/payment/subscription/cycle writes, processor calls) throws.
class FakeDb implements QueryClient {
  statements: string[] = [];
  private nextTokenId = 900;
  readonly untouched = {
    subscriptions: [{ id: 68, member_id: 63, status: "active", next_billing_date: "2026-09-21" }],
    recurring_billing_cycles: [] as unknown[],
    paymentTransactionIds: ["TXN-1"],
  };

  constructor(
    public tokens: Token[],
    public payments: Payment[] = [],
    public memberStatus: string | null = "active",
  ) {}

  async query(sql: string, params: any[] = []) {
    this.statements.push(sql);
    if (/^SELECT id, status FROM members WHERE id = \$1 FOR UPDATE$/.test(sql)) {
      return {
        rows: this.memberStatus === null ? [] : [{ id: params[0], status: this.memberStatus }],
      };
    }
    if (/FROM payment_tokens\s+WHERE id = \$1 AND member_id = \$2 AND is_active = true AND is_primary = true\s+FOR UPDATE/.test(sql)) {
      const [id, memberId] = params;
      const token = this.tokens.find(
        (t) => t.id === id && t.member_id === memberId && t.is_active && t.is_primary,
      );
      return { rows: token ? [{ ...token }] : [] };
    }
    if (/^SELECT id FROM payment_tokens\s+WHERE member_id = \$1 AND is_active = true\s+FOR UPDATE$/.test(sql)) {
      return {
        rows: this.tokens
          .filter((t) => t.member_id === params[0] && t.is_active)
          .map((t) => ({ id: t.id })),
      };
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
      assert.match(sql, /member_id = \$2 AND id IS DISTINCT FROM \$3::int\s+AND \(TRIM\(bric_token\) = \$1 OR TRIM\(original_network_trans_id\) = \$1\)/);
      const [ref, memberId, excludeTokenId] = params;
      const holds = (t: Token) =>
        t.bric_token?.trim() === ref || t.original_network_trans_id?.trim() === ref;
      return {
        rows: [
          {
            other_member_token: this.tokens.some((t) => t.member_id !== memberId && holds(t)),
            other_member_payment: this.payments.some(
              (p) => String(p.member_id) !== String(memberId) && p.epx_auth_guid?.trim() === ref,
            ),
            same_member_other_token: this.tokens.some(
              (t) => t.member_id === memberId && t.id !== excludeTokenId && holds(t),
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
    if (/^INSERT INTO payment_tokens \(\s*member_id, payment_method_type, bric_token, is_active, is_primary, created_at\s*\) VALUES \(\$1, \$2, \$3, true, true, NOW\(\)\)\s+RETURNING id$/.test(sql)) {
      const [memberId, type, ref] = params;
      if (this.tokens.some((t) => t.bric_token === ref)) {
        throw new Error("duplicate key value violates unique constraint (bric_token)");
      }
      const id = this.nextTokenId++;
      this.tokens.push({
        id,
        member_id: memberId,
        payment_method_type: type,
        bric_token: ref,
        original_network_trans_id: null,
        is_active: true,
        is_primary: true,
      });
      return { rows: [{ id }], rowCount: 1 };
    }
    throw new Error(`Unexpected SQL in credential restore: ${sql}`);
  }
}

const actor = { id: "super-admin-1", email: "ops@example.com", role: "super_admin" };

function defaultToken(overrides: Partial<Token> = {}): Token {
  return {
    id: 26,
    member_id: 63,
    payment_method_type: "CreditCard",
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

async function create(
  db: FakeDb,
  northTranId: unknown,
  paymentMethodType: unknown = "CreditCard",
  audits: RestoreAuditEntry[] = [],
) {
  return createPaymentTokenFromNorthTranIdWithClient(
    db,
    { memberId: 63, paymentMethodType, northTranId, actor },
    async (_client, entry) => {
      audits.push(entry);
    },
  );
}

async function expectRejected(promise: Promise<unknown>, status: number, code?: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof PaymentCredentialRestoreError, String(error));
    assert.equal(error.status, status);
    if (code) assert.equal(error.code, code);
    return true;
  });
}

const forbiddenSideEffects =
  /recurring_billing_cycles|subscriptions|transaction_id|processor_reference|next_billing_date|UPDATE payments|INSERT INTO payments|UPDATE members|original_network_trans_id\s*=/i;

function assertNoBillingSideEffects(db: FakeDb, before: string, label: string) {
  assert.equal(JSON.stringify(db.untouched), before, `${label}: no subscription, cycle, or payment changes`);
  for (const sql of db.statements) {
    assert.doesNotMatch(sql, forbiddenSideEffects, `${label}: must not touch billing state`);
  }
}

function assertAuditHasNoRawBric(audit: RestoreAuditEntry) {
  const serialized = JSON.stringify(audit);
  assert.ok(!serialized.includes(RESTORED_BRIC), "audit must never contain the raw BRIC");
  assert.ok(!serialized.includes("SYNTHETICBRIC"), "audit must not contain any part beyond the last four characters");
  assert.equal(audit.details.restoredReference, `****${RESTORED_BRIC.slice(-4)}`);
}

async function testAuthorization() {
  assert.equal(canRestorePaymentCredential("super_admin"), true);
  for (const role of ["admin", "agent", "member", "", null, undefined]) {
    assert.equal(canRestorePaymentCredential(role), false, `${role} must not restore`);
  }
  const route = fs.readFileSync(
    path.join(process.cwd(), "server/routes/payment-credential-restore.ts"),
    "utf8",
  );
  const handler = route.slice(route.indexOf("async function handleRestore"));
  assert.ok(
    handler.indexOf("canRestorePaymentCredential(req.user.role)") >= 0 &&
      handler.indexOf("canRestorePaymentCredential(req.user.role)") < handler.indexOf("await run("),
    "both endpoints must reject non-super-admins before any restore work",
  );
  assert.match(handler, /status\(403\)/);
  assert.equal(
    (route.match(/handleRestore\(req, res,/g) || []).length,
    2,
    "both restore endpoints must go through the shared authorized handler",
  );
}

async function testRestoreExistingToken() {
  // Valid restore replaces legacy ciphertext and nothing else.
  {
    const db = new FakeDb([defaultToken()]);
    const before = JSON.stringify(db.untouched);
    const audits: RestoreAuditEntry[] = [];
    const result = await restore(db, `  ${RESTORED_BRIC}  `, audits);
    assert.equal(db.tokens[0].bric_token, RESTORED_BRIC, "raw BRIC is stored trimmed");
    assert.equal(db.tokens[0].original_network_trans_id, null, "original_network_trans_id untouched");
    assert.equal(result.created, false);
    assert.equal(audits.length, 1);
    assert.equal(audits[0].changeType, "payment_credential_restored");
    assert.equal(audits[0].memberId, 63);
    assert.deepEqual(audits[0].actor, actor);
    assert.equal(audits[0].details.action, "replaced_bric");
    assert.equal(audits[0].details.paymentTokenId, 26);
    assert.equal(audits[0].details.previousCredentialState, "legacy_encrypted_credential_unavailable");
    assert.equal(audits[0].details.chargeSubmitted, false);
    assert.ok(typeof audits[0].details.restoredAt === "string");
    assertAuditHasNoRawBric(audits[0]);
    assertNoBillingSideEffects(db, before, "restore");
  }

  // Empty bric_token can also be restored.
  {
    const db = new FakeDb([defaultToken({ bric_token: null })]);
    const audits: RestoreAuditEntry[] = [];
    await restore(db, RESTORED_BRIC, audits);
    assert.equal(db.tokens[0].bric_token, RESTORED_BRIC);
    assert.equal(audits[0].details.previousCredentialState, "missing_payment_credential");
  }

  // Never overwrite a usable credential, or one billing would ignore.
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
  // The same value already referenced by billing is not a competing reference.
  {
    const db = new FakeDb([defaultToken()], [{ member_id: 63, epx_auth_guid: RESTORED_BRIC }]);
    await restore(db, RESTORED_BRIC);
    assert.equal(db.tokens[0].bric_token, RESTORED_BRIC);
  }
  await expectRejected(
    restore(new FakeDb([defaultToken({ is_primary: false })]), RESTORED_BRIC),
    404,
    "default_token_not_found",
  );
}

async function testCreateWhenNoActiveToken() {
  for (const type of ["CreditCard", "ACH"] as const) {
    const db = new FakeDb([]);
    const before = JSON.stringify(db.untouched);
    const audits: RestoreAuditEntry[] = [];
    const result = await create(db, ` ${RESTORED_BRIC} `, type, audits);
    assert.equal(result.created, true);
    assert.equal(db.tokens.length, 1, `${type}: exactly one token created`);
    const [token] = db.tokens;
    assert.equal(result.paymentTokenId, token.id);
    assert.deepEqual(
      { ...token, id: 0 },
      {
        id: 0,
        member_id: 63,
        payment_method_type: type,
        bric_token: RESTORED_BRIC,
        original_network_trans_id: null,
        is_active: true,
        is_primary: true,
      },
      `${type}: one active default token holding only the BRIC`,
    );
    assert.equal(audits.length, 1);
    assert.equal(audits[0].details.action, "created_token");
    assert.equal(audits[0].details.paymentMethodType, type);
    assert.equal(audits[0].details.paymentTokenId, token.id);
    assert.equal(audits[0].details.previousCredentialState, "no_active_payment_method");
    assert.equal(audits[0].details.chargeSubmitted, false);
    assertAuditHasNoRawBric(audits[0]);
    assertNoBillingSideEffects(db, before, `create ${type}`);
  }

  // Inactive tokens with other values don't block creation.
  {
    const db = new FakeDb([defaultToken({ is_active: false, is_primary: false, bric_token: LEGACY_CIPHERTEXT })]);
    await create(db, RESTORED_BRIC);
    assert.equal(db.tokens.filter((t) => t.is_active).length, 1);
  }

  // An active token means the existing restore path applies instead.
  {
    const db = new FakeDb([defaultToken()]);
    await expectRejected(create(db, RESTORED_BRIC), 409, "active_token_exists");
    assert.equal(db.tokens.length, 1);
    assert.ok(!db.statements.some((sql) => sql.startsWith("INSERT")), "no insert");
  }
  {
    const db = new FakeDb([defaultToken({ is_primary: false })]);
    await expectRejected(create(db, RESTORED_BRIC), 409, "active_token_exists");
  }

  // Payment method type must be explicit; rejected before any database access.
  for (const type of [undefined, null, "", "card", "creditcard", "BankAccount", "Savings", "CKS2"]) {
    const db = new FakeDb([]);
    // Call directly: the create() helper defaults a missing type to CreditCard.
    await expectRejected(
      createPaymentTokenFromNorthTranIdWithClient(
        db,
        { memberId: 63, paymentMethodType: type, northTranId: RESTORED_BRIC, actor },
        async () => {},
      ),
      400,
      "invalid_payment_method_type",
    );
    assert.equal(db.statements.length, 0, `type ${String(type)}: no queries`);
  }

  // A different usable payment AUTH_GUID would be billed instead; the same one is fine.
  await expectRejected(
    create(new FakeDb([], [{ member_id: 63, epx_auth_guid: OTHER_BRIC }]), RESTORED_BRIC),
    409,
    "billing_reference_already_present",
  );
  {
    const db = new FakeDb([], [{ member_id: 63, epx_auth_guid: RESTORED_BRIC }]);
    await create(db, RESTORED_BRIC);
    assert.equal(db.tokens.length, 1);
  }
}

async function testDuplicateRejection() {
  const crossMember: Array<[string, Token[], Payment[]]> = [
    ["other member token", [defaultToken({ id: 40, member_id: 12, bric_token: RESTORED_BRIC })], []],
    ["other member original reference", [defaultToken({ id: 41, member_id: 12, original_network_trans_id: RESTORED_BRIC })], []],
    ["group-owned token", [defaultToken({ id: 42, member_id: null, bric_token: RESTORED_BRIC })], []],
    ["other member payment", [], [{ member_id: 12, epx_auth_guid: RESTORED_BRIC }]],
  ];
  for (const [label, others, payments] of crossMember) {
    // Restore path.
    {
      const db = new FakeDb([defaultToken(), ...others], payments);
      const audits: RestoreAuditEntry[] = [];
      await expectRejected(restore(db, RESTORED_BRIC, audits), 409, "cross_member_duplicate");
      assert.equal(db.tokens[0].bric_token, LEGACY_CIPHERTEXT, `${label}: token unchanged`);
      assert.equal(audits.length, 0, `${label}: no audit on rejection`);
      assert.ok(!db.statements.some((sql) => /^(UPDATE|INSERT)/.test(sql)), `${label}: no write`);
    }
    // Create path.
    {
      const db = new FakeDb([...others], payments);
      const audits: RestoreAuditEntry[] = [];
      await expectRejected(create(db, RESTORED_BRIC, "ACH", audits), 409, "cross_member_duplicate");
      assert.equal(db.tokens.length, others.length, `${label}: no token created`);
      assert.equal(audits.length, 0);
    }
  }

  // Same member, another token: both credential columns are checked.
  for (const [label, other] of [
    ["bric_token", defaultToken({ id: 27, is_active: false, is_primary: false, bric_token: RESTORED_BRIC })],
    ["original_network_trans_id", defaultToken({ id: 28, is_active: false, is_primary: false, original_network_trans_id: RESTORED_BRIC })],
  ] as Array<[string, Token]>) {
    const restoreDb = new FakeDb([defaultToken(), other]);
    await expectRejected(restore(restoreDb, RESTORED_BRIC), 409, "same_member_duplicate");
    assert.equal(restoreDb.tokens[0].bric_token, LEGACY_CIPHERTEXT, `restore vs ${label}: unchanged`);

    const createDb = new FakeDb([other]);
    await expectRejected(create(createDb, RESTORED_BRIC), 409, "same_member_duplicate");
    assert.equal(createDb.tokens.length, 1, `create vs ${label}: no token created`);
  }
}

async function testMalformedCredential() {
  const malformed = ["", "   ", "short", "has spaces in it", "bad!chars#here", LEGACY_CIPHERTEXT, "x".repeat(129), 12345678, null, undefined];
  for (const value of malformed) {
    const restoreDb = new FakeDb([defaultToken()]);
    await expectRejected(restore(restoreDb, value), 400);
    assert.equal(restoreDb.statements.length, 0, `restore ${String(value)}: no queries`);
    assert.equal(restoreDb.tokens[0].bric_token, LEGACY_CIPHERTEXT);

    const createDb = new FakeDb([]);
    await expectRejected(create(createDb, value), 400);
    assert.equal(createDb.statements.length, 0, `create ${String(value)}: no queries`);
    assert.equal(createDb.tokens.length, 0);
  }
}

async function testMemberStatus() {
  // Cancelled members are never restored and never reactivated.
  {
    const db = new FakeDb([defaultToken()], [], "cancelled");
    await expectRejected(restore(db, RESTORED_BRIC), 409, "member_cancelled");
    assert.equal(db.tokens[0].bric_token, LEGACY_CIPHERTEXT);
    assert.equal(db.memberStatus, "cancelled");
  }
  {
    const db = new FakeDb([], [], "cancelled");
    await expectRejected(create(db, RESTORED_BRIC), 409, "member_cancelled");
    assert.equal(db.tokens.length, 0);
    assert.equal(db.memberStatus, "cancelled");
  }
  await expectRejected(restore(new FakeDb([defaultToken()], [], null), RESTORED_BRIC), 404, "member_not_found");
  await expectRejected(create(new FakeDb([], [], null), RESTORED_BRIC), 404, "member_not_found");

  // Suspended members may be restored; their status is never written.
  {
    const db = new FakeDb([], [], "suspended");
    await create(db, RESTORED_BRIC);
    assert.equal(db.memberStatus, "suspended");
    assert.ok(!db.statements.some((sql) => /UPDATE members/i.test(sql)), "member status never written");
  }
}

function testNoChargePathReachable() {
  const moduleSource = fs.readFileSync(
    path.join(process.cwd(), "server/services/payment-credential-restore.ts"),
    "utf8",
  );
  assert.doesNotMatch(
    moduleSource,
    /epx-payment-service|submitServerPost|durable-recurring-billing|processConfirmedPayment|EPXHostedCheckoutService|neonDb|storage"/,
    "credential restore must not import any charge, billing, or direct database path",
  );
}

async function run() {
  await testAuthorization();
  await testRestoreExistingToken();
  await testCreateWhenNoActiveToken();
  await testDuplicateRejection();
  await testMalformedCredential();
  await testMemberStatus();
  testNoChargePathReachable();
  console.log("Payment credential restore tests passed");
}

void run().catch((error) => {
  console.error(error);
  process.exit(1);
});
