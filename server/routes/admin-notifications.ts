/**
 * Admin Notifications Routes
 * 
 * API endpoints for managing system notifications
 */

import { Router, Request, Response } from "express";
import { authenticateToken, AuthRequest } from "../auth/supabaseAuth";
import { supabase } from "../lib/supabaseClient";

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

export default router;
