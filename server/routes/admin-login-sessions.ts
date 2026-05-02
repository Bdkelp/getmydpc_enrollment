import { Router, type Response } from "express";
import { authenticateToken, type AuthRequest } from "../auth/supabaseAuth";
import { hasAtLeastRole } from "../auth/roles";
import { storage } from "../storage";

const router = Router();

const isAdmin = (role: string | undefined): boolean => hasAtLeastRole(role, "admin");

router.get("/api/admin/login-sessions", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user?.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { limit = "50" } = req.query;
    const loginSessions = await storage.getAllLoginSessions(parseInt(String(limit)));
    res.json(loginSessions);
  } catch (error) {
    console.error("Error fetching login sessions:", error);
    res.status(500).json({ message: "Failed to fetch login sessions" });
  }
});

export default router;
