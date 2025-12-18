import { storage } from '../storage';

export type PaymentRecord = Awaited<ReturnType<typeof storage.getPaymentByTransactionId>>;

export function maskAuthGuidValue(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > 8 ? `${trimmed.slice(0, 4)}***${trimmed.slice(-4)}` : '********';
}

export function parsePaymentMetadata(metadata: unknown): Record<string, any> {
  if (!metadata) return {};
  if (typeof metadata === 'object') {
    return { ...(metadata as Record<string, any>) };
  }
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata);
    } catch (error) {
      console.warn('[EPX] Failed to parse payment metadata JSON', error);
      return {};
    }
  }
  return {};
}

function extractAuthGuidFromFields(fields?: Record<string, string>): string | undefined {
  if (!fields) return undefined;
  const candidateKeys = [
    'ORIG_AUTH_GUID',
    'orig_auth_guid',
    'ORIG_AUTH',
    'orig_auth'
  ];

  for (const key of candidateKeys) {
    const value = fields[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

export interface ServerPostPersistOptions {
  paymentRecord?: PaymentRecord | null;
  tranType: string;
  amount?: number | null;
  initiatedBy?: string | null;
  requestFields?: Record<string, string>;
  responseFields?: Record<string, string>;
  transactionReference?: string | null;
  authGuidUsed?: string | null;
  metadataSource?: string;
}

export async function persistServerPostResult(options: ServerPostPersistOptions): Promise<void> {
  const {
    paymentRecord,
    tranType,
    amount,
    initiatedBy,
    requestFields,
    responseFields,
    transactionReference,
    authGuidUsed,
    metadataSource
  } = options;

  if (!paymentRecord || !paymentRecord.id) {
    return;
  }

  const effectiveTransactionReference = transactionReference
    || requestFields?.TRAN_NBR
    || responseFields?.TRAN_NBR
    || paymentRecord.transaction_id
    || null;

  const responseAuthGuid = extractAuthGuidFromFields(responseFields);
  const authGuidToPersist = responseAuthGuid || authGuidUsed || null;
  const maskedAuthGuid = maskAuthGuidValue(authGuidToPersist);

  const metadataBase = parsePaymentMetadata(paymentRecord.metadata);
  const history: any[] = Array.isArray(metadataBase.serverPostHistory)
    ? [...metadataBase.serverPostHistory]
    : [];

  const timestamp = new Date().toISOString();
  const entry = {
    tranType,
    timestamp,
    transactionReference: effectiveTransactionReference,
    authResp: responseFields?.AUTH_RESP || null,
    authRespText: responseFields?.AUTH_RESP_TEXT || responseFields?.RESPONSE_TEXT || null,
    authCode: responseFields?.AUTH_CODE || null,
    authGuidMasked: maskedAuthGuid,
    amount: typeof amount === 'number' ? amount : null,
    initiatedBy: initiatedBy || null,
    source: metadataSource || 'server-post'
  };

  history.push(entry);
  metadataBase.serverPostHistory = history.slice(-10);
  metadataBase.serverPost = {
    lastEntry: entry
  };

  const updatePayload: Record<string, any> = {
    metadata: metadataBase
  };

  if (entry.authCode) {
    updatePayload.authorizationCode = entry.authCode;
  }

  if (effectiveTransactionReference && effectiveTransactionReference !== paymentRecord.transaction_id) {
    updatePayload.transactionId = effectiveTransactionReference;
  }

  if (authGuidToPersist && authGuidToPersist !== paymentRecord.epx_auth_guid) {
    updatePayload.epxAuthGuid = authGuidToPersist;
  }

  try {
    await storage.updatePayment(paymentRecord.id, updatePayload);
  } catch (error: any) {
    console.error('[EPX] Failed to persist Server Post result', {
      error: error?.message,
      paymentId: paymentRecord.id,
      tranType
    });
  }
}
