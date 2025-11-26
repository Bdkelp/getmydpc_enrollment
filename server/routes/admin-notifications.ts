/**
 * Admin Notifications Routes
 * 
 * API endpoints for managing system notifications
 */

import { Router, Request, Response } from "express";
import { authenticateToken, AuthRequest } from "../auth/supabaseAuth";
import { supabase } from "../lib/supabaseClient";
import { EPXServerPostService } from "../services/epx-payment-service";

const router = Router();

/**
 * GET /api/admin/notifications
 * Get all notifications (filtered by status)
 */
router.get("/api/admin/notifications", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { filter = 'unresolved' } = req.query;
    
    let query = supabase
      .from('admin_notifications')
      .select('*')
      .order('created_at', { ascending: false });

    if (filter === 'unresolved') {
      query = query.eq('resolved', false);
    } else if (filter === 'resolved') {
      query = query.eq('resolved', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Admin Notifications] Query error:', error);
      return res.status(500).json({ error: 'Failed to fetch notifications' });
    }

    res.json(data || []);
  } catch (error: any) {
    console.error('[Admin Notifications] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch notifications' });
  }
});

/**
 * POST /api/admin/notifications/:id/resolve
 * Mark a notification as resolved
 */
router.post("/api/admin/notifications/:id/resolve", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const { data, error } = await supabase
      .from('admin_notifications')
      .update({
        resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: userId
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[Admin Notifications] Resolve error:', error);
      return res.status(500).json({ error: 'Failed to resolve notification' });
    }

    res.json({ success: true, notification: data });
  } catch (error: any) {
    console.error('[Admin Notifications] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to resolve notification' });
  }
});

/**
 * POST /api/admin/notifications/:id/retry-epx
 * Retry EPX subscription creation for a failed notification
 */
router.post("/api/admin/notifications/:id/retry-epx", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { subscriptionId } = req.body;

    if (!subscriptionId) {
      return res.status(400).json({ error: 'Subscription ID required' });
    }

    // Get subscription details
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*, members!inner(*)')
      .eq('id', subscriptionId)
      .single();

    if (subError || !subscription) {
      console.error('[Admin Notifications] Subscription not found:', subError);
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const member = subscription.members;

    if (!member || !member.payment_token) {
      return res.status(400).json({ error: 'Member or payment token not found' });
    }

    // Attempt to create EPX recurring subscription
    const epxService = new EPXServerPostService();
    const epxResult = await epxService.createSubscription({
      MerchantAccountCode: "DPCPRIMARY",
      Payment: {
        PaymentMethodType: member.payment_method_type || "CreditCard",
        PreviousPayment: {
          GUID: member.payment_token,
          Amount: subscription.amount,
        }
      },
      BillingSchedule: {
        Frequency: "Monthly",
        StartDate: member.first_payment_date || new Date().toISOString().split('T')[0],
        FailureOption: "Skip",
        RetryAttempts: 3,
      },
      SubscriptionName: `DPC - ${member.customer_number}`,
      CustomerEmail: member.email,
      CustomerName: `${member.first_name} ${member.last_name}`,
      CustomerAccountCode: member.customer_number,
    });

    if (epxResult.success && epxResult.data?.SubscriptionID) {
      // Update subscription with EPX ID
      await supabase
        .from('subscriptions')
        .update({ epx_subscription_id: epxResult.data.SubscriptionID })
        .eq('id', subscriptionId);

      // Mark notification as resolved
      await supabase
        .from('admin_notifications')
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: req.user?.id,
          metadata: {
            ...(typeof subscription.metadata === 'object' ? subscription.metadata : {}),
            epxSubscriptionId: epxResult.data.SubscriptionID,
            retrySuccess: true,
            retryDate: new Date().toISOString()
          }
        })
        .eq('id', id);

      res.json({
        success: true,
        epxSubscriptionId: epxResult.data.SubscriptionID,
        message: 'EPX subscription created successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: epxResult.error || 'Failed to create EPX subscription'
      });
    }
  } catch (error: any) {
    console.error('[Admin Notifications] Retry EPX error:', error);
    res.status(500).json({ error: error.message || 'Failed to retry EPX subscription' });
  }
});

export default router;
