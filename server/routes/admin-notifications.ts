/**
 * Admin Notifications Routes
 * 
 * API endpoints for managing system notifications
 */

import { Router, Request, Response } from "express";
import { authenticateToken, AuthRequest } from "../auth/supabaseAuth";
import { supabase } from "../lib/supabaseClient";
import { createRecurringSubscription, recordEpxSubscriptionFailure, resolveEpxSubscriptionFailure } from "../services/epx-recurring-billing";

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

    const subscriptionIdNumber = typeof subscriptionId === 'number' ? subscriptionId : parseInt(String(subscriptionId), 10);

    if (Number.isNaN(subscriptionIdNumber)) {
      return res.status(400).json({ error: 'Invalid subscription ID' });
    }

    // Get subscription details
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*, members!inner(*)')
      .eq('id', subscriptionIdNumber)
      .single();

    if (subError || !subscription) {
      console.error('[Admin Notifications] Subscription not found:', subError);
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const member = subscription.members;

    if (!member || !member.payment_token) {
      return res.status(400).json({ error: 'Member or payment token not found' });
    }

    // Attempt to create EPX recurring subscription via helper
    const retryResult = await createRecurringSubscription({
      member,
      subscriptionId: subscriptionIdNumber,
      amount: subscription.amount,
      billingDate: member.first_payment_date || new Date().toISOString(),
      paymentToken: member.payment_token,
      paymentMethodType: member.payment_method_type,
      source: 'admin-retry'
    });

    if (retryResult.success && retryResult.epxSubscriptionId) {
      await resolveEpxSubscriptionFailure({
        subscriptionId: subscriptionIdNumber,
        resolvedBy: req.user?.id,
        epxSubscriptionId: retryResult.epxSubscriptionId,
      });

      await supabase
        .from('admin_notifications')
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: req.user?.id,
          metadata: {
            epxSubscriptionId: retryResult.epxSubscriptionId,
            retrySuccess: true,
            retryDate: new Date().toISOString(),
            source: 'admin-retry'
          }
        })
        .eq('id', id);

      return res.json({
        success: true,
        epxSubscriptionId: retryResult.epxSubscriptionId,
        message: 'EPX subscription created successfully'
      });
    }

    await recordEpxSubscriptionFailure({
      subscriptionId: subscriptionIdNumber,
      memberId: member.id,
      error: retryResult.error || 'Failed to create EPX subscription',
      source: 'admin-retry'
    });

    res.status(500).json({
      success: false,
      error: retryResult.error || 'Failed to create EPX subscription'
    });
  } catch (error: any) {
    console.error('[Admin Notifications] Retry EPX error:', error);
    res.status(500).json({ error: error.message || 'Failed to retry EPX subscription' });
  }
});

export default router;
