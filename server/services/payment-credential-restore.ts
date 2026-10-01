import { hasAtLeastRole } from "../auth/roles";
import { resolveCanonicalPaymentCredential } from "./payment-credential";

/**
 * Super-admin restore of a member's recurring credential from the North
 * portal Tran ID (North labels the BRIC as Tran ID). See
 * docs/vendor/epx/EPX_CERTIFICATION_REFERENCE.md: the BRIC alone is the
 * certified recurring credential for CCE1 and CKC2, and AUTH_CODE is response
 * metadata.
 *
 * Two paths:
 * - restore: the member's active default token has an unusable bric_token;
 *   replace it.
 * - create: the member has no active token at all; insert one active
 *   default token holding the BRIC.
 *
 * This module has no database import so it can be tested with a fake client.
 * It only ever writes payment_tokens plus one audit entry; it never submits a
 * charge and never touches payments, processor references, members,
 * subscriptions, or billing cycles.
 */

export interface RestoreActor {
  id: string;
  email?: string | null;
  role?: string | null;
}

export interface RestoreAuditEntry {
  memberId: number;
  actor: RestoreActor;
  changeType: "payment_credential_restored";
  details: Record<string, unknown>;
}

export interface QueryClient {
  query(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: any[]; rowCount?: number | null }>;
}

type WriteAudit = (client: QueryClient, entry: RestoreAuditEntry) => Promise<void>;

export type RestorablePaymentMethodType = "CreditCard" | "ACH";

export class PaymentCredentialRestoreError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function canRestorePaymentCredential(
  role: string | null | undefined,
): boolean {
  return hasAtLeastRole(role, "super_admin");
}

// Audit and API responses only ever carry the last four characters.
export function maskRestoredReference(value: string): string {
  return value.length > 4 ? `****${value.slice(-4)}` : "****";
}

function requireReference(northTranId: unknown): string {
  const resolution = resolveCanonicalPaymentCredential(northTranId);
  if (resolution.error) {
    throw new PaymentCredentialRestoreError(
      400,
      resolution.error,
      "North Tran ID / BRIC is not a valid processor reference",
    );
  }
  return resolution.credential;
}

// Locks the member row. Recovery policy: cancelled accounts are never
// restored or reactivated here; member status is never written.
async function lockRestorableMember(
  client: QueryClient,
  memberId: number,
): Promise<void> {
  const memberResult = await client.query(
    "SELECT id, status FROM members WHERE id = $1 FOR UPDATE",
    [memberId],
  );
  const member = memberResult.rows[0];
  if (!member) {
    throw new PaymentCredentialRestoreError(404, "member_not_found", "Member not found");
  }
  if (String(member.status || "").toLowerCase() === "cancelled") {
    throw new PaymentCredentialRestoreError(
      409,
      "member_cancelled",
      "Cancelled members cannot have a North Tran ID / BRIC restored; review the account status first",
    );
  }
}

// The recurring engine prefers these references over payment_tokens.bric_token.
// If one is usable and different, the restored BRIC would never be billed.
function assertNoCompetingReference(
  reference: string,
  candidates: unknown[],
): void {
  for (const candidate of candidates) {
    const resolution = resolveCanonicalPaymentCredential(candidate);
    if (!resolution.error && resolution.credential !== reference) {
      throw new PaymentCredentialRestoreError(
        409,
        "billing_reference_already_present",
        "Recurring billing already has a different usable processor reference for this member; restoring this BRIC would not change what is billed",
      );
    }
  }
}

async function latestPaymentAuthGuid(
  client: QueryClient,
  memberId: number,
): Promise<unknown> {
  const latestPayment = await client.query(
    `SELECT epx_auth_guid FROM payments
     WHERE member_id::text = $1::text AND epx_auth_guid IS NOT NULL
       AND LENGTH(TRIM(epx_auth_guid::text)) >= 8
     ORDER BY created_at DESC, id DESC LIMIT 1`,
    [memberId],
  );
  return latestPayment.rows[0]?.epx_auth_guid;
}

// excludeTokenId is the token being restored; null when creating a token.
async function assertNotDuplicate(
  client: QueryClient,
  reference: string,
  memberId: number,
  excludeTokenId: number | null,
): Promise<void> {
  const duplicate = await client.query(
    `SELECT
       EXISTS (
         SELECT 1 FROM payment_tokens
         WHERE member_id IS DISTINCT FROM $2
           AND (TRIM(bric_token) = $1 OR TRIM(original_network_trans_id) = $1)
       ) AS other_member_token,
       EXISTS (
         SELECT 1 FROM payments
         WHERE member_id::text IS DISTINCT FROM $2::text
           AND TRIM(epx_auth_guid) = $1
       ) AS other_member_payment,
       EXISTS (
         SELECT 1 FROM payment_tokens
         WHERE member_id = $2 AND id IS DISTINCT FROM $3::int
           AND (TRIM(bric_token) = $1 OR TRIM(original_network_trans_id) = $1)
       ) AS same_member_other_token`,
    [reference, memberId, excludeTokenId],
  );
  const conflicts = duplicate.rows[0] || {};
  if (conflicts.other_member_token || conflicts.other_member_payment) {
    throw new PaymentCredentialRestoreError(
      409,
      "cross_member_duplicate",
      "This North Tran ID / BRIC is already recorded for a different member",
    );
  }
  if (conflicts.same_member_other_token) {
    throw new PaymentCredentialRestoreError(
      409,
      "same_member_duplicate",
      "This North Tran ID / BRIC is already stored on another payment method for this member",
    );
  }
}

export async function restorePaymentCredentialWithClient(
  client: QueryClient,
  input: {
    memberId: number;
    paymentTokenId: number;
    northTranId: unknown;
    actor: RestoreActor;
  },
  writeAudit: WriteAudit,
): Promise<{ paymentTokenId: number; restoredReference: string; created: false }> {
  const reference = requireReference(input.northTranId);
  await lockRestorableMember(client, input.memberId);

  const tokenResult = await client.query(
    `SELECT id, payment_method_type, bric_token, original_network_trans_id
     FROM payment_tokens
     WHERE id = $1 AND member_id = $2 AND is_active = true AND is_primary = true
     FOR UPDATE`,
    [input.paymentTokenId, input.memberId],
  );
  const token = tokenResult.rows[0];
  if (!token) {
    throw new PaymentCredentialRestoreError(
      404,
      "default_token_not_found",
      "Active default payment method not found for this member",
    );
  }

  const previousState = resolveCanonicalPaymentCredential(token.bric_token);
  if (!previousState.error) {
    throw new PaymentCredentialRestoreError(
      409,
      "credential_already_usable",
      "This payment method already has a usable North Tran ID / BRIC",
    );
  }
  assertNoCompetingReference(reference, [
    token.original_network_trans_id,
    await latestPaymentAuthGuid(client, input.memberId),
  ]);
  await assertNotDuplicate(client, reference, input.memberId, input.paymentTokenId);

  const updated = await client.query(
    `UPDATE payment_tokens SET bric_token = $3
     WHERE id = $1 AND member_id = $2 AND bric_token IS NOT DISTINCT FROM $4`,
    [input.paymentTokenId, input.memberId, reference, token.bric_token],
  );
  if (updated.rowCount !== 1) {
    throw new PaymentCredentialRestoreError(
      409,
      "token_changed",
      "Payment method changed during restore; reload and try again",
    );
  }

  const restoredReference = maskRestoredReference(reference);
  await writeAudit(client, {
    memberId: input.memberId,
    actor: input.actor,
    changeType: "payment_credential_restored",
    details: {
      action: "replaced_bric",
      paymentTokenId: input.paymentTokenId,
      paymentMethodType: token.payment_method_type || null,
      source: "north_tran_id",
      previousCredentialState: previousState.error,
      restoredReference,
      restoredAt: new Date().toISOString(),
      chargeSubmitted: false,
    },
  });

  return { paymentTokenId: input.paymentTokenId, restoredReference, created: false };
}

export async function createPaymentTokenFromNorthTranIdWithClient(
  client: QueryClient,
  input: {
    memberId: number;
    paymentMethodType: unknown;
    northTranId: unknown;
    actor: RestoreActor;
  },
  writeAudit: WriteAudit,
): Promise<{ paymentTokenId: number; restoredReference: string; created: true }> {
  if (input.paymentMethodType !== "CreditCard" && input.paymentMethodType !== "ACH") {
    throw new PaymentCredentialRestoreError(
      400,
      "invalid_payment_method_type",
      "Payment method type must be CreditCard or ACH",
    );
  }
  const paymentMethodType: RestorablePaymentMethodType = input.paymentMethodType;
  const reference = requireReference(input.northTranId);
  await lockRestorableMember(client, input.memberId);

  const activeTokens = await client.query(
    `SELECT id FROM payment_tokens
     WHERE member_id = $1 AND is_active = true
     FOR UPDATE`,
    [input.memberId],
  );
  if (activeTokens.rows.length > 0) {
    throw new PaymentCredentialRestoreError(
      409,
      "active_token_exists",
      "This member already has an active payment method; restore its North Tran ID / BRIC instead",
    );
  }
  assertNoCompetingReference(reference, [
    await latestPaymentAuthGuid(client, input.memberId),
  ]);
  await assertNotDuplicate(client, reference, input.memberId, null);

  const inserted = await client.query(
    `INSERT INTO payment_tokens (
       member_id, payment_method_type, bric_token, is_active, is_primary, created_at
     ) VALUES ($1, $2, $3, true, true, NOW())
     RETURNING id`,
    [input.memberId, paymentMethodType, reference],
  );
  const paymentTokenId = Number(inserted.rows[0]?.id);
  if (!paymentTokenId) {
    throw new Error("Payment method insert returned no id");
  }

  const restoredReference = maskRestoredReference(reference);
  await writeAudit(client, {
    memberId: input.memberId,
    actor: input.actor,
    changeType: "payment_credential_restored",
    details: {
      action: "created_token",
      paymentTokenId,
      paymentMethodType,
      source: "north_tran_id",
      previousCredentialState: "no_active_payment_method",
      restoredReference,
      restoredAt: new Date().toISOString(),
      chargeSubmitted: false,
    },
  });

  return { paymentTokenId, restoredReference, created: true };
}
