/**
 * EPX Recurring Billing Routes
 * Test endpoints for EPX Recurring Billing API certification
 */

import { Router, Response } from "express";
import { getEPXService, EPXCreateSubscriptionRequest } from "../services/epx-payment-service";
import { authenticateToken, AuthRequest } from "../auth/supabaseAuth";

const router = Router();

/**
 * Test endpoint for EPX Recurring Billing certification
 * Creates a test subscription using EPX test card data
 * 
 * POST /api/epx/test-recurring
 * 
 * Example curl request:
 * curl -X POST https://your-domain.com/api/epx/test-recurring \
 *   -H "Content-Type: application/json" \
 *   -H "Authorization: Bearer YOUR_TOKEN" \
 *   -d '{
 *     "amount": 10.99,
 *     "frequency": "Monthly",
 *     "billingDate": "2025-12-01"
 *   }'
 */
router.post("/api/epx/test-recurring", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { amount, frequency, billingDate } = req.body;

    // Default test values
    const testAmount = amount || 10.99;
    const testFrequency = frequency || "Monthly";
    const testBillingDate = billingDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 7 days from now

    // EPX test credit card (from EPX documentation)
    // Card: 4111111111111111 (Visa test card)
    // Exp: 2 years from now in YYMM format
    const now = new Date();
    const expYear = (now.getFullYear() + 2) % 100; // Last 2 digits
    const expMonth = String(now.getMonth() + 1).padStart(2, '0');
    const expirationDate = `${expYear}${expMonth}`;

    const testRequest: EPXCreateSubscriptionRequest = {
      CustomerData: {
        FirstName: "Test",
        LastName: "User",
        Phone: "1234567890",
        Email: "test@example.com"
      },
      PaymentMethod: {
        CreditCardData: {
          AccountNumber: "4111111111111111", // Visa test card
          ExpirationDate: expirationDate,
          CVV: "123",
          FirstName: "Test",
          LastName: "User",
          PostalCode: "12345",
          StreetAddress: "123 Test Street"
        }
      },
      SubscriptionData: {
        Amount: testAmount,
        Frequency: testFrequency as 'Weekly' | 'BiWeekly' | 'Monthly',
        BillingDate: testBillingDate,
        FailureOption: "Forward",
        NumberOfPayments: 3,
        Retries: 1,
        Description: "EPX Certification Test Subscription"
      }
    };

    console.log('[EPX Test Recurring] Creating test subscription with EPX test card data');

    const epxService = getEPXService();
    const result = await epxService.createSubscription(testRequest);

    if (result.success) {
      console.log('[EPX Test Recurring] Test subscription created successfully');
      console.log(result.data);
      res.json({
        success: true,
        message: "Test subscription created successfully",
        subscriptionId: result.data?.id,
        status: result.data?.Status,
        paymentsRemaining: result.data?.PaymentsRemaining,
        verifyResult: result.data?.VerifyResult,
        data: result.data
      });
    } else {
      console.error('[EPX Test Recurring] Test subscription failed:', result.error);
      res.status(400).json({
        success: false,
        error: result.error || "Failed to create test subscription"
      });
    }
  } catch (error: any) {
    console.error('[EPX Test Recurring] Exception:', error);
    res.status(500).json({
      success: false,
      error: error.message || "Internal server error"
    });
  }
});

/**
 * Create production recurring subscription
 * POST /api/epx/recurring/create
 * 
 * Requires authentication and full subscription details
 */
router.post("/api/epx/recurring/create", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const requestData: EPXCreateSubscriptionRequest = req.body;

    // Validate required fields
    if (!requestData.CustomerData || !requestData.PaymentMethod || !requestData.SubscriptionData) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: CustomerData, PaymentMethod, and SubscriptionData are required"
      });
    }

    console.log('[EPX Recurring] Creating subscription for customer:', requestData.CustomerData.Email);

    const epxService = getEPXService();
    const result = await epxService.createSubscription(requestData);

    if (result.success) {
      res.json({
        success: true,
        message: "Subscription created successfully",
        subscriptionId: result.data?.id,
        status: result.data?.Status,
        paymentsRemaining: result.data?.PaymentsRemaining,
        verifyResult: result.data?.VerifyResult
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || "Failed to create subscription"
      });
    }
  } catch (error: any) {
    console.error('[EPX Recurring] Create subscription error:', error);
    res.status(500).json({
      success: false,
      error: error.message || "Internal server error"
    });
  }
});

/**
 * Pay a subscription bill manually
 * POST /api/epx/recurring/pay-bill
 */
router.post("/api/epx/recurring/pay-bill", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { billId } = req.body;

    if (!billId) {
      return res.status(400).json({
        success: false,
        error: "BillID is required"
      });
    }

    const epxService = getEPXService();
    const result = await epxService.payBill({ BillID: billId });

    if (result.success) {
      res.json({
        success: true,
        message: "Bill paid successfully",
        payment: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || "Failed to pay bill"
      });
    }
  } catch (error: any) {
    console.error('[EPX Recurring] Pay bill error:', error);
    res.status(500).json({
      success: false,
      error: error.message || "Internal server error"
    });
  }
});

/**
 * Get subscription details
 * GET /api/epx/recurring/subscription/:id
 */
router.get("/api/epx/recurring/subscription/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const subscriptionId = parseInt(req.params.id);

    if (isNaN(subscriptionId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid subscription ID"
      });
    }

    const epxService = getEPXService();
    const result = await epxService.getSubscription(subscriptionId);

    if (result.success) {
      res.json({
        success: true,
        subscription: result.data
      });
    } else {
      res.status(404).json({
        success: false,
        error: result.error || "Subscription not found"
      });
    }
  } catch (error: any) {
    console.error('[EPX Recurring] Get subscription error:', error);
    res.status(500).json({
      success: false,
      error: error.message || "Internal server error"
    });
  }
});

/**
 * Cancel subscription
 * POST /api/epx/recurring/cancel
 */
router.post("/api/epx/recurring/cancel", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { subscriptionId } = req.body;

    if (!subscriptionId) {
      return res.status(400).json({
        success: false,
        error: "SubscriptionID is required"
      });
    }

    const epxService = getEPXService();
    const result = await epxService.cancelSubscription(subscriptionId);

    if (result.success) {
      res.json({
        success: true,
        message: "Subscription canceled successfully",
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || "Failed to cancel subscription"
      });
    }
  } catch (error: any) {
    console.error('[EPX Recurring] Cancel subscription error:', error);
    res.status(500).json({
      success: false,
      error: error.message || "Internal server error"
    });
  }
});

/**
 * Pause/Resume subscription
 * POST /api/epx/recurring/pause
 */
router.post("/api/epx/recurring/pause", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { subscriptionId, paused } = req.body;

    if (!subscriptionId || typeof paused !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: "SubscriptionID and paused (boolean) are required"
      });
    }

    const epxService = getEPXService();
    const result = await epxService.pauseResumeSubscription(subscriptionId, paused);

    if (result.success) {
      res.json({
        success: true,
        message: paused ? "Subscription paused successfully" : "Subscription resumed successfully",
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || "Failed to update subscription"
      });
    }
  } catch (error: any) {
    console.error('[EPX Recurring] Pause/resume subscription error:', error);
    res.status(500).json({
      success: false,
      error: error.message || "Internal server error"
    });
  }
});

export default router;
