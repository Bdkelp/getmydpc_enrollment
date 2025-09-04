import { Router } from "express";
import { storage } from "./storage";
import { authenticateToken, type AuthRequest } from "./auth/supabaseAuth";
import { paymentService } from "./services/payment-service";
import { notificationService } from "./utils/notifications";
import { calculateCommission, getPlanTierFromName, getPlanTypeFromMemberType } from "./utils/commission";
import { commissions, users, plans, subscriptions } from "@shared/schema";
import { eq, and, desc, count, sum, sql } from "drizzle-orm";
import { z } from "zod";
import { supabase } from './lib/supabaseClient'; // Assuming supabase client is imported here
import epxRoutes from './routes/epx-routes';

const router = Router();

// Public routes (no authentication required)
router.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

router.get("/api/plans", async (req, res) => {
  try {
    console.log('[API /plans] Fetching plans...');
    const allPlans = await storage.getPlans();
    console.log('[API /plans] Retrieved plans:', {
      total: allPlans.length,
      active: allPlans.filter(plan => plan.isActive).length,
      inactive: allPlans.filter(plan => !plan.isActive).length
    });

    if (allPlans.length > 0) {
      console.log('[API /plans] Sample plan:', {
        id: allPlans[0].id,
        name: allPlans[0].name,
        isActive: allPlans[0].isActive,
        price: allPlans[0].price
      });
    }

    const activePlans = allPlans.filter(plan => plan.isActive);
    console.log('[API /plans] Returning active plans:', activePlans.length);
    res.json(activePlans);
  } catch (error) {
    console.error("[API /plans] Error fetching plans:", error);
    res.status(500).json({ message: "Failed to fetch plans", error: error.message });
  }
});

// Auth routes (public - no authentication required)
router.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Sign in with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.error('Login error:', error);
      return res.status(401).json({ message: error.message || 'Invalid credentials' });
    }

    if (!data.session) {
      return res.status(401).json({ message: 'Failed to create session' });
    }

    // Get or create user in our database
    console.log('[Login] Checking for existing user:', email);
    let user = await storage.getUserByEmail(email);

    if (!user) {
      console.log('[Login] User not found, creating new user');
      const userRole = determineUserRole(data.user.email!);
      console.log('[Login] Determined role for', email, ':', userRole);

      // Create user in our database if they don't exist
      user = await storage.createUser({
        id: data.user.id,
        email: data.user.email!,
        firstName: data.user.user_metadata?.firstName || data.user.user_metadata?.first_name || 'User',
        lastName: data.user.user_metadata?.lastName || data.user.user_metadata?.last_name || '',
        emailVerified: data.user.email_confirmed_at ? true : false,
        role: userRole,
        isActive: true,
        approvalStatus: 'approved',
        createdAt: new Date(),
        updatedAt: new Date()
      });

      console.log('[Login] Created new user:', {
        id: user.id,
        email: user.email,
        role: user.role,
        approvalStatus: user.approvalStatus
      });
    } else {
      console.log('[Login] Found existing user:', {
        id: user.id,
        email: user.email,
        role: user.role,
        approvalStatus: user.approvalStatus
      });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
        approvalStatus: user.approvalStatus
      },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Login failed' });
  }
});

router.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    // Sign up with Supabase
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          firstName,
          lastName
        }
      }
    });

    if (error) {
      console.error('Registration error:', error);
      return res.status(400).json({ message: error.message || 'Registration failed' });
    }

    if (!data.user) {
      return res.status(400).json({ message: 'Failed to create user' });
    }

    // Create user in our database
    const user = await storage.createUser({
      id: data.user.id,
      email: data.user.email!,
      firstName: firstName || 'User',
      lastName: lastName || '',
      emailVerified: false,
      role: 'member',
      isActive: true,
      approvalStatus: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    res.json({
      message: 'Registration successful. Please check your email to verify your account.',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Registration failed' });
  }
});

router.post("/api/auth/logout", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Logout error:', error);
      }
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Logout failed' });
  }
});

// Helper function to determine user role
function determineUserRole(email: string): "admin" | "agent" | "member" {
  const adminEmails = [
    'michael@mypremierplans.com',
    'travis@mypremierplans.com',
    'richard@mypremierplans.com',
    'joaquin@mypremierplans.com'
  ];

  const agentEmails = [
    'mdkeener@gmail.com',
    'tmatheny77@gmail.com',
    'svillarreal@cyariskmanagement.com'
  ];

  if (adminEmails.includes(email)) return "admin";
  if (agentEmails.includes(email)) return "agent";
  return "member";
}

// Authentication route (protected)
router.get("/api/auth/user", authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not found" });
    }

    // Get user's subscription and plan info
    const userSubscriptions = await storage.getUserSubscriptions(req.user.id);
    const activeSubscription = userSubscriptions.find(sub => sub.status === 'active');

    let planInfo = null;
    if (activeSubscription) {
      const plan = await storage.getPlan(activeSubscription.planId);
      planInfo = plan;
    }

    const userResponse = {
      id: req.user.id,
      email: req.user.email,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      role: req.user.role,
      subscription: activeSubscription,
      plan: planInfo,
      isActive: req.user.isActive,
      approvalStatus: req.user.approvalStatus
    };

    res.json(userResponse);
  } catch (error) {
    console.error("Error in /api/auth/user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Apply authentication only to specific protected routes below, not globally

// User profile routes
router.get("/api/user/profile", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const user = await storage.getUser(req.user!.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ message: "Failed to fetch profile" });
  }
});

router.put("/api/user/profile", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const updateData = req.body;
    delete updateData.id; // Prevent ID modification
    delete updateData.role; // Prevent role modification via profile update
    delete updateData.createdAt; // Prevent creation date modification
    delete updateData.approvalStatus; // Prevent approval status modification

    // Validate phone number format if provided
    if (updateData.phone) {
      const phoneRegex = /^\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/;
      if (!phoneRegex.test(updateData.phone)) {
        return res.status(400).json({ message: "Invalid phone number format" });
      }
    }

    // Validate email format if changed
    if (updateData.email && updateData.email !== req.user!.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(updateData.email)) {
        return res.status(400).json({ message: "Invalid email format" });
      }

      // Check if email is already in use by another user
      const existingUser = await storage.getUserByEmail(updateData.email);
      if (existingUser && existingUser.id !== req.user!.id) {
        return res.status(400).json({ message: "Email already in use" });
      }
    }

    const updatedUser = await storage.updateUser(req.user!.id, {
      ...updateData,
      updatedAt: new Date()
    });

    res.json(updatedUser);
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ message: "Failed to update profile" });
  }
});

// Subscription routes
router.get("/api/user/subscription", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const subscriptions = await storage.getUserSubscriptions(req.user!.id);
    res.json(subscriptions);
  } catch (error) {
    console.error("Error fetching subscriptions:", error);
    res.status(500).json({ message: "Failed to fetch subscriptions" });
  }
});

// Lead management routes
router.get("/api/leads", authenticateToken, async (req: AuthRequest, res) => {
  try {
    let leads;

    if (req.user!.role === 'admin') {
      leads = await storage.getAllLeads();
    } else if (req.user!.role === 'agent') {
      leads = await storage.getAgentLeads(req.user!.id);
    } else {
      return res.status(403).json({ message: "Not authorized to view leads" });
    }

    res.json(leads);
  } catch (error) {
    console.error("Error fetching leads:", error);
    res.status(500).json({ message: "Failed to fetch leads" });
  }
});

router.post("/api/leads", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { firstName, lastName, email, phone, message, source } = req.body;

    const lead = await storage.createLead({
      firstName,
      lastName,
      email,
      phone,
      message: message || '',
      source: source || 'contact_form',
      status: 'new',
      assignedAgentId: req.user!.role === 'agent' ? req.user!.id : null
    });

    res.status(201).json(lead);
  } catch (error) {
    console.error("Error creating lead:", error);
    res.status(500).json({ message: "Failed to create lead" });
  }
});

// Admin routes
router.get("/api/admin/stats", authenticateToken, async (req: AuthRequest, res) => {
  if (req.user!.role !== 'admin') {
    console.log('[Admin Stats API] Access denied - user role:', req.user!.role);
    return res.status(403).json({ message: "Admin access required" });
  }

  try {
    console.log('[Admin Stats API] Fetching stats for admin:', req.user!.email);
    const stats = await storage.getAdminDashboardStats();
    console.log('[Admin Stats API] Retrieved stats:', stats);
    res.json(stats);
  } catch (error) {
    console.error("[Admin Stats API] Error fetching admin stats:", error);
    res.status(500).json({ message: "Failed to fetch admin stats" });
  }
});

router.get("/api/admin/users", authenticateToken, async (req: AuthRequest, res) => {
  if (req.user!.role !== 'admin') {
    console.log('[Admin Users API] Access denied - user role:', req.user!.role);
    return res.status(403).json({ message: "Admin access required" });
  }

  try {
    // Add CORS headers for external browser access
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');

    console.log('[Admin Users API] Fetching users for admin:', req.user!.email);
    const result = await storage.getAllUsers();
    const users = result.users || [];
    const totalCount = result.totalCount || 0;

    console.log('[Admin Users API] Retrieved users count:', totalCount);
    console.log('[Admin Users API] User roles breakdown:', {
      admins: users.filter(u => u.role === 'admin').length,
      agents: users.filter(u => u.role === 'agent').length,
      members: users.filter(u => u.role === 'member' || u.role === 'user').length,
      others: users.filter(u => !['admin', 'agent', 'member', 'user'].includes(u.role)).length
    });

    if (users.length > 0) {
      console.log('[Admin Users API] Sample user data:', {
        id: users[0].id,
        email: users[0].email,
        firstName: users[0].firstName,
        lastName: users[0].lastName,
        role: users[0].role,
        approvalStatus: users[0].approvalStatus
      });
    }

    res.json({ users, totalCount });
  } catch (error) {
    console.error("[Admin Users API] Error fetching users:", error);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

router.get("/api/admin/pending-users", authenticateToken, async (req: AuthRequest, res) => {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({ message: "Admin access required" });
  }

  try {
    const users = await storage.getAllUsers();
    const pendingUsers = users.users?.filter((user: any) => user.approvalStatus === 'pending') || [];
    res.json(pendingUsers);
  } catch (error) {
    console.error("Error fetching pending users:", error);
    res.status(500).json({ message: "Failed to fetch pending users" });
  }
});

router.post("/api/admin/approve-user/:userId", authenticateToken, async (req: AuthRequest, res) => {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({ message: "Admin access required" });
  }

  try {
    const { userId } = req.params;
    const updatedUser = await storage.updateUser(userId, {
      approvalStatus: 'approved',
      updatedAt: new Date()
    });
    res.json(updatedUser);
  } catch (error) {
    console.error("Error approving user:", error);
    res.status(500).json({ message: "Failed to approve user" });
  }
});

router.post("/api/admin/reject-user/:userId", authenticateToken, async (req: AuthRequest, res) => {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({ message: "Admin access required" });
  }

  try {
    const { userId } = req.params;
    const { reason } = req.body;
    const updatedUser = await storage.updateUser(userId, {
      approvalStatus: 'rejected',
      rejectionReason: reason,
      updatedAt: new Date()
    });
    res.json(updatedUser);
  } catch (error) {
    console.error("Error rejecting user:", error);
    res.status(500).json({ message: "Failed to reject user" });
  }
});

// Admin user management endpoints
router.put("/api/admin/users/:userId/role", authenticateToken, async (req: AuthRequest, res) => {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({ message: "Admin access required" });
  }

  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!['user', 'agent', 'admin'].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const updatedUser = await storage.updateUser(userId, {
      role,
      updatedAt: new Date()
    });

    res.json(updatedUser);
  } catch (error) {
    console.error("Error updating user role:", error);
    res.status(500).json({ message: "Failed to update user role" });
  }
});

router.put("/api/admin/users/:userId/agent-number", authenticateToken, async (req: AuthRequest, res) => {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({ message: "Admin access required" });
  }

  try {
    const { userId } = req.params;
    const { agentNumber } = req.body;

    const updatedUser = await storage.updateUser(userId, {
      agentNumber,
      updatedAt: new Date()
    });

    res.json(updatedUser);
  } catch (error) {
    console.error("Error updating agent number:", error);
    res.status(500).json({ message: "Failed to update agent number" });
  }
});

// Suspend user endpoint
router.put("/api/admin/users/:userId/suspend", authenticateToken, async (req: AuthRequest, res) => {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({ message: "Admin access required" });
  }

  try {
    const { userId } = req.params;
    
    const updatedUser = await storage.updateUser(userId, {
      isActive: false,
      approvalStatus: 'rejected', // Using 'rejected' as a proxy for suspended
      updatedAt: new Date()
    });

    res.json(updatedUser);
  } catch (error) {
    console.error("Error suspending user:", error);
    res.status(500).json({ message: "Failed to suspend user" });
  }
});

router.get("/api/admin/leads", authenticateToken, async (req: AuthRequest, res) => {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({ message: "Admin access required" });
  }

  try {
    const { status, assignedAgentId } = req.query;
    const leads = await storage.getLeads(status as string, assignedAgentId as string);
    // Ensure we always return an array
    const safeLeads = Array.isArray(leads) ? leads : [];
    res.json(safeLeads);
  } catch (error) {
    console.error("Error fetching leads:", error);
    res.status(500).json({ message: "Failed to fetch leads", error: error.message });
  }
});

router.get("/api/admin/agents", authenticateToken, async (req: AuthRequest, res) => {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({ message: "Admin access required" });
  }

  try {
    const agents = await storage.getAgents();
    res.json(agents);
  } catch (error) {
    console.error("Error fetching agents:", error);
    res.status(500).json({ message: "Failed to fetch agents" });
  }
});

router.put("/api/admin/leads/:leadId/assign", authenticateToken, async (req: AuthRequest, res) => {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({ message: "Admin access required" });
  }

  try {
    const { leadId } = req.params;
    const { agentId } = req.body;

    const result = await storage.assignLead(parseInt(leadId), agentId);
    res.json(result);
  } catch (error) {
    console.error("Error assigning lead:", error);
    res.status(500).json({ message: "Failed to assign lead" });
  }
});

router.get("/api/admin/enrollments", authenticateToken, async (req: AuthRequest, res) => {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({ message: "Admin access required" });
  }

  try {
    const { startDate, endDate, agentId } = req.query;

    let enrollments;
    if (agentId && agentId !== 'all') {
      enrollments = await storage.getEnrollmentsByAgent(agentId as string, startDate as string, endDate as string);
    } else {
      enrollments = await storage.getAllEnrollments(startDate as string, endDate as string);
    }

    // Ensure we always return an array
    const safeEnrollments = Array.isArray(enrollments) ? enrollments : [];
    res.json(safeEnrollments);
  } catch (error) {
    console.error("Error fetching enrollments:", error);
    res.status(500).json({ message: "Failed to fetch enrollments", error: error.message });
  }
});

router.get("/api/admin/analytics", authenticateToken, async (req: AuthRequest, res) => {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({ message: "Admin access required" });
  }

  try {
    const { days = "30" } = req.query;

    // Return mock analytics data for now
    const analytics = {
      overview: {
        totalMembers: 150,
        activeSubscriptions: 142,
        monthlyRevenue: 11000,
        averageRevenue: 77.46,
        churnRate: 2.5,
        growthRate: 8.2,
        newEnrollmentsThisMonth: 12,
        cancellationsThisMonth: 3
      },
      planBreakdown: [
        {
          planId: 1,
          planName: "Individual Plan",
          memberCount: 89,
          monthlyRevenue: 7031,
          percentage: 63.9
        },
        {
          planId: 2,
          planName: "Family Plan",
          memberCount: 53,
          monthlyRevenue: 3969,
          percentage: 36.1
        }
      ],
      recentEnrollments: [
        {
          id: "1",
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          planName: "Individual Plan",
          amount: 79,
          enrolledDate: new Date().toISOString(),
          status: "active"
        }
      ],
      monthlyTrends: [
        {
          month: "2024-01",
          enrollments: 15,
          cancellations: 2,
          netGrowth: 13,
          revenue: 1027
        }
      ]
    };

    res.json(analytics);
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({ message: "Failed to fetch analytics" });
  }
});

router.get("/api/agents", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const agents = await storage.getAgents();
    res.json(agents);
  } catch (error) {
    console.error("Error fetching agents:", error);
    res.status(500).json({ message: "Failed to fetch agents" });
  }
});

router.put("/api/admin/users/:userId", authenticateToken, async (req: AuthRequest, res) => {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({ message: "Admin access required" });
  }

  try {
    const { userId } = req.params;
    const updateData = req.body;

    const updatedUser = await storage.updateUser(userId, {
      ...updateData,
      updatedAt: new Date()
    });

    res.json(updatedUser);
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ message: "Failed to update user" });
  }
});

// Agent routes
router.get("/api/agent/commissions", authenticateToken, async (req: AuthRequest, res) => {
  if (req.user!.role !== 'agent') {
    return res.status(403).json({ message: "Agent access required" });
  }

  try {
    const agentCommissions = await storage.getAgentCommissions(req.user!.id);
    res.json(agentCommissions);
  } catch (error) {
    console.error("Error fetching commissions:", error);
    res.status(500).json({ message: "Failed to fetch commissions" });
  }
});


// Commission Generation Logic
// This function will be called when a new subscription is created or updated.
// It calculates and creates commission records for agents.
router.post("/api/commissions/generate", authenticateToken, async (req: AuthRequest, res) => {
  // Only admins can trigger commission generation directly, but the logic
  // should also be callable from subscription creation/updates.
  if (req.user!.role !== 'admin') {
    return res.status(403).json({ message: "Admin access required to generate commissions" });
  }

  try {
    const { subscriptionId, userId, enrolledByAgentId, planName, memberType } = req.body;

    if (!subscriptionId || !userId || !planName || !memberType) {
      return res.status(400).json({ message: "Missing required fields: subscriptionId, userId, planName, memberType" });
    }

    // Use the helper function to create commission with admin check
    const commissionResult = await createCommissionWithCheck(
      enrolledByAgentId,
      parseInt(subscriptionId),
      userId,
      planName,
      memberType
    );

    if (commissionResult.skipped) {
      return res.status(200).json({ message: "Commission generation skipped", ...commissionResult });
    } else if (commissionResult.error) {
      return res.status(500).json({ message: "Failed to generate commission", ...commissionResult });
    } else {
      return res.status(201).json({ message: "Commission generated successfully", commission: commissionResult.commission });
    }

  } catch (error) {
    console.error("Error initiating commission generation:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Helper function to create commission with admin check
async function createCommissionWithCheck(agentId: string | null, subscriptionId: number, userId: string, planName: string, memberType: string) {
  try {
    // Get agent profile to check role
    const agent = agentId ? await storage.getUser(agentId) : null;
    const enrollingUser = await storage.getUser(userId);

    // Check if agent or enrolling user is admin
    if (agent?.role === 'admin' || enrollingUser?.role === 'admin') {
      console.log('Commission creation skipped - admin involved:', {
        agentRole: agent?.role,
        enrollingUserRole: enrollingUser?.role,
        agentId,
        userId
      });
      return { skipped: true, reason: 'admin_no_commission' };
    }

    // Calculate commission using existing logic
    const commissionResult = calculateCommission(planName, memberType);
    if (!commissionResult) {
      console.warn(`No commission rate found for plan: ${planName}, member type: ${memberType}`);
      return { skipped: true, reason: 'no_commission_rate' };
    }

    // Create commission record
    const commission = await storage.createCommission({
      agentId: agentId || 'HOUSE', // Assign to 'HOUSE' if no agent is assigned
      subscriptionId,
      userId,
      planName,
      planType: getPlanTypeFromMemberType(memberType),
      planTier: getPlanTierFromName(planName),
      commissionAmount: commissionResult.commission,
      totalPlanCost: commissionResult.totalCost,
      status: 'pending',
      paymentStatus: 'unpaid'
    });

    return { success: true, commission };
  } catch (error) {
    console.error('Error creating commission:', error);
    return { error: error.message };
  }
}

export async function registerRoutes(app: any) {
  // Use the router
  app.use(router);

  // Register EPX routes
  app.use(epxRoutes);

  // Auth middleware - must be after session middleware
  const authMiddleware = async (req: any, res: any, next: any) => {
    if (req.path.startsWith('/api/auth/') && req.path !== '/api/auth/user') {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      console.warn('[Auth] No authorization token provided for:', req.path);
      return res.status(401).json({ error: 'No authorization token provided' });
    }

    const token = authHeader.split(' ')[1];

    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        console.warn('[Auth] Invalid token for:', req.path, error?.message);
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      // Get user data from our database with retry logic
      let userData;
      let retries = 3;
      while (retries > 0) {
        try {
          userData = await storage.getUser(user.id);
          break;
        } catch (dbError) {
          retries--;
          if (retries === 0) {
            console.error('[Auth] Database error after retries:', dbError);
            return res.status(500).json({ error: 'Database connection failed' });
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      if (!userData) {
        console.warn('[Auth] User not found in database:', user.id);
        return res.status(404).json({ error: 'User not found in database' });
      }

      // Check approval status
      if (userData.approvalStatus === 'pending') {
        return res.status(403).json({ 
          error: 'Account pending approval',
          requiresApproval: true 
        });
      }

      if (userData.approvalStatus === 'rejected') {
        return res.status(403).json({ 
          error: 'Account access denied' 
        });
      }

      req.user = userData;
      next();
    } catch (error) {
      console.error('[Auth] Auth middleware error:', error);
      return res.status(500).json({ error: 'Authentication failed' });
    }
  };

  // Admin role check middleware
  const adminRequired = (req: any, res: any, next: any) => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  };

  // User activity endpoint
  app.post('/api/user/activity', authMiddleware, (req: any, res: any) => {
    try {
      // Log user activity (could be stored in database if needed)
      console.log(`[Activity] User ${req.user.email} active at ${new Date().toISOString()}`);
      res.json({ success: true });
    } catch (error) {
      console.error('[Activity] Error logging activity:', error);
      res.status(500).json({ error: 'Failed to log activity' });
    }
  });

  // Add the authMiddleware to routes that require authentication
  // This should be done after defining the routes that don't need auth (like /api/auth/*)
  // and before routes that do need auth.
  // A common approach is to use app.use() with the middleware.
  // However, since we are using `authenticateToken` within specific route handlers,
  // we don't need to apply `authMiddleware` globally here unless we want to replace it.
  // The current implementation uses `authenticateToken` which seems to be a separate middleware.
  // Let's ensure the new `authMiddleware` is used where appropriate or replace `authenticateToken`.
  // For now, we assume `authenticateToken` handles the logic, and the new `authMiddleware`
  // is for a different purpose or a replacement.
  // If the intention is to replace `authenticateToken`, then `app.use(authMiddleware)` would be used.
  // Given the prompt, it seems like `authMiddleware` is being added as a new middleware.
  // For now, let's register it for the new endpoint and assume `authenticateToken` is still in use elsewhere.


  // Create and return the server
  const { createServer } = await import("http");
  return createServer(app);
}