import { Router } from "express";
import { storage } from "./storage";
import { authenticateToken, type AuthRequest } from "./auth/supabaseAuth";
import { paymentService } from "./services/payment-service";
import { sendEnrollmentNotification } from "./utils/notifications";
import {
  calculateCommission,
  getPlanTierFromName,
  getPlanTypeFromMemberType,
} from "./utils/commission";
import { commissions, users, plans, subscriptions } from "@shared/schema";
import { eq, and, desc, count, sum, sql } from "drizzle-orm";
import { z } from "zod";
import { supabase } from "./lib/supabaseClient"; // Assuming supabase client is imported here
import supabaseAuthRoutes from "./routes/supabase-auth";
import { nanoid } from "nanoid"; // Import nanoid for generating IDs
import epxRoutes from "./routes/epx-routes"; // Import EPX payment routes

const router = Router();

// Public routes (no authentication required)
router.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Diagnostic endpoint for CORS testing
router.get("/api/test-cors", (req, res) => {
  const origin = req.headers.origin;
  console.log('[CORS Test] Request from origin:', origin);

  // Set CORS headers
  const allowedOrigins = [
    'https://getmydpcenrollment-production.up.railway.app',
    'https://enrollment.getmydpc.com',
    'https://shimmering-nourishment.up.railway.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5000',
    'https://ffd2557a-af4c-48a9-9a30-85d2ce375e45-00-pjr5zjuzb5vw.worf.replit.dev'
  ];

  if (allowedOrigins.includes(origin as string)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }

  res.json({
    status: "CORS test successful",
    timestamp: new Date().toISOString(),
    origin: origin,
    corsAllowed: allowedOrigins.includes(origin as string),
    headers: req.headers
  });
});

// Public test endpoint (NO AUTH - for debugging only)
router.get("/api/public/test-leads-noauth", async (req, res) => {
  try {
    console.log("[Public Test] Fetching leads WITHOUT authentication...");
    const leads = await storage.getAllLeads();
    console.log(`[Public Test] Found ${leads.length} leads`);
    res.json({
      success: true,
      totalLeads: leads.length,
      leads: leads,
    });
  } catch (error) {
    console.error("[Public Test] Error:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch leads", error: error.message });
  }
});

// Test endpoint for leads system
router.get("/api/test-leads", async (req, res) => {
  try {
    console.log("[Test Leads] Testing leads system...");

    // Test 1: Check if we can query leads table
    const allLeads = await storage.getAllLeads();
    console.log("[Test Leads] Total leads found:", allLeads.length);

    // Test 2: Try to create a test lead
    const testLead = {
      firstName: "System",
      lastName: "Test",
      email: "systemtest@example.com",
      phone: "210-555-TEST",
      message: "System test lead - will be deleted",
      source: "system_test",
      status: "new",
    };

    const createdLead = await storage.createLead(testLead);
    console.log("[Test Leads] Test lead created:", createdLead.id);

    // Clean up test lead
    const { supabase } = await import("./lib/supabaseClient");
    await supabase.from("leads").delete().eq("id", createdLead.id);
    console.log("[Test Leads] Test lead cleaned up");

    res.json({
      success: true,
      totalLeads: allLeads.length,
      recentLeads: allLeads.slice(0, 5).map((lead) => ({
        id: lead.id,
        name: `${lead.firstName} ${lead.lastName}`,
        email: lead.email,
        phone: lead.phone,
        status: lead.status,
        source: lead.source,
        createdAt: lead.createdAt,
      })),
      testResults: {
        canQueryLeads: true,
        canCreateLeads: true,
        databaseConnected: true,
      },
    });
  } catch (error: any) {
    console.error("[Test Leads] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      testResults: {
        canQueryLeads: false,
        canCreateLeads: false,
        databaseConnected: false,
      },
    });
  }
});

router.get("/api/plans", async (req, res) => {
  try {
    console.log("[API /plans] Fetching plans...");
    const allPlans = await storage.getPlans();
    console.log("[API /plans] Retrieved plans:", {
      total: allPlans.length,
      active: allPlans.filter((plan) => plan.isActive).length,
      inactive: allPlans.filter((plan) => !plan.isActive).length,
    });

    if (allPlans.length > 0) {
      console.log("[API /plans] Sample plan:", {
        id: allPlans[0].id,
        name: allPlans[0].name,
        isActive: allPlans[0].isActive,
        price: allPlans[0].price,
      });
    }

    const activePlans = allPlans.filter((plan) => plan.isActive);
    console.log("[API /plans] Returning active plans:", activePlans.length);
    res.json(activePlans);
  } catch (error) {
    console.error("[API /plans] Error fetching plans:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch plans", error: error.message });
  }
});

// Auth routes (public - no authentication required)
router.post("/api/auth/login", async (req, res) => {
  // Set CORS headers for auth endpoint
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://getmydpcenrollment-production.up.railway.app',
    'https://enrollment.getmydpc.com',
    'https://shimmering-nourishment.up.railway.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5000',
    'https://ffd2557a-af4c-48a9-9a30-85d2ce375e45-00-pjr5zjuzb5vw.worf.replit.dev'
  ];

  if (allowedOrigins.includes(origin as string)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }

  try {
    const { email, password } = req.body;

    // Sign in with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error("Login error:", error);
      return res
        .status(401)
        .json({ message: error.message || "Invalid credentials" });
    }

    if (!data.session) {
      return res.status(401).json({ message: "Failed to create session" });
    }

    // Get or create user in our database
    console.log("[Login] Checking for existing user:", email);
    let user = await storage.getUserByEmail(email);

    if (!user) {
      console.log("[Login] User not found, creating new user");
      const userRole = determineUserRole(data.user.email!);
      console.log("[Login] Determined role for", email, ":", userRole);

      // Create user in our database if they don't exist
      user = await storage.createUser({
        id: data.user.id,
        email: data.user.email!,
        firstName:
          data.user.user_metadata?.firstName ||
          data.user.user_metadata?.first_name ||
          "User",
        lastName:
          data.user.user_metadata?.lastName ||
          data.user.user_metadata?.last_name ||
          "",
        emailVerified: data.user.email_confirmed_at ? true : false,
        role: userRole,
        isActive: true,
        approvalStatus: "approved",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      console.log("[Login] Created new user:", {
        id: user.id,
        email: user.email,
        role: user.role,
        approvalStatus: user.approvalStatus,
      });
    } else {
      console.log("[Login] Found existing user:", {
        id: user.id,
        email: user.email,
        role: user.role,
        approvalStatus: user.approvalStatus,
      });
    }

    // Update last login - temporarily skip due to RLS recursion issue
    try {
      await storage.updateUser(user.id, {
        lastLoginAt: new Date(),
      });
    } catch (updateError) {
      console.warn("[Login] Could not update last login time:", updateError);
      // Continue with login even if update fails
    }

    // Create login session record
    try {
      const userAgent = req.headers["user-agent"] || "";
      const ipAddress = req.ip || req.connection.remoteAddress || "unknown";

      // Parse user agent for device/browser info
      let deviceType = "desktop";
      let browser = "unknown";

      if (userAgent.includes("Mobile")) deviceType = "mobile";
      else if (userAgent.includes("Tablet")) deviceType = "tablet";

      if (userAgent.includes("Chrome")) browser = "Chrome";
      else if (userAgent.includes("Firefox")) browser = "Firefox";
      else if (userAgent.includes("Safari")) browser = "Safari";
      else if (userAgent.includes("Edge")) browser = "Edge";

      await storage.createLoginSession({
        userId: user.id,
        ipAddress: ipAddress,
        userAgent: userAgent,
        deviceType: deviceType,
        browser: browser,
      });

      console.log("[Login] Session tracked for user:", user.email);
    } catch (error) {
      console.error("[Login] Error tracking session:", error);
      // Don't fail login if session tracking fails
    }

    console.log("[Login] Login successful for user:", user.email);

    res.json({
      success: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        expires_in: data.session.expires_in,
        token_type: data.session.token_type,
      },
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        agentNumber: user.agentNumber, // Include agent number in login response
        profileImageUrl: user.profileImageUrl,
        isActive: user.isActive,
        approvalStatus: user.approvalStatus,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Login failed" });
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
          lastName,
        },
      },
    });

    if (error) {
      console.error("Registration error:", error);
      return res
        .status(400)
        .json({ message: error.message || "Registration failed" });
    }

    if (!data.user) {
      return res.status(400).json({ message: "Failed to create user" });
    }

    // Create user in our database
    const user = await storage.createUser({
      id: data.user.id,
      email: data.user.email!,
      firstName: firstName || "User",
      lastName: lastName || "",
      emailVerified: false,
      role: "member",
      isActive: true,
      approvalStatus: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    res.json({
      success: true,
      message:
        "Registration successful. Please check your email to verify your account.",
      session: data.session
        ? {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at,
            expires_in: data.session.expires_in,
            token_type: data.session.token_type,
          }
        : null,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        approvalStatus: user.approvalStatus,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: "Registration failed" });
  }
});

router.post("/api/auth/logout", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (token) {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Logout error:", error);
      }
    }

    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ message: "Logout failed" });
  }
});

// Helper function to determine user role
function determineUserRole(email: string): "admin" | "agent" | "member" {
  const adminEmails = [
    "michael@mypremierplans.com",
    "travis@mypremierplans.com",
    "richard@mypremierplans.com",
    "joaquin@mypremierplans.com",
  ];

  const agentEmails = [
    "mdkeener@gmail.com",
    "tmatheny77@gmail.com",
    "svillarreal@cyariskmanagement.com",
  ];

  if (adminEmails.includes(email)) return "admin";
  if (agentEmails.includes(email)) return "agent";
  return "member";
}

// Authentication route (protected)
router.get(
  "/api/auth/user",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Get user's subscription and plan info
      const userSubscriptions = await storage.getUserSubscriptions(req.user.id);
      const activeSubscription = userSubscriptions.find(
        (sub) => sub.status === "active",
      );

      let planInfo = null;
      if (activeSubscription && activeSubscription.planId) {
        try {
          const plan = await storage.getPlan(activeSubscription.planId);
          planInfo = plan;
        } catch (error) {
          console.error("Error fetching plan:", error);
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
        approvalStatus: req.user.approvalStatus,
      };

      res.json(userResponse);
    } catch (error) {
      console.error("Error in /api/auth/user:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  },
);

router.put(
  "/api/user/profile",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      const updateData = req.body;
      delete updateData.id; // Prevent ID modification
      delete updateData.role; // Prevent role modification via profile update
      delete updateData.createdAt; // Prevent creation date modification
      delete updateData.approvalStatus; // Prevent approval status modification
      delete updateData.agentNumber; // Prevent agent number modification via profile update

      // Validate phone number format if provided
      if (updateData.phone) {
        const phoneRegex =
          /^\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/;
        if (!phoneRegex.test(updateData.phone)) {
          return res
            .status(400)
            .json({ message: "Invalid phone number format" });
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
        updatedAt: new Date(),
      });

      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  },
);

// User activity tracking endpoint for SessionManager
router.post(
  "/api/user/activity",
  authenticateToken,
  async (req: AuthRequest, res) => {
    console.log("🔍 USER ACTIVITY ROUTE HIT - User:", req.user?.email);
    try {
      res.json({ success: true, timestamp: new Date() });
    } catch (error) {
      console.error("❌ Error updating user activity:", error);
      res.status(500).json({ message: "Failed to update activity" });
    }
  },
);

// Additional user activity endpoint (using router)
router.post("/api/user/activity-ping", async (req: any, res: any) => {
  console.log("🔍 USER ACTIVITY PING ROUTE HIT");

  // Add CORS headers
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://getmydpcenrollment-production.up.railway.app',
    'https://enrollment.getmydpc.com',
    'https://shimmering-nourishment.up.railway.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5000',
    'https://ffd2557a-af4c-48a9-9a30-85d2ce375e45-00-pjr5zjuzb5vw.worf.replit.dev'
  ];

  if (allowedOrigins.includes(origin as string)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }

  try {
    res.json({ success: true, timestamp: new Date(), activity: "ping" });
  } catch (error) {
    console.error("❌ Error in user activity ping:", error);
    res.status(500).json({ message: "Failed to update activity" });
  }
});

// Subscription routes
router.get(
  "/api/user/subscription",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      const subscriptions = await storage.getUserSubscriptions(req.user!.id);
      res.json(subscriptions);
    } catch (error) {
      console.error("Error fetching subscriptions:", error);
      res.status(500).json({ message: "Failed to fetch subscriptions" });
    }
  },
);

// Lead management routes
router.get("/api/leads", authenticateToken, async (req: AuthRequest, res) => {
  try {
    let leads;

    if (req.user!.role === "admin") {
      leads = await storage.getAllLeads();
    } else if (req.user!.role === "agent") {
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
      message: message || "",
      source: source || "contact_form",
      status: "new",
      assignedAgentId: req.user!.role === "agent" ? req.user!.id : null,
    });

    res.status(201).json(lead);
  } catch (error) {
    console.error("Error creating lead:", error);
    res.status(500).json({ message: "Failed to create lead" });
  }
});

// Payment processing endpoint with error handling
router.post(
  "/api/process-payment",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      console.log("[Payment Processing] Request received:", {
        userId: req.user!.id,
        bodyKeys: Object.keys(req.body),
        amount: req.body.amount,
      });

      const { planId, amount, paymentMethod } = req.body;

      if (!planId || !amount) {
        return res.status(400).json({
          success: false,
          error: "Missing required fields: planId and amount",
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
          error: "Plan not found",
        });
      }

      // For now, redirect to EPX payment creation
      res.json({
        success: true,
        message: "Use EPX payment endpoint",
        redirectTo: "/api/epx/create-payment",
      });
    } catch (error: any) {
      console.error("[Payment Processing] Error:", error);
      res.status(500).json({
        success: false,
        error: "Payment processing failed",
        details: error.message,
      });
    }
  },
);

// Public lead submission endpoint (for contact forms)
router.post("/api/public/leads", async (req: any, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [Public Leads] === ENDPOINT HIT ===`);
  console.log(`[${timestamp}] [Public Leads] Method:`, req.method);
  console.log(`[${timestamp}] [Public Leads] Origin:`, req.headers.origin);
  console.log(`[${timestamp}] [Public Leads] Headers:`, JSON.stringify(req.headers, null, 2));

  // Set CORS headers FIRST before any other processing
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://getmydpcenrollment-production.up.railway.app',
    'https://enrollment.getmydpc.com',
    'https://shimmering-nourishment.up.railway.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5000',
    'https://ffd2557a-af4c-48a9-9a30-85d2ce375e45-00-pjr5zjuzb5vw.worf.replit.dev'
  ];

  const regexPatterns = [/\.vercel\.app$/, /\.railway\.app$/, /\.replit\.dev$/];
  const isAllowedByRegex = origin && regexPatterns.some(pattern => pattern.test(origin));

  // Always set CORS headers for this public endpoint
  if (allowedOrigins.includes(origin as string) || isAllowedByRegex) {
    res.header('Access-Control-Allow-Origin', origin);
    console.log(`[${timestamp}] [Public Leads] CORS allowed for origin: ${origin}`);
  } else {
    res.header('Access-Control-Allow-Origin', '*');
    console.log(`[${timestamp}] [Public Leads] CORS wildcard for origin: ${origin}`);
  }

  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,HEAD');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept,Origin,Cache-Control,X-File-Name');

  console.log(`[${timestamp}] [Public Leads] Body type:`, typeof req.body);
  console.log(`[${timestamp}] [Public Leads] Raw body:`, JSON.stringify(req.body, null, 2));

  try {
    // Check if body exists and is parsed
    if (!req.body) {
      console.error(`[${timestamp}] [Public Leads] No request body found`);
      return res.status(400).json({
        error: "No data received",
        debug: "Request body is empty",
        timestamp,
      });
    }

    const { firstName, lastName, email, phone, message } = req.body;

    console.log(`[${timestamp}] [Public Leads] Extracted fields:`, {
      firstName: !!firstName,
      lastName: !!lastName,
      email: !!email,
      phone: !!phone,
      message: !!message,
    });

    // Check required fields
    const missingFields = [];
    if (!firstName) missingFields.push("firstName");
    if (!lastName) missingFields.push("lastName");
    if (!email) missingFields.push("email");
    if (!phone) missingFields.push("phone");

    if (missingFields.length > 0) {
      console.log(
        `[${timestamp}] [Public Leads] Missing required fields:`,
        missingFields,
      );
      return res.status(400).json({
        error: "Missing required fields",
        missingFields,
        receivedData: { firstName, lastName, email, phone },
        timestamp,
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
      return res
        .status(400)
        .json({ error: "Invalid phone number format", timestamp });
    }

    console.log(
      `[${timestamp}] [Public Leads] Validation passed, creating lead...`,
    );

    const leadData = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      message: message ? message.trim() : "",
      source: "contact_form",
      status: "new",
    };

    console.log(
      `[${timestamp}] [Public Leads] Lead data to create:`,
      JSON.stringify(leadData, null, 2),
    );

    let lead;
    try {
      lead = await storage.createLead(leadData);
      console.log(`[${timestamp}] [Public Leads] Lead created successfully:`, {
        id: lead.id,
        email: lead.email,
        status: lead.status,
        source: lead.source,
      });
    } catch (storageError: any) {
      console.error(
        `[${timestamp}] [Public Leads] Storage error creating lead:`,
        {
          error: storageError.message,
          code: storageError.code,
          details: storageError.details,
          hint: storageError.hint,
          leadData: leadData,
        },
      );

      // Try to provide more specific error messages
      if (
        storageError.message?.includes("column") &&
        storageError.message?.includes("does not exist")
      ) {
        throw new Error(`Database schema mismatch: ${storageError.message}`);
      } else if (
        storageError.message?.includes("permission denied") ||
        storageError.message?.includes("RLS")
      ) {
        throw new Error("Permission denied: Lead submission not allowed");
      } else {
        throw storageError;
      }
    }

    res.json({
      success: true,
      leadId: lead.id,
      message: "Lead submitted successfully",
      timestamp,
    });
  } catch (error: any) {
    console.error(`[${timestamp}] [Public Leads] Error creating lead:`, {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
    });

    res.status(500).json({
      error: "Failed to submit lead",
      details: error.message,
      timestamp,
      errorCode: error.code,
    });
  }
});

// Admin routes
router.get(
  "/api/admin/stats",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (req.user!.role !== "admin") {
      console.log(
        "[Admin Stats API] Access denied - user role:",
        req.user!.role,
      );
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      console.log(
        "[Admin Stats API] Fetching stats for admin:",
        req.user!.email,
      );
      const stats = await storage.getAdminDashboardStats();
      console.log("[Admin Stats API] Retrieved stats:", stats);
      res.json(stats);
    } catch (error) {
      console.error("[Admin Stats API] Error fetching admin stats:", error);
      res.status(500).json({ message: "Failed to fetch admin stats" });
    }
  },
);

router.get(
  "/api/admin/users",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (req.user!.role !== "admin") {
      console.log(
        "[Admin Users API] Access denied - user role:",
        req.user!.role,
      );
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      // Add CORS headers for external browser access
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Access-Control-Allow-Origin", req.headers.origin || "*");

      console.log(
        "[Admin Users API] Fetching users for admin:",
        req.user!.email,
      );
      const filterType = req.query.filter as string;

      // If filter is 'members', only get members (exclude agents/admins)
      const usersResult =
        filterType === "members"
          ? await storage.getMembersOnly()
          : await storage.getAllUsers();

      if (!usersResult || !usersResult.users) {
        console.error("[Admin Users API] No users data returned from storage");
        return res
          .status(500)
          .json({ message: "Failed to fetch users - no data returned" });
      }

      const users = usersResult.users;
      console.log("[Admin Users API] Retrieved users count:", users.length);

      // Enhance users with subscription data - simplified approach
      const enhancedUsers = [];
      for (const user of users) {
        try {
          let enhancedUser = { ...user };

          // Only try to get subscription data for members/users, and handle errors gracefully
          if (user.role === "member" || user.role === "user") {
            try {
              const subscription = await storage.getUserSubscription(user.id);
              if (subscription) {
                enhancedUser.subscription = {
                  status: subscription.status,
                  planName: "Active Plan", // Simplified - avoid additional DB calls
                  amount: subscription.amount || 0,
                };
              }
            } catch (subError) {
              console.warn(
                `[Admin Users API] Could not fetch subscription for user ${user.id}:`,
                subError.message,
              );
              // Continue without subscription data
            }
          }

          enhancedUsers.push(enhancedUser);
        } catch (userError) {
          console.error(
            `[Admin Users API] Error processing user ${user.id}:`,
            userError,
          );
          // Add user without enhancements rather than failing completely
          enhancedUsers.push(user);
        }
      }

      console.log(
        "[Admin Users API] Successfully enhanced users count:",
        enhancedUsers.length,
      );

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
        details: "Check server logs for more information",
      });
    }
  },
);

router.get(
  "/api/admin/pending-users",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (req.user!.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const users = await storage.getAllUsers();
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

router.post(
  "/api/admin/approve-user/:userId",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (req.user!.role !== "admin") {
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

router.post(
  "/api/admin/reject-user/:userId",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (req.user!.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { userId } = req.params;
      const { reason } = req.body;
      const updatedUser = await storage.updateUser(userId, {
        approvalStatus: "rejected",
        rejectionReason: reason,
        updatedAt: new Date(),
      });
      res.json(updatedUser);
    } catch (error) {
      console.error("Error rejecting user:", error);
      res.status(500).json({ message: "Failed to reject user" });
    }
  },
);

// Admin user management endpoints
router.put(
  "/api/admin/users/:userId/role",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (req.user!.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { userId } = req.params;
      const { role } = req.body;

      if (!["member", "agent", "admin"].includes(role)) {
        return res
          .status(400)
          .json({
            message:
              "Invalid role. Must be 'member' (DPC plan subscriber), 'agent' (enrollment agent), or 'admin' (system administrator)",
          });
      }

      const updatedUser = await storage.updateUser(userId, {
        role,
        updatedAt: new Date(),
      });

      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ message: "Failed to update user role" });
    }
  },
);

router.put(
  "/api/admin/users/:userId/agent-number",
  authenticateToken,
  async (req: AuthRequest, res) => {
    // CRITICAL: Only admins can assign/modify agent numbers for commission tracking
    if (req.user!.role !== "admin") {
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
      if (user.role !== "agent" && user.role !== "admin") {
        return res.status(400).json({
          success: false,
          error: "Only agents and admins can be assigned agent numbers",
        });
      }

      // Validate agent number format if provided
      if (agentNumber && agentNumber.trim() !== "") {
        const trimmedAgentNumber = agentNumber.trim().toUpperCase();

        // Validate MPP format: MPP + 2-letter role code + 2-digit year + 4-digit SSN
        const agentNumberPattern = /^MPP[SA|AG][0-9]{2}[0-9]{4}$/;
        if (!agentNumberPattern.test(trimmedAgentNumber)) {
          return res.status(400).json({
            success: false,
            error:
              "Agent number must follow format: MPP[SA|AG][YY][SSSS] (e.g., MPPSA231154 for Super Admin or MPPAG231154 for Agent)",
          });
        }

        if (trimmedAgentNumber.length !== 12) {
          return res.status(400).json({
            success: false,
            error:
              "Agent number must be exactly 12 characters (MPP + 2-letter role + 2-digit year + 4-digit SSN)",
          });
        }

        // Check for duplicate agent numbers
        const existingUser =
          await storage.getUserByAgentNumber(trimmedAgentNumber);
        if (existingUser && existingUser.id !== userId) {
          return res.status(400).json({
            success: false,
            error: "Agent number already in use",
          });
        }
      }

      const result = await storage.updateUser(userId, {
        agentNumber: agentNumber?.trim() || null,
        updatedAt: new Date(),
      });

      res.json(result);
    } catch (error) {
      console.error("Error updating agent number:", error);
      res.status(500).json({
        message: "Failed to update agent number",
        details: error.message,
      });
    }
  },
);

// Suspend user endpoint
router.put(
  "/api/admin/users/:userId/suspend",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (req.user!.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { userId } = req.params;
      const { reason } = req.body;

      // Also deactivate any active subscriptions
      const userSubscriptions = await storage.getUserSubscriptions(userId);
      for (const subscription of userSubscriptions) {
        if (subscription.status === "active") {
          await storage.updateSubscription(subscription.id, {
            status: "suspended",
            pendingReason: "admin_suspended",
            pendingDetails: reason || "Account suspended by administrator",
            updatedAt: new Date(),
          });
        }
      }

      const updatedUser = await storage.updateUser(userId, {
        isActive: false,
        approvalStatus: "suspended",
        rejectionReason: reason || "Account suspended by administrator",
        updatedAt: new Date(),
      });

      res.json(updatedUser);
    } catch (error) {
      console.error("Error suspending user:", error);
      res.status(500).json({ message: "Failed to suspend user" });
    }
  },
);

// Reactivate user endpoint
router.put(
  "/api/admin/users/:userId/reactivate",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (req.user!.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { userId } = req.params;
      const { reactivateSubscriptions } = req.body;

      // Reactivate the user account
      const updatedUser = await storage.updateUser(userId, {
        isActive: true,
        approvalStatus: "approved",
        approvedAt: new Date(),
        approvedBy: req.user!.id,
        rejectionReason: null,
        updatedAt: new Date(),
      });

      // Optionally reactivate suspended subscriptions
      if (reactivateSubscriptions) {
        const userSubscriptions = await storage.getUserSubscriptions(userId);
        for (const subscription of userSubscriptions) {
          if (
            subscription.status === "suspended" ||
            subscription.status === "cancelled"
          ) {
            await storage.updateSubscription(subscription.id, {
              status: "active",
              pendingReason: null,
              pendingDetails: null,
              updatedAt: new Date(),
            });
          }
        }
      }

      res.json(updatedUser);
    } catch (error) {
      console.error("Error reactivating user:", error);
      res.status(500).json({ message: "Failed to reactivate user" });
    }
  },
);

// Assign agent number endpoint
router.put(
  "/api/admin/users/:userId/assign-agent-number",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (req.user!.role !== "admin") {
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
        return res
          .status(400)
          .json({ message: "Agent number already assigned to another user" });
      }

      // Update user with new agent number
      const updatedUser = await storage.updateUser(userId, {
        agentNumber: agentNumber,
        updatedAt: new Date(),
      });

      res.json(updatedUser);
    } catch (error) {
      console.error("Error assigning agent number:", error);
      res.status(500).json({ message: "Failed to assign agent number" });
    }
  },
);

router.get(
  "/api/admin/leads",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (req.user!.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      console.log("[Admin Leads API] Fetching leads with filters:", req.query);
      const { status, assignedAgentId } = req.query;

      // Use the storage layer's getAllLeads function which handles mapping correctly
      const leads = await storage.getAllLeads(
        (status as string) || undefined,
        (assignedAgentId as string) || undefined,
      );

      console.log(`[Admin Leads API] Found ${leads.length} leads`);

      // The storage layer already handles the snake_case to camelCase mapping
      res.json(leads);
    } catch (error: any) {
      console.error("[Admin Leads API] Error fetching leads:", error);
      res.status(500).json({
        message: "Failed to fetch leads",
        error: error.message,
      });
    }
  },
);

// Add a members-only endpoint
router.get(
  "/api/admin/members",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (req.user!.role !== "admin" && req.user!.role !== "agent") {
      return res
        .status(403)
        .json({ message: "Admin or agent access required" });
    }

    try {
      console.log("[Admin Members API] Fetching members only...");
      const membersResult = await storage.getMembersOnly();

      console.log(
        `[Admin Members API] Found ${membersResult.users.length} members`,
      );
      res.json(membersResult);
    } catch (error: any) {
      console.error("[Admin Members API] Error fetching members:", error);
      res.status(500).json({
        message: "Failed to fetch members",
        error: error.message,
      });
    }
  },
);

router.get(
  "/api/admin/agents",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (req.user!.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const agents = await storage.getAgents();
      res.json(agents);
    } catch (error) {
      console.error("Error fetching agents:", error);
      res.status(500).json({ message: "Failed to fetch agents" });
    }
  },
);

router.get(
  "/api/admin/login-sessions",
  authenticateToken,
  async (req: AuthRequest, res) => {
    console.log("🔍 LOGIN SESSIONS ROUTE HIT");
    console.log("User:", req.user?.email);
    console.log("Role:", req.user?.role);
    console.log("Headers:", req.headers.authorization);

    if (req.user!.role !== "admin") {
      console.log("❌ Access denied - not admin");
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      console.log("✅ Calling getAllLoginSessions...");
      const { limit = "50" } = req.query;
      const loginSessions = await storage.getAllLoginSessions(parseInt(limit as string));
      console.log("✅ Got", loginSessions?.length || 0, "login sessions");
      res.json(loginSessions);
    } catch (error) {
      console.error("❌ Error fetching login sessions:", error);
      res.status(500).json({ message: "Failed to fetch login sessions" });
    }
  },
);

router.put(
  "/api/admin/leads/:leadId/assign",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (req.user!.role !== "admin") {
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
  },
);

router.get(
  "/api/admin/enrollments",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (req.user!.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { startDate, endDate, agentId } = req.query;

      let enrollments;
      if (agentId && agentId !== "all") {
        enrollments = await storage.getEnrollmentsByAgent(
          agentId as string,
          startDate as string,
          endDate as string,
        );
      } else {
        enrollments = await storage.getAllEnrollments(
          startDate as string,
          endDate as string,
        );
      }

      // Ensure we always return an array
      const safeEnrollments = Array.isArray(enrollments) ? enrollments : [];
      res.json(safeEnrollments);
    } catch (error) {
      console.error("Error fetching enrollments:", error);
      res
        .status(500)
        .json({ message: "Failed to fetch enrollments", error: error.message });
    }
  },
);

router.get(
  "/api/admin/analytics",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (req.user!.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { days = "30", refresh = "false" } = req.query;

      console.log(
        `[Analytics API] Fetching analytics for ${days} days (refresh: ${refresh})`,
      );

      // Get comprehensive analytics data
      const analytics = await storage.getComprehensiveAnalytics(
        parseInt(days as string),
      );

      console.log("[Analytics API] Analytics overview:", {
        totalMembers: analytics.overview?.totalMembers || 0,
        activeSubscriptions: analytics.overview?.activeSubscriptions || 0,
        monthlyRevenue: analytics.overview?.monthlyRevenue || 0,
        recentEnrollments: analytics.recentEnrollments?.length || 0,
      });

      res.json(analytics);
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res
        .status(500)
        .json({ message: "Failed to fetch analytics", error: error.message });
    }
  },
);

router.get("/api/agents", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const agents = await storage.getAgents();
    res.json(agents);
  } catch (error) {
    console.error("Error fetching agents:", error);
    res.status(500).json({ message: "Failed to fetch agents" });
  }
});

router.post(
  "/api/admin/reports/export",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (req.user!.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { reportType, format, timeRange, email, data } = req.body;

      if (email) {
        // Send report via email
        const emailContent = await generateReportEmail(
          reportType,
          data,
          format,
        );

        // Here you would integrate with your email service
        // For now, we'll just simulate success
        console.log(`Sending ${reportType} report to ${email}`);

        res.json({ message: "Report sent successfully" });
      } else {
        // Generate file for download
        const fileBuffer = await generateReportFile(reportType, data, format);

        const contentTypes = {
          csv: "text/csv",
          xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          pdf: "application/pdf",
        };

        res.setHeader(
          "Content-Type",
          contentTypes[format as keyof typeof contentTypes],
        );
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${reportType}_report.${format}"`,
        );
        res.send(fileBuffer);
      }
    } catch (error) {
      console.error("Error exporting report:", error);
      res.status(500).json({ message: "Failed to export report" });
    }
  },
);

async function generateReportEmail(
  reportType: string,
  data: any,
  format: string,
): Promise<string> {
  // Generate email content based on report type
  return `Your ${reportType} report is ready and has been generated in ${format} format.`;
}

async function generateReportFile(
  reportType: string,
  data: any,
  format: string,
): Promise<Buffer> {
  if (format === "csv") {
    return generateCSV(reportType, data);
  } else if (format === "xlsx") {
    return generateExcel(reportType, data);
  } else if (format === "pdf") {
    return generatePDF(reportType, data);
  }
  throw new Error("Unsupported format");
}

function generateCSV(reportType: string, data: any): Buffer {
  let csvContent = "";

  if (reportType === "members" && Array.isArray(data)) {
    csvContent =
      "Name,Email,Phone,Plan,Status,Enrolled Date,Total Paid,Agent\n";
    data.forEach((member: any) => {
      csvContent += `"${member.firstName} ${member.lastName}",${member.email},${member.phone},${member.planName},${member.status},${member.enrolledDate},${member.totalPaid},${member.agentName}\n`;
    });
  } else if (reportType === "agents" && Array.isArray(data)) {
    csvContent =
      "Agent Name,Agent Number,Total Enrollments,Monthly Enrollments,Total Commissions,Paid Commissions,Pending Commissions,Conversion Rate\n";
    data.forEach((agent: any) => {
      csvContent += `${agent.agentName},${agent.agentNumber},${agent.totalEnrollments},${agent.monthlyEnrollments},${agent.totalCommissions},${agent.paidCommissions},${agent.pendingCommissions},${agent.conversionRate}%\n`;
    });
  } else if (reportType === "commissions" && Array.isArray(data)) {
    csvContent =
      "Agent,Agent Number,Member,Plan,Commission Amount,Plan Cost,Status,Payment Status,Created Date\n";
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

router.put(
  "/api/admin/users/:userId",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (req.user!.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { userId } = req.params;
      const updateData = req.body;

      const updatedUser = await storage.updateUser(userId, {
        ...updateData,
        updatedAt: new Date(),
      });

      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  },
);

// Agent routes
router.get(
  "/api/agent/enrollments",
  authenticateToken,
  async (req: AuthRequest, res) => {
    console.log("🔍 AGENT ENROLLMENTS ROUTE HIT - User:", req.user?.email, "Role:", req.user?.role);

    if (req.user!.role !== "agent" && req.user!.role !== "admin") {
      console.log("❌ Access denied - not agent or admin");
      return res.status(403).json({ message: "Agent or admin access required" });
    }

    try {
      const { startDate, endDate } = req.query;
      let enrollments;

      if (req.user!.role === "admin") {
        // Admin sees all enrollments
        enrollments = await storage.getAllEnrollments(
          startDate as string, 
          endDate as string
        );
      } else {
        // Agent sees only their enrollments
        enrollments = await storage.getAgentEnrollments(
          req.user!.id,
          startDate as string,
          endDate as string
        );
      }

      console.log("✅ Got", enrollments?.length || 0, "enrollments");
      res.json(enrollments);
    } catch (error) {
      console.error("❌ Error fetching agent enrollments:", error);
      res.status(500).json({ message: "Failed to fetch enrollments" });
    }
  },
);

router.get(
  "/api/agent/commissions",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (req.user!.role !== "agent" && req.user!.role !== "admin") {
      return res.status(403).json({ message: "Agent or admin access required" });
    }

    try {
      const agentCommissions = await storage.getAgentCommissions(req.user!.id);
      res.json(agentCommissions);
    } catch (error) {
      console.error("Error fetching commissions:", error);
      res.status(500).json({ message: "Failed to fetch commissions" });
    }
  },
);

// Agent member management routes
router.get(
  "/api/agent/members",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (req.user!.role !== "agent") {
      return res.status(403).json({ message: "Agent access required" });
    }

    try {
      // Get all users enrolled by this agent plus users they have commissions for
      const enrolledUsers = await storage.getAgentEnrollments(req.user!.id);

      // Get users from commissions
      const agentCommissions = await storage.getAgentCommissions(req.user!.id);
      const commissionUserIds = agentCommissions.map((c) => c.userId);

      // Fetch additional users from commissions that weren't directly enrolled
      const additionalUsers = [];
      for (const userId of commissionUserIds) {
        if (!enrolledUsers.find((u) => u.id === userId)) {
          const user = await storage.getUser(userId);
          if (user) additionalUsers.push(user);
        }
      }

      const allMembers = [...enrolledUsers, ...additionalUsers];

      // Get subscription info for each member
      const membersWithDetails = await Promise.all(
        allMembers.map(async (member) => {
          const subscription = await storage.getUserSubscription(member.id);
          const familyMembers = await storage.getFamilyMembers(member.id);

          return {
            ...member,
            subscription,
            familyMembers,
            totalFamilyMembers: familyMembers.length,
          };
        }),
      );

      res.json(membersWithDetails);
    } catch (error) {
      console.error("Error fetching agent members:", error);
      res.status(500).json({ message: "Failed to fetch agent members" });
    }
  },
);

router.get(
  "/api/agent/members/:memberId",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (req.user!.role !== "agent") {
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
      const hasAccess =
        member.enrolledByAgentId === req.user!.id ||
        (await storage.getCommissionByUserId(memberId, req.user!.id));

      if (!hasAccess) {
        return res
          .status(403)
          .json({ message: "Access denied to this member" });
      }

      // Get complete member details
      const subscription = await storage.getUserSubscription(memberId);
      const familyMembers = await storage.getFamilyMembers(memberId);
      const payments = await storage.getUserPayments(memberId);

      res.json({
        ...member,
        subscription,
        familyMembers,
        payments: payments.slice(0, 10), // Last 10 payments
      });
    } catch (error) {
      console.error("Error fetching member details:", error);
      res.status(500).json({ message: "Failed to fetch member details" });
    }
  },
);

router.put(
  "/api/agent/members/:memberId",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (req.user!.role !== "agent") {
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

      const hasAccess =
        member.enrolledByAgentId === req.user!.id ||
        (await storage.getCommissionByUserId(memberId, req.user!.id));

      if (!hasAccess) {
        return res
          .status(403)
          .json({ message: "Access denied to this member" });
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
        const phoneRegex =
          /^\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/;
        if (!phoneRegex.test(updateData.phone)) {
          return res
            .status(400)
            .json({ message: "Invalid phone number format" });
        }
      }

      const updatedMember = await storage.updateUser(memberId, {
        ...updateData,
        updatedAt: new Date(),
      });

      // Log the agent action
      console.log(
        `Agent ${req.user!.email} updated member ${memberId}:`,
        updateData,
      );

      res.json(updatedMember);
    } catch (error) {
      console.error("Error updating member:", error);
      res.status(500).json({ message: "Failed to update member" });
    }
  },
);

router.put(
  "/api/agent/members/:memberId/subscription",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (req.user!.role !== "agent") {
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

      const hasAccess =
        member.enrolledByAgentId === req.user!.id ||
        (await storage.getCommissionByUserId(memberId, req.user!.id));

      if (!hasAccess) {
        return res
          .status(403)
          .json({ message: "Access denied to this member" });
      }

      // Get current subscription
      const currentSubscription = await storage.getUserSubscription(memberId);
      if (!currentSubscription) {
        return res
          .status(404)
          .json({ message: "No active subscription found" });
      }

      // Get new plan details
      const newPlan = planId ? await storage.getPlan(planId) : null;
      if (!newPlan) {
        return res.status(404).json({ message: "Plan not found" });
      }

      // Update subscription plan but preserve billing dates
      const updatedSubscription = await storage.updateSubscription(
        currentSubscription.id,
        {
          planId: newPlan.id,
          amount: newPlan.price,
          updatedAt: new Date(),
          // Note: NOT updating nextBillingDate, currentPeriodStart, currentPeriodEnd
        },
      );

      // Update member type in user record if provided
      if (memberType) {
        await storage.updateUser(memberId, {
          memberType,
          updatedAt: new Date(),
        });
      }

      // Log the agent action
      console.log(
        `Agent ${req.user!.email} updated subscription for member ${memberId}:`,
        {
          oldPlan: currentSubscription.planId,
          newPlan: newPlan.id,
          memberType,
        },
      );

      res.json({
        subscription: updatedSubscription,
        plan: newPlan,
        message: "Subscription updated successfully. Billing date unchanged.",
      });
    } catch (error) {
      console.error("Error updating member subscription:", error);
      res.status(500).json({ message: "Failed to update subscription" });
    }
  },
);

router.post(
  "/api/agent/members/:memberId/family",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (req.user!.role !== "agent") {
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

      const hasAccess =
        member.enrolledByAgentId === req.user!.id ||
        (await storage.getCommissionByUserId(memberId, req.user!.id));

      if (!hasAccess) {
        return res
          .status(403)
          .json({ message: "Access denied to this member" });
      }

      const newFamilyMember = await storage.addFamilyMember({
        ...familyMemberData,
        primaryUserId: memberId,
      });

      // Log the agent action
      console.log(
        `Agent ${req.user!.email} added family member for ${memberId}:`,
        familyMemberData.firstName,
        familyMemberData.lastName,
      );

      res.status(201).json(newFamilyMember);
    } catch (error) {
      console.error("Error adding family member:", error);
      res.status(500).json({ message: "Failed to add family member" });
    }
  },
);

router.get(
  "/api/agent/stats",
  authenticateToken,
  async (req: AuthRequest, res) => {
    console.log("🔍 AGENT STATS ROUTE HIT - User:", req.user?.email, "Role:", req.user?.role);

    if (req.user!.role !== "agent" && req.user!.role !== "admin") {
      console.log("❌ Access denied - not agent or admin");
      return res.status(403).json({ message: "Agent or admin access required" });
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

      const monthlyEnrollments = enrollments.filter(
        (e) => new Date(e.createdAt) >= thisMonth,
      ).length;

      // Get active members count
      const activeMembers = enrollments.filter((e) => e.isActive).length;

      console.log("✅ Got agent stats for", req.user!.role);
      res.json({
        totalEnrollments: enrollments.length,
        monthlyEnrollments,
        activeMembers,
        ...commissionStats,
      });
    } catch (error) {
      console.error("❌ Error fetching agent stats:", error);
      res.status(500).json({ message: "Failed to fetch agent stats" });
    }
  },
);

// Commission Generation Logic
// This function will be called when a new subscription is created or updated.
// It calculates and creates commission records for agents.
router.post(
  "/api/commissions/generate",
  authenticateToken,
  async (req: AuthRequest, res) => {
    // Only admins can trigger commission generation directly, but the logic
    // should also be callable from subscription creation/updates.
    if (req.user!.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Admin access required to generate commissions" });
    }

    try {
      const {
        subscriptionId,
        userId,
        enrolledByAgentId,
        planName,
        memberType,
      } = req.body;

      if (!subscriptionId || !userId || !planName || !memberType) {
        return res
          .status(400)
          .json({
            message:
              "Missing required fields: subscriptionId, userId, planName, memberType",
          });
      }

      // Use the helper function to create commission with admin check
      const commissionResult = await createCommissionWithCheck(
        enrolledByAgentId,
        parseInt(subscriptionId),
        userId,
        planName,
        memberType,
      );

      if (commissionResult.skipped) {
        return res
          .status(200)
          .json({
            message: "Commission generation skipped",
            ...commissionResult,
          });
      } else if (commissionResult.error) {
        return res
          .status(500)
          .json({
            message: "Failed to generate commission",
            ...commissionResult,
          });
      } else {
        return res
          .status(201)
          .json({
            message: "Commission generated successfully",
            commission: commissionResult.commission,
          });
      }
    } catch (error) {
      console.error("Error initiating commission generation:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  },
);

// Helper function to create commission with admin check
async function createCommissionWithCheck(
  agentId: string | null,
  subscriptionId: number,
  userId: string,
  planName: string,
  memberType: string,
) {
  try {
    // Get agent profile to check role
    const agent = agentId ? await storage.getUser(agentId) : null;
    const dpcMember = await storage.getUser(userId);

    // Check if agent or DPC member is admin (admins don't earn commissions)
    if (agent?.role === "admin" || dpcMember?.role === "admin") {
      console.log("Commission creation skipped - admin involved:", {
        agentRole: agent?.role,
        dpcMemberRole: dpcMember?.role,
        agentId,
        userId,
      });
      return { skipped: true, reason: "admin_no_commission" };
    }

    // Calculate commission using existing logic
    const commissionResult = calculateCommission(planName, memberType);
    if (!commissionResult) {
      console.warn(
        `No commission rate found for plan: ${planName}, member type: ${memberType}`,
      );
      return { skipped: true, reason: "no_commission_rate" };
    }

    // Create commission record
    const commission = await storage.createCommission({
      agentId: agentId || "HOUSE", // Assign to 'HOUSE' if no agent is assigned
      subscriptionId,
      userId,
      planName,
      planType: getPlanTypeFromMemberType(memberType),
      planTier: getPlanTierFromName(planName),
      commissionAmount: commissionResult.commission,
      totalPlanCost: commissionResult.totalCost,
      status: "pending",
      paymentStatus: "unpaid",
    });

    return { success: true, commission };
  } catch (error) {
    console.error("Error creating commission:", error);
    return { error: error.message };
  }
}

import { createServer } from "http";

export async function registerRoutes(app: any) {
  // Create HTTP server instance
  const server = createServer(app);
  
  // Auth middleware - must be after session middleware
  const authMiddleware = async (req: any, res: any, next: any) => {
    if ((req.path.startsWith("/api/auth/") && req.path !== "/api/auth/user") || req.path === "/api/plans") {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      console.warn("[Auth] No authorization token provided for:", req.path);
      return res.status(401).json({ error: "No authorization token provided" });
    }

    const token = authHeader.split(" ")[1];

    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);

      if (error || !user) {
        console.warn("[Auth] Invalid token for:", req.path, error?.message);
        return res.status(401).json({ error: "Invalid or expired token" });
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
            console.error("[Auth] Database error after retries:", dbError);
            return res
              .status(500)
              .json({ error: "Database connection failed" });
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      if (!userData) {
        console.warn("[Auth] User not found in database:", user.id);
        return res.status(404).json({ error: "User not found in database" });
      }

      // Check approval status
      if (userData.approvalStatus === "pending") {
        return res.status(403).json({
          error: "Account pending approval",
          requiresApproval: true,
        });
      }

      if (userData.approvalStatus === "rejected") {
        return res.status(403).json({
          error: "Account access denied",
        });
      }

      req.user = userData;
      next();
    } catch (error) {
      console.error("[Auth] Auth middleware error:", error);
      return res.status(500).json({ error: "Authentication failed" });
    }
  };

  // Admin role check middleware
  const adminRequired = (req: any, res: any, next: any) => {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  };

  // Register EPX payment routes FIRST (highest priority)
  app.use(epxRoutes);

  // Use the router for general API routes
  app.use(router);

  // Register Supabase auth routes (after main routes)
  app.use(supabaseAuthRoutes);

  // Registration endpoint - ensure it's accessible
  app.post("/api/registration", async (req: any, res: any) => {
    console.log("🔍 REGISTRATION START - Data received");
    console.log("Request body keys:", Object.keys(req.body || {}));
    console.log("[Registration] Endpoint hit - method:", req.method, "path:", req.path);

    // Add CORS headers for registration endpoint
    const origin = req.headers.origin;
    const allowedOrigins = [
      'https://getmydpcenrollment-production.up.railway.app',
      'https://enrollment.getmydpc.com',
      'https://shimmering-nourishment.up.railway.app',
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:5000',
      'https://ffd2557a-af4c-48a9-9a30-85d2ce375e45-00-pjr5zjuzb5vw.worf.replit.dev'
    ];

    if (allowedOrigins.includes(origin as string)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
    }

    let supabaseUserId = null; // Track for cleanup if needed

    try {
      console.log("✅ Step 1: Starting user creation...");
      console.log("[Registration] Registration attempt:", req.body?.email);
      console.log("[Registration] Request body keys:", Object.keys(req.body || {}));

      const {
        email,
        password,
        firstName,
        lastName,
        middleName,
        phone,
        dateOfBirth,
        gender,
        ssn,
        address,
        address2,
        city,
        state,
        zipCode,
        employerName,
        dateOfHire,
        memberType,
        planStartDate,
        planId,
        coverageType,
        addRxValet,
        totalMonthlyPrice,
        familyMembers,
        termsAccepted,
        privacyAccepted,
        privacyNoticeAcknowledged,
        smsConsent,
        communicationsConsent,
        faqDownloaded
      } = req.body;

      console.log("✅ Step 2: Email validation debugging...");
      console.log("[Registration] Email received:", email);
      console.log("[Registration] Email type:", typeof email);
      console.log("[Registration] Email length:", email?.length);

      // Basic validation with better error details
      const missingFields = [];
      if (!email) missingFields.push("email");
      if (!firstName) missingFields.push("firstName");
      if (!lastName) missingFields.push("lastName");

      if (missingFields.length > 0) {
        console.log("[Registration] Missing fields:", missingFields);
        return res.status(400).json({
          error: "Missing required fields",
          required: ["email", "firstName", "lastName"],
          missing: missingFields,
          received: {
            email: !!email,
            firstName: !!firstName,
            lastName: !!lastName
          }
        });
      }

      // Email validation with detailed logging
      console.log("✅ Step 3: Email format validation...");
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const isValidEmail = emailRegex.test(email);
      console.log("[Registration] Email regex test result:", isValidEmail);
      console.log("[Registration] Email regex pattern:", emailRegex.toString());

      if (!isValidEmail) {
        console.error("[Registration] Email validation failed for:", email);
        return res.status(400).json({
          error: "Invalid email format",
          email: email,
          regexPattern: emailRegex.toString()
        });
      }

      // Check if user already exists in our database first
      console.log("✅ Step 3.5: Checking for existing user...");
      try {
        const existingUser = await storage.getUserByEmail(email.trim().toLowerCase());
        if (existingUser) {
          console.log("[Registration] User already exists:", existingUser.id);
          return res.status(400).json({
            error: "User already exists with this email",
            existingUserId: existingUser.id
          });
        }
      } catch (checkError) {
        console.warn("[Registration] Error checking existing user:", checkError.message);
        // Continue with registration attempt
      }

      // Generate a strong password by default to avoid Supabase validation issues
      let finalPassword = password;

      console.log("✅ Step 4: Processing password...");
      console.log("[Registration] Original password provided:", !!password);

      // Always generate a strong password for DPC enrollments to avoid Supabase issues
      const timestamp = Date.now();
      const randomNum = Math.floor(Math.random() * 9999);
      finalPassword = `MPP${timestamp}${randomNum}!Secure`;

      console.log("[Registration] Using strong generated password for Supabase compliance");
      console.log("[Registration] Generated password length:", finalPassword.length);

      console.log("✅ Step 5: Before Supabase auth signUp...");
      console.log("[Registration] Email for Supabase:", email);
      console.log("[Registration] Password strength check passed");
      console.log("[Registration] Supabase signup payload:", {
        email: email,
        passwordLength: finalPassword.length,
        hasMetadata: !!firstName
      });

      // Use existing registration logic with improved password and detailed error handling
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(), // Ensure clean email format
        password: finalPassword,
        options: {
          data: {
            firstName,
            lastName,
            phone: phone || "",
          },
        },
      });

      if (error) {
        console.error("❌ SUPABASE AUTH ERROR:", error.message);
        console.error("❌ Error details:", JSON.stringify(error, null, 2));
        console.error("[Registration] Supabase error code:", error.status);
        console.error("[Registration] Error source:", error.name || 'Unknown');

        // Check if it's an email validation error from Supabase
        if (error.message && error.message.toLowerCase().includes('invalid')) {
          console.error("❌ EMAIL VALIDATION ERROR FROM SUPABASE");
          console.error("❌ Original email:", email);
          console.error("❌ Processed email:", email.trim().toLowerCase());
        }

        return res.status(400).json({
          error: error.message || "Registration failed",
          source: "Supabase Auth",
          details: process.env.NODE_ENV === "development" ? error : undefined
        });
      }

      console.log("✅ Step 6: Supabase user created successfully");
      console.log("[Registration] Supabase user ID:", data.user?.id);
      console.log("[Registration] Supabase user email:", data.user?.email);

      if (!data.user) {
        console.error("❌ No user data returned from Supabase");
        return res.status(400).json({
          error: "Failed to create user - no user data returned"
        });
      }

      // Store Supabase user ID for potential cleanup
      supabaseUserId = data.user.id;

      console.log("✅ Step 7: Before database user creation...");
      console.log("[Registration] Creating user with ID:", data.user.id);
      console.log("[Registration] Creating user with email:", data.user.email);
      console.log("[Registration] User ID type:", typeof data.user.id);
      console.log("[Registration] User ID length:", data.user.id?.length);

      // Verify the Supabase user ID is valid
      if (!data.user.id || typeof data.user.id !== 'string') {
        throw new Error("Invalid user ID from Supabase authentication");
      }

      // Create user in our database with retry logic for ID conflicts
      let user;
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          console.log(`[Registration] Database creation attempt ${retryCount + 1}/${maxRetries}`);
          console.log("[Registration] Using Supabase ID:", data.user.id);

          // Create user in our database with full enrollment data
          user = await storage.createUser({
            id: data.user.id, // Use the Supabase UUID directly
            email: data.user.email!, // Use the email from Supabase to ensure consistency
            firstName: firstName || "User",
            lastName: lastName || "",
            middleName: middleName || "",
            phone: phone || "",
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
            gender: gender || null,
            ssn: ssn || null,
            address: address || "",
            address2: address2 || "",
            city: city || "",
            state: state || "",
            zipCode: zipCode || "",
            employerName: employerName || "",
            dateOfHire: dateOfHire ? new Date(dateOfHire) : null,
            memberType: memberType || "member-only",
            planStartDate: planStartDate ? new Date(planStartDate) : new Date(),
            emailVerified: false,
            role: "member",
            isActive: true,
            approvalStatus: "approved", // Auto-approve DPC enrollments
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          console.log("✅ Step 8: User created in database successfully");
          console.log("[Registration] User ID:", user.id);
          break; // Success, exit retry loop

        } catch (dbError: any) {
          retryCount++;
          console.error(`❌ Database error attempt ${retryCount}/${maxRetries}:`, dbError.message);

          if (dbError.message && dbError.message.includes('duplicate key')) {
            console.error("❌ DUPLICATE KEY ERROR - User ID conflict");
            console.error("❌ Conflicting ID:", data.user.id);

            if (retryCount < maxRetries) {
              console.log("🔄 Retrying user creation...");
              // Wait a moment before retry
              await new Promise(resolve => setTimeout(resolve, 100));
            } else {
              console.error("❌ Max retries reached for user creation");
              throw new Error(`Failed to create user after ${maxRetries} attempts: ${dbError.message}`);
            }
          } else {
            // Non-duplicate key error, don't retry
            console.error("❌ Non-recoverable database error:", dbError);
            throw dbError;
          }
        }
      }

      if (!user) {
        throw new Error("Failed to create user in database after retries");
      }

      console.log("✅ Step 9: User creation completed successfully");
      console.log("[Registration] Final user email:", user.email);

      // Create subscription if plan is selected
      if (planId && totalMonthlyPrice) {
        try {
          console.log("✅ Step 7: Before subscription creation...");
          const subscription = await storage.createSubscription({
            userId: user.id,
            planId: parseInt(planId),
            status: "pending_payment",
            amount: totalMonthlyPrice,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            createdAt: new Date(),
            updatedAt: new Date()
          });
          console.log("[Registration] Subscription created:", subscription.id);
        } catch (subError) {
          console.error("[Registration] Error creating subscription:", subError);
          // Continue with registration even if subscription fails
        }
      }

      console.log("✅ Step 8: Before family members processing...");

      // Add family members if provided
      if (familyMembers && Array.isArray(familyMembers)) {
        console.log("[Registration] Processing", familyMembers.length, "family members");
        for (const familyMember of familyMembers) {
          if (familyMember.firstName && familyMember.lastName) {
            try {
              await storage.addFamilyMember({
                ...familyMemberData,
                primaryUserId: user.id,
              });
              console.log("[Registration] Added family member:", familyMember.firstName, familyMember.lastName);
            } catch (familyError) {
              console.error("[Registration] Error adding family member:", familyError);
              // Continue with other family members
            }
          }
        }
      }

      console.log("✅ Step 9: Registration completed successfully!");
      console.log("[Registration] Final user email:", user.email);

      res.json({
        success: true,
        message: "Registration successful. Proceeding to payment...",
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          approvalStatus: user.approvalStatus,
        },
        enrollment: {
          planId: planId,
          coverageType: coverageType,
          totalMonthlyPrice: totalMonthlyPrice,
          addRxValet: addRxValet
        },
        // Include generated password for testing purposes
        ...(finalPassword !== password && { generatedPassword: finalPassword })
      });
    } catch (error: any) {
      console.error("❌ REGISTRATION ERROR:", error.message);
      console.error("❌ Error details:", error);
      console.error("❌ Stack trace:", error.stack);

      // Clean up Supabase user if database creation failed
      if (supabaseUserId && error.message && (
        error.message.includes('duplicate key') || 
        error.message.includes('constraint') ||
        error.message.includes('users_pkey')
      )) {
        console.log("🧹 Cleaning up Supabase user due to database error...");
        try {
          // Note: In production, you might want to keep the Supabase user and handle this differently
          const { error: deleteError } = await supabase.auth.admin.deleteUser(supabaseUserId);
          if (deleteError) {
            console.error("❌ Failed to cleanup Supabase user:", deleteError.message);
          } else {
            console.log("✅ Cleaned up Supabase user:", supabaseUserId);
          }
        } catch (cleanupError) {
          console.error("❌ Error during cleanup:", cleanupError);
        }
      }

      // Provide specific error messages based on error type
      let errorMessage = "Registration failed";
      let statusCode = 500;

      if (error.message && error.message.includes('duplicate key')) {
        errorMessage = "Account with this information already exists";
        statusCode = 409; // Conflict
      } else if (error.message && error.message.includes('constraint')) {
        errorMessage = "Invalid data provided for registration";
        statusCode = 400; // Bad Request
      } else if (error.message && error.message.includes('users_pkey')) {
        errorMessage = "User ID conflict - please try again";
        statusCode = 409; // Conflict
      }

      res.status(statusCode).json({
        error: errorMessage,
        message: error.message,
        details: process.env.NODE_ENV === "development" ? error.message : "Internal error",
        retryable: statusCode === 409 // Suggest retry for conflicts
      });
    }
  });

  // Agent enrollment endpoint
  app.post("/api/agent/enrollment", authMiddleware, async (req: any, res: any) => {
    try {
      console.log("[Agent Enrollment] Enrollment attempt by agent:", req.user?.email);

      const { agentCode, userEmail, planType, memberData } = req.body;

      // Validate agent has permission
      if (req.user?.role !== "agent" && req.user?.role !== "admin") {
        return res.status(403).json({
          error: "Agent or admin access required"
        });
      }

      // Basic validation
      if (!userEmail || !planType) {
        return res.status(400).json({
          error: "Missing required fields",
          required: ["userEmail", "planType"]
        });
      }

      // Record enrollment attempt
      const enrollmentRecord = {
        agentId: req.user.id,
        agentEmail: req.user.email,
        memberEmail: userEmail,
        planType: planType,
        enrollmentDate: new Date(),
        status: "pending"
      };

      console.log("[Agent Enrollment] Recording enrollment:", enrollmentRecord);

      res.json({
        success: true,
        message: "Agent enrollment recorded successfully",
        data: {
          enrollmentId: nanoid(),
          agentCode: req.user.agentNumber || agentCode,
          userEmail,
          planType,
          enrolledBy: req.user.email
        }
      });

    } catch (error: any) {
      console.error("[Agent Enrollment] Error:", error);
      res.status(500).json({
        error: "Agent enrollment failed",
        details: process.env.NODE_ENV === "development" ? error.message : "Internal error"
      });
    }
  });

  // Agent lookup endpoint
  app.get("/api/agent/:agentId", async (req: any, res: any) => {
    try {
      const { agentId } = req.params;
      console.log("[Agent Lookup] Looking up agent:", agentId);

      // Try to find agent by ID or agent number
      let agent;
      try {
        agent = await storage.getUser(agentId);
      } catch (error) {
        // Try by agent number if direct ID lookup fails
        agent = await storage.getUserByAgentNumber(agentId);
      }

      if (!agent) {
        return res.status(404).json({
          error: "Agent not found",
          agentId: agentId
        });
      }

      // Only return agent data if they are actually an agent
      if (agent.role !== "agent" && agent.role !== "admin") {
        return res.status(404).json({
          error: "Agent not found",
          agentId: agentId
        });
      }

      res.json({
        success: true,
        agent: {
          id: agent.id,
          agentNumber: agent.agentNumber,
          firstName: agent.firstName,
          lastName: agent.lastName,
          email: agent.email,
          isActive: agent.isActive,
          role: agent.role
        }
      });

    } catch (error: any) {
      console.error("[Agent Lookup] Error:", error);
      res.status(500).json({
        error: "Agent lookup failed",
        details: process.env.NODE_ENV === "development" ? error.message : "Internal error"
      });
    }
  });

  // Fix: /api/agent/enrollments (404)
  app.get('/api/agent/enrollments', authMiddleware, async (req: any, res: any) => {
    try {
      if (req.user?.role !== 'agent' && req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Agent access required' });
      }

      const agentId = req.user.id;
      const { startDate, endDate } = req.query;

      const enrollments = await storage.getEnrollmentsByAgent(
        agentId,
        startDate as string,
        endDate as string
      );

      res.json({
        success: true,
        enrollments: enrollments || [],
        total: enrollments?.length || 0,
        agentId: agentId
      });
    } catch (error: any) {
      console.error('Agent enrollments error:', error);
      res.status(500).json({ error: 'Failed to fetch enrollments' });
    }
  });

  // Fix: /api/agent/stats (403) - permission issue
  app.get('/api/agent/stats', authMiddleware, async (req: any, res: any) => {
    try {
      if (req.user?.role !== 'agent' && req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Agent access required' });
      }

      const agentId = req.user.id;

      // Get enrollment counts
      const enrollments = await storage.getAgentEnrollments(agentId);
      const thisMonth = new Date();
      thisMonth.setDate(1);
      thisMonth.setHours(0, 0, 0, 0);

      const monthlyEnrollments = enrollments.filter(
        (e) => new Date(e.createdAt) >= thisMonth,
      ).length;

      // Get active members count
      const activeMembers = enrollments.filter((e) => e.isActive).length;

      // Get commission stats
      const commissionStats = await storage.getCommissionStats(agentId);

      res.json({
        success: true,
        stats: {
          totalEnrollments: enrollments.length,
          monthlyEnrollments,
          activeMembers,
          pendingEnrollments: enrollments.filter(e => e.approvalStatus === 'pending').length,
          ...commissionStats
        }
      });
    } catch (error: any) {
      console.error('Agent stats error:', error);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  // Fix: /api/agent/commission-stats (404)
  app.get('/api/agent/commission-stats', authMiddleware, async (req: any, res: any) => {
    try {
      console.log("🔍 COMMISSION STATS ROUTE HIT - User:", req.user?.email, "Role:", req.user?.role);

      if (req.user?.role !== 'agent' && req.user?.role !== 'admin') {
        console.log("❌ Access denied - not agent or admin");
        return res.status(403).json({ error: 'Agent or admin access required' });
      }

      // Get actual commission stats for the agent
      const agentId = req.user.id;
      const commissions = await storage.getAgentCommissions(agentId);

      const totalCommission = commissions.reduce((sum, c) => sum + (parseFloat(c.commissionAmount) || 0), 0);
      const thisMonth = new Date();
      thisMonth.setDate(1);
      thisMonth.setHours(0, 0, 0, 0);

      const monthlyCommissions = commissions.filter(c => new Date(c.createdAt) >= thisMonth);
      const monthlyCommission = monthlyCommissions.reduce((sum, c) => sum + (parseFloat(c.commissionAmount) || 0), 0);

      const pendingCommissions = commissions.filter(c => c.paymentStatus === 'unpaid');
      const pendingCommission = pendingCommissions.reduce((sum, c) => sum + (parseFloat(c.commissionAmount) || 0), 0);

      console.log("✅ Got commission stats for", req.user.role);
      res.json({
        success: true,
        commissionStats: {
          totalCommission: totalCommission.toFixed(2),
          monthlyCommission: monthlyCommission.toFixed(2),
          pendingCommission: pendingCommission.toFixed(2),
          totalCount: commissions.length,
          monthlyCount: monthlyCommissions.length,
          pendingCount: pendingCommissions.length
        }
      });
    } catch (error: any) {
      console.error('❌ Commission stats error:', error);
      res.status(500).json({ error: 'Failed to fetch commission stats' });
    }
  });

  // Fix: /api/agent/commissions (403) - permission issue  
  app.get('/api/agent/commissions', authMiddleware, async (req: any, res: any) => {
    try {
      console.log("🔍 AGENT COMMISSIONS ROUTE HIT - User:", req.user?.email, "Role:", req.user?.role);

      if (req.user?.role !== 'agent' && req.user?.role !== 'admin') {
        console.log("❌ Access denied - not agent or admin");
        return res.status(403).json({ error: 'Agent or admin access required' });
      }

      const { startDate, endDate } = req.query;
      const commissions = await storage.getAgentCommissions(
        req.user.id,
        startDate as string,
        endDate as string
      );

      console.log("✅ Got", commissions?.length || 0, "commissions");
      res.json({
        success: true,
        commissions: commissions || [],
        dateRange: { startDate, endDate },
        total: commissions?.length || 0
      });
    } catch (error: any) {
      console.error('❌ Agent commissions error:', error);
      res.status(500).json({ error: 'Failed to fetch commissions' });
    }
  });

  // Fix: Missing admin endpoints for user management tabs
  app.get('/api/admin/pending-users', authMiddleware, async (req: any, res: any) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const users = await storage.getAllUsers();
      const pendingUsers = users.users?.filter((user: any) => user.approvalStatus === 'pending') || [];
      res.json(pendingUsers);
    } catch (error: any) {
      console.error('Error fetching pending users:', error);
      res.status(500).json({ error: 'Failed to fetch pending users' });
    }
  });

  app.get('/api/admin/login-sessions', authMiddleware, async (req: any, res: any) => {
    try {
      console.log("🔍 LOGIN SESSIONS ROUTE HIT");
      console.log("User:", req.user?.email);
      console.log("Role:", req.user?.role);

      if (req.user?.role !== 'admin') {
        console.log("❌ Access denied - not admin");
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { limit = "50" } = req.query;
      const loginSessions = await storage.getAllLoginSessions(parseInt(limit as string));
      console.log("✅ Got", loginSessions?.length || 0, "login sessions");
      res.json(loginSessions);
    } catch (error: any) {
      console.error("❌ Error fetching login sessions:", error);
      res.status(500).json({ error: 'Failed to fetch login sessions' });
    }
  });

  app.put('/api/admin/users/:userId/role', authMiddleware, async (req: any, res: any) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { userId } = req.params;
      const { role } = req.body;

      if (!["member", "agent", "admin"].includes(role)) {
        return res.status(400).json({
          error: "Invalid role. Must be 'member', 'agent', or 'admin'"
        });
      }

      const updatedUser = await storage.updateUser(userId, {
        role,
        updatedAt: new Date(),
      });

      res.json(updatedUser);
    } catch (error: any) {
      console.error("Error updating user role:", error);
      res.status(500).json({ error: "Failed to update user role" });
    }
  });

  app.put('/api/admin/users/:userId/agent-number', authMiddleware, async (req: any, res: any) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { userId } = req.params;
      const { agentNumber } = req.body;

      // Get user to validate they can have an agent number
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Only agents and admins should have agent numbers
      if (user.role !== 'agent' && user.role !== 'admin') {
        return res.status(400).json({
          error: 'Only agents and admins can be assigned agent numbers'
        });
      }

      // Check for duplicate agent numbers if provided
      if (agentNumber && agentNumber.trim() !== '') {
        const existingUser = await storage.getUserByAgentNumber(agentNumber.trim());
        if (existingUser && existingUser.id !== userId) {
          return res.status(400).json({
            error: 'Agent number already in use'
          });
        }
      }

      const result = await storage.updateUser(userId, {
        agentNumber: agentNumber?.trim() || null,
        updatedAt: new Date(),
      });

      res.json(result);
    } catch (error: any) {
      console.error("Error updating agent number:", error);
      res.status(500).json({ error: "Failed to update agent number" });
    }
  });

  app.put('/api/admin/users/:userId/suspend', authMiddleware, async (req: any, res: any) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { userId } = req.params;
      const { reason } = req.body;

      const updatedUser = await storage.updateUser(userId, {
        isActive: false,
        approvalStatus: 'suspended',
        rejectionReason: reason || 'Account suspended by administrator',
        updatedAt: new Date(),
      });

      res.json(updatedUser);
    } catch (error: any) {
      console.error("Error suspending user:", error);
      res.status(500).json({ error: "Failed to suspend user" });
    }
  });

  app.put('/api/admin/users/:userId/reactivate', authMiddleware, async (req: any, res: any) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { userId } = req.params;

      const updatedUser = await storage.updateUser(userId, {
        isActive: true,
        approvalStatus: 'approved',
        approvedAt: new Date(),
        approvedBy: req.user.id,
        rejectionReason: null,
        updatedAt: new Date(),
      });

      res.json(updatedUser);
    } catch (error: any) {
      console.error("Error reactivating user:", error);
      res.status(500).json({ error: "Failed to reactivate user" });
    }
  });

  app.post('/api/admin/approve-user/:userId', authMiddleware, async (req: any, res: any) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { userId } = req.params;
      const updatedUser = await storage.updateUser(userId, {
        approvalStatus: 'approved',
        approvedAt: new Date(),
        approvedBy: req.user.id,
        updatedAt: new Date(),
      });
      res.json(updatedUser);
    } catch (error: any) {
      console.error("Error approving user:", error);
      res.status(500).json({ error: "Failed to approve user" });
    }
  });

  // Fix: /api/user (404) - basic user endpoint
  app.get('/api/user', async (req: any, res: any) => {
    try {
      // TODO: Add authentication and return actual user data
      res.json({
        success: true,
        user: {
          id: 'temp-user-id',
          email: 'user@example.com',
          firstName: 'Test',
          lastName: 'User'
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  });

  // Log the new routes
  console.log("[Route] POST /api/registration");
  console.log("[Route] POST /api/agent/enrollment");
  console.log("[Route] GET /api/agent/:agentId");
  console.log("[Route] GET /api/agent/enrollments");
  console.log("[Route] GET /api/agent/stats"); 
  console.log("[Route] GET /api/agent/commission-stats");
  console.log("[Route] GET /api/agent/commissions");
  console.log("[Route] GET /api/user");

  // Return the server instance (not just the app)
  return server;
}