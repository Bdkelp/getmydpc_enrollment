
import { Router } from "express";
import { storage } from "./storage";
import { authenticateToken, type AuthRequest } from "./auth/supabaseAuth";
import { paymentService } from "./services/payment-service";
import { notificationService } from "./utils/notifications";
import { calculateCommission } from "./utils/commission";
import { commissions, plans, subscriptions } from "@shared/schema";
import { eq, and, desc, count, sum, sql } from "drizzle-orm";
import { z } from "zod";

const router = Router();

// Public routes (no authentication required)
router.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

router.get("/api/plans", async (req, res) => {
  try {
    const allPlans = await storage.getPlans();
    const activePlans = allPlans.filter(plan => plan.isActive);
    res.json(activePlans);
  } catch (error) {
    console.error("Error fetching plans:", error);
    res.status(500).json({ message: "Failed to fetch plans" });
  }
});

// Auth routes (public - no authentication required)
router.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Sign in with Supabase
    const { data, error } = await import('./lib/supabaseClient').then(m => m.supabase.auth.signInWithPassword({
      email,
      password
    }));
    
    if (error) {
      console.error('Login error:', error);
      return res.status(401).json({ message: error.message || 'Invalid credentials' });
    }
    
    if (!data.session) {
      return res.status(401).json({ message: 'Failed to create session' });
    }
    
    // Get or create user in our database
    let user = await storage.getUserByEmail(email);
    
    if (!user) {
      // Create user in our database if they don't exist
      user = await storage.createUser({
        id: data.user.id,
        email: data.user.email!,
        firstName: data.user.user_metadata?.firstName || data.user.user_metadata?.first_name || 'User',
        lastName: data.user.user_metadata?.lastName || data.user.user_metadata?.last_name || '',
        emailVerified: data.user.email_confirmed_at ? true : false,
        role: determineUserRole(data.user.email!),
        isActive: true,
        approvalStatus: 'approved',
        createdAt: new Date(),
        updatedAt: new Date()
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
    const { data, error } = await import('./lib/supabaseClient').then(m => m.supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          firstName,
          lastName
        }
      }
    }));
    
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
      const { error } = await import('./lib/supabaseClient').then(m => m.supabase.auth.signOut());
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

// Protected routes (require authentication)
router.use(authenticateToken);

// User profile routes
router.get("/api/user/profile", async (req: AuthRequest, res) => {
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

router.put("/api/user/profile", async (req: AuthRequest, res) => {
  try {
    const updateData = req.body;
    delete updateData.id; // Prevent ID modification
    delete updateData.role; // Prevent role modification via profile update
    
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
router.get("/api/user/subscription", async (req: AuthRequest, res) => {
  try {
    const subscriptions = await storage.getUserSubscriptions(req.user!.id);
    res.json(subscriptions);
  } catch (error) {
    console.error("Error fetching subscriptions:", error);
    res.status(500).json({ message: "Failed to fetch subscriptions" });
  }
});

// Lead management routes
router.get("/api/leads", async (req: AuthRequest, res) => {
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

router.post("/api/leads", async (req: AuthRequest, res) => {
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
router.get("/api/admin/users", async (req: AuthRequest, res) => {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({ message: "Admin access required" });
  }
  
  try {
    const users = await storage.getAllUsers();
    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

router.put("/api/admin/users/:userId", async (req: AuthRequest, res) => {
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
router.get("/api/agent/commissions", async (req: AuthRequest, res) => {
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

export async function registerRoutes(app: any) {
  // Use the router
  app.use(router);
  
  // Create and return the server
  const { createServer } = await import("http");
  return createServer(app);
}
