
import { Router, Request, Response } from 'express';
import { storage } from '../storage';

const router = Router();

/**
 * Debug endpoint to check recent payment activity
 */
router.get('/api/debug/payments', async (req: Request, res: Response) => {
  try {
    console.log('[Debug Payments] Checking recent payment activity...');

    // Get recent payments from database
    const recentPayments = await storage.getPaymentsWithFilters({
      limit: 50
    });

    console.log('[Debug Payments] Found payments:', recentPayments.length);

    // Format payment data for analysis
    const paymentSummary = recentPayments.map(payment => ({
      id: payment.id,
      transactionId: payment.transactionId,
      userId: payment.userId,
      amount: payment.amount,
      status: payment.status,
      paymentMethod: payment.paymentMethod,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      environment: payment.metadata?.environment || 'unknown',
      hasMetadata: !!payment.metadata,
      metadataKeys: payment.metadata ? Object.keys(payment.metadata) : []
    }));

    // Check for recent sandbox payments
    const sandboxPayments = paymentSummary.filter(p => 
      p.environment === 'sandbox' && 
      new Date(p.createdAt) > new Date('2024-08-14')
    );

    // Get environment info
    const envInfo = {
      EPX_ENVIRONMENT: process.env.EPX_ENVIRONMENT || 'sandbox',
      NODE_ENV: process.env.NODE_ENV,
      hasEPXConfig: !!(process.env.EPX_MAC && process.env.EPX_CUST_NBR),
      serverTime: new Date().toISOString()
    };

    res.json({
      success: true,
      summary: {
        totalPayments: paymentSummary.length,
        sandboxPaymentsSinceAug14: sandboxPayments.length,
        latestPayment: paymentSummary[0] || null,
        environment: envInfo
      },
      recentPayments: paymentSummary.slice(0, 10),
      sandboxPayments: sandboxPayments.slice(0, 10),
      debug: {
        note: 'If no payments appear here but you sent test payments, check the payment creation logs',
        possibleIssues: [
          'Payment creation failing before database insert',
          'Transaction ID mismatch between creation and webhook',
          'Storage service connection issues',
          'Missing environment variables'
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

    const testPayment = {
      userId: 'debug-user-' + Date.now(),
      amount: '10.00',
      currency: 'USD',
      status: 'pending',
      paymentMethod: 'card',
      transactionId: 'DEBUG_' + Date.now(),
      metadata: {
        environment: process.env.EPX_ENVIRONMENT || 'sandbox',
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

export default router;
