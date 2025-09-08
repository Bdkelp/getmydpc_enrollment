
import { Router, Request, Response } from 'express';
import { storage } from '../storage';
import { supabase } from '../lib/supabaseClient';

const router = Router();

/**
 * Debug endpoint to check recent payment activity
 */
router.get('/api/debug/payments', async (req: Request, res: Response) => {
  try {
    console.log('[Debug Payments] Checking recent payment activity...');

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



/**
 * Debug endpoint to analyze payment flow and logging
 */
router.get('/api/debug/payment-flow-analysis', async (req: Request, res: Response) => {
  try {
    console.log('[Debug] Analyzing payment flow and logging...');

    // Check recent server logs for payment-related activity
    const serverLogs: any[] = [];
    
    // Get payments from database with detailed analysis
    const { data: allPayments, error } = await supabase
      .from('payments')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Debug] Error fetching payments:', error);
      throw error;
    }

    const payments = allPayments || [];
    
    // Analyze payment creation patterns
    const paymentAnalysis = {
      totalPayments: payments.length,
      paymentsByDate: {} as Record<string, number>,
      paymentsByStatus: {} as Record<string, number>,
      paymentsByEnvironment: {} as Record<string, number>,
      paymentsByMethod: {} as Record<string, number>,
      recentPaymentActivity: payments.slice(0, 20).map(p => ({
        id: p.id,
        transactionId: p.transaction_id,
        amount: p.amount,
        status: p.status,
        method: p.payment_method,
        environment: p.metadata?.environment || 'unknown',
        createdAt: p.created_at,
        hasWebhookData: !!(p.metadata?.epxResponse || p.metadata?.bricToken),
        metadataKeys: Object.keys(p.metadata || {})
      }))
    };

    // Group payments by date
    payments.forEach(payment => {
      const date = new Date(payment.created_at).toISOString().split('T')[0];
      paymentAnalysis.paymentsByDate[date] = (paymentAnalysis.paymentsByDate[date] || 0) + 1;
      
      paymentAnalysis.paymentsByStatus[payment.status] = (paymentAnalysis.paymentsByStatus[payment.status] || 0) + 1;
      
      const env = payment.metadata?.environment || 'unknown';
      paymentAnalysis.paymentsByEnvironment[env] = (paymentAnalysis.paymentsByEnvironment[env] || 0) + 1;
      
      const method = payment.payment_method || 'unknown';
      paymentAnalysis.paymentsByMethod[method] = (paymentAnalysis.paymentsByMethod[method] || 0) + 1;
    });

    // Check for missing payments since Aug 14
    const aug14Date = new Date('2024-08-14');
    const recentPayments = payments.filter(p => new Date(p.created_at) > aug14Date);
    
    // EPX service status
    const epxStatus = {
      initialized: true, // We know it's initialized from the logs
      environment: process.env.EPX_ENVIRONMENT || 'sandbox',
      hasRequiredConfig: !!(process.env.EPX_MAC && process.env.EPX_CUST_NBR),
      webhookUrl: process.env.EPX_RESPONSE_URL,
      baseUrl: process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : 'unknown'
    };

    res.json({
      success: true,
      analysis: paymentAnalysis,
      epxStatus,
      findings: {
        hasRecentPayments: recentPayments.length > 0,
        missingPaymentsSinceAug14: recentPayments.length === 0,
        mostRecentPayment: payments[0] || null,
        potentialIssues: recentPayments.length === 0 ? [
          'No payments recorded since Aug 14, 2024',
          'Payment creation may be failing before database insert',
          'EPX webhook may not be reaching the server',
          'Transaction logging may not be working properly'
        ] : []
      },
      recommendations: recentPayments.length === 0 ? [
        'Test payment creation with /api/debug/test-payment-creation',
        'Check EPX webhook configuration',
        'Monitor server logs during payment attempts',
        'Verify network connectivity to EPX servers'
      ] : []
    });

  } catch (error: any) {
    console.error('[Debug] Payment flow analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

/**
 * Debug endpoint to trace a specific payment flow
 */
router.get('/api/debug/trace-payment/:transactionId', async (req: Request, res: Response) => {
  try {
    const { transactionId } = req.params;
    console.log('[Debug] Tracing payment flow for transaction:', transactionId);

    const payment = await storage.getPaymentByTransactionId(transactionId);
    
    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found',
        transactionId,
        note: 'This could mean the payment was never created or the transaction ID is incorrect'
      });
    }

    // Analyze the payment record
    const trace = {
      payment: {
        id: payment.id,
        transactionId: payment.transactionId || payment.transaction_id,
        status: payment.status,
        amount: payment.amount,
        createdAt: payment.createdAt || payment.created_at,
        updatedAt: payment.updatedAt || payment.updated_at
      },
      metadata: payment.metadata || {},
      timeline: [],
      issues: [],
      webhookStatus: 'unknown'
    };

    // Check for webhook processing
    if (payment.metadata?.epxResponse) {
      trace.webhookStatus = 'processed';
      trace.timeline.push({
        event: 'webhook_received',
        timestamp: payment.metadata?.webhookProcessedAt || 'unknown',
        data: payment.metadata.epxResponse
      });
    } else {
      trace.webhookStatus = 'missing';
      trace.issues.push('No webhook response data found in payment metadata');
    }

    // Check for authorization data
    if (payment.authorizationCode) {
      trace.timeline.push({
        event: 'payment_authorized',
        authCode: payment.authorizationCode,
        timestamp: payment.updatedAt || payment.updated_at
      });
    } else if (payment.status === 'completed') {
      trace.issues.push('Payment marked as completed but no authorization code found');
    }

    res.json({
      success: true,
      trace,
      analysis: {
        hasWebhookData: !!payment.metadata?.epxResponse,
        hasAuthCode: !!payment.authorizationCode,
        statusConsistent: payment.status === 'completed' ? !!payment.authorizationCode : true,
        metadataComplete: !!(payment.metadata?.environment && payment.metadata?.timestamp)
      }
    });

  } catch (error: any) {
    console.error('[Debug] Payment trace error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
