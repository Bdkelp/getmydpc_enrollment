/**
 * ACH Payment Routes
 * Handles bank account payment processing via EPX Server POST API (CKC2 transactions)
 */

import { Router } from 'express';
import { submitACHRecurringPayment } from '../services/epx-payment-service';
import { authenticateToken, type AuthRequest } from '../auth/supabaseAuth';
import { storage } from '../storage';

const router = Router();

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
    const member = await storage.getMember(parseInt(memberId, 10));
    if (!member) {
      return res.status(404).json({
        success: false,
        error: 'Member not found'
      });
    }

    // TODO: Implement EPX initial ACH setup based on their documentation
    // This is a placeholder - update after EPX confirms the approach
    
    // PLACEHOLDER RESPONSE - Remove after implementation
    console.log('[ACH Payment] Initial ACH setup requested for member:', {
      memberId: member.id,
      customerNumber: member.customerNumber,
      amount: parsedAmount,
      accountType
    });

    return res.status(501).json({
      success: false,
      error: 'ACH initial setup not yet implemented - awaiting EPX documentation',
      message: 'Please contact support for assistance with ACH payments',
      technicalNote: 'Implementation pending EPX confirmation on initial ACH authorization flow'
    });

    // FUTURE IMPLEMENTATION (uncomment after EPX guidance):
    /*
    // Submit initial ACH payment to EPX
    const result = await submitACHRecurringPayment({
      amount: parsedAmount,
      authGuid: '', // For initial payment, this may be empty or require different flow
      member: member,
      bankAccountData: {
        routingNumber,
        accountNumber,
        accountType: accountType as 'Checking' | 'Savings',
        accountHolderName
      },
      transactionId: `ACH-INIT-${member.id}-${Date.now()}`,
      description: `Initial ACH setup for ${member.firstName} ${member.lastName}`
    });

    if (result.success) {
      // Extract AUTH_GUID from EPX response
      const authGuid = result.responseFields.AUTH_GUID;
      
      // Store bank account details and AUTH_GUID in member record
      const lastFour = accountNumber.slice(-4);
      await storage.updateMember(member.id, {
        paymentToken: authGuid,
        paymentMethodType: 'ACH',
        bankRoutingNumber: routingNumber,
        bankAccountNumber: accountNumber, // Should be encrypted
        bankAccountType: accountType,
        bankAccountHolderName: accountHolderName,
        bankAccountLastFour: lastFour
      });

      return res.json({
        success: true,
        transactionId: result.responseFields.TRAN_NBR,
        authGuid: authGuid,
        message: 'ACH payment authorized successfully'
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.error || 'ACH payment authorization failed'
      });
    }
    */
  } catch (error: any) {
    console.error('[ACH Payment] Initial setup error:', error);
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
    if (member.paymentMethodType !== 'ACH' || !member.paymentToken) {
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
    const result = await submitACHRecurringPayment({
      amount: parsedAmount,
      authGuid: member.paymentToken, // AUTH_GUID from initial setup
      member: member,
      bankAccountData: {
        routingNumber: member.bankRoutingNumber,
        accountNumber: member.bankAccountNumber,
        accountType: (member.bankAccountType || 'Checking') as 'Checking' | 'Savings',
        accountHolderName: member.bankAccountHolderName || `${member.firstName} ${member.lastName}`
      },
      transactionId: `ACH-REC-${member.id}-${Date.now()}`,
      description: description || `Recurring ACH payment for ${member.firstName} ${member.lastName}`
    });

    if (result.success) {
      // Log payment in database
      // TODO: Create payment record in payments table
      
      return res.json({
        success: true,
        transactionId: result.responseFields.TRAN_NBR,
        authCode: result.responseFields.AUTH_CODE,
        message: 'ACH recurring payment processed successfully',
        settlementNote: 'ACH payments typically settle in 3-5 business days'
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.error || 'ACH recurring payment failed',
        responseCode: result.responseFields.AUTH_RESP
      });
    }
  } catch (error: any) {
    console.error('[ACH Payment] Recurring payment error:', error);
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
    const hasACH = member.paymentMethodType === 'ACH' && !!member.paymentToken;
    
    return res.json({
      success: true,
      hasACH,
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
