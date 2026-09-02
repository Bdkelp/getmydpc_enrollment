export const PAYMENT_CREDENTIAL_ERROR = {
  missing: "missing_payment_credential",
  legacyEncrypted: "legacy_encrypted_credential_unavailable",
  invalid: "invalid_payment_credential",
} as const;

export type PaymentCredentialError =
  (typeof PAYMENT_CREDENTIAL_ERROR)[keyof typeof PAYMENT_CREDENTIAL_ERROR];

export type PaymentCredentialResolution =
  | { credential: string; error: null }
  | { credential: null; error: PaymentCredentialError };

export function isLegacyEncryptedPaymentCredential(value: string): boolean {
  return /^[0-9a-f]{32}:(?:[0-9a-f]{32})+$/i.test(value.trim());
}

export function resolveCanonicalPaymentCredential(
  value: unknown,
): PaymentCredentialResolution {
  const credential = typeof value === "string" ? value.trim() : "";
  if (!credential) {
    return { credential: null, error: PAYMENT_CREDENTIAL_ERROR.missing };
  }
  if (isLegacyEncryptedPaymentCredential(credential)) {
    return {
      credential: null,
      error: PAYMENT_CREDENTIAL_ERROR.legacyEncrypted,
    };
  }
  if (
    credential.length < 8 ||
    credential.length > 128 ||
    !/^[A-Za-z0-9-]+$/.test(credential)
  ) {
    return { credential: null, error: PAYMENT_CREDENTIAL_ERROR.invalid };
  }
  return { credential, error: null };
}

export function requireCanonicalPaymentCredential(value: unknown): string {
  const resolution = resolveCanonicalPaymentCredential(value);
  if (resolution.error) {
    throw new Error(resolution.error);
  }
  return resolution.credential;
}

export function redactResolvedPaymentCredential<
  Candidate extends Record<string, unknown> & { resolvedAuthGuid?: unknown },
>(candidate: Candidate): Omit<Candidate, "resolvedAuthGuid"> {
  const { resolvedAuthGuid: omittedCredential, ...safeCandidate } = candidate;
  void omittedCredential;
  return safeCandidate;
}
