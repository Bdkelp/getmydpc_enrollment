

import { Router, Request, Response } from 'express';
import { storage } from '../storage';
import { supabase } from '../lib/supabaseClient';
import { paymentEnvironment } from '../services/payment-environment-service';

const router = Router();

/**
 * Simple test endpoint to verify debug routing is working
 */
router.get('/api/debug/test', async (req: Request, res: Response) => {
  console.log('[Debug Test] Endpoint accessed');
  res.json({
    success: true,
    message: 'Debug routing is working',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

/**
 * Debug endpoint to check recent payment activity
 */
router.get('/api/debug/payments', async (req: Request, res: Response) => {
  try {
    console.log('[Debug Payments] Checking recent payment activity...');
    const currentEnvironment = await paymentEnvironment.getEnvironment();

    // Get recent payments from database - use direct supabase query
    const { data: recentPayments, error } = await supabase
      .from('payments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[Debug Payments] Database error:', error);
      throw error;
    }

    console.log('[Debug Payments] Found payments:', recentPayments?.length || 0);

    // Format payment data for analysis
    const paymentSummary = (recentPayments || []).map(payment => ({
      id: payment.id,
      transactionId: payment.transaction_id || payment.transactionId,
      userId: payment.user_id || payment.userId,
      amount: payment.amount,
      status: payment.status,
      paymentMethod: payment.payment_method || payment.paymentMethod,
      createdAt: payment.created_at || payment.createdAt,
      updatedAt: payment.updated_at || payment.updatedAt,
      environment: payment.metadata?.environment || 'unknown',
      hasMetadata: !!payment.metadata,
      metadataKeys: payment.metadata ? Object.keys(payment.metadata) : [],
      rawPayment: payment // Include raw data for debugging
    }));

    // Check for recent sandbox payments since Aug 14, 2024
    const aug14Date = new Date('2024-08-14');
    const sandboxPayments = paymentSummary.filter(p => {
      const paymentDate = new Date(p.createdAt);
      return p.environment === 'sandbox' && paymentDate > aug14Date;
    });

    // Also check for ANY payments since Aug 14
    const allPaymentsSinceAug14 = paymentSummary.filter(p => {
      const paymentDate = new Date(p.createdAt);
      return paymentDate > aug14Date;
    });

    // Get environment info
    const envInfo = {
      EPX_ENVIRONMENT: currentEnvironment,
      NODE_ENV: process.env.NODE_ENV,
      hasEPXConfig: !!(process.env.EPX_MAC && process.env.EPX_CUST_NBR),
      serverTime: new Date().toISOString()
    };

    res.json({
      success: true,
      summary: {
        totalPayments: paymentSummary.length,
        sandboxPaymentsSinceAug14: sandboxPayments.length,
        allPaymentsSinceAug14: allPaymentsSinceAug14.length,
        latestPayment: paymentSummary[0] || null,
        environment: envInfo,
        paymentsByEnvironment: {
          sandbox: paymentSummary.filter(p => p.environment === 'sandbox').length,
          production: paymentSummary.filter(p => p.environment === 'production').length,
          unknown: paymentSummary.filter(p => p.environment === 'unknown').length
        },
        paymentsByStatus: {
          pending: paymentSummary.filter(p => p.status === 'pending').length,
          completed: paymentSummary.filter(p => p.status === 'completed').length,
          failed: paymentSummary.filter(p => p.status === 'failed').length
        }
      },
      recentPayments: paymentSummary.slice(0, 10),
      sandboxPayments: sandboxPayments.slice(0, 10),
      allPaymentsSinceAug14: allPaymentsSinceAug14.slice(0, 10),
      debug: {
        note: 'If no payments appear here but you sent test payments, check the payment creation logs',
        possibleIssues: [
          'Payment creation failing before database insert',
          'Transaction ID mismatch between creation and webhook',
          'Storage service connection issues',
          'Missing environment variables',
          'EPX webhook not reaching the server',
          'Database connection issues during payment creation'
        ],
        recommendations: [
          'Check server logs during payment attempts',
          'Test the /api/debug/test-payment-creation endpoint',
          'Verify EPX webhook URL is correct',
          'Check network connectivity to payment processor'
        ]
      }
    });

  } catch (error: any) {
    console.error('[Debug Payments] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

/**
 * Debug endpoint to test payment creation
 */
router.post('/api/debug/test-payment-creation', async (req: Request, res: Response) => {
  try {
    console.log('[Debug] Testing payment creation...');
    const currentEnvironment = await paymentEnvironment.getEnvironment();

    const testPayment = {
      userId: 'debug-user-' + Date.now(),
      amount: '10.00',
      currency: 'USD',
      status: 'pending',
      paymentMethod: 'card',
      transactionId: 'DEBUG_' + Date.now(),
      metadata: {
        environment: currentEnvironment,
        debug: true,
        timestamp: new Date().toISOString()
      }
    };

    console.log('[Debug] Creating test payment:', testPayment);

    const result = await storage.createPayment(testPayment);

    console.log('[Debug] Test payment created:', result);

    res.json({
      success: true,
      message: 'Test payment created successfully',
      payment: result
    });

  } catch (error: any) {
    console.error('[Debug] Test payment creation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: 'Failed to create test payment - this indicates storage issues'
    });
  }
});

/**
 * Debug endpoint to check EPX configuration
 */
router.get('/api/debug/epx-config', async (req: Request, res: Response) => {
  try {
    console.log('[Debug EPX Config] Checking EPX configuration...');
    const currentEnvironment = await paymentEnvironment.getEnvironment();

    const config = {
      EPX_ENVIRONMENT: currentEnvironment,
      EPX_MAC: process.env.EPX_MAC ? `${process.env.EPX_MAC.substring(0, 8)}...` : 'NOT_SET',
      EPX_CUST_NBR: process.env.EPX_CUST_NBR || 'NOT_SET',
      EPX_MERCH_NBR: process.env.EPX_MERCH_NBR || 'NOT_SET',
      EPX_DBA_NBR: process.env.EPX_DBA_NBR || 'NOT_SET',
      EPX_TERMINAL_NBR: process.env.EPX_TERMINAL_NBR || 'NOT_SET',
      NODE_ENV: process.env.NODE_ENV || 'NOT_SET'
    };

    const issues = [];
    
    if (!process.env.EPX_MAC) {
      issues.push('EPX_MAC is not set');
    } else if (process.env.EPX_MAC.length !== 32) {
      issues.push(`EPX_MAC has incorrect length: ${process.env.EPX_MAC.length} (should be 32)`);
    }
    
    if (!process.env.EPX_CUST_NBR) {
      issues.push('EPX_CUST_NBR is not set');
    }
    
    if (!process.env.EPX_MERCH_NBR) {
      issues.push('EPX_MERCH_NBR is not set');
    }
    
    console.log('[Debug EPX Config] Configuration check completed');

    res.json({
      success: true,
      config,
      issues,
      hasIssues: issues.length > 0,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('[Debug EPX Config] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;

