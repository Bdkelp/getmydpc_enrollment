/**
 * INTEGRATION GUIDE: Adding Recurring Payout Creation to EPX Callbacks
 * 
 * This shows where to add the createPayoutsForMemberPayment() call
 * in your EPX hosted checkout callback/webhook handlers.
 */

// Example location: server/routes/epx-hosted-routes.ts
// In the success callback after payment is captured:

import { createPayoutsForMemberPayment } from '../services/commission-payout-service';

// BEFORE (existing code):
// After payment success, you create commission record...
// const { data: newCommission, error: commissionError } = await supabase
//   .from('agent_commissions')
//   .insert({ ... })
//   .select()
//   .single();

// AFTER (add this):
// Create monthly payouts for all commissions (direct + override)
try {
  const payoutResult = await createPayoutsForMemberPayment(
    parseInt(memberId), // Member ID
    paymentRecordId,    // Payment record ID from payments table
    epxTransactionId,   // EPX transaction/authorization GUID
    new Date()          // Payment captured timestamp
  );
  
  logEPX({
    level: 'info',
    phase: 'callback',
    message: '✅ Created monthly payouts for commissions',
    data: {
      memberId,
      directPayouts: payoutResult.direct.length,
      overridePayouts: payoutResult.override.length,
      totalPayouts: payoutResult.direct.length + payoutResult.override.length
    }
  });
} catch (payoutError: any) {
  logEPX({
    level: 'error',
    phase: 'callback',
    message: 'Failed to create monthly payouts',
    data: { error: payoutError.message, memberId }
  });
  // Don't fail the payment if payout creation fails
  // Can be retried manually by admin
}

// ============================================================
// EXACT INTEGRATION POINTS IN YOUR CODEBASE:
// ============================================================

/**
 * 1. INITIAL ENROLLMENT (First Payment)
 * Location: server/routes/epx-hosted-routes.ts
 * Search for: "Commission created successfully via callback"
 * Add after: Commission creation success log
 */

/**
 * 2. RECURRING MONTHLY PAYMENTS (EPX Webhook)
 * Location: server/routes/epx-hosted-routes.ts or dedicated webhook handler
 * Event: EPX sends notification when recurring payment is captured
 * Add: Call createPayoutsForMemberPayment() in webhook handler
 * 
 * Note: You may need to create a new webhook endpoint if EPX recurring
 * payments use a different callback URL than initial enrollment.
 */

// EXAMPLE RECURRING PAYMENT WEBHOOK HANDLER:
router.post('/api/epx/recurring-payment-webhook', async (req, res) => {
  try {
    const { member_id, transaction_id, amount, payment_date } = req.body;
    
    // Verify EPX signature/authentication here...
    
    // Log the recurring payment
    logEPX({
      level: 'info',
      phase: 'recurring-webhook',
      message: 'Received recurring payment notification',
      data: { member_id, transaction_id, amount }
    });
    
    // Find or create payment record
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert({
        member_id: parseInt(member_id),
        amount: parseFloat(amount),
        transaction_id: transaction_id,
        status: 'succeeded',
        payment_method_type: 'CreditCard',
        created_at: payment_date || new Date().toISOString()
      })
      .select()
      .single();
    
    if (paymentError) {
      throw new Error(`Failed to create payment record: ${paymentError.message}`);
    }
    
    // Create monthly payouts for all commissions (BOTH direct and override)
    const payoutResult = await createPayoutsForMemberPayment(
      parseInt(member_id),
      payment.id,
      transaction_id,
      new Date(payment_date || new Date())
    );
    
    logEPX({
      level: 'info',
      phase: 'recurring-webhook',
      message: '✅ Recurring payment and payouts processed',
      data: {
        memberId: member_id,
        paymentId: payment.id,
        directPayouts: payoutResult.direct.length,
        overridePayouts: payoutResult.override.length
      }
    });
    
    res.json({ success: true, message: 'Recurring payment processed' });
    
  } catch (error: any) {
    logEPX({
      level: 'error',
      phase: 'recurring-webhook',
      message: 'Error processing recurring payment',
      data: { error: error.message }
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// TESTING THE INTEGRATION:
// ============================================================

/**
 * Test Steps:
 * 
 * 1. Create test enrollment with downline agent structure:
 *    - Agent A (downline): upline_agent_id = Agent B
 *    - Agent B (upline): override_commission_rate = 10.00
 * 
 * 2. Process initial payment:
 *    - Should create 2 commissions (direct + override)
 *    - Should create 2 payouts (direct + override)
 * 
 * 3. Simulate recurring payment (month 2):
 *    - Call webhook endpoint or manually call createPayoutsForMemberPayment()
 *    - Should create 2 more payouts for the new month
 * 
 * 4. Check commission_payouts table:
 *    SELECT * FROM commission_payouts 
 *    WHERE commission_id IN (
 *      SELECT id FROM agent_commissions WHERE member_id = 'test-member-id'
 *    )
 *    ORDER BY payout_month, commission_type;
 * 
 * Expected result:
 *   Month 1: 2 payouts (1 direct, 1 override)
 *   Month 2: 2 payouts (1 direct, 1 override)
 * 
 * 5. Test weekly batch:
 *    - Run: await getEligiblePayouts(new Date())
 *    - Should return payouts past their payment_eligible_date
 *    - Mark as paid: await markPayoutsAsPaid(ids, new Date(), 'BATCH-TEST')
 */
