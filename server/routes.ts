import { Router } from "express";
import { storage } from "./storage";
import { authenticateToken, type AuthRequest } from "./auth/supabaseAuth";
import { paymentService } from "./services/payment-service";
import { sendEnrollmentNotification } from "./utils/notifications";
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

// Public test endpoint (NO AUTH - for debugging only)
router.get("/api/public/test-leads-noauth", async (req, res) => {
  try {
    console.log('[Public Test] Fetching leads WITHOUT authentication...');
    const leads = await storage.getAllLeads();
    console.log(`[Public Test] Found ${leads.length} leads`);
    res.json({
      success: true,
      totalLeads: leads.length,
      leads: leads
    });
  } catch (error) {
    console.error('[Public Test] Error:', error);
    res.status(500).json({ message: "Failed to fetch leads", error: error.message });
  }
});

// Test endpoint for leads system
router.get("/api/test-leads", async (req, res) => {
  try {
    console.log('[Test Leads] Testing leads system...');

    // Test 1: Check if we can query leads table
    const allLeads = await storage.getAllLeads();
    console.log('[Test Leads] Total leads found:', allLeads.length);

    // Test 2: Try to create a test lead
    const testLead = {
      firstName: 'System',
      lastName: 'Test',
      email: 'systemtest@example.com',
      phone: '210-555-TEST',
      message: 'System test lead - will be deleted',
      source: 'system_test',
      status: 'new'
    };

    const createdLead = await storage.createLead(testLead);
    console.log('[Test Leads] Test lead created:', createdLead.id);

    // Clean up test lead
    const { supabase } = await import('./lib/supabaseClient');
    await supabase.from('leads').delete().eq('id', createdLead.id);
    console.log('[Test Leads] Test lead cleaned up');

    res.json({
      success: true,
      totalLeads: allLeads.length,
      recentLeads: allLeads.slice(0, 5).map(lead => ({
        id: lead.id,
        name: `${lead.firstName} ${lead.lastName}`,
        email: lead.email,
        phone: lead.phone,
        status: lead.status,
        source: lead.source,
        createdAt: lead.createdAt
      })),
      testResults: {
        canQueryLeads: true,
        canCreateLeads: true,
        databaseConnected: true
      }
    });

  } catch (error: any) {
    console.error('[Test Leads] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      testResults: {
        canQueryLeads: false,
        canCreateLeads: false,
        databaseConnected: false
      }
    });
  }
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

    // Update last login
    await storage.updateUser(user.id, {
      lastLoginAt: new Date()
    });

    // Create login session record
    try {
      const userAgent = req.headers['user-agent'] || '';
      const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';

      // Parse user agent for device/browser info
      let deviceType = 'desktop';
      let browser = 'unknown';

      if (userAgent.includes('Mobile')) deviceType = 'mobile';
      else if (userAgent.includes('Tablet')) deviceType = 'tablet';

      if (userAgent.includes('Chrome')) browser = 'Chrome';
      else if (userAgent.includes('Firefox')) browser = 'Firefox';
      else if (userAgent.includes('Safari')) browser = 'Safari';
      else if (userAgent.includes('Edge')) browser = 'Edge';

      await storage.createLoginSession({
        userId: user.id,
        ipAddress: ipAddress,
        userAgent: userAgent,
        deviceType: deviceType,
        browser: browser
      });

      console.log('[Login] Session tracked for user:', user.email);
    } catch (error) {
      console.error('[Login] Error tracking session:', error);
      // Don't fail login if session tracking fails
    }

    console.log('[Login] Login successful for user:', user.email);

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        agentNumber: user.agentNumber, // Include agent number in login response
        profileImageUrl: user.profileImageUrl,
        isActive: user.isActive,
        approvalStatus: user.approvalStatus
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
    if (activeSubscription && activeSubscription.planId) {
      try {
        const plan = await storage.getPlan(activeSubscription.planId);
        planInfo = plan;
      } catch (error) {
        console.error('Error fetching plan:', error);
        // Continue without plan info
      }
    }

    const userResponse = {
      id: req.user.id,
      email: req.user.email,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      role: req.user.role,
      agentNumber: req.user.agentNumber, // Include agent number for agents and admins
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


router.put("/api/user/profile", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const updateData = req.body;
    delete updateData.id; // Prevent ID modification
    delete updateData.role; // Prevent role modification via profile update
    delete updateData.createdAt; // Prevent creation date modification
    delete updateData.approvalStatus; // Prevent approval status modification
    delete updateData.agentNumber; // Prevent agent number modification via profile update

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

// Payment processing endpoint with error handling
router.post("/api/process-payment", authenticateToken, async (req: AuthRequest, res) => {
  try {
    console.log('[Payment Processing] Request received:', {
      userId: req.user!.id,
      bodyKeys: Object.keys(req.body),
      amount: req.body.amount
    });

    const { planId, amount, paymentMethod } = req.body;

    if (!planId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: planId and amount'
      });
    }

    // Validate plan exists
    if (!planId) {
      return res.status(400).json({ message: "Plan ID is required" });
    }
    const plan = await storage.getPlan(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'Plan not found'
      });
    }

    // For now, redirect to EPX payment creation
    res.json({
      success: true,
      message: 'Use EPX payment endpoint',
      redirectTo: '/api/epx/create-payment'
    });

  } catch (error: any) {
    console.error('[Payment Processing] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Payment processing failed',
      details: error.message
    });
  }
});

// Public lead submission endpoint (for contact forms)
router.post("/api/public/leads", async (req: any, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [Public Leads] === ENDPOINT HIT ===`);
  console.log(`[${timestamp}] [Public Leads] Method:`, req.method);
  console.log(`[${timestamp}] [Public Leads] Headers:`, JSON.stringify(req.headers, null, 2));
  console.log(`[${timestamp}] [Public Leads] Body type:`, typeof req.body);
  console.log(`[${timestamp}] [Public Leads] Raw body:`, JSON.stringify(req.body, null, 2));

  try {
    // Check if body exists and is parsed
    if (!req.body) {
      console.error(`[${timestamp}] [Public Leads] No request body found`);
      return res.status(400).json({ 
        error: "No data received",
        debug: "Request body is empty",
        timestamp
      });
    }

    const { firstName, lastName, email, phone, message } = req.body;

    console.log(`[${timestamp}] [Public Leads] Extracted fields:`, { 
      firstName: !!firstName, 
      lastName: !!lastName, 
      email: !!email, 
      phone: !!phone, 
      message: !!message 
    });

    // Check required fields
    const missingFields = [];
    if (!firstName) missingFields.push('firstName');
    if (!lastName) missingFields.push('lastName');
    if (!email) missingFields.push('email');
    if (!phone) missingFields.push('phone');

    if (missingFields.length > 0) {
      console.log(`[${timestamp}] [Public Leads] Missing required fields:`, missingFields);
      return res.status(400).json({ 
        error: "Missing required fields",
        missingFields,
        receivedData: { firstName, lastName, email, phone },
        timestamp
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log(`[${timestamp}] [Public Leads] Invalid email format:`, email);
      return res.status(400).json({ error: "Invalid email format", timestamp });
    }

    // Validate phone (basic check)
    if (phone.length < 10) {
      console.log(`[${timestamp}] [Public Leads] Invalid phone format:`, phone);
      return res.status(400).json({ error: "Invalid phone number format", timestamp });
    }

    console.log(`[${timestamp}] [Public Leads] Validation passed, creating lead...`);

    const leadData = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      message: message ? message.trim() : "",
      source: "contact_form",
      status: "new"
    };

    console.log(`[${timestamp}] [Public Leads] Lead data to create:`, JSON.stringify(leadData, null, 2));

    // Test database connection and table structure first
    try {
      const { supabase } = await import('./lib/supabaseClient');

      // Test connection and check table structure
      const { data: connectionTest, error: connectionError } = await supabase
        .from('leads')
        .select('id, first_name, last_name, email, phone')
        .limit(1);

      if (connectionError) {
        console.error(`[${timestamp}] [Public Leads] Database connection test failed:`, connectionError);
        throw new Error(`Database connection failed: ${connectionError.message}`);
      }

      console.log(`[${timestamp}] [Public Leads] Database connection successful, table structure verified`);

      // Test if we can actually insert (using anon key)
      console.log(`[${timestamp}] [Public Leads] Testing anonymous insert capability...`);

    } catch (dbError) {
      console.error(`[${timestamp}] [Public Leads] Database test error:`, dbError);
      throw dbError;
    }

    let lead;
    try {
      lead = await storage.createLead(leadData);
      console.log(`[${timestamp}] [Public Leads] Lead created successfully:`, { 
        id: lead.id, 
        email: lead.email,
        status: lead.status,
        source: lead.source
      });
    } catch (storageError: any) {
      console.error(`[${timestamp}] [Public Leads] Storage error creating lead:`, {
        error: storageError.message,
        code: storageError.code,
        details: storageError.details,
        hint: storageError.hint,
        leadData: leadData
      });

      // Try to provide more specific error messages
      if (storageError.message?.includes('column') && storageError.message?.includes('does not exist')) {
        throw new Error(`Database schema mismatch: ${storageError.message}`);
      } else if (storageError.message?.includes('permission denied') || storageError.message?.includes('RLS')) {
        throw new Error('Permission denied: Lead submission not allowed');
      } else {
        throw storageError;
      }
    }

    res.json({ 
      success: true, 
      leadId: lead.id,
      message: "Lead submitted successfully",
      timestamp
    });

  } catch (error: any) {
    console.error(`[${timestamp}] [Public Leads] Error creating lead:`, {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code
    });

    res.status(500).json({ 
      error: "Failed to submit lead", 
      details: error.message,
      timestamp,
      errorCode: error.code
    });
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
    const filterType = req.query.filter as string;

    // If filter is 'members', only get members (exclude agents/admins)
    const usersResult = filterType === 'members' 
      ? await storage.getMembersOnly()
      : await storage.getAllUsers();

    if (!usersResult || !usersResult.users) {
      console.error('[Admin Users API] No users data returned from storage');
      return res.status(500).json({ message: "Failed to fetch users - no data returned" });
    }

    const users = usersResult.users;
    console.log('[Admin Users API] Retrieved users count:', users.length);

    // Enhance users with subscription data - simplified approach
    const enhancedUsers = [];
    for (const user of users) {
      try {
        let enhancedUser = { ...user };

        // Only try to get subscription data for members/users, and handle errors gracefully
        if (user.role === 'member' || user.role === 'user') {
          try {
            const subscription = await storage.getUserSubscription(user.id);
            if (subscription) {
              enhancedUser.subscription = {
                status: subscription.status,
                planName: 'Active Plan', // Simplified - avoid additional DB calls
                amount: subscription.amount || 0
              };
            }
          } catch (subError) {
            console.warn(`[Admin Users API] Could not fetch subscription for user ${user.id}:`, subError.message);
            // Continue without subscription data
          }
        }

        enhancedUsers.push(enhancedUser);
      } catch (userError) {
        console.error(`[Admin Users API] Error processing user ${user.id}:`, userError);
        // Add user without enhancements rather than failing completely
        enhancedUsers.push(user);
      }
    }

    console.log('[Admin Users API] Successfully enhanced users count:', enhancedUsers.length);

    res.json({
      users: enhancedUsers,
      totalCount: enhancedUsers.length,
    });
  } catch (error) {
    console.error("[Admin Users API] Error fetching users:", error);
    console.error("[Admin Users API] Error stack:", error.stack);
    res.status(500).json({ 
      message: "Failed to fetch users", 
      error: error.message,
      details: "Check server logs for more information"
    });
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

    if (!['member', 'agent', 'admin'].includes(role)) {
      return res.status(400).json({ message: "Invalid role. Must be 'member' (DPC plan subscriber), 'agent' (enrollment agent), or 'admin' (system administrator)" });
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
  // CRITICAL: Only admins can assign/modify agent numbers for commission tracking
  if (req.user!.role !== 'admin') {
    return res.status(403).json({ message: "Admin access required" });
  }

  try {
    const { userId } = req.params;
    const { agentNumber } = req.body;

    // Get user to validate they can have an agent number
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Only agents and admins should have agent numbers (they enroll DPC members)
    if (user.role !== 'agent' && user.role !== 'admin') {
      return res.status(400).json({ 
        success: false, 
        error: 'Only agents and admins can be assigned agent numbers' 
      });
    }

    // Validate agent number format if provided
    if (agentNumber && agentNumber.trim() !== '') {
      const trimmedAgentNumber = agentNumber.trim().toUpperCase();

      // Validate MPP format: MPP + 2-letter role code + 2-digit year + 4-digit SSN
      const agentNumberPattern = /^MPP[SA|AG][0-9]{2}[0-9]{4}$/;
      if (!agentNumberPattern.test(trimmedAgentNumber)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Agent number must follow format: MPP[SA|AG][YY][SSSS] (e.g., MPPSA231154 for Super Admin or MPPAG231154 for Agent)' 
        });
      }

      if (trimmedAgentNumber.length !== 12) {
        return res.status(400).json({ 
          success: false, 
          error: 'Agent number must be exactly 12 characters (MPP + 2-letter role + 2-digit year + 4-digit SSN)' 
        });
      }

      // Check for duplicate agent numbers
      const existingUser = await storage.getUserByAgentNumber(trimmedAgentNumber);
      if (existingUser && existingUser.id !== userId) {
        return res.status(400).json({
          success: false,
          error: 'Agent number already in use'
        });
      }
    }

    const result = await storage.updateUser(userId, {
      agentNumber: agentNumber?.trim() || null,
      updatedAt: new Date()
    });

    res.json(result);
  } catch (error) {
    console.error("Error updating agent number:", error);
    res.status(500).json({ 
      message: "Failed to update agent number",
      details: error.message
    });
  }
});

// Suspend user endpoint
router.put("/api/admin/users/:userId/suspend", authenticateToken, async (req: AuthRequest, res) => {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({ message: "Admin access required" });
  }

  try {
    const { userId } = req.params;
    const { reason } = req.body;

    // Also deactivate any active subscriptions
    const userSubscriptions = await storage.getUserSubscriptions(userId);
    for (const subscription of userSubscriptions) {
      if (subscription.status === 'active') {
        await storage.updateSubscription(subscription.id, {
          status: 'suspended',
          pendingReason: 'admin_suspended',
          pendingDetails: reason || 'Account suspended by administrator',
          updatedAt: new Date()
        });
      }
    }

    const updatedUser = await storage.updateUser(userId, {
      isActive: false,
      approvalStatus: 'suspended',
      rejectionReason: reason || 'Account suspended by administrator',
      updatedAt: new Date()
    });

    res.json(updatedUser);
  } catch (error) {
    console.error("Error suspending user:", error);
    res.status(500).json({ message: "Failed to suspend user" });
  }
});

// Reactivate user endpoint
router.put("/api/admin/users/:userId/reactivate", authenticateToken, async (req: AuthRequest, res) => {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({ message: "Admin access required" });
  }

  try {
    const { userId } = req.params;
    const { reactivateSubscriptions } = req.body;

    // Reactivate the user account
    const updatedUser = await storage.updateUser(userId, {
      isActive: true,
      approvalStatus: 'approved',
      approvedAt: new Date(),
      approvedBy: req.user!.id,
      rejectionReason: null,
      updatedAt: new Date()
    });

    // Optionally reactivate suspended subscriptions
    if (reactivateSubscriptions) {
      const userSubscriptions = await storage.getUserSubscriptions(userId);
      for (const subscription of userSubscriptions) {
        if (subscription.status === 'suspended' || subscription.status === 'cancelled') {
          await storage.updateSubscription(subscription.id, {
            status: 'active',
            pendingReason: null,
            pendingDetails: null,
            updatedAt: new Date()
          });
        }
      }
    }

    res.json(updatedUser);
  } catch (error) {
    console.error("Error reactivating user:", error);
    res.status(500).json({ message: "Failed to reactivate user" });
  }
});

// Assign agent number endpoint
router.put("/api/admin/users/:userId/assign-agent-number", authenticateToken, async (req: AuthRequest, res) => {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({ message: "Admin access required" });
  }

  try {
    const { userId } = req.params;
    const { agentNumber } = req.body;

    if (!agentNumber) {
      return res.status(400).json({ message: "Agent number is required" });
    }

    // Check if agent number is already taken
    const existingUser = await storage.getUserByAgentNumber(agentNumber);
    if (existingUser && existingUser.id !== userId) {
      return res.status(400).json({ message: "Agent number already assigned to another user" });
    }

    // Update user with new agent number
    const updatedUser = await storage.updateUser(userId, {
      agentNumber: agentNumber,
      updatedAt: new Date()
    });

    res.json(updatedUser);
  } catch (error) {
    console.error("Error assigning agent number:", error);
    res.status(500).json({ message: "Failed to assign agent number" });
  }
});

router.get("/api/admin/leads", authenticateToken, async (req: AuthRequest, res) => {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({ message: "Admin access required" });
  }

  try {
    console.log('[Admin Leads API] Fetching leads with filters:', req.query);
    const { status, assignedAgentId } = req.query;

    // Use the storage layer's getAllLeads function which handles mapping correctly
    const leads = await storage.getAllLeads(
      status as string || undefined,
      assignedAgentId as string || undefined
    );

    console.log(`[Admin Leads API] Found ${leads.length} leads`);

    // The storage layer already handles the snake_case to camelCase mapping
    res.json(leads);
  } catch (error: any) {
    console.error('[Admin Leads API] Error fetching leads:', error);
    res.status(500).json({ 
      message: "Failed to fetch leads",
      error: error.message 
    });
  }
});

// Add a members-only endpoint
router.get("/api/admin/members", authenticateToken, async (req: AuthRequest, res) => {
  if (req.user!.role !== 'admin' && req.user!.role !== 'agent') {
    return res.status(403).json({ message: "Admin or agent access required" });
  }

  try {
    console.log('[Admin Members API] Fetching members only...');
    const membersResult = await storage.getMembersOnly();

    console.log(`[Admin Members API] Found ${membersResult.users.length} members`);
    res.json(membersResult);
  } catch (error: any) {
    console.error('[Admin Members API] Error fetching members:', error);
    res.status(500).json({ 
      message: "Failed to fetch members",
      error: error.message 
    });
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
    const { days = "30", refresh = "false" } = req.query;

    console.log(`[Analytics API] Fetching analytics for ${days} days (refresh: ${refresh})`);

    // Get comprehensive analytics data
    const analytics = await storage.getComprehensiveAnalytics(parseInt(days as string));

    console.log('[Analytics API] Analytics overview:', {
      totalMembers: analytics.overview?.totalMembers || 0,
      activeSubscriptions: analytics.overview?.activeSubscriptions || 0,
      monthlyRevenue: analytics.overview?.monthlyRevenue || 0,
      recentEnrollments: analytics.recentEnrollments?.length || 0
    });

    res.json(analytics);
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({ message: "Failed to fetch analytics", error: error.message });
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

router.post("/api/admin/reports/export", authenticateToken, async (req: AuthRequest, res) => {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({ message: "Admin access required" });
  }

  try {
    const { reportType, format, timeRange, email, data } = req.body;

    if (email) {
      // Send report via email
      const emailContent = await generateReportEmail(reportType, data, format);

      // Here you would integrate with your email service
      // For now, we'll just simulate success
      console.log(`Sending ${reportType} report to ${email}`);

      res.json({ message: "Report sent successfully" });
    } else {
      // Generate file for download
      const fileBuffer = await generateReportFile(reportType, data, format);

      const contentTypes = {
        csv: 'text/csv',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        pdf: 'application/pdf'
      };

      res.setHeader('Content-Type', contentTypes[format as keyof typeof contentTypes]);
      res.setHeader('Content-Disposition', `attachment; filename="${reportType}_report.${format}"`);
      res.send(fileBuffer);
    }
  } catch (error) {
    console.error("Error exporting report:", error);
    res.status(500).json({ message: "Failed to export report" });
  }
});

async function generateReportEmail(reportType: string, data: any, format: string): Promise<string> {
  // Generate email content based on report type
  return `Your ${reportType} report is ready and has been generated in ${format} format.`;
}

async function generateReportFile(reportType: string, data: any, format: string): Promise<Buffer> {
  if (format === 'csv') {
    return generateCSV(reportType, data);
  } else if (format === 'xlsx') {
    return generateExcel(reportType, data);
  } else if (format === 'pdf') {
    return generatePDF(reportType, data);
  }
  throw new Error('Unsupported format');
}

function generateCSV(reportType: string, data: any): Buffer {
  let csvContent = '';

  if (reportType === 'members' && Array.isArray(data)) {
    csvContent = 'Name,Email,Phone,Plan,Status,Enrolled Date,Total Paid,Agent\n';
    data.forEach((member: any) => {
      csvContent += `"${member.firstName} ${member.lastName}",${member.email},${member.phone},${member.planName},${member.status},${member.enrolledDate},${member.totalPaid},${member.agentName}\n`;
    });
  } else if (reportType === 'agents' && Array.isArray(data)) {
    csvContent = 'Agent Name,Agent Number,Total Enrollments,Monthly Enrollments,Total Commissions,Paid Commissions,Pending Commissions,Conversion Rate\n';
    data.forEach((agent: any) => {
      csvContent += `${agent.agentName},${agent.agentNumber},${agent.totalEnrollments},${agent.monthlyEnrollments},${agent.totalCommissions},${agent.paidCommissions},${agent.pendingCommissions},${agent.conversionRate}%\n`;
    });
  } else if (reportType === 'commissions' && Array.isArray(data)) {
    csvContent = 'Agent,Agent Number,Member,Plan,Commission Amount,Plan Cost,Status,Payment Status,Created Date\n';
    data.forEach((commission: any) => {
      csvContent += `${commission.agentName},${commission.agentNumber},${commission.memberName},${commission.planName},${commission.commissionAmount},${commission.totalPlanCost},${commission.status},${commission.paymentStatus},${commission.createdDate}\n`;
    });
  }

  return Buffer.from(csvContent);
}

function generateExcel(reportType: string, data: any): Buffer {
  // For now, return CSV format - in production you'd use a library like xlsx
  return generateCSV(reportType, data);
}

function generatePDF(reportType: string, data: any): Buffer {
  // For now, return CSV format - in production you'd use a library like puppeteer or pdfkit
  return generateCSV(reportType, data);
}

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

// Agent member management routes
router.get("/api/agent/members", authenticateToken, async (req: AuthRequest, res) => {
  if (req.user!.role !== 'agent') {
    return res.status(403).json({ message: "Agent access required" });
  }

  try {
    // Get all users enrolled by this agent plus users they have commissions for
    const enrolledUsers = await storage.getAgentEnrollments(req.user!.id);

    // Get users from commissions
    const agentCommissions = await storage.getAgentCommissions(req.user!.id);
    const commissionUserIds = agentCommissions.map(c => c.userId);

    // Fetch additional users from commissions that weren't directly enrolled
    const additionalUsers = [];
    for (const userId of commissionUserIds) {
      if (!enrolledUsers.find(u => u.id === userId)) {
        const user = await storage.getUser(userId);
        if (user) additionalUsers.push(user);
      }
    }

    const allMembers = [...enrolledUsers, ...additionalUsers];

    // Get subscription info for each member
    const membersWithDetails = await Promise.all(allMembers.map(async (member) => {
      const subscription = await storage.getUserSubscription(member.id);
      const familyMembers = await storage.getFamilyMembers(member.id);

      return {
        ...member,
        subscription,
        familyMembers,
        totalFamilyMembers: familyMembers.length
      };
    }));

    res.json(membersWithDetails);
  } catch (error) {
    console.error("Error fetching agent members:", error);
    res.status(500).json({ message: "Failed to fetch agent members" });
  }
});

router.get("/api/agent/members/:memberId", authenticateToken, async (req: AuthRequest, res) => {
  if (req.user!.role !== 'agent') {
    return res.status(403).json({ message: "Agent access required" });
  }

  try {
    const { memberId } = req.params;

    // Verify agent has access to this member
    const member = await storage.getUser(memberId);
    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    // Check if agent enrolled this user or has commissions for them
    const hasAccess = member.enrolledByAgentId === req.user!.id || 
      await storage.getCommissionByUserId(memberId, req.user!.id);

    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this member" });
    }

    // Get complete member details
    const subscription = await storage.getUserSubscription(memberId);
    const familyMembers = await storage.getFamilyMembers(memberId);
    const payments = await storage.getUserPayments(memberId);

    res.json({
      ...member,
      subscription,
      familyMembers,
      payments: payments.slice(0, 10) // Last 10 payments
    });
  } catch (error) {
    console.error("Error fetching member details:", error);
    res.status(500).json({ message: "Failed to fetch member details" });
  }
});

router.put("/api/agent/members/:memberId", authenticateToken, async (req: AuthRequest, res) => {
  if (req.user!.role !== 'agent') {
    return res.status(403).json({ message: "Agent access required" });
  }

  try {
    const { memberId } = req.params;
    const updateData = req.body;

    // Verify agent has access to this member
    const member = await storage.getUser(memberId);
    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    const hasAccess = member.enrolledByAgentId === req.user!.id || 
      await storage.getCommissionByUserId(memberId, req.user!.id);

    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this member" });
    }

    // Remove protected fields that agents cannot modify
    delete updateData.id;
    delete updateData.email;
    delete updateData.role;
    delete updateData.approvalStatus;
    delete updateData.isActive;
    delete updateData.createdAt;
    delete updateData.enrolledByAgentId;
    // EPX payment system - no legacy payment fields to exclude

    // Validate phone number format if provided
    if (updateData.phone) {
      const phoneRegex = /^\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/;
      if (!phoneRegex.test(updateData.phone)) {
        return res.status(400).json({ message: "Invalid phone number format" });
      }
    }

    const updatedMember = await storage.updateUser(memberId, {
      ...updateData,
      updatedAt: new Date()
    });

    // Log the agent action
    console.log(`Agent ${req.user!.email} updated member ${memberId}:`, updateData);

    res.json(updatedMember);
  } catch (error) {
    console.error("Error updating member:", error);
    res.status(500).json({ message: "Failed to update member" });
  }
});

router.put("/api/agent/members/:memberId/subscription", authenticateToken, async (req: AuthRequest, res) => {
  if (req.user!.role !== 'agent') {
    return res.status(403).json({ message: "Agent access required" });
  }

  try {
    const { memberId } = req.params;
    const { planId, memberType } = req.body;

    // Verify agent has access to this member
    const member = await storage.getUser(memberId);
    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    const hasAccess = member.enrolledByAgentId === req.user!.id || 
      await storage.getCommissionByUserId(memberId, req.user!.id);

    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this member" });
    }

    // Get current subscription
    const currentSubscription = await storage.getUserSubscription(memberId);
    if (!currentSubscription) {
      return res.status(404).json({ message: "No active subscription found" });
    }

    // Get new plan details
    const newPlan = planId ? await storage.getPlan(planId) : null;
    if (!newPlan) {
      return res.status(404).json({ message: "Plan not found" });
    }

    // Update subscription plan but preserve billing dates
    const updatedSubscription = await storage.updateSubscription(currentSubscription.id, {
      planId: newPlan.id,
      amount: newPlan.price,
      updatedAt: new Date()
      // Note: NOT updating nextBillingDate, currentPeriodStart, currentPeriodEnd
    });

    // Update member type in user record if provided
    if (memberType) {
      await storage.updateUser(memberId, {
        memberType,
        updatedAt: new Date()
      });
    }

    // Log the agent action
    console.log(`Agent ${req.user!.email} updated subscription for member ${memberId}:`, {
      oldPlan: currentSubscription.planId,
      newPlan: newPlan.id,
      memberType
    });

    res.json({
      subscription: updatedSubscription,
      plan: newPlan,
      message: "Subscription updated successfully. Billing date unchanged."
    });
  } catch (error) {
    console.error("Error updating member subscription:", error);
    res.status(500).json({ message: "Failed to update subscription" });
  }
});

router.post("/api/agent/members/:memberId/family", authenticateToken, async (req: AuthRequest, res) => {
  if (req.user!.role !== 'agent') {
    return res.status(403).json({ message: "Agent access required" });
  }

  try {
    const { memberId } = req.params;
    const familyMemberData = req.body;

    // Verify agent has access to this member
    const member = await storage.getUser(memberId);
    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    const hasAccess = member.enrolledByAgentId === req.user!.id || 
      await storage.getCommissionByUserId(memberId, req.user!.id);

    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this member" });
    }

    const newFamilyMember = await storage.addFamilyMember({
      ...familyMemberData,
      primaryUserId: memberId
    });

    // Log the agent action
    console.log(`Agent ${req.user!.email} added family member for ${memberId}:`, familyMemberData.firstName, familyMemberData.lastName);

    res.status(201).json(newFamilyMember);
  } catch (error) {
    console.error("Error adding family member:", error);
    res.status(500).json({ message: "Failed to add family member" });
  }
});

router.get("/api/agent/stats", authenticateToken, async (req: AuthRequest, res) => {
  if (req.user!.role !== 'agent') {
    return res.status(403).json({ message: "Agent access required" });
  }

  try {
    const agentId = req.user!.id;

    // Get commission stats
    const commissionStats = await storage.getCommissionStats(agentId);

    // Get enrollment counts
    const enrollments = await storage.getAgentEnrollments(agentId);
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const monthlyEnrollments = enrollments.filter(e => 
      new Date(e.createdAt) >= thisMonth
    ).length;

    // Get active members count
    const activeMembers = enrollments.filter(e => e.isActive).length;

    res.json({
      totalEnrollments: enrollments.length,
      monthlyEnrollments,
      activeMembers,
      ...commissionStats
    });
  } catch (error) {
    console.error("Error fetching agent stats:", error);
    res.status(500).json({ message: "Failed to fetch agent stats" });
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
    const dpcMember = await storage.getUser(userId);

    // Check if agent or DPC member is admin (admins don't earn commissions)
    if (agent?.role === 'admin' || dpcMember?.role === 'admin') {
      console.log('Commission creation skipped - admin involved:', {
        agentRole: agent?.role,
        dpcMemberRole: dpcMember?.role,
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

  // Use the router
  app.use(router);

  // Register EPX routes
  app.use(epxRoutes);

  // Mock payment endpoint for testing
  app.post('/api/mock-payment', authMiddleware, async (req: any, res: any) => {
    try {
      const userId = req.user.id;
      const { planId, amount } = req.body;

      // Simulate payment processing delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Create a mock payment record
      const paymentId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const payment = await storage.createPayment({
        id: paymentId,
        userId: userId,
        amount: amount || 79,
        status: 'completed',
        transactionId: paymentId,
        paymentMethod: 'test-card',
        authorizationCode: 'TEST_AUTH_' + Math.random().toString(36).substr(2, 6),
        metadata: {
          environment: 'test',
          testPayment: true,
          bricToken: 'mock-token'
        }
      });

      // Create subscription if it doesn't exist
      let subscription = await storage.getSubscriptionByUserId(userId);
      if (!subscription) {
        subscription = await storage.createSubscription({
          userId: userId,
          planId: planId || 1,
          status: 'active',
          startDate: new Date(),
          nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
        });
      }

      console.log('[Mock Payment] Created test payment:', payment.id);

      res.json({
        success: true,
        paymentId: payment.id,
        transactionId: paymentId,
        message: 'Test payment processed successfully'
      });

    } catch (error: any) {
      console.error('[Mock Payment] Error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Mock payment failed'
      });
    }
  });

  // User profile routes
  // Get user profile
  app.get('/api/user/profile', authMiddleware, async (req: any, res: any) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        profileImageUrl: user.profileImageUrl,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt
      });
    } catch (error: any) {
      console.error('[Profile] Error fetching profile:', error);
      res.status(500).json({ error: 'Failed to fetch profile' });
    }
  });

  // Get user's login sessions
  app.get('/api/user/login-sessions', authMiddleware, async (req: any, res: any) => {
    try {
      const sessions = await storage.getUserLoginSessions(req.user.id);
      res.json(sessions);
    } catch (error: any) {
      console.error('[Sessions] Error fetching user sessions:', error);
      res.status(500).json({ error: 'Failed to fetch login sessions' });
    }
  });

  // Admin endpoint: Get all login sessions
  app.get('/api/admin/login-sessions', authMiddleware, adminRequired, async (req: any, res: any) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const sessions = await storage.getAllLoginSessions(limit);
      res.json(sessions);
    } catch (error: any) {
      console.error('[Admin Sessions] Error fetching all sessions:', error);
      res.status(500).json({ error: 'Failed to fetch login sessions' });
    }
  });

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

  // Toggle user status (activate/deactivate)
  router.put("/api/admin/users/:userId/toggle-status", authenticateToken, async (req: AuthRequest, res) => {
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { userId } = req.params;
      const { isActive, userRole } = req.body;

      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const newStatus = isActive !== undefined ? isActive : !user.isActive;

      // Update user status
      const updatedUser = await storage.updateUser(userId, {
        isActive: newStatus,
        updatedAt: new Date()
      });

      // Only handle subscription reactivation for actual members, NOT agents
      if (newStatus && (user.role === 'member' || user.role === 'user')) {
        try {
          const subscription = await storage.getUserSubscription(userId);
          if (subscription && subscription.status === 'cancelled') {
            await storage.updateSubscription(subscription.id, {
              status: 'active',
              updatedAt: new Date()
            });
            console.log(`Reactivated subscription for member ${userId}`);
          }
        } catch (error) {
          console.log('No subscription to reactivate or error reactivating:', error);
        }
      } else if (user.role === 'agent') {
        console.log(`Agent ${userId} status updated - no subscription handling needed`);
      }

      const userType = user.role === 'agent' ? 'Agent' : 'User';
      res.json({ 
        success: true, 
        user: updatedUser,
        message: `${userType} ${newStatus ? 'activated' : 'deactivated'} successfully`
      });
    } catch (error: any) {
      console.error('Error toggling user status:', error);
      res.status(500).json({ 
        message: error.message || "Failed to update user status" 
      });
    }
  });

  // Bulk reactivate all agents (emergency fix)
  router.post("/api/admin/reactivate-agents", authenticateToken, async (req: AuthRequest, res) => {
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      console.log('Bulk reactivating all agents...');

      // Get all agents
      const { users } = await storage.getAllUsers();
      const agents = users.filter(user => user.role === 'agent');

      console.log(`Found ${agents.length} agents to reactivate`);

      const reactivatedAgents = [];

      for (const agent of agents) {
        if (!agent.isActive) {
          try {
            const updatedAgent = await storage.updateUser(agent.id, {
              isActive: true,
              updatedAt: new Date()
            });
            reactivatedAgents.push(updatedAgent);
            console.log(`Reactivated agent: ${agent.email}`);
          } catch (error) {
            console.error(`Failed to reactivate agent ${agent.email}:`, error);
          }
        }
      }

      res.json({
        success: true,
        message: `Successfully reactivated ${reactivatedAgents.length} agents`,
        reactivatedCount: reactivatedAgents.length,
        totalAgents: agents.length
      });
    } catch (error: any) {
      console.error('Error bulk reactivating agents:', error);
      res.status(500).json({
        message: error.message || "Failed to reactivate agents"
      });
    }
  });


  // Create and return the server
  const { createServer } = await import("http");
  return createServer(app);
}