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

    await storage.updateAgentHierarchy(
      agentId,
      uplineId,
      overrideAmount,
      req.user?.id || '',
      reason
    );

    res.json({ success: true, message: 'Agent hierarchy updated successfully' });
  } catch (error: any) {
    console.error('Error updating agent hierarchy:', error);
    res.status(500).json({ error: 'Failed to update agent hierarchy' });
  }
});

export default router;
