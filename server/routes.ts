import type { Express } from "express";
import { createServer, type Server } from "http";
import Stripe from "stripe";
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

let stripe: Stripe | null = null;

if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2023-10-16",
  });
}

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

  // Stripe payment intent route for one-time payments
  app.post("/api/create-payment-intent", authMiddleware, async (req: any, res) => {
    try {
      const userId = useSupabaseAuth ? req.user.id : req.user.claims.sub;
      const { planId, hasRxValet, coverageType, totalAmount } = req.body;
      
      if (!stripe) {
        return res.status(503).json({ message: "Payment processing not configured" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(400).json({ message: "Invalid plan" });
      }

      // Use the total amount calculated on the frontend
      const amountInCents = Math.round(parseFloat(totalAmount) * 100);

      // Create payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: "usd",
        payment_method_types: ['card'],
        metadata: {
          userId,
          planId: planId.toString(),
          planName: plan.name,
          hasRxValet: hasRxValet ? "true" : "false",
          coverageType: coverageType || "",
          totalAmount: totalAmount
        },
      });

      res.json({ 
        clientSecret: paymentIntent.client_secret,
        amount: totalAmount 
      });
    } catch (error: any) {
      console.error("Error creating payment intent:", error);
      res.status(500).json({ message: "Error creating payment intent: " + error.message });
    }
  });

  // Stripe subscription routes
  app.post('/api/create-subscription', authMiddleware, async (req: any, res) => {
    try {
      const userId = useSupabaseAuth ? req.user.id : req.user.claims.sub;
      const { planId } = req.body;
      
      if (!stripe) {
        return res.status(503).json({ message: "Payment processing not configured" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(400).json({ message: "Invalid plan" });
      }

      // Check if user already has an active subscription
      const existingSubscription = await storage.getUserSubscription(userId);
      if (existingSubscription) {
        return res.status(400).json({ message: "User already has an active subscription" });
      }

      let customerId = user.stripeCustomerId;

      // Create Stripe customer if doesn't exist
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email || undefined,
          name: `${user.firstName} ${user.lastName}`,
          metadata: { userId },
        });
        customerId = customer.id;
        await storage.updateUserStripeInfo(userId, customerId);
      }

      // Create Stripe subscription
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: plan.stripePriceId }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
      });

      // Create subscription record in database
      await storage.createSubscription({
        userId,
        planId,
        status: "pending",
        amount: plan.price,
        stripeSubscriptionId: subscription.id,
        nextBillingDate: new Date(subscription.current_period_end * 1000),
      });

      // Update user with subscription ID
      await storage.updateUserStripeInfo(userId, customerId, subscription.id);

      const paymentIntent = subscription.latest_invoice?.payment_intent as Stripe.PaymentIntent;
      
      res.json({
        subscriptionId: subscription.id,
        clientSecret: paymentIntent?.client_secret,
      });
    } catch (error: any) {
      console.error("Error creating subscription:", error);
      res.status(500).json({ message: "Error creating subscription: " + error.message });
    }
  });

  // Handle successful payment completion (called after Stripe redirect)
  app.post('/api/complete-payment', authMiddleware, async (req: any, res) => {
    try {
      const userId = useSupabaseAuth ? req.user.id : req.user.claims.sub;
      const { payment_intent } = req.body;

      if (!stripe || !payment_intent) {
        return res.status(400).json({ message: "Invalid payment data" });
      }

      // Retrieve the payment intent from Stripe
      const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent);
      
      if (paymentIntent.status === 'succeeded') {
        const metadata = paymentIntent.metadata;
        const planId = parseInt(metadata.planId);
        const hasRxValet = metadata.hasRxValet === "true";
        
        // Get user and plan
        const user = await storage.getUser(userId);
        const plan = await storage.getPlan(planId);
        
        if (!user || !plan) {
          return res.status(400).json({ message: "User or plan not found" });
        }

        // Create subscription record
        const subscription = await storage.createSubscription({
          userId,
          planId,
          status: "active",
          amount: metadata.totalAmount,
          nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        });

        // Record payment
        await storage.createPayment({
          userId,
          subscriptionId: subscription.id,
          amount: metadata.totalAmount,
          status: "succeeded",
          stripePaymentIntentId: payment_intent,
          paymentMethod: "card",
        });

        // Store enrollment information for commission tracking
        await storage.recordEnrollmentModification({
          userId,
          planId,
          memberType: metadata.coverageType,
          hasRxValet,
          enrolledByAgentId: user.enrolledByAgentId,
          status: 'active'
        });

        res.json({ success: true, subscription });
      } else {
        res.status(400).json({ message: "Payment not successful" });
      }
    } catch (error: any) {
      console.error("Error completing payment:", error);
      res.status(500).json({ message: "Error completing payment: " + error.message });
    }
  });

  // Stripe webhook to handle payment events
  app.post('/api/stripe-webhook', async (req, res) => {
    try {
      const sig = req.headers['stripe-signature'];
      if (!sig || !stripe) {
        return res.status(400).json({ message: "Missing stripe signature or stripe not configured" });
      }

      const event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET || ''
      );

      switch (event.type) {
        case 'payment_intent.succeeded':
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          console.log("Payment succeeded:", paymentIntent.id);
          // Payment success is handled in complete-payment endpoint
          break;

        case 'invoice.payment_succeeded':
          const invoice = event.data.object as Stripe.Invoice;
          if (invoice.subscription) {
            // Handle recurring subscription payments
            const subscriptions = await storage.getActiveSubscriptions();
            const subscription = subscriptions.find(s => s.stripeSubscriptionId === invoice.subscription);
            if (subscription) {
              await storage.updateSubscription(subscription.id, {
                status: "active",
                nextBillingDate: new Date(invoice.period_end * 1000),
              });

              // Record payment
              await storage.createPayment({
                userId: subscription.userId,
                subscriptionId: subscription.id,
                amount: (invoice.amount_paid / 100).toString(),
                status: "succeeded",
                stripePaymentIntentId: invoice.payment_intent as string,
                paymentMethod: "card",
              });
            }
          }
          break;

        case 'customer.subscription.deleted':
          const deletedSubscription = event.data.object as Stripe.Subscription;
          const subscriptions = await storage.getActiveSubscriptions();
          const sub = subscriptions.find(s => s.stripeSubscriptionId === deletedSubscription.id);
          if (sub) {
            await storage.updateSubscription(sub.id, {
              status: "cancelled",
              endDate: new Date(),
            });
          }
          break;
      }

      res.json({ received: true });
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(400).json({ message: "Webhook error" });
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
      
      // Create the lead
      const lead = await storage.createLead({
        firstName,
        lastName,
        email,
        phone,
        message,
        source: 'contact_form',
        status: 'new'
      });
      
      // Auto-assign to available agent
      const availableAgentId = await storage.getAvailableAgentForLead();
      if (availableAgentId) {
        await storage.assignLeadToAgent(lead.id, availableAgentId);
      }
      
      res.json({ success: true, lead });
    } catch (error) {
      console.error("Lead creation error:", error);
      res.status(500).json({ message: "Failed to create lead" });
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
