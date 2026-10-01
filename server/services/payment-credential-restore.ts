import { hasAtLeastRole } from "../auth/roles";
import { resolveCanonicalPaymentCredential } from "./payment-credential";

/**
 * Super-admin restore of a payment token's BRIC from the North portal
 * Tran ID (North labels the BRIC as Tran ID). See
 * docs/vendor/epx/EPX_CERTIFICATION_REFERENCE.md: the BRIC alone is the
 * certified recurring credential, and AUTH_CODE is response metadata.
 *
 * This module has no database import so it can be tested with a fake client.
 * It only ever writes payment_tokens.bric_token plus one audit entry; it never
 * submits a charge and never touches payments, processor references,
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

export async function restorePaymentCredentialWithClient(
  client: QueryClient,
  input: {
    memberId: number;
    paymentTokenId: number;
    northTranId: unknown;
    actor: RestoreActor;
  },
  writeAudit: (client: QueryClient, entry: RestoreAuditEntry) => Promise<void>,
): Promise<{ paymentTokenId: number; restoredReference: string }> {
  const resolution = resolveCanonicalPaymentCredential(input.northTranId);
  if (resolution.error) {
    throw new PaymentCredentialRestoreError(
      400,
      resolution.error,
      "North Tran ID / BRIC is not a valid processor reference",
    );
  }
  const reference = resolution.credential;

  await client.query("SELECT id FROM members WHERE id = $1 FOR UPDATE", [
    input.memberId,
  ]);
  const tokenResult = await client.query(
    `SELECT id, bric_token, original_network_trans_id
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
  // Same precedence as the recurring engine: a usable reference here would be
  // billed instead of the restored BRIC, so the restore would change nothing.
  const latestPayment = await client.query(
    `SELECT epx_auth_guid FROM payments
     WHERE member_id::text = $1::text AND epx_auth_guid IS NOT NULL
       AND LENGTH(TRIM(epx_auth_guid::text)) >= 8
     ORDER BY created_at DESC, id DESC LIMIT 1`,
    [input.memberId],
  );
  if (
    !resolveCanonicalPaymentCredential(token.original_network_trans_id).error ||
    !resolveCanonicalPaymentCredential(latestPayment.rows[0]?.epx_auth_guid).error
  ) {
    throw new PaymentCredentialRestoreError(
      409,
      "billing_reference_already_present",
      "Recurring billing already has a usable processor reference for this member; restoring the BRIC would not change what is billed",
    );
  }

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
         WHERE member_id = $2 AND id <> $3 AND TRIM(bric_token) = $1
       ) AS same_member_other_token`,
    [reference, input.memberId, input.paymentTokenId],
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
      paymentTokenId: input.paymentTokenId,
      source: "north_tran_id",
      previousCredentialState: previousState.error,
      restoredReference,
      restoredAt: new Date().toISOString(),
      chargeSubmitted: false,
    },
  });

  return { paymentTokenId: input.paymentTokenId, restoredReference };
}
