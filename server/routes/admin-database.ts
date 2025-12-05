import { Router, Request, Response } from 'express';
import { neonPool } from '../lib/neonDb';
import { authenticateToken, type AuthRequest } from '../auth/supabaseAuth';

const router = Router();

/**
 * Get statistics for all database tables
 */
router.get('/api/admin/database/stats', authenticateToken, async (req: AuthRequest, res: Response) => {
  const isAdminUser = req.user?.role === 'admin' || req.user?.role === 'super_admin';
  if (!isAdminUser) {
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
  const isAdminUser = req.user?.role === 'admin' || req.user?.role === 'super_admin';
  if (!isAdminUser) {
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

export default router;
