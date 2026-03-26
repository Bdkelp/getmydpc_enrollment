/**
 * ACH Payment Routes
 * Handles bank account payment processing via EPX Server POST API (CKC2 transactions)
 */

import { Router, type Response } from 'express';
import { submitACHRecurringPayment } from '../services/epx-payment-service';
import { authenticateToken, type AuthRequest } from '../auth/supabaseAuth';
import { hasAtLeastRole } from '../auth/roles';
import { storage } from '../storage';
import { logEPX } from '../services/epx-payment-logger';
import { paymentEnvironment } from '../services/payment-environment-service';

const router = Router();

function maskLastFour(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.length > 4 ? `****${trimmed.slice(-4)}` : '****';
}

async function enforceACHCertificationAccess(req: AuthRequest, res: Response): Promise<boolean> {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
    return false;
  }

  if (!hasAtLeastRole(req.user.role, 'super_admin')) {
    logEPX({
      level: 'warn',
      phase: 'recurring',
      message: 'Blocked ACH access for non-super-admin user',
      data: {
        userId: req.user.id,
        role: req.user.role
      }
    });
    res.status(403).json({
      success: false,
      error: 'ACH testing is currently restricted to super admins only'
    });
    return false;
  }

  const environment = await paymentEnvironment.getEnvironment();
  if (environment !== 'sandbox') {
    logEPX({
      level: 'warn',
      phase: 'recurring',
      message: 'Blocked ACH access because payment environment is not sandbox',
      data: {
        userId: req.user.id,
        role: req.user.role,
        paymentEnvironment: environment
      }
    });
    res.status(409).json({
      success: false,
      error: 'ACH certification mode is disabled in production payment environment',
      paymentEnvironment: environment
    });
    return false;
  }

  return true;
}

/**
 * POST /api/payments/ach/initial
 * Initial ACH payment setup - creates AUTH_GUID token for recurring billing
 * 
 * TODO: This needs to be implemented based on EPX's recommended approach
 * Options:
 * 1. EPX Hosted Checkout for ACH (preferred if available)
 * 2. Direct CKC2 submission with bank account data
 */
router.post('/initial', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!(await enforceACHCertificationAccess(req, res))) {
      return;
    }

    const {
      memberId,
      amount,
      routingNumber,
      accountNumber,
      accountType,
      accountHolderName
    } = req.body;

    // Validate required fields
    if (!memberId || !amount || !routingNumber || !accountNumber || !accountType || !accountHolderName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: memberId, amount, routingNumber, accountNumber, accountType, accountHolderName'
      });
    }

    const numericMemberId = parseInt(String(memberId), 10);
    if (!Number.isFinite(numericMemberId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid memberId'
      });
    }

    // Validate amount
    const parsedAmount = parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be a positive number'
      });
    }

    // Validate routing number (9 digits)
    if (!/^\d{9}$/.test(routingNumber)) {
      return res.status(400).json({
        success: false,
        error: 'Routing number must be exactly 9 digits'
      });
    }

    // Validate account number (4-17 digits)
    if (!/^\d{4,17}$/.test(accountNumber)) {
      return res.status(400).json({
        success: false,
        error: 'Account number must be 4-17 digits'
      });
    }

    // Validate account type
    if (!['Checking', 'Savings'].includes(accountType)) {
      return res.status(400).json({
        success: false,
        error: 'Account type must be either Checking or Savings'
      });
    }

    // Get member data
    const member = await storage.getMember(numericMemberId);
    if (!member) {
      return res.status(404).json({
        success: false,
        error: 'Member not found'
      });
    }

    logEPX({
      level: 'info',
      phase: 'recurring',
      message: 'ACH initial setup requested',
      data: {
        memberId: member.id,
        amount: parsedAmount,
        paymentMethodType: 'ACH',
        accountType,
        routingNumberMasked: maskLastFour(routingNumber),
        accountNumberMasked: maskLastFour(accountNumber)
      }
    });

    const achTransactionId = `ACH-INIT-${member.id}-${Date.now()}`;

    // Submit initial ACH payment to EPX (CKC2)
    const result = await submitACHRecurringPayment({
      amount: parsedAmount,
      authGuid: member.paymentToken || '',
      member: member,
      bankAccountData: {
        routingNumber,
        accountNumber,
        accountType: accountType as 'Checking' | 'Savings',
        accountHolderName
      },
      transactionId: achTransactionId,
      description: `Initial ACH setup for ${member.firstName} ${member.lastName}`
    });

    if (result.success) {
      const authGuid = result.responseFields.AUTH_GUID
        || result.responseFields.ORIG_AUTH_GUID
        || null;
      const lastFour = accountNumber.slice(-4);

      await storage.updateMember(member.id, {
        paymentToken: authGuid,
        paymentMethodType: 'ACH',
        bankRoutingNumber: routingNumber,
        bankAccountNumber: accountNumber,
        bankAccountType: accountType,
        bankAccountHolderName: accountHolderName,
        bankAccountLastFour: lastFour
      });

      if (authGuid) {
        await storage.upsertMemberPaymentToken({
          memberId: member.id,
          paymentMethodType: 'ACH',
          token: authGuid,
          bankRoutingNumber: routingNumber,
          bankAccountLastFour: lastFour,
          bankAccountType: accountType,
        });
      }

      logEPX({
        level: 'info',
        phase: 'recurring',
        message: 'ACH initial setup approved',
        data: {
          memberId: member.id,
          paymentMethodType: 'ACH',
          transactionId: result.responseFields.TRAN_NBR || achTransactionId,
          authCode: result.responseFields.AUTH_CODE,
          responseCode: result.responseFields.AUTH_RESP,
          hasAuthGuid: Boolean(authGuid)
        }
      });

      return res.json({
        success: true,
        transactionId: result.responseFields.TRAN_NBR || achTransactionId,
        authGuid,
        hasAuthGuid: Boolean(authGuid),
        authCode: result.responseFields.AUTH_CODE || null,
        message: 'ACH payment authorized successfully'
      });
    } else {
      logEPX({
        level: 'warn',
        phase: 'recurring',
        message: 'ACH initial setup declined',
        data: {
          memberId: member.id,
          paymentMethodType: 'ACH',
          transactionId: achTransactionId,
          responseCode: result.responseFields.AUTH_RESP,
          responseMessage: result.responseFields.AUTH_RESP_TEXT || result.error || null
        }
      });

      return res.status(400).json({
        success: false,
        error: result.error || 'ACH payment authorization failed',
        responseCode: result.responseFields.AUTH_RESP || null,
        responseMessage: result.responseFields.AUTH_RESP_TEXT || null
      });
    }
  } catch (error: any) {
    console.error('[ACH Payment] Initial setup error:', error);
    logEPX({
      level: 'error',
      phase: 'recurring',
      message: 'ACH initial setup route failed',
      data: {
        error: error.message
      }
    });
    return res.status(500).json({
      success: false,
      error: 'Internal server error processing ACH payment',
      details: error.message
    });
  }
});

/**
 * POST /api/payments/ach/recurring
 * Process recurring ACH payment using stored AUTH_GUID token
 * This is for members who already have ACH set up
 */
router.post('/recurring', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!(await enforceACHCertificationAccess(req, res))) {
      return;
    }

    const {
      memberId,
      amount,
      description
    } = req.body;

    // Validate required fields
    if (!memberId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: memberId, amount'
      });
    }

    // Validate amount
    const parsedAmount = parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be a positive number'
      });
    }

    // Get member data
    const member = await storage.getMember(parseInt(memberId, 10));
    if (!member) {
      return res.status(404).json({
        success: false,
        error: 'Member not found'
      });
    }

    // Verify member has ACH payment method set up
    if (member.paymentMethodType !== 'ACH') {
      return res.status(400).json({
        success: false,
        error: 'Member does not have ACH payment method configured',
        message: 'Please set up ACH payment first'
      });
    }

    // Verify we have bank account data
    if (!member.bankRoutingNumber || !member.bankAccountNumber) {
      return res.status(400).json({
        success: false,
        error: 'Bank account information missing',
        message: 'Please update bank account details'
      });
    }

    // Submit recurring ACH payment
    const achTransactionId = `ACH-REC-${member.id}-${Date.now()}`;
    logEPX({
      level: 'info',
      phase: 'recurring',
      message: 'Submitting ACH recurring payment request',
      data: {
        memberId: member.id,
        amount: parsedAmount,
        paymentMethodType: 'ACH',
        accountType: member.bankAccountType || 'Checking',
        routingNumberMasked: maskLastFour(member.bankRoutingNumber),
        accountNumberMasked: maskLastFour(member.bankAccountNumber),
        transactionId: achTransactionId
      }
    });

    const result = await submitACHRecurringPayment({
      amount: parsedAmount,
      authGuid: member.paymentToken || '', // AUTH_GUID when available
      member: member,
      bankAccountData: {
        routingNumber: member.bankRoutingNumber,
        accountNumber: member.bankAccountNumber,
        accountType: (member.bankAccountType || 'Checking') as 'Checking' | 'Savings',
        accountHolderName: member.bankAccountHolderName || `${member.firstName} ${member.lastName}`
      },
      transactionId: achTransactionId,
      description: description || `Recurring ACH payment for ${member.firstName} ${member.lastName}`
    });

    if (result.success) {
      // Log payment in database
      // TODO: Create payment record in payments table
      logEPX({
        level: 'info',
        phase: 'recurring',
        message: 'ACH recurring payment approved',
        data: {
          memberId: member.id,
          paymentMethodType: 'ACH',
          transactionId: result.responseFields.TRAN_NBR || achTransactionId,
          authCode: result.responseFields.AUTH_CODE,
          responseCode: result.responseFields.AUTH_RESP,
          responseMessage: result.responseFields.AUTH_RESP_TEXT || null
        }
      });
      
      return res.json({
        success: true,
        transactionId: result.responseFields.TRAN_NBR,
        authCode: result.responseFields.AUTH_CODE,
        message: 'ACH recurring payment processed successfully',
        settlementNote: 'ACH payments typically settle in 3-5 business days'
      });
    } else {
      logEPX({
        level: 'warn',
        phase: 'recurring',
        message: 'ACH recurring payment declined',
        data: {
          memberId: member.id,
          paymentMethodType: 'ACH',
          transactionId: achTransactionId,
          responseCode: result.responseFields.AUTH_RESP,
          responseMessage: result.responseFields.AUTH_RESP_TEXT || result.error || null
        }
      });
      return res.status(400).json({
        success: false,
        error: result.error || 'ACH recurring payment failed',
        responseCode: result.responseFields.AUTH_RESP
      });
    }
  } catch (error: any) {
    console.error('[ACH Payment] Recurring payment error:', error);
    logEPX({
      level: 'error',
      phase: 'recurring',
      message: 'ACH recurring payment route failed',
      data: {
        error: error.message
      }
    });
    return res.status(500).json({
      success: false,
      error: 'Internal server error processing recurring ACH payment',
      details: error.message
    });
  }
});

/**
 * GET /api/payments/ach/member/:memberId
 * Get ACH payment method details for a member
 */
router.get('/member/:memberId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!(await enforceACHCertificationAccess(req, res))) {
      return;
    }

    const memberId = parseInt(req.params.memberId, 10);
    
    if (!Number.isFinite(memberId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid member ID'
      });
    }

    const member = await storage.getMember(memberId);
    if (!member) {
      return res.status(404).json({
        success: false,
        error: 'Member not found'
      });
    }

    // Only return safe data (no full account numbers)
    const hasACH = member.paymentMethodType === 'ACH' && !!member.bankAccountLastFour;
    
    return res.json({
      success: true,
      hasACH,
      hasAuthGuid: hasACH ? Boolean(member.paymentToken) : false,
      paymentMethod: member.paymentMethodType || 'none',
      bankAccountLastFour: hasACH ? member.bankAccountLastFour : null,
      bankAccountType: hasACH ? member.bankAccountType : null,
      routingNumberLastFour: hasACH && member.bankRoutingNumber 
        ? member.bankRoutingNumber.slice(-4) 
        : null
    });
  } catch (error: any) {
    console.error('[ACH Payment] Get member ACH details error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

export default router;
