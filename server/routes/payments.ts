import { Router, type Response } from 'express';
import { authenticateToken, type AuthRequest } from '../auth/supabaseAuth';
import { hasAtLeastRole } from '../auth/roles';
import { certificationLogger } from '../services/certification-logger';

const router = Router();

router.post('/api/payments/update-info', authenticateToken, async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user || !hasAtLeastRole(user.role, 'agent')) {
    return res.status(403).json({ success: false, error: 'Agent access required' });
  }

  const { memberId, memberEmail, reason, preferredContact, details } = req.body || {};

  if (!memberId && !memberEmail) {
    return res.status(400).json({ success: false, error: 'Provide a member ID or member email so the request can be routed.' });
  }

  certificationLogger.logCertificationEntry({
    purpose: 'billing-update-request',
    requestedBy: user.email,
    memberId: memberId || null,
    memberEmail: memberEmail || null,
    reason: reason || 'unspecified',
    preferredContact: preferredContact || 'unspecified',
    details: details || null,
    timestamp: new Date().toISOString(),
  });

  return res.json({
    success: true,
    message: 'Payment update request logged. Billing will reach out to the member shortly.',
  });
});

export default router;
