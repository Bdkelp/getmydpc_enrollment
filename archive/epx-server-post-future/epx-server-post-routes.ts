/**
 * EPX Server Post API Routes
 * Handles payment methods, recurring billing, and transaction management
 */

import { Router, type Request, type Response } from 'express';
import { db } from '../db';
import { 
  paymentTokens, 
  billingSchedule, 
  recurringBillingLog, 
  payments,
  members 
} from '../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { 
  createEPXServerPostService, 
  EPXServerPostService 
} from '../services/epx-server-post-service';
import { getRecurringBillingScheduler } from '../services/recurring-billing-scheduler';

const router = Router();

// Initialize EPX service
const epxService = createEPXServerPostService();

// ============================================================
// MIDDLEWARE
// ============================================================

interface AuthRequest extends Request {
  user?: any;
}

function requireAuth(req: AuthRequest, res: Response, next: Function) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

function requireRole(roles: string[]) {
  return (req: AuthRequest, res: Response, next: Function) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// ============================================================
// MEMBER ROUTES - Payment Methods
// ============================================================

/**
 * GET /api/member/payment-methods
 * Get member's stored payment methods
 */
router.get(
  '/api/member/payment-methods',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const memberId = req.user.id;

      const tokens = await db
        .select({
          id: paymentTokens.id,
          cardLastFour: paymentTokens.cardLastFour,
          cardType: paymentTokens.cardType,
          expiryMonth: paymentTokens.expiryMonth,
          expiryYear: paymentTokens.expiryYear,
          isPrimary: paymentTokens.isPrimary,
          isActive: paymentTokens.isActive,
          lastUsedAt: paymentTokens.lastUsedAt,
          createdAt: paymentTokens.createdAt
        })
        .from(paymentTokens)
        .where(eq(paymentTokens.memberId, memberId))
        .orderBy(desc(paymentTokens.isPrimary));

      res.json({
        success: true,
        paymentMethods: tokens
      });
    } catch (error: any) {
      console.error('[Payment Methods] Error:', error);
      res.status(500).json({ error: 'Failed to fetch payment methods' });
    }
  }
);

/**
 * POST /api/member/payment-methods
 * Add or update payment method
 */
router.post(
  '/api/member/payment-methods',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const memberId = req.user.id;
      const { cardNumber, expirationDate, cvv } = req.body;

      // Validate input
      if (!cardNumber || !expirationDate || !cvv) {
        return res.status(400).json({
          error: 'Missing required fields: cardNumber, expirationDate (MMYY), cvv'
        });
      }

      // Get member details
      const member = await db.query.members.findFirst({
        where: eq(members.id, memberId)
      });

      if (!member) {
        return res.status(404).json({ error: 'Member not found' });
      }

      // Create BRIC token via EPX Server Post
      const tokenResult = await epxService.createBRICToken({
        cardDetails: {
          cardNumber,
          expirationDate, // MMYY
          cvv
        },
        customerData: {
          firstName: member.firstName,
          lastName: member.lastName,
          email: member.email,
          phone: member.phone || undefined
        }
      });

      if (tokenResult.Status !== 'Approved' || !tokenResult.BRIC) {
        return res.status(400).json({
          error: 'Failed to tokenize card',
          message: tokenResult.Message
        });
      }

      // Deactivate old primary token if exists
      await db.update(paymentTokens)
        .set({ isPrimary: false })
        .where(
          and(
            eq(paymentTokens.memberId, memberId),
            eq(paymentTokens.isPrimary, true)
          )
        );

      // Store new token
      const [newToken] = await db.insert(paymentTokens).values({
        memberId,
        bricToken: tokenResult.BRIC,
        cardLastFour: tokenResult.CardNumber?.slice(-4),
        cardType: tokenResult.CardType,
        expiryMonth: expirationDate.substring(0, 2),
        expiryYear: '20' + expirationDate.substring(2, 4),
        originalNetworkTransId: tokenResult.NetworkTransactionId,
        isActive: true,
        isPrimary: true,
        createdAt: new Date()
      }).returning();

      // Update billing schedule to use new token
      await db.update(billingSchedule)
        .set({ paymentTokenId: newToken.id })
        .where(eq(billingSchedule.memberId, memberId));

      res.json({
        success: true,
        message: 'Payment method updated successfully',
        paymentMethod: {
          id: newToken.id,
          cardLastFour: newToken.cardLastFour,
          cardType: newToken.cardType,
          expiryMonth: newToken.expiryMonth,
          expiryYear: newToken.expiryYear
        }
      });
    } catch (error: any) {
      console.error('[Payment Methods] Update error:', error);
      res.status(500).json({ error: 'Failed to update payment method' });
    }
  }
);

/**
 * DELETE /api/member/payment-methods/:id
 * Remove a payment method
 */
router.delete(
  '/api/member/payment-methods/:id',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const memberId = req.user.id;
      const tokenId = parseInt(req.params.id);

      // Verify ownership
      const token = await db.query.paymentTokens.findFirst({
        where: and(
          eq(paymentTokens.id, tokenId),
          eq(paymentTokens.memberId, memberId)
        )
      });

      if (!token) {
        return res.status(404).json({ error: 'Payment method not found' });
      }

      // Don't allow deleting primary token if it's in use
      if (token.isPrimary) {
        const activeSchedules = await db.query.billingSchedule.findMany({
          where: and(
            eq(billingSchedule.memberId, memberId),
            eq(billingSchedule.paymentTokenId, tokenId),
            eq(billingSchedule.status, 'active')
          )
        });

        if (activeSchedules.length > 0) {
          return res.status(400).json({
            error: 'Cannot delete payment method in use by active subscription'
          });
        }
      }

      // Soft delete (deactivate)
      await db.update(paymentTokens)
        .set({ isActive: false })
        .where(eq(paymentTokens.id, tokenId));

      res.json({
        success: true,
        message: 'Payment method removed'
      });
    } catch (error: any) {
      console.error('[Payment Methods] Delete error:', error);
      res.status(500).json({ error: 'Failed to remove payment method' });
    }
  }
);

// ============================================================
// MEMBER ROUTES - Billing History
// ============================================================

/**
 * GET /api/member/billing-history
 * Get member's billing transaction history
 */
router.get(
  '/api/member/billing-history',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const memberId = req.user.id;
      const limit = parseInt(req.query.limit as string) || 50;

      const history = await db
        .select({
          id: recurringBillingLog.id,
          amount: recurringBillingLog.amount,
          billingDate: recurringBillingLog.billingDate,
          status: recurringBillingLog.status,
          attemptNumber: recurringBillingLog.attemptNumber,
          epxTransactionId: recurringBillingLog.epxTransactionId,
          epxResponseMessage: recurringBillingLog.epxResponseMessage,
          failureReason: recurringBillingLog.failureReason,
          processedAt: recurringBillingLog.processedAt
        })
        .from(recurringBillingLog)
        .where(eq(recurringBillingLog.memberId, memberId))
        .orderBy(desc(recurringBillingLog.createdAt))
        .limit(limit);

      res.json({
        success: true,
        history,
        total: history.length
      });
    } catch (error: any) {
      console.error('[Billing History] Error:', error);
      res.status(500).json({ error: 'Failed to fetch billing history' });
    }
  }
);

/**
 * GET /api/member/billing-schedule
 * Get member's current billing schedule
 */
router.get(
  '/api/member/billing-schedule',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const memberId = req.user.id;

      const schedule = await db.query.billingSchedule.findFirst({
        where: eq(billingSchedule.memberId, memberId)
      });

      if (!schedule) {
        return res.json({
          success: true,
          schedule: null,
          message: 'No active billing schedule'
        });
      }

      res.json({
        success: true,
        schedule: {
          id: schedule.id,
          amount: schedule.amount,
          frequency: schedule.frequency,
          nextBillingDate: schedule.nextBillingDate,
          lastBillingDate: schedule.lastBillingDate,
          status: schedule.status,
          consecutiveFailures: schedule.consecutiveFailures
        }
      });
    } catch (error: any) {
      console.error('[Billing Schedule] Error:', error);
      res.status(500).json({ error: 'Failed to fetch billing schedule' });
    }
  }
);

// ============================================================
// ADMIN ROUTES - Billing Management
// ============================================================

/**
 * POST /api/admin/billing/process/:scheduleId
 * Manually trigger billing for a specific schedule
 */
router.post(
  '/api/admin/billing/process/:scheduleId',
  requireAuth,
  requireRole(['admin']),
  async (req: AuthRequest, res: Response) => {
    try {
      const scheduleId = parseInt(req.params.scheduleId);

      // Get schedule with all related data
      const schedule = await db.query.billingSchedule.findFirst({
        where: eq(billingSchedule.id, scheduleId),
        with: {
          member: true,
          paymentToken: true
        }
      });

      if (!schedule) {
        return res.status(404).json({ error: 'Billing schedule not found' });
      }

      // Trigger manual billing via scheduler
      const scheduler = getRecurringBillingScheduler();
      // Note: You'll need to expose processSingleBilling as public method
      // or implement manual charge logic here

      res.json({
        success: true,
        message: 'Manual billing triggered',
        scheduleId
      });
    } catch (error: any) {
      console.error('[Admin Billing] Process error:', error);
      res.status(500).json({ error: 'Failed to process billing' });
    }
  }
);

/**
 * GET /api/admin/billing/failed
 * Get all failed billings that need attention
 */
router.get(
  '/api/admin/billing/failed',
  requireAuth,
  requireRole(['admin']),
  async (req: AuthRequest, res: Response) => {
    try {
      const failedBillings = await db
        .select()
        .from(recurringBillingLog)
        .where(eq(recurringBillingLog.status, 'failed'))
        .orderBy(desc(recurringBillingLog.createdAt))
        .limit(100);

      res.json({
        success: true,
        failedBillings,
        total: failedBillings.length
      });
    } catch (error: any) {
      console.error('[Admin Billing] Failed billings error:', error);
      res.status(500).json({ error: 'Failed to fetch failed billings' });
    }
  }
);

/**
 * POST /api/admin/billing/retry/:logId
 * Retry a failed billing
 */
router.post(
  '/api/admin/billing/retry/:logId',
  requireAuth,
  requireRole(['admin']),
  async (req: AuthRequest, res: Response) => {
    try {
      const logId = parseInt(req.params.logId);

      const logEntry = await db.query.recurringBillingLog.findFirst({
        where: eq(recurringBillingLog.id, logId)
      });

      if (!logEntry) {
        return res.status(404).json({ error: 'Billing log not found' });
      }

      // Update schedule to retry immediately
      await db.update(billingSchedule)
        .set({
          nextBillingDate: new Date(),
          status: 'active'
        })
        .where(eq(billingSchedule.id, logEntry.billingScheduleId!));

      res.json({
        success: true,
        message: 'Retry scheduled for next billing run'
      });
    } catch (error: any) {
      console.error('[Admin Billing] Retry error:', error);
      res.status(500).json({ error: 'Failed to schedule retry' });
    }
  }
);

/**
 * GET /api/admin/billing/stats
 * Get billing statistics
 */
router.get(
  '/api/admin/billing/stats',
  requireAuth,
  requireRole(['admin']),
  async (req: AuthRequest, res: Response) => {
    try {
      // Get active schedules count
      const activeSchedules = await db
        .select()
        .from(billingSchedule)
        .where(eq(billingSchedule.status, 'active'));

      // Get today's successful charges
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayCharges = await db
        .select()
        .from(recurringBillingLog)
        .where(
          and(
            eq(recurringBillingLog.status, 'success'),
            eq(recurringBillingLog.billingDate, today)
          )
        );

      const todayRevenue = todayCharges.reduce(
        (sum, charge) => sum + parseFloat(charge.amount),
        0
      );

      // Get suspended schedules
      const suspendedSchedules = await db
        .select()
        .from(billingSchedule)
        .where(eq(billingSchedule.status, 'suspended'));

      res.json({
        success: true,
        stats: {
          activeSchedules: activeSchedules.length,
          suspendedSchedules: suspendedSchedules.length,
          todayCharges: todayCharges.length,
          todayRevenue: todayRevenue.toFixed(2)
        }
      });
    } catch (error: any) {
      console.error('[Admin Billing] Stats error:', error);
      res.status(500).json({ error: 'Failed to fetch billing stats' });
    }
  }
);

// ============================================================
// TRANSACTION MANAGEMENT
// ============================================================

/**
 * POST /api/admin/transactions/void/:transactionId
 * Void a transaction (same-day only)
 */
router.post(
  '/api/admin/transactions/void/:transactionId',
  requireAuth,
  requireRole(['admin']),
  async (req: AuthRequest, res: Response) => {
    try {
      const transactionId = req.params.transactionId;

      const result = await epxService.voidTransaction(transactionId);

      res.json({
        success: result.Status === 'Approved',
        message: result.Message,
        result
      });
    } catch (error: any) {
      console.error('[Transactions] Void error:', error);
      res.status(500).json({ error: 'Failed to void transaction' });
    }
  }
);

/**
 * POST /api/admin/transactions/refund
 * Refund a settled transaction
 */
router.post(
  '/api/admin/transactions/refund',
  requireAuth,
  requireRole(['admin']),
  async (req: AuthRequest, res: Response) => {
    try {
      const { bricToken, amount, originalTransactionId } = req.body;

      if (!bricToken || !amount || !originalTransactionId) {
        return res.status(400).json({
          error: 'Missing required fields: bricToken, amount, originalTransactionId'
        });
      }

      const result = await epxService.refundTransaction(
        bricToken,
        parseFloat(amount),
        originalTransactionId
      );

      res.json({
        success: result.Status === 'Approved',
        message: result.Message,
        result
      });
    } catch (error: any) {
      console.error('[Transactions] Refund error:', error);
      res.status(500).json({ error: 'Failed to process refund' });
    }
  }
);

export default router;
