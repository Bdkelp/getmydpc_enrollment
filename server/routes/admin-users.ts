import { Router, type Response } from "express";
import { authenticateToken, type AuthRequest } from "../auth/supabaseAuth";
import { hasAtLeastRole } from "../auth/roles";
import { storage } from "../storage";

const router = Router();

const isAdmin = (role: string | undefined): boolean =>
  hasAtLeastRole(role, "admin");
const isSuperAdmin = (role: string | undefined): boolean =>
  hasAtLeastRole(role, "super_admin");

router.get(
  "/api/admin/impersonation/current",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    const actorUser = req.realUser || req.user;
    if (!isSuperAdmin(actorUser?.role)) {
      return res.status(403).json({ message: "Super admin access required" });
    }

    try {
      const activeSession = await storage.getActiveImpersonationSession(
        actorUser!.id,
      );

      if (!activeSession) {
        return res.json({
          success: true,
          active: false,
          session: null,
        });
      }

      const targetUser = await storage.getUser(activeSession.target_user_id);
      return res.json({
        success: true,
        active: true,
        session: activeSession,
        targetUser: targetUser
          ? {
              id: targetUser.id,
              email: targetUser.email,
              firstName: targetUser.firstName,
              lastName: targetUser.lastName,
              role: targetUser.role,
            }
          : null,
      });
    } catch (error: any) {
      console.error("Error loading current impersonation session:", error);
      return res.status(500).json({
        message: "Failed to load impersonation session",
        error: error?.message || "Unknown error",
      });
    }
  },
);

router.post(
  "/api/admin/impersonation/start",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    const actorUser = req.realUser || req.user;
    if (!isSuperAdmin(actorUser?.role)) {
      return res.status(403).json({ message: "Super admin access required" });
    }

    try {
      const { targetUserId, reason, durationMinutes } = req.body || {};

      if (!targetUserId || !String(targetUserId).trim()) {
        return res.status(400).json({ message: "targetUserId is required" });
      }

      const normalizedTargetUserId = String(targetUserId).trim();
      if (normalizedTargetUserId === actorUser!.id) {
        return res
          .status(400)
          .json({ message: "Cannot impersonate your own account" });
      }

      const targetUser = await storage.getUser(normalizedTargetUserId);
      if (!targetUser) {
        return res.status(404).json({ message: "Target user not found" });
      }

      if (!targetUser.isActive || targetUser.approvalStatus !== "approved") {
        return res.status(400).json({
          message:
            "Target user must be active and approved before impersonation",
        });
      }

      const expiresAt =
        Number.isFinite(Number(durationMinutes)) && Number(durationMinutes) > 0
          ? new Date(Date.now() + Number(durationMinutes) * 60 * 1000)
          : new Date(Date.now() + 60 * 60 * 1000);

      const session = await storage.startImpersonationSession({
        impersonatorUserId: actorUser!.id,
        targetUserId: normalizedTargetUserId,
        reason:
          typeof reason === "string" && reason.trim().length > 0
            ? reason.trim()
            : "Super admin live drop-in",
        expiresAt,
        startedIp: req.ip,
        startedUserAgent: req.get("user-agent") || undefined,
      });

      if (!session) {
        return res.status(503).json({
          message:
            "Impersonation session storage is unavailable. Run impersonation_sessions migration first.",
        });
      }

      return res.json({
        success: true,
        session,
        targetUser: {
          id: targetUser.id,
          email: targetUser.email,
          firstName: targetUser.firstName,
          lastName: targetUser.lastName,
          role: targetUser.role,
        },
      });
    } catch (error: any) {
      console.error("Error starting impersonation session:", error);
      return res.status(500).json({
        message: "Failed to start impersonation session",
        error: error?.message || "Unknown error",
      });
    }
  },
);

router.post(
  "/api/admin/impersonation/stop",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    const actorUser = req.realUser || req.user;
    if (!isSuperAdmin(actorUser?.role)) {
      return res.status(403).json({ message: "Super admin access required" });
    }

    try {
      const stoppedSession = await storage.stopImpersonationSession({
        impersonatorUserId: actorUser!.id,
        endedIp: req.ip,
        endedUserAgent: req.get("user-agent") || undefined,
      });

      return res.json({
        success: true,
        hadActiveSession: Boolean(stoppedSession),
        session: stoppedSession,
      });
    } catch (error: any) {
      console.error("Error stopping impersonation session:", error);
      return res.status(500).json({
        message: "Failed to stop impersonation session",
        error: error?.message || "Unknown error",
      });
    }
  },
);

router.get(
  "/api/admin/users",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    if (!isAdmin(req.user?.role)) {
      console.log(
        "[Admin Users API] Access denied - user role:",
        req.user?.role,
      );
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      // Add CORS headers for external browser access
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Access-Control-Allow-Origin", req.headers.origin || "*");

      console.log(
        "[Admin Users API] Fetching users for admin:",
        req.user?.email,
      );
      const filterType = req.query.filter as string;

      // Users table = staff (admin/super_admin/agent), members table = customers
      const usersResult =
        filterType === "members"
          ? await storage.getMembersOnly()
          : await storage.getAllUsersForAdmin();

      if (!usersResult || !usersResult.users) {
        console.error("[Admin Users API] No users data returned from storage");
        return res
          .status(500)
          .json({ message: "Failed to fetch users - no data returned" });
      }

      const users = usersResult.users;
      const enhancedUsers = [];

      for (const user of users) {
        try {
          enhancedUsers.push({ ...user });
        } catch (userError) {
          console.error(
            `[Admin Users API] Error processing user ${user.id}:`,
            userError,
          );
          enhancedUsers.push(user);
        }
      }

      res.json({
        users: enhancedUsers,
        totalCount: enhancedUsers.length,
      });
    } catch (error: any) {
      console.error("[Admin Users API] Error fetching users:", error);
      res.status(500).json({
        message: "Failed to fetch users",
        error: error.message,
        details: "Check server logs for more information",
      });
    }
  },
);

router.get(
  "/api/admin/pending-users",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    if (!isAdmin(req.user?.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const users = await storage.getAllUsersForAdmin();
      const pendingUsers =
        users.users?.filter((user: any) => user.approvalStatus === "pending") ||
        [];
      res.json(pendingUsers);
    } catch (error) {
      console.error("Error fetching pending users:", error);
      res.status(500).json({ message: "Failed to fetch pending users" });
    }
  },
);

router.delete(
  "/api/admin/users/:userId",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    if (!isAdmin(req.user?.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { userId } = req.params;
      if (!userId || !String(userId).trim()) {
        return res.status(400).json({ message: "User ID is required" });
      }

      if (req.user?.id === userId) {
        return res
          .status(400)
          .json({ message: "You cannot remove your own account" });
      }

      const updatedUser = await storage.updateUser(userId, {
        isActive: false,
        approvalStatus: "suspended",
        updatedAt: new Date(),
      });

      res.json({
        success: true,
        message: "User removed from active access",
        user: updatedUser,
      });
    } catch (error) {
      console.error("Error removing user:", error);
      res.status(500).json({ message: "Failed to remove user" });
    }
  },
);

router.post(
  "/api/admin/approve-user/:userId",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    if (!isAdmin(req.user?.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { userId } = req.params;
      const updatedUser = await storage.updateUser(userId, {
        approvalStatus: "approved",
        updatedAt: new Date(),
      });
      res.json(updatedUser);
    } catch (error) {
      console.error("Error approving user:", error);
      res.status(500).json({ message: "Failed to approve user" });
    }
  },
);

export default router;
