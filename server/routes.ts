
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

// Authentication route
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

export default router;
