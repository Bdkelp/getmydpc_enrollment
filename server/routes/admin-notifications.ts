/**
 * Admin Notifications Routes
 * 
 * API endpoints for managing system notifications
 */

import { Router, Request, Response } from "express";
import { authenticateToken, AuthRequest } from "../auth/supabaseAuth";
import * as storage from "../storage";

const router = Router();

/**
 * GET /api/admin/notifications
 * Get all notifications (filtered by status)
 */
router.get("/api/admin/notifications", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { filter = 'unresolved', limit = '50' } = req.query;
    
    if (filter === 'unresolved') {
      const notifications = await storage.getUnresolvedNotifications(parseInt(String(limit)));
      return res.json({
        success: true,
        notifications,
        total: notifications.length
      });
    }

    // For other filters, use supabase directly
    const { supabase } = await import("../lib/supabaseClient");
    let query = supabase
      .from('admin_notifications')
      .select(`
        *,
        members:member_id (
          id,
          first_name,
          last_name,
          email,
          customer_number
        )
      `)
      .order('created_at', { ascending: false })
      .limit(parseInt(String(limit)));

    if (filter === 'resolved') {
      query = query.eq('resolved', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Admin Notifications] Query error:', error);
      return res.status(500).json({ error: 'Failed to fetch notifications' });
    }

    res.json({
      success: true,
      notifications: data || [],
      total: data?.length || 0
    });
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

    if (!userId) {
      return res.status(401).json({ error: 'User ID required' });
    }

    await storage.resolveAdminNotification(parseInt(id), userId);

    res.json({ success: true, message: 'Notification resolved' });
  } catch (error: any) {
    console.error('[Admin Notifications] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to resolve notification' });
  }
});

/**
 * GET /api/admin/notifications/count
 * Get count of unresolved notifications
 */
router.get("/api/admin/notifications/count", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const notifications = await storage.getUnresolvedNotifications(1000);
    res.json({
      success: true,
      count: notifications.length
    });
  } catch (error: any) {
    console.error('[Admin Notifications] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to count notifications' });
  }
});

export default router;
