/**
 * EPX Certification helper routes
 * Provides admin-only utilities for generating and exporting certification samples
 */

import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { authenticateToken, type AuthRequest } from '../auth/supabaseAuth';
import { hasAtLeastRole } from '../auth/roles';
import { certificationLogger } from '../services/certification-logger';
import { storage, getRecentPaymentsDetailed } from '../storage';
import { submitServerPostRecurringPayment } from '../services/epx-payment-service';

const router = Router();

const hasAdminPrivileges = (req: AuthRequest): boolean => {
  return hasAtLeastRole(req.user?.role, 'admin');
};

const SUPPORTED_TRAN_TYPES = ['CCE1', 'CCE2', 'V', 'R'] as const;
type SupportedTranType = (typeof SUPPORTED_TRAN_TYPES)[number];
const isSupportedTranType = (value: string): value is SupportedTranType =>
  SUPPORTED_TRAN_TYPES.includes(value as SupportedTranType);

const normalizeTranTypeInput = (value?: string | null): SupportedTranType | null => {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const upper = trimmed.toUpperCase();
  const aliasMap: Record<string, SupportedTranType> = {
    REVERSAL: 'R',
    REV: 'R',
    RETURN: 'R'
  };

  const normalized = aliasMap[upper] || (upper as SupportedTranType);
  return isSupportedTranType(normalized) ? normalized : null;
};

const sanitizeFilename = (value?: string): string => {
  if (!value || typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed.length) {
    return '';
  }
  const sanitized = trimmed.replace(/[^a-z0-9._-]/gi, '_');
  return sanitized.endsWith('.json') ? sanitized : `${sanitized}.json`;
};

type ServerPostPayload = {
  tranType?: string;
  transactionId?: string;
  memberId?: number | string;
  amount?: number | string;
  description?: string;
  aciExt?: string;
  cardEntryMethod?: string;
  industryType?: string;
  authGuid?: string;
  paymentTransactionId?: string;
};

const executeServerPostAction = async (
  payload: ServerPostPayload,
  initiatedBy?: string,
  source: string = 'epx-certification'
): Promise<{ status: number; body: Record<string, any> }> => {
  try {
    const {
      tranType = 'CCE1',
      transactionId,
      memberId,
      amount,
      description,
      aciExt,
      cardEntryMethod,
      industryType,
      authGuid,
      paymentTransactionId
    } = payload || {};

    let resolvedTranType: SupportedTranType = 'CCE1';
    if (typeof tranType === 'string' && tranType.trim()) {
      const normalizedValue = normalizeTranTypeInput(tranType);
      if (!normalizedValue) {
        return {
          status: 400,
          body: {
            success: false,
            error: `Unsupported TRAN_TYPE. Use one of: ${SUPPORTED_TRAN_TYPES.join(', ')} (REVERSAL/REV map to R)`
          }
        };
      }
      resolvedTranType = normalizedValue;
    }

    let paymentRecord;
    if (paymentTransactionId || transactionId) {
      paymentRecord = await storage.getPaymentByTransactionId(paymentTransactionId || transactionId);
    }

    const resolvedAuthGuid = authGuid || paymentRecord?.epx_auth_guid;
    if (!resolvedAuthGuid) {
      return {
        status: 400,
        body: {
          success: false,
          error: 'An EPX AUTH_GUID is required (provide authGuid or reference a payment with one).'
        }
      };
    }

    let resolvedMemberId: number | null = null;
    if (typeof memberId === 'number') {
      resolvedMemberId = memberId;
    } else if (typeof memberId === 'string' && memberId.trim()) {
      resolvedMemberId = Number(memberId);
    } else if (paymentRecord?.member_id) {
      resolvedMemberId = Number(paymentRecord.member_id);
    }

    const member = resolvedMemberId ? await storage.getMember(resolvedMemberId) : null;

    let resolvedAmount: number | null = null;
    if (typeof amount === 'number') {
      resolvedAmount = amount;
    } else if (typeof amount === 'string' && amount.trim()) {
      resolvedAmount = parseFloat(amount);
    } else if (paymentRecord?.amount) {
      resolvedAmount = parseFloat(String(paymentRecord.amount));
    }

    if (!resolvedAmount || !Number.isFinite(resolvedAmount) || resolvedAmount <= 0) {
      return {
        status: 400,
        body: { success: false, error: 'A valid amount is required.' }
      };
    }

    const response = await submitServerPostRecurringPayment({
      amount: resolvedAmount,
      authGuid: resolvedAuthGuid,
      transactionId: paymentRecord?.transaction_id || transactionId,
      member: member ? (member as Record<string, any>) : undefined,
      description: description || `Manual ${resolvedTranType} initiated by ${initiatedBy || 'unknown admin'}`,
      aciExt,
      cardEntryMethod,
      industryType,
      tranType: resolvedTranType,
      metadata: {
        initiatedBy,
        paymentId: paymentRecord?.id || null,
        toolkit: source
      }
    });

    return {
      status: response.success ? 200 : 502,
      body: {
        success: response.success,
        tranType: resolvedTranType,
        transactionReference: response.requestFields?.TRAN_NBR,
        payment: paymentRecord
          ? {
              id: paymentRecord.id,
              memberId: paymentRecord.member_id,
              transactionId: paymentRecord.transaction_id,
              amount: paymentRecord.amount,
              epxAuthGuidMasked: paymentRecord.epx_auth_guid
                ? `${paymentRecord.epx_auth_guid.slice(0, 4)}****${paymentRecord.epx_auth_guid.slice(-4)}`
                : null
            }
          : null,
        request: {
          fields: response.requestFields,
          payload: response.requestPayload
        },
        response: {
          fields: response.responseFields,
          raw: response.rawResponse
        },
        error: response.error
      }
    };
  } catch (error: any) {
    console.error(`[EPX Manual Transaction] ${source} helper failed`, error);
    return {
      status: 500,
      body: {
        success: false,
        error: error?.message || 'Server Post helper failed'
      }
    };
  }
};

router.get('/api/epx/certification/logs', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!hasAdminPrivileges(req)) {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  const limitParam = parseInt((req.query.limit as string) || '25', 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 25;

  const entries = certificationLogger.getRecentEntries(limit);

  res.json({
    success: true,
    entries,
    totalEntries: entries.length,
    limit
  });
});

router.get('/api/epx/certification/callbacks', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!hasAdminPrivileges(req)) {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  const limitParam = parseInt((req.query.limit as string) || '50', 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 50;

  // Pull a larger recent set, then filter down to hosted callback events
  const recentEntries = certificationLogger.getRecentEntries(500);
  const callbackEntries = recentEntries.filter((entry) =>
    typeof entry?.purpose === 'string' && entry.purpose.startsWith('hosted-callback')
  ).slice(0, limit);

  res.json({
    success: true,
    entries: callbackEntries,
    totalEntries: callbackEntries.length,
    limit
  });
});

router.get('/api/epx/certification/payments', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (!hasAdminPrivileges(req)) {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  const limitParam = parseInt((req.query.limit as string) || '25', 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 25;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;

  try {
    const recentPayments = await getRecentPaymentsDetailed({ limit, status });
    const normalized = recentPayments.map((payment) => ({
      id: payment.id,
      memberId: payment.member_id,
      planName: payment.plan_name,
      amount: payment.amount,
      status: payment.status,
      createdAt: payment.created_at,
      transactionId: payment.transaction_id,
      epxAuthGuid: payment.epx_auth_guid,
      environment: payment.environment,
      metadata: payment.metadata,
      member: payment.member_id
        ? {
            firstName: payment.member_first_name,
            lastName: payment.member_last_name,
            email: payment.member_email,
            customerNumber: payment.member_customer_number,
          }
        : null,
    }));

    res.json({
      success: true,
      limit,
      status,
      payments: normalized,
    });
  } catch (error: any) {
    console.error('[EPX Certification] Failed to load payments', error);
    res.status(500).json({ success: false, error: error?.message || 'Unable to load recent payments' });
  }
});

router.get('/api/epx/certification/report', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!hasAdminPrivileges(req)) {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  const report = certificationLogger.generateCertificationReport();
  const summary = certificationLogger.getLogsSummary();

  res.json({
    success: true,
    report,
    summary
  });
});

router.post('/api/epx/certification/export', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!hasAdminPrivileges(req)) {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  const providedName = sanitizeFilename(req.body?.filename);
  const defaultName = `epx-certification-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const exportFileName = providedName || defaultName;

  try {
    const filePath = certificationLogger.exportAllLogs(exportFileName);
    const rawContents = fs.readFileSync(filePath, 'utf8');
    let entries: unknown = [];

    try {
      entries = JSON.parse(rawContents);
    } catch (parseError) {
      console.warn('[EPX Certification] Failed to parse exported log file', { parseError });
    }

    res.json({
      success: true,
      fileName: path.basename(filePath),
      filePath,
      totalEntries: Array.isArray(entries) ? entries.length : 0,
      entries
    });
  } catch (error: any) {
    console.error('[EPX Certification] Export failed', { error: error?.message });
    res.status(500).json({
      success: false,
      error: 'Failed to export certification logs'
    });
  }
});

router.post('/api/epx/certification/server-post', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (!hasAdminPrivileges(req)) {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  const result = await executeServerPostAction(req.body || {}, req.user?.email, 'epx-certification');
  return res.status(result.status).json(result.body);
});

router.post('/api/admin/payments/manual-transaction', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (!hasAdminPrivileges(req)) {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  const result = await executeServerPostAction(req.body || {}, req.user?.email, 'admin-dashboard');
  return res.status(result.status).json(result.body);
});

export default router;
