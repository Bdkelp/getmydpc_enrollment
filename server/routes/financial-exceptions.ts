import { Router, Response } from 'express';
import { authenticateToken, type AuthRequest } from '../auth/supabaseAuth';
import { isAtLeastAdmin } from '../auth/roles';
import { getFinancialException, listFinancialExceptions, resolveFinancialException, retryFinancialException } from '../services/financial-reconciliation-service';
import { getCommissionCenterAggregation } from '../services/commission-center-aggregation-service';

const router = Router();
const requireAdmin = (req: AuthRequest, res: Response): boolean => {
  if (!isAtLeastAdmin(req.user?.role)) {
    res.status(403).json({ error: 'Admin authorization required' });
    return false;
  }
  return true;
};

router.get('/api/admin/financial-exceptions', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try { res.json({ success: true, exceptions: await listFinancialExceptions({ status: req.query.status ? String(req.query.status) : undefined, limit: Number(req.query.limit) || 100 }) }); }
  catch (error: any) { res.status(500).json({ error: error?.message || 'Failed to load financial exceptions' }); }
});

router.get('/api/admin/financial-exceptions/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try { const exception = await getFinancialException(req.params.id); if (!exception) return res.status(404).json({ error: 'Financial exception not found' }); res.json({ success: true, exception }); }
  catch (error: any) { res.status(500).json({ error: error?.message || 'Failed to load financial exception' }); }
});

router.post('/api/admin/financial-exceptions/:id/retry', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try { res.json({ success: true, exception: await retryFinancialException(req.params.id, req.user?.id || null) }); }
  catch (error: any) { res.status(409).json({ error: error?.message || 'Financial retry failed' }); }
});

router.post('/api/admin/financial-exceptions/:id/resolve', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try { res.json({ success: true, exception: await resolveFinancialException(req.params.id, req.user?.id || '', String(req.body?.reason || ''), req.body?.status === 'ignored' ? 'ignored' : 'resolved') }); }
  catch (error: any) { res.status(400).json({ error: error?.message || 'Financial exception resolution failed' }); }
});

router.get('/api/admin/commission-center/aggregation', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    res.json({ success: true, data: await getCommissionCenterAggregation(req.query.agentId ? String(req.query.agentId) : undefined) });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to load commission aggregation' });
  }
});

router.get('/api/agent/commission-center', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (!req.user?.id || !['agent', 'admin', 'super_admin'].includes(String(req.user.role))) {
    return res.status(403).json({ error: 'Agent authorization required' });
  }
  try {
    const data = await getCommissionCenterAggregation(String(req.user.id));
    res.json({ success: true, data });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message.toLowerCase().includes('column') || message.toLowerCase().includes('relation')) {
      console.warn(`[CommissionCenter] FINANCIAL SCHEMA MIGRATION REQUIRED: ${message}`);
      return res.status(503).json({ error: 'Commission information is temporarily unavailable.', code: 'FINANCIAL_SCHEMA_MIGRATION_REQUIRED' });
    }
    res.status(500).json({ error: 'Commission information is temporarily unavailable.' });
  }
});

export default router;
