import { Router, Response } from "express";
import { authenticateToken, type AuthRequest } from "../auth/supabaseAuth";
import { hasAtLeastRole } from "../auth/roles";
import { storage } from "../storage";

const router = Router();

const isAdmin = (role: string | undefined): boolean =>
  hasAtLeastRole(role, "admin");

// Admin: Get agent hierarchy
router.get(
  "/api/admin/agents/hierarchy",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!isAdmin(req.user?.role)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const agents = await storage.getAgentHierarchy();
      res.json(agents);
    } catch (error: any) {
      console.error("Error fetching agent hierarchy:", error);
      res.status(500).json({ error: "Failed to fetch agent hierarchy" });
    }
  },
);

// Admin: Read-only hierarchy integrity diagnostics
router.get(
  "/api/admin/agents/hierarchy/health",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!isAdmin(req.user?.role)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const diagnostics = await storage.getAgentHierarchyHealthDiagnostics();
      res.json({ success: true, diagnostics });
    } catch (error: any) {
      console.error("Error fetching hierarchy diagnostics:", error);
      res.status(500).json({ error: "Failed to fetch hierarchy diagnostics" });
    }
  },
);

// Admin: Update agent hierarchy
router.post(
  "/api/admin/agents/update-hierarchy",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!isAdmin(req.user?.role)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { agentId, uplineId, overrideAmount, reason } = req.body;

      if (!agentId) {
        return res.status(400).json({ error: "Agent ID is required" });
      }

      const normalizedOverrideAmount = Number(overrideAmount ?? 0);
      if (
        !Number.isFinite(normalizedOverrideAmount) ||
        normalizedOverrideAmount < 0
      ) {
        return res
          .status(400)
          .json({ error: "Override amount must be a non-negative number" });
      }

      await storage.updateAgentHierarchy(
        agentId,
        uplineId,
        normalizedOverrideAmount,
        req.user?.id || "",
        reason,
      );

      res.json({
        success: true,
        message: "Agent hierarchy updated successfully",
      });
    } catch (error: any) {
      console.error("Error updating agent hierarchy:", error);
      const statusCode = Number(error?.statusCode) || 500;
      res
        .status(statusCode)
        .json({ error: error?.message || "Failed to update agent hierarchy" });
    }
  },
);

// Admin: list agency assignment directory (agency users + assignable agents + snapshot)
router.get(
  "/api/admin/agency-assignments",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!isAdmin(req.user?.role)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const [agencyUsers, assignableAgents, assignments] = await Promise.all([
        storage.listAgencyUsers(),
        storage.listAssignableAgents(),
        storage.getAgencyAssignmentsSnapshot(),
      ]);

      res.json({
        success: true,
        agencyUsers,
        assignableAgents,
        assignments,
      });
    } catch (error: any) {
      console.error("Error loading agency assignments:", error);
      res
        .status(500)
        .json({ error: error?.message || "Failed to load agency assignments" });
    }
  },
);

// Admin: replace assignment set for one agency user
router.put(
  "/api/admin/agency-assignments/:agencyUserId",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!isAdmin(req.user?.role)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { agencyUserId } = req.params;
      const { agentIds, reason } = req.body || {};

      if (!agencyUserId || !String(agencyUserId).trim()) {
        return res.status(400).json({ error: "Agency user ID is required" });
      }

      if (!Array.isArray(agentIds)) {
        return res.status(400).json({ error: "agentIds must be an array" });
      }

      const assignedAgentIds = await storage.setAgencyAssignments(
        String(agencyUserId),
        agentIds,
        req.user?.id || "",
        typeof reason === "string" ? reason : undefined,
      );

      res.json({
        success: true,
        agencyUserId: String(agencyUserId),
        assignedAgentIds,
      });
    } catch (error: any) {
      console.error("Error saving agency assignments:", error);
      const message = error?.message || "Failed to save agency assignments";
      const status = /required|invalid|inactive|must/i.test(message)
        ? 400
        : 500;
      res.status(status).json({ error: message });
    }
  },
);

export default router;
