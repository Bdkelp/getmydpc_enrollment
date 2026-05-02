import { Router, type Response } from "express";
import { authenticateToken, type AuthRequest } from "../auth/supabaseAuth";
import { hasAtLeastRole } from "../auth/roles";
import { storage } from "../storage";

const router = Router();

const isAdmin = (role: string | undefined): boolean => hasAtLeastRole(role, "admin");

router.get("/api/admin/users", authenticateToken, async (req: AuthRequest, res: Response) => {
  if (!isAdmin(req.user?.role)) {
    console.log("[Admin Users API] Access denied - user role:", req.user?.role);
    return res.status(403).json({ message: "Admin access required" });
  }

  try {
    // Add CORS headers for external browser access
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Origin", req.headers.origin || "*");

    console.log("[Admin Users API] Fetching users for admin:", req.user?.email);
    const filterType = req.query.filter as string;

    // Users table = staff (admin/super_admin/agent), members table = customers
    const usersResult =
      filterType === "members"
        ? await storage.getMembersOnly()
        : await storage.getAllUsers();

    if (!usersResult || !usersResult.users) {
      console.error("[Admin Users API] No users data returned from storage");
      return res.status(500).json({ message: "Failed to fetch users - no data returned" });
    }

    const users = usersResult.users;
    const enhancedUsers = [];

    for (const user of users) {
      try {
        enhancedUsers.push({ ...user });
      } catch (userError) {
        console.error(`[Admin Users API] Error processing user ${user.id}:`, userError);
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
});

router.get("/api/admin/pending-users", authenticateToken, async (req: AuthRequest, res: Response) => {
  if (!isAdmin(req.user?.role)) {
    return res.status(403).json({ message: "Admin access required" });
  }

  try {
    const users = await storage.getAllUsers();
    const pendingUsers = users.users?.filter((user: any) => user.approvalStatus === "pending") || [];
    res.json(pendingUsers);
  } catch (error) {
    console.error("Error fetching pending users:", error);
    res.status(500).json({ message: "Failed to fetch pending users" });
  }
});

router.post("/api/admin/approve-user/:userId", authenticateToken, async (req: AuthRequest, res: Response) => {
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
});

export default router;
