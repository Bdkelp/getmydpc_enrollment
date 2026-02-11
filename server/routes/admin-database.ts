import { Router, Request, Response } from 'express';
import { neonPool } from '../lib/neonDb';
import { authenticateToken, type AuthRequest } from '../auth/supabaseAuth';
import { isAtLeastAdmin } from '../auth/roles';
import { storage } from '../storage';

const router = Router();

const mapMemberRecord = (row: Record<string, any>) => ({
  id: row.id,
  firstName: row.first_name,
  lastName: row.last_name,
  email: row.email,
  phone: row.phone,
  address: row.address,
  address2: row.address2,
  city: row.city,
  state: row.state,
  zipCode: row.zip_code,
  customerNumber: row.customer_number,
  memberPublicId: row.member_public_id,
  planId: row.plan_id,
  planStartDate: row.plan_start_date,
  membershipStartDate: row.membership_start_date,
  totalMonthlyPrice: row.total_monthly_price,
  status: row.status,
  isActive: row.is_active,
  cancellationDate: row.cancellation_date,
  cancellationReason: row.cancellation_reason,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapSubscriptionRecord = (row: Record<string, any>) => ({
  id: row.id,
  planId: row.plan_id,
  planName: row.plan_name,
  status: row.status,
  startDate: row.start_date,
  nextBillingDate: row.next_billing_date,
  cancellationDate: row.cancellation_date,
  createdAt: row.created_at,
});

/**
 * Get statistics for all database tables
 */
router.get('/api/admin/database/stats', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (!isAtLeastAdmin(req.user?.role)) {
    return res.status(403).json({ message: 'Admin access required' });
  }

  try {
    console.log('[Admin Database] Fetching database statistics for admin:', req.user!.email);

    // Get counts from main tables
    const queries = [
      { table: 'users', query: 'SELECT COUNT(*) as count FROM users' },
      { table: 'members', query: 'SELECT COUNT(*) as count FROM members' },
      { table: 'leads', query: 'SELECT COUNT(*) as count FROM leads' },
      { table: 'subscriptions', query: 'SELECT COUNT(*) as count FROM subscriptions' },
      { table: 'payments', query: 'SELECT COUNT(*) as count FROM payments' },
      { table: 'plans', query: 'SELECT COUNT(*) as count FROM plans' },
    ];

    const stats = await Promise.all(
      queries.map(async ({ table, query }) => {
        try {
          const result = await neonPool.query(query);
          return {
            table,
            count: parseInt(result.rows[0]?.count || '0'),
          };
        } catch (error: any) {
          console.error(`[Admin Database] Error getting count for ${table}:`, error.message);
          return {
            table,
            count: 0,
            error: error.message,
          };
        }
      })
    );

    console.log('[Admin Database] Stats retrieved:', stats);
    res.json(stats);
  } catch (error: any) {
    console.error('[Admin Database] Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch database statistics',
    });
  }
});

/**
 * Get data from a specific table
 */
router.get('/api/admin/database/:table', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (!isAtLeastAdmin(req.user?.role)) {
    return res.status(403).json({ message: 'Admin access required' });
  }

  try {
    const { table } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    console.log(`[Admin Database] Fetching data from table: ${table} for admin:`, req.user!.email);

    // Whitelist allowed tables for security
    const allowedTables = [
      'users',
      'members',
      'leads',
      'subscriptions',
      'payments',
      'plans',
      'enrollments',
      'commissions',
      'login_sessions',
      'family_members',
      'lead_activities',
    ];

    if (!allowedTables.includes(table)) {
      return res.status(400).json({
        success: false,
        error: `Table '${table}' is not accessible`,
      });
    }

    // Get total count
    const countResult = await neonPool.query(`SELECT COUNT(*) as count FROM ${table}`);
    const totalCount = parseInt(countResult.rows[0]?.count || '0');

    // Get table data with limit and offset
    const dataResult = await neonPool.query(
      `SELECT * FROM ${table} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    console.log(`[Admin Database] Retrieved ${dataResult.rows.length} rows from ${table}`);

    res.json({
      success: true,
      table,
      data: dataResult.rows,
      total: totalCount,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error: any) {
    console.error('[Admin Database] Error fetching table data:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch table data',
    });
  }
});

router.get('/api/admin/members/:memberId', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (!isAtLeastAdmin(req.user?.role)) {
    return res.status(403).json({ message: 'Admin access required' });
  }

  const memberId = parseInt(req.params.memberId, 10);
  if (!Number.isFinite(memberId)) {
    return res.status(400).json({ success: false, error: 'Member ID must be numeric' });
  }

  try {
    const memberResult = await neonPool.query(
      `SELECT id, first_name, last_name, email, phone, address, address2, city, state, zip_code,
              customer_number, plan_id, plan_start_date, membership_start_date, total_monthly_price,
              status, is_active, cancellation_date, cancellation_reason, created_at, updated_at
       FROM members WHERE id = $1 LIMIT 1`,
      [memberId]
    );

    if (memberResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }

    const subscriptionResult = await neonPool.query(
      `SELECT s.id, s.plan_id, p.name AS plan_name, s.status, s.start_date, s.next_billing_date,
              s.end_date AS cancellation_date, s.created_at
       FROM subscriptions s
       LEFT JOIN plans p ON s.plan_id = p.id
       WHERE s.member_id = $1
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [memberId]
    );

    return res.json({
      success: true,
      member: mapMemberRecord(memberResult.rows[0]),
      subscription: subscriptionResult.rows[0] ? mapSubscriptionRecord(subscriptionResult.rows[0]) : null,
    });
  } catch (error: any) {
    console.error('[Admin Database] Failed to load member', error);
    return res.status(500).json({ success: false, error: error?.message || 'Unable to load member' });
  }
});

router.get('/api/admin/memberships/overview', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (!isAtLeastAdmin(req.user?.role)) {
    return res.status(403).json({ message: 'Admin access required' });
  }

  try {
    const summary = await storage.getMembershipStats();
    res.json({ ...summary, generatedAt: new Date().toISOString() });
  } catch (error: any) {
    console.error('[Admin Memberships] Failed to load summary', error);
    res.status(500).json({ message: error?.message || 'Unable to load membership summary' });
  }
});

router.get('/api/admin/memberships/duplicates', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (!isAtLeastAdmin(req.user?.role)) {
    return res.status(403).json({ message: 'Admin access required' });
  }

  const limit = Math.min(parseInt((req.query.limit as string) || '10', 10) || 10, 50);

  try {
    const groups = await storage.getDuplicateMembershipGroups(limit);
    res.json({ groups, limit });
  } catch (error: any) {
    console.error('[Admin Memberships] Failed to load duplicates', error);
    res.status(500).json({ message: error?.message || 'Unable to load duplicate memberships' });
  }
});

router.patch('/api/admin/memberships/:memberId/test', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (!isAtLeastAdmin(req.user?.role)) {
    return res.status(403).json({ message: 'Admin access required' });
  }

  const memberId = parseInt(req.params.memberId, 10);
  if (!Number.isFinite(memberId)) {
    return res.status(400).json({ message: 'Member ID must be numeric' });
  }

  const { isTestMember, reason } = req.body || {};
  if (typeof isTestMember !== 'boolean') {
    return res.status(400).json({ message: 'isTestMember boolean flag is required' });
  }

  try {
    const updated = await storage.setMemberTestFlag(memberId, isTestMember, {
      reason,
      updatedBy: req.user?.id || null,
    });
    res.json({ success: true, member: updated });
  } catch (error: any) {
    console.error('[Admin Memberships] Failed to update test flag', error);
    res.status(500).json({ message: error?.message || 'Unable to update test flag' });
  }
});

router.post('/api/admin/memberships/:memberId/archive', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (!isAtLeastAdmin(req.user?.role)) {
    return res.status(403).json({ message: 'Admin access required' });
  }

  const memberId = parseInt(req.params.memberId, 10);
  if (!Number.isFinite(memberId)) {
    return res.status(400).json({ message: 'Member ID must be numeric' });
  }

  const { reason } = req.body || {};

  try {
    const updated = await storage.archiveMember(memberId, {
      reason,
      archivedBy: req.user?.id || null,
    });
    res.json({ success: true, member: updated });
  } catch (error: any) {
    console.error('[Admin Memberships] Failed to archive member', error);
    res.status(500).json({ message: error?.message || 'Unable to archive member' });
  }
});

router.post('/api/admin/memberships/:memberId/restore', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (!isAtLeastAdmin(req.user?.role)) {
    return res.status(403).json({ message: 'Admin access required' });
  }

  const memberId = parseInt(req.params.memberId, 10);
  if (!Number.isFinite(memberId)) {
    return res.status(400).json({ message: 'Member ID must be numeric' });
  }

  const { targetStatus } = req.body || {};

  try {
    const updated = await storage.restoreMember(memberId, {
      restoredBy: req.user?.id || null,
      targetStatus: typeof targetStatus === 'string' && targetStatus.trim() ? targetStatus.trim() : undefined,
    });
    res.json({ success: true, member: updated });
  } catch (error: any) {
    console.error('[Admin Memberships] Failed to restore member', error);
    res.status(500).json({ message: error?.message || 'Unable to restore member' });
  }
});

export default router;
