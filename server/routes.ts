import type { Express } from "express";
import { createServer, type Server } from "http";

import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { z } from "zod";
import { registrationSchema, insertPlanSchema } from "@shared/schema";
import { calculateEnrollmentCommission } from "./utils/commission";
import authRoutes from "./auth/authRoutes";
import { configurePassportStrategies } from "./auth/authService";
import { setupSupabaseAuth, verifySupabaseToken } from "./auth/supabaseAuth";
import passport from "passport";
import express from "express";



export async function registerRoutes(app: Express): Promise<Server> {
  // Serve attached assets
  app.use('/attached_assets', express.static('attached_assets'));
  
  // Determine which authentication system to use
  const useSupabaseAuth = process.env.SUPABASE_URL;
  const authMiddleware = useSupabaseAuth ? verifySupabaseToken : isAuthenticated;
  
  if (useSupabaseAuth) {
    setupSupabaseAuth(app);
  } else {
    // Fallback to Replit auth for development
    if (process.env.REPLIT_DOMAINS) {
      await setupAuth(app);
    }
    
    // Configure passport strategies for production auth
    configurePassportStrategies();
    app.use(passport.initialize());
    app.use(passport.session());
    
    // Use new auth routes for production
    app.use(authRoutes);
  }

  // Auth routes - only add if NOT using Supabase (since Supabase adds its own)
  if (!useSupabaseAuth) {
    app.get('/api/auth/user', authMiddleware, async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const user = await storage.getUser(userId);
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }
        
        // Get user's current subscription and plan
        const subscription = await storage.getUserSubscription(userId);
        let plan = null;
        if (subscription) {
          plan = await storage.getPlan(subscription.planId);
        }
        
        res.json({ ...user, subscription, plan });
      } catch (error) {
        console.error("Error fetching user:", error);
        res.status(500).json({ message: "Failed to fetch user" });
      }
    });
  }

  // Middleware to check if user is agent or admin
  const isAgentOrAdmin = async (req: any, res: any, next: any) => {
    // Get user ID based on authentication system
    const userId = useSupabaseAuth ? req.user?.id : req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const user = await storage.getUser(userId);
    if (!user || (user.role !== 'agent' && user.role !== 'admin')) {
      return res.status(403).json({ message: "Access denied. Agent or admin role required." });
    }
    
    req.userRole = user.role;
    next();
  };

  // Middleware to check if user is admin
  const isAdmin = async (req: any, res: any, next: any) => {
    // Get user ID based on authentication system
    const userId = useSupabaseAuth ? req.user?.id : req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const user = await storage.getUser(userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: "Access denied. Admin role required." });
    }
    
    next();
  };

  // Mock payment endpoint for testing
  app.post("/api/mock-payment", authMiddleware, async (req: any, res) => {
    try {
      const { planId } = req.body;
      const userId = useSupabaseAuth ? req.user.id : req.user.claims.sub;
      
      console.log("Mock payment request:", { planId, userId });
      
      if (!planId) {
        return res.status(400).json({ message: "Plan ID is required" });
      }
      
      // Get plan details
      const plan = await storage.getPlan(planId);
      if (!plan) {
        console.error("Plan not found:", planId);
        return res.status(404).json({ message: "Plan not found" });
      }
      
      console.log("Plan details:", { id: plan.id, name: plan.name, price: plan.price });
      
      // Get total price from session storage (includes processing fees and add-ons)
      const planPrice = parseFloat(plan.price);
      const totalPrice = planPrice * 1.04; // Include 4% processing fee
      
      // Create subscription
      const subscription = await storage.createSubscription({
        userId,
        planId,
        status: "active",
        amount: totalPrice.toFixed(2), // Convert to string with 2 decimal places
        startDate: new Date(),
        nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      });
      
      console.log("Subscription created:", subscription.id);
      
      // Create payment record
      const payment = await storage.createPayment({
        userId,
        subscriptionId: subscription.id,
        amount: totalPrice.toFixed(2), // Convert to string with 2 decimal places
        status: "succeeded",
        stripePaymentIntentId: `mock_${Date.now()}`, // Mock payment ID
      });
      
      console.log("Payment created:", payment.id);
      
      // Check if the user has a lead and mark it as enrolled
      const user = await storage.getUser(userId);
      if (user && user.email) {
        const lead = await storage.getLeadByEmail(user.email);
        if (lead && lead.status !== 'enrolled') {
          await storage.updateLead(lead.id, { status: 'enrolled' });
          
          // Add activity note about enrollment
          if (lead.assignedAgentId) {
            await storage.addLeadActivity({
              leadId: lead.id,
              agentId: lead.assignedAgentId,
              activityType: 'note',
              notes: `Lead successfully enrolled in ${plan.name}`
            });
          }
          console.log("Lead marked as enrolled:", lead.id);
        }
      }
      
      res.json({
        success: true,
        subscriptionId: subscription.id,
        paymentId: payment.id,
      });
    } catch (error: any) {
      console.error("Error processing mock payment:", error);
      console.error("Error stack:", error.stack);
      res.status(500).json({ message: "Failed to process mock payment: " + error.message });
    }
  });

  // Public routes - Plans
  app.get("/api/plans", async (req, res) => {
    try {
      const plans = await storage.getActivePlans();
      res.json(plans);
    } catch (error) {
      console.error("Error fetching plans:", error);
      res.status(500).json({ message: "Failed to fetch plans" });
    }
  });

  app.get("/api/plans/:id", async (req, res) => {
    try {
      const planId = parseInt(req.params.id);
      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ message: "Plan not found" });
      }
      res.json(plan);
    } catch (error) {
      console.error("Error fetching plan:", error);
      res.status(500).json({ message: "Failed to fetch plan" });
    }
  });

  // Protected routes - User registration/profile
  app.post("/api/registration", authMiddleware, async (req: any, res) => {
    try {
      const validatedData = registrationSchema.parse(req.body);
      const userId = useSupabaseAuth ? req.user.id : req.user.claims.sub;
      
      // Extract planId separately (not part of user profile)
      const { planId, ...userProfileData } = validatedData;
      
      // Get the current user (agent) to track who enrolled this member
      const currentUser = await storage.getUser(userId);
      const agentId = currentUser?.role === 'agent' ? userId : undefined;
      
      // Update user profile with registration data (excluding planId)
      const user = await storage.updateUserProfile(userId, {
        firstName: userProfileData.firstName,
        lastName: userProfileData.lastName,
        middleName: userProfileData.middleName,
        ssn: userProfileData.ssn, // Should be encrypted in production
        email: userProfileData.email,
        phone: userProfileData.phone,
        dateOfBirth: userProfileData.dateOfBirth,
        gender: userProfileData.gender,
        address: userProfileData.address,
        address2: userProfileData.address2,
        city: userProfileData.city,
        state: userProfileData.state,
        zipCode: userProfileData.zipCode,
        employerName: userProfileData.employerName,
        divisionName: userProfileData.divisionName,
        dateOfHire: userProfileData.dateOfHire,
        memberType: userProfileData.memberType,
        planStartDate: userProfileData.planStartDate,
        emergencyContactName: userProfileData.emergencyContactName,
        emergencyContactPhone: userProfileData.emergencyContactPhone,
        enrolledByAgentId: agentId,
      });

      // Add family members if any
      const familyMembers = (req.body as any).familyMembers || [];
      for (const member of familyMembers) {
        if (member && member.firstName) { // Only add valid family members
          await storage.addFamilyMember({
            primaryUserId: userId,
            firstName: member.firstName,
            lastName: member.lastName,
            middleName: member.middleName,
            dateOfBirth: member.dateOfBirth,
            gender: member.gender,
            ssn: member.ssn,
            email: member.email,
            phone: member.phone,
            relationship: member.relationship,
            memberType: member.relationship === "spouse" ? "spouse" : "dependent",
            planStartDate: userProfileData.planStartDate,
            isActive: true,
          });
        }
      }

      res.json(user);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Validation error:", error.errors);
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating user profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Family member enrollment
  app.post('/api/family-enrollment', authMiddleware, async (req: any, res) => {
    try {
      const userId = useSupabaseAuth ? req.user.id : req.user.claims.sub;
      const { members } = req.body;
      
      if (!members || !Array.isArray(members)) {
        return res.status(400).json({ message: "Invalid family member data" });
      }
      
      // Add each family member
      for (const member of members) {
        await storage.addFamilyMember({
          primaryUserId: userId,
          firstName: member.firstName,
          lastName: member.lastName,
          middleName: member.middleName,
          dateOfBirth: member.dateOfBirth,
          gender: member.gender,
          ssn: member.ssn, // Should be encrypted in production
          email: member.email,
          phone: member.phone,
          relationship: member.relationship,
          memberType: member.memberType,
          address: member.address,
          address2: member.address2,
          city: member.city,
          state: member.state,
          zipCode: member.zipCode,
          planStartDate: member.planStartDate,
        });
      }
      
      res.json({ message: "Family members enrolled successfully" });
    } catch (error) {
      console.error("Family enrollment error:", error);
      res.status(500).json({ message: "Failed to enroll family members" });
    }
  });

  // Agent routes
  app.get("/api/agent/stats", authMiddleware, isAgentOrAdmin, async (req: any, res) => {
    try {
      const agentId = useSupabaseAuth ? req.user.id : req.user.claims.sub;
      
      // Get enrollments created by this agent
      const enrollments = await storage.getAgentEnrollments(agentId);
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      
      // Calculate stats
      const monthlyEnrollments = enrollments.filter((e: any) => 
        new Date(e.createdAt) >= monthStart
      );
      
      // Calculate commissions with new structure
      const enrollmentDetails = await Promise.all(enrollments.map(async (user: any) => {
        const subscription = await storage.getUserSubscription(user.id);
        const plan = subscription ? await storage.getPlan(subscription.planId) : null;
        return {
          planName: plan?.name || '',
          memberType: user.memberType || 'member',
          hasRx: user.hasRxValet || false
        };
      }));
      
      const monthlyEnrollmentDetails = await Promise.all(monthlyEnrollments.map(async (user: any) => {
        const subscription = await storage.getUserSubscription(user.id);
        const plan = subscription ? await storage.getPlan(subscription.planId) : null;
        return {
          planName: plan?.name || '',
          memberType: user.memberType || 'member',
          hasRx: user.hasRxValet || false
        };
      }));
      
      const totalCommission = enrollmentDetails.reduce((total, enrollment) => {
        return total + calculateEnrollmentCommission(enrollment.planName, enrollment.memberType, enrollment.hasRx);
      }, 0);
      
      const monthlyCommission = monthlyEnrollmentDetails.reduce((total, enrollment) => {
        return total + calculateEnrollmentCommission(enrollment.planName, enrollment.memberType, enrollment.hasRx);
      }, 0);
      
      // Get lead stats and recent leads
      const leadStats = await storage.getAgentLeadStats(agentId);
      const recentLeads = await storage.getAgentLeads(agentId);
      
      res.json({
        totalEnrollments: enrollments.length,
        monthlyEnrollments: monthlyEnrollments.length,
        totalCommission,
        monthlyCommission,
        activeLeads: leadStats.new + leadStats.contacted + leadStats.qualified,
        conversionRate: (leadStats.new + leadStats.contacted + leadStats.qualified + leadStats.enrolled + leadStats.closed) > 0 
          ? (leadStats.enrolled / (leadStats.new + leadStats.contacted + leadStats.qualified + leadStats.enrolled + leadStats.closed)) * 100 
          : 0,
        leads: recentLeads.slice(0, 5).map(lead => ({
          id: lead.id,
          name: `${lead.firstName} ${lead.lastName}`,
          email: lead.email,
          phone: lead.phone,
          lastContact: lead.updatedAt,
          status: lead.status
        }))
      });
    } catch (error) {
      console.error("Agent stats error:", error);
      res.status(500).json({ message: "Failed to fetch agent stats" });
    }
  });

  app.get("/api/agent/enrollments", authMiddleware, isAgentOrAdmin, async (req: any, res) => {
    try {
      const agentId = useSupabaseAuth ? req.user.id : req.user.claims.sub;
      const { startDate, endDate } = req.query;
      
      const enrollments = await storage.getAgentEnrollments(agentId, startDate, endDate);
      
      // Format enrollments with plan details
      const formattedEnrollments = await Promise.all(enrollments.map(async (user: any) => {
        const subscription = await storage.getUserSubscription(user.id);
        const plan = subscription ? await storage.getPlan(subscription.planId) : null;
        
        return {
          id: user.id,
          createdAt: user.createdAt,
          firstName: user.firstName,
          lastName: user.lastName,
          planName: plan?.name || 'No Plan',
          memberType: user.memberType,
          monthlyPrice: plan?.price || 0,
          commission: calculateEnrollmentCommission(plan?.name || '', user.memberType || 'member', user.hasRxValet || false),
          status: subscription?.status || 'pending',
          pendingReason: subscription?.pendingReason,
          pendingDetails: subscription?.pendingDetails,
          subscriptionId: subscription?.id
        };
      }));
      
      res.json(formattedEnrollments);
    } catch (error) {
      console.error("Agent enrollments error:", error);
      res.status(500).json({ message: "Failed to fetch enrollments" });
    }
  });

  app.post("/api/agent/export-enrollments", authMiddleware, isAgentOrAdmin, async (req: any, res) => {
    try {
      const agentId = useSupabaseAuth ? req.user.id : req.user.claims.sub;
      const { startDate, endDate } = req.body;
      
      const enrollments = await storage.getAgentEnrollments(agentId, startDate, endDate);
      
      // Get agent info for the export
      const agent = await storage.getUser(agentId);
      const agentNumber = agent?.agentNumber || 'Not Assigned';
      
      // Create CSV content
      const headers = ['Agent Number', 'Agent Name', 'Date', 'First Name', 'Last Name', 'Email', 'Phone', 'Plan', 'Member Type', 'Monthly Price', 'Commission', 'Status'];
      const rows = await Promise.all(enrollments.map(async (user: any) => {
        const subscription = await storage.getUserSubscription(user.id);
        const plan = subscription ? await storage.getPlan(subscription.planId) : null;
        
        return [
          agentNumber,
          `${agent?.firstName || ''} ${agent?.lastName || ''}`.trim() || 'Unknown',
          new Date(user.createdAt).toLocaleDateString(),
          user.firstName,
          user.lastName,
          user.email || '',
          user.phone || '',
          plan?.name || 'No Plan',
          user.memberType || '',
          plan?.price || '0',
          calculateEnrollmentCommission(plan?.name || '', user.memberType || 'member', user.hasRxValet || false).toFixed(2),
          subscription?.status || 'pending'
        ];
      }));
      
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=enrollments-${startDate}-to-${endDate}.csv`);
      res.send(csvContent);
    } catch (error) {
      console.error("Export error:", error);
      res.status(500).json({ message: "Failed to export enrollments" });
    }
  });

  // Resolve pending enrollment with consent
  app.put("/api/enrollment/:userId/resolve", authMiddleware, isAgentOrAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { subscriptionId, consentType, consentNotes } = req.body;
      const modifiedBy = useSupabaseAuth ? req.user.id : req.user.claims.sub;

      // Update subscription status to active
      await storage.updateSubscription(subscriptionId, {
        status: 'active',
        pendingReason: null,
        pendingDetails: null,
      });

      // Record the modification with consent
      await storage.recordEnrollmentModification({
        userId,
        subscriptionId,
        modifiedBy,
        changeType: 'status_change',
        changeDetails: {
          before: { status: 'pending' },
          after: { status: 'active' }
        },
        consentType,
        consentNotes,
        consentDate: new Date(),
      });

      res.json({ message: "Enrollment resolved successfully" });
    } catch (error) {
      console.error("Error resolving enrollment:", error);
      res.status(500).json({ message: "Failed to resolve enrollment" });
    }
  });

  // User dashboard routes
  app.get("/api/user/payments", authMiddleware, async (req: any, res) => {
    try {
      const userId = useSupabaseAuth ? req.user.id : req.user.claims.sub;
      const payments = await storage.getUserPayments(userId);
      res.json(payments);
    } catch (error) {
      console.error("Error fetching payments:", error);
      res.status(500).json({ message: "Failed to fetch payments" });
    }
  });

  app.get("/api/user/family-members", authMiddleware, async (req: any, res) => {
    try {
      const userId = useSupabaseAuth ? req.user.id : req.user.claims.sub;
      const members = await storage.getFamilyMembers(userId);
      res.json(members);
    } catch (error) {
      console.error("Error fetching family members:", error);
      res.status(500).json({ message: "Failed to fetch family members" });
    }
  });

  // Admin routes
  app.get("/api/admin/users", authMiddleware, async (req: any, res) => {
    try {
      const userId = useSupabaseAuth ? req.user.id : req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      
      const users = await storage.getAllUsers(limit, offset);
      const totalCount = await storage.getUsersCount();
      
      res.json({ users, totalCount });
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.get("/api/admin/stats", authMiddleware, async (req: any, res) => {
    try {
      const userId = useSupabaseAuth ? req.user.id : req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const revenueStats = await storage.getRevenueStats();
      const subscriptionStats = await storage.getSubscriptionStats();
      const totalUsers = await storage.getUsersCount();
      
      res.json({
        totalUsers,
        ...revenueStats,
        subscriptions: subscriptionStats,
      });
    } catch (error) {
      console.error("Error fetching admin stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // Admin approval endpoints
  app.get('/api/admin/pending-users', authMiddleware, isAdmin, async (req, res) => {
    try {
      const pendingUsers = await storage.getPendingUsers();
      res.json(pendingUsers);
    } catch (error) {
      console.error("Error fetching pending users:", error);
      res.status(500).json({ message: "Failed to fetch pending users" });
    }
  });

  app.post('/api/admin/approve-user/:userId', authMiddleware, isAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const adminId = req.user.id;
      
      await storage.approveUser(userId, adminId);
      
      // TODO: Send approval email to user
      
      res.json({ message: "User approved successfully" });
    } catch (error) {
      console.error("Error approving user:", error);
      res.status(500).json({ message: "Failed to approve user" });
    }
  });

  app.post('/api/admin/reject-user/:userId', authMiddleware, isAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { reason } = req.body;
      
      await storage.rejectUser(userId, reason);
      
      // TODO: Send rejection email to user
      
      res.json({ message: "User rejected" });
    } catch (error) {
      console.error("Error rejecting user:", error);
      res.status(500).json({ message: "Failed to reject user" });
    }
  });

  app.post("/api/admin/plans", authMiddleware, async (req: any, res) => {
    try {
      const userId = useSupabaseAuth ? req.user.id : req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const validatedData = insertPlanSchema.parse(req.body);
      const plan = await storage.createPlan(validatedData);
      res.json(plan);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating plan:", error);
      res.status(500).json({ message: "Failed to create plan" });
    }
  });

  // Lead management routes
  app.post("/api/leads", async (req, res) => {
    try {
      const { firstName, lastName, email, phone, message } = req.body;
      
      console.log("Creating lead with data:", { firstName, lastName, email, phone, message });
      
      // Validate required fields
      if (!firstName || !lastName || !email || !phone) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      // Create the lead
      const lead = await storage.createLead({
        firstName,
        lastName,
        email,
        phone,
        message: message || '',
        source: 'contact_form',
        status: 'new'
      });
      
      console.log("Lead created successfully:", lead.id);
      
      // Auto-assign to available agent
      const availableAgentId = await storage.getAvailableAgentForLead();
      if (availableAgentId) {
        await storage.assignLeadToAgent(lead.id, availableAgentId);
        console.log("Lead assigned to agent:", availableAgentId);
      }
      
      res.json({ success: true, lead });
    } catch (error: any) {
      console.error("Lead creation error:", error);
      console.error("Error stack:", error.stack);
      res.status(500).json({ message: "Failed to create lead", error: error.message });
    }
  });
  
  app.get("/api/agent/leads", authMiddleware, isAgentOrAdmin, async (req: any, res) => {
    try {
      const agentId = useSupabaseAuth ? req.user.id : req.user.claims.sub;
      const { status } = req.query;
      
      const leads = await storage.getAgentLeads(agentId, status);
      res.json(leads);
    } catch (error) {
      console.error("Fetch leads error:", error);
      res.status(500).json({ message: "Failed to fetch leads" });
    }
  });
  
  app.put("/api/leads/:id", authMiddleware, isAgentOrAdmin, async (req: any, res) => {
    try {
      const leadId = parseInt(req.params.id);
      const updates = req.body;
      
      const lead = await storage.updateLead(leadId, updates);
      res.json(lead);
    } catch (error) {
      console.error("Update lead error:", error);
      res.status(500).json({ message: "Failed to update lead" });
    }
  });
  
  app.post("/api/leads/:id/activities", authMiddleware, isAgentOrAdmin, async (req: any, res) => {
    try {
      const leadId = parseInt(req.params.id);
      const agentId = useSupabaseAuth ? req.user.id : req.user.claims.sub;
      const { activityType, notes } = req.body;
      
      const activity = await storage.addLeadActivity({
        leadId,
        agentId,
        activityType,
        notes
      });
      
      res.json(activity);
    } catch (error) {
      console.error("Add activity error:", error);
      res.status(500).json({ message: "Failed to add activity" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
