/**
 * EPX Certification helper routes
 * Provides admin-only utilities for generating and exporting certification samples
 */

import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { authenticateToken, type AuthRequest } from '../auth/supabaseAuth';
import { requireRole } from '../auth/roles';
import { certificationLogger } from '../services/certification-logger';
import { storage, getRecentPaymentsDetailed } from '../storage';
import { submitServerPostRecurringPayment, getEPXService } from '../services/epx-payment-service';
import { maskAuthGuidValue, parsePaymentMetadata, persistServerPostResult } from '../utils/epx-metadata';
import { getTransactionLogs, type EPXLogEvent } from '../services/epx-payment-logger';
import { getPaymentEnvironmentDetails, paymentEnvironment, type PaymentEnvironment } from '../services/payment-environment-service';

const router = Router();

const requireSuperAdmin = requireRole('super_admin');
const requireAdmin = requireRole('admin');

const SUPPORTED_TRAN_TYPES = ['CCE1', 'CCE9'] as const;
type SupportedTranType = (typeof SUPPORTED_TRAN_TYPES)[number];
const isSupportedTranType = (value: string): value is SupportedTranType =>
  SUPPORTED_TRAN_TYPES.includes(value as SupportedTranType);

const LOG_PHASES: EPXLogEvent['phase'][] = [
  'create-payment',
  'callback',
  'recaptcha',
  'status',
  'server-post',
  'general',
  'certification',
  'recurring',
  'scheduler'
];

const isValidLogPhase = (value: string): value is EPXLogEvent['phase'] =>
  LOG_PHASES.includes(value as EPXLogEvent['phase']);

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
    RETURN: 'CCE9',
    REFUND: 'CCE9'
  };

  const normalized = aliasMap[upper] || (upper as SupportedTranType);
  return isSupportedTranType(normalized) ? normalized : null;
};

const toNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const extractSubscriptionIdFromPayment = (payment: any): number | undefined => {
  if (!payment) return undefined;
  const direct = toNumber(payment.subscription_id ?? payment.subscriptionId);
  if (direct) return direct;

  const metadata = parsePaymentMetadata(payment.metadata);
  if (!metadata) return undefined;
  return toNumber(metadata.subscriptionId ?? metadata.subscription_id);
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
            error: `Unsupported TRAN_TYPE. Use one of: ${SUPPORTED_TRAN_TYPES.join(', ')}`
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

    let explicitAmount: number | null = null;
    if (typeof amount === 'number') {
      explicitAmount = amount;
    } else if (typeof amount === 'string' && amount.trim()) {
      explicitAmount = parseFloat(amount);
    }

    if (explicitAmount !== null) {
      if (!Number.isFinite(explicitAmount) || explicitAmount <= 0) {
        return {
          status: 400,
          body: { success: false, error: 'Enter a positive numeric amount.' }
        };
      }
    }

    const fallbackAmount = paymentRecord?.amount ? parseFloat(String(paymentRecord.amount)) : null;

    const amountToSend = explicitAmount !== null
      ? explicitAmount
      : fallbackAmount && Number.isFinite(fallbackAmount)
        ? fallbackAmount
        : undefined;

    if (!amountToSend || amountToSend <= 0) {
      return {
        status: 400,
        body: { success: false, error: 'A valid amount is required for this transaction type.' }
      };
    }

    const response = await submitServerPostRecurringPayment({
      amount: amountToSend,
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

    if (paymentRecord) {
      await persistServerPostResult({
        paymentRecord,
        tranType: resolvedTranType,
        amount: amountToSend ?? (paymentRecord?.amount ? Number(paymentRecord.amount) : null),
        initiatedBy,
        requestFields: response.requestFields,
        responseFields: response.responseFields,
        transactionReference: response.requestFields?.TRAN_NBR || paymentRecord.transaction_id || transactionId || null,
        authGuidUsed: resolvedAuthGuid,
        metadataSource: source
      });
    }

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
              epxAuthGuidMasked: maskAuthGuidValue(paymentRecord.epx_auth_guid)
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

const handleSubscriptionCancellation = async (
  req: AuthRequest,
  res: Response,
  source: 'epx-certification' | 'admin-dashboard'
) => {
  try {
    const { subscriptionId, transactionId, reason } = req.body || {};
    let resolvedSubscriptionId = toNumber(subscriptionId);
    let paymentRecord: any | undefined;

    if (!resolvedSubscriptionId && transactionId) {
      paymentRecord = await storage.getPaymentByTransactionId(transactionId);
      resolvedSubscriptionId = extractSubscriptionIdFromPayment(paymentRecord);
    }

    if (!resolvedSubscriptionId) {
      return res.status(400).json({
        success: false,
        error: 'Provide a subscriptionId or reference a payment with subscription metadata.'
      });
    }

    const epxService = await getEPXService();
    const environment = await paymentEnvironment.getEnvironment();
    const cancelResult = await epxService.cancelSubscription(resolvedSubscriptionId);
    const endpointPath = source === 'admin-dashboard'
      ? '/api/admin/payments/cancel-subscription'
      : '/api/epx/certification/cancel-subscription';

    certificationLogger.logCertificationEntry({
      purpose: 'subscription-cancel',
      transactionId: transactionId || paymentRecord?.transaction_id,
      environment,
      amount: paymentRecord?.amount ? Number(paymentRecord.amount) : undefined,
      customerId: paymentRecord?.member_id ? String(paymentRecord.member_id) : undefined,
      metadata: {
        subscriptionId: resolvedSubscriptionId,
        paymentId: paymentRecord?.id || null,
        initiatedBy: req.user?.email,
        reason: reason || null,
        toolkit: source,
      },
      request: {
        timestamp: new Date().toISOString(),
        method: 'POST',
        endpoint: endpointPath,
        headers: req.headers as Record<string, any>,
        body: {
          subscriptionId: resolvedSubscriptionId,
          transactionId,
          reason,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || undefined,
      },
      response: {
        statusCode: cancelResult.success ? 200 : 502,
        headers: { 'content-type': 'application/json' },
        body: cancelResult,
      },
    });

    return res.status(cancelResult.success ? 200 : 502).json({
      success: cancelResult.success,
      subscriptionId: resolvedSubscriptionId,
      paymentId: paymentRecord?.id || null,
      response: cancelResult.data,
      error: cancelResult.error,
    });
  } catch (error: any) {
    console.error('[EPX Certification] Cancel subscription failed', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to cancel subscription',
    });
  }
};

router.get('/api/epx/certification/logs', authenticateToken, requireSuperAdmin, (req: AuthRequest, res: Response) => {

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

router.get('/api/epx/certification/logs/transaction/:transactionId', authenticateToken, requireSuperAdmin, (req: AuthRequest, res: Response) => {

  const transactionId = req.params.transactionId?.trim();
  if (!transactionId) {
    return res.status(400).json({ success: false, error: 'transactionId path parameter is required' });
  }

  const limitParam = parseInt((req.query.limit as string) || '100', 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 100;
  const dateParam = typeof req.query.date === 'string' ? req.query.date : undefined;
  const phaseParam = typeof req.query.phases === 'string' ? req.query.phases : undefined;

  const requestedPhases = phaseParam
    ? phaseParam.split(',').map((phase) => phase.trim()).filter(isValidLogPhase)
    : [];

  const logs = getTransactionLogs(transactionId, {
    date: dateParam,
    limit,
    phases: requestedPhases.length ? requestedPhases : undefined
  });

  res.json({
    success: true,
    transactionId,
    date: dateParam || null,
    limit,
    totalEntries: logs.length,
    phases: requestedPhases.length ? requestedPhases : null,
    logs
  });
});

router.get('/api/epx/certification/callbacks', authenticateToken, requireSuperAdmin, (req: AuthRequest, res: Response) => {

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

router.get('/api/epx/certification/payments', authenticateToken, requireSuperAdmin, async (req: AuthRequest, res: Response) => {

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

router.get('/api/epx/certification/report', authenticateToken, requireSuperAdmin, (req: AuthRequest, res: Response) => {

  const report = certificationLogger.generateCertificationReport();
  const summary = certificationLogger.getLogsSummary();

  res.json({
    success: true,
    report,
    summary
  });
});

router.post('/api/epx/certification/export', authenticateToken, requireSuperAdmin, (req: AuthRequest, res: Response) => {

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

/**
 * GET /api/epx/certification/auth-guid
 * Quick endpoint to retrieve most recent AUTH_GUID for EPX certification
 */
router.get('/api/epx/certification/auth-guid', authenticateToken, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const recentPayments = await getRecentPaymentsDetailed({ limit: 10, status: 'completed' });
    
    const paymentsWithAuthGuid = recentPayments
      .filter(p => p.epx_auth_guid && p.epx_auth_guid.trim())
      .map(p => ({
        id: p.id,
        memberId: p.member_id,
        transactionId: p.transaction_id,
        amount: p.amount,
        planName: p.plan_name,
        createdAt: p.created_at,
        authGuid: p.epx_auth_guid,
        authGuidMasked: maskAuthGuidValue(p.epx_auth_guid),
        member: p.member_id ? {
          name: `${p.member_first_name || ''} ${p.member_last_name || ''}`.trim(),
          email: p.member_email,
          customerNumber: p.member_customer_number
        } : null
      }));

    const mostRecent = paymentsWithAuthGuid[0];

    res.json({
      success: true,
      mostRecent: mostRecent || null,
      recentPayments: paymentsWithAuthGuid,
      message: mostRecent 
        ? `Found AUTH_GUID from transaction ${mostRecent.transactionId}`
        : 'No payments with AUTH_GUID found. Complete a test enrollment first.'
    });
  } catch (error: any) {
    console.error('[EPX Certification] Failed to retrieve AUTH_GUID', error);
    res.status(500).json({ 
      success: false, 
      error: error?.message || 'Failed to retrieve AUTH_GUID' 
    });
  }
});

router.post('/api/epx/certification/server-post', authenticateToken, requireSuperAdmin, async (req: AuthRequest, res: Response) => {

  const result = await executeServerPostAction(req.body || {}, req.user?.email, 'epx-certification');
  return res.status(result.status).json(result.body);
});

router.post('/api/epx/certification/cancel-subscription', authenticateToken, requireSuperAdmin, async (req: AuthRequest, res: Response) => {

  return handleSubscriptionCancellation(req, res, 'epx-certification');
});

router.get('/api/admin/payments/environment', authenticateToken, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const details = await getPaymentEnvironmentDetails();
    res.json({
      success: true,
      environment: details.environment,
      updatedAt: details.updatedAt,
      updatedBy: details.updatedBy,
      allowed: ['sandbox', 'production'] as PaymentEnvironment[],
    });
  } catch (error: any) {
    console.error('[EPX Admin] Failed to load payment environment', error);
    res.status(500).json({ success: false, error: error?.message || 'Unable to load payment environment' });
  }
});

router.post('/api/admin/payments/environment', authenticateToken, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  const requested = typeof req.body?.environment === 'string'
    ? req.body.environment.trim().toLowerCase()
    : '';

  if (requested !== 'sandbox' && requested !== 'production') {
    return res.status(400).json({
      success: false,
      error: 'Environment must be "sandbox" or "production"',
    });
  }

  try {
    const previous = paymentEnvironment.getCachedEnvironment();
    const updated = await paymentEnvironment.setEnvironment(requested as PaymentEnvironment, req.user?.id);
    const details = await getPaymentEnvironmentDetails();

    res.json({
      success: true,
      previousEnvironment: previous,
      environment: updated,
      updatedAt: details.updatedAt,
      updatedBy: details.updatedBy,
    });
  } catch (error: any) {
    console.error('[EPX Admin] Failed to update payment environment', error);
    res.status(500).json({ success: false, error: error?.message || 'Unable to update payment environment' });
  }
});

router.post('/api/admin/payments/cancel-subscription', authenticateToken, requireSuperAdmin, async (req: AuthRequest, res: Response) => {

  return handleSubscriptionCancellation(req, res, 'admin-dashboard');
});

router.post('/api/admin/payments/manual-transaction', authenticateToken, requireSuperAdmin, async (req: AuthRequest, res: Response) => {

  // Regular manual transactions (refunds, captures, etc.)
  const result = await executeServerPostAction(req.body || {}, req.user?.email, 'admin-dashboard');
  return res.status(result.status).json(result.body);
});

export default router;
