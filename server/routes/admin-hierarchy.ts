import { Router, Response } from "express";
import { authenticateToken, type AuthRequest } from "../auth/supabaseAuth";
import { hasAtLeastRole } from "../auth/roles";
import { storage } from "../storage";

const router = Router();

const isAdmin = (role: string | undefined): boolean => hasAtLeastRole(role, "admin");

// Admin: Get agent hierarchy
router.get('/api/admin/agents/hierarchy', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const agents = await storage.getAgentHierarchy();
    res.json(agents);
  } catch (error: any) {
    console.error('Error fetching agent hierarchy:', error);
    res.status(500).json({ error: 'Failed to fetch agent hierarchy' });
  }
});

// Admin: Read-only hierarchy integrity diagnostics
router.get('/api/admin/agents/hierarchy/health', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const diagnostics = await storage.getAgentHierarchyHealthDiagnostics();
    res.json({ success: true, diagnostics });
  } catch (error: any) {
    console.error('Error fetching hierarchy diagnostics:', error);
    res.status(500).json({ error: 'Failed to fetch hierarchy diagnostics' });
  }
});

// Admin: Update agent hierarchy
router.post('/api/admin/agents/update-hierarchy', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { agentId, uplineId, overrideAmount, reason } = req.body;

    if (!agentId) {
      return res.status(400).json({ error: 'Agent ID is required' });
    }

    const normalizedOverrideAmount = Number(overrideAmount ?? 0);
    if (!Number.isFinite(normalizedOverrideAmount) || normalizedOverrideAmount < 0) {
      return res.status(400).json({ error: 'Override amount must be a non-negative number' });
    }

    await storage.updateAgentHierarchy(
      agentId,
      uplineId,
      normalizedOverrideAmount,
      req.user?.id || '',
      reason
    );

    res.json({ success: true, message: 'Agent hierarchy updated successfully' });
  } catch (error: any) {
    console.error('Error updating agent hierarchy:', error);
    const statusCode = Number(error?.statusCode) || 500;
    res.status(statusCode).json({ error: error?.message || 'Failed to update agent hierarchy' });
  }
});

export default router;
