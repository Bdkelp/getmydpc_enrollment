import {
  users,
  plans,
  subscriptions,
  payments,
  familyMembers,
  enrollmentModifications,
  leads,
  leadActivities,
  type User,
  type UpsertUser,
  type Plan,
  type InsertPlan,
  type Subscription,
  type InsertSubscription,
  type Payment,
  type InsertPayment,
  type FamilyMember,
  type InsertFamilyMember,
  type Lead,
  type InsertLead,
  type LeadActivity,
  type InsertLeadActivity,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, like, count, gte, lte, sql } from "drizzle-orm";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserProfile(id: string, data: Partial<User>): Promise<User>;
  updateUserStripeInfo(id: string, stripeCustomerId?: string, stripeSubscriptionId?: string): Promise<User>;
  
  // Plan operations
  getPlans(): Promise<Plan[]>;
  getActivePlans(): Promise<Plan[]>;
  getPlan(id: number): Promise<Plan | undefined>;
  createPlan(plan: InsertPlan): Promise<Plan>;
  updatePlan(id: number, data: Partial<Plan>): Promise<Plan>;
  
  // Subscription operations
  getUserSubscription(userId: string): Promise<Subscription | undefined>;
  createSubscription(subscription: InsertSubscription): Promise<Subscription>;
  updateSubscription(id: number, data: Partial<Subscription>): Promise<Subscription>;
  getActiveSubscriptions(): Promise<Subscription[]>;
  
  // Payment operations
  createPayment(payment: InsertPayment): Promise<Payment>;
  getUserPayments(userId: string): Promise<Payment[]>;
  getPaymentByStripeId(stripePaymentIntentId: string): Promise<Payment | undefined>;
  
  // Family member operations
  getFamilyMembers(primaryUserId: string): Promise<FamilyMember[]>;
  addFamilyMember(member: InsertFamilyMember): Promise<FamilyMember>;
  
  // Admin operations
  getAllUsers(limit?: number, offset?: number): Promise<User[]>;
  getUsersCount(): Promise<number>;
  getRevenueStats(): Promise<{ totalRevenue: number; monthlyRevenue: number }>;
  getSubscriptionStats(): Promise<{ active: number; pending: number; cancelled: number }>;
  
  // Agent operations
  getAgentEnrollments(agentId: string, startDate?: string, endDate?: string): Promise<User[]>;
  
  // Enrollment modification operations
  recordEnrollmentModification(data: any): Promise<void>;
  
  // Lead management operations
  createLead(lead: InsertLead): Promise<Lead>;
  getAgentLeads(agentId: string, status?: string): Promise<Lead[]>;
  getLead(id: number): Promise<Lead | undefined>;
  getLeadByEmail(email: string): Promise<Lead | undefined>;
  updateLead(id: number, data: Partial<Lead>): Promise<Lead>;
  assignLeadToAgent(leadId: number, agentId: string): Promise<Lead>;
  
  // Lead activity operations
  addLeadActivity(activity: InsertLeadActivity): Promise<LeadActivity>;
  getLeadActivities(leadId: number): Promise<LeadActivity[]>;
  
  // Lead stats
  getAgentLeadStats(agentId: string): Promise<{ new: number; contacted: number; qualified: number; enrolled: number; closed: number }>;
  getAvailableAgentForLead(): Promise<string | null>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const existingUser = await this.getUser(userData.id);
    if (existingUser) {
      // If user exists, preserve their role
      const { role, ...updateData } = userData;
      const [user] = await db
        .update(users)
        .set({ ...updateData, updatedAt: new Date() })
        .where(eq(users.id, userData.id))
        .returning();
      return user;
    } else {
      // New user, set default role
      const [user] = await db
        .insert(users)
        .values({ ...userData, role: userData.role || "user" })
        .returning();
      return user;
    }
  }

  async updateUserProfile(id: string, data: Partial<User>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserStripeInfo(id: string, stripeCustomerId?: string, stripeSubscriptionId?: string): Promise<User> {
    const updateData: Partial<User> = { updatedAt: new Date() };
    if (stripeCustomerId) updateData.stripeCustomerId = stripeCustomerId;
    if (stripeSubscriptionId) updateData.stripeSubscriptionId = stripeSubscriptionId;

    const [user] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // Plan operations
  async getPlans(): Promise<Plan[]> {
    return await db.select().from(plans).orderBy(plans.price);
  }

  async getActivePlans(): Promise<Plan[]> {
    return await db.select().from(plans).where(eq(plans.isActive, true)).orderBy(plans.price);
  }

  async getPlan(id: number): Promise<Plan | undefined> {
    const [plan] = await db.select().from(plans).where(eq(plans.id, id));
    return plan;
  }

  async createPlan(plan: InsertPlan): Promise<Plan> {
    const [newPlan] = await db.insert(plans).values(plan).returning();
    return newPlan;
  }

  async updatePlan(id: number, data: Partial<Plan>): Promise<Plan> {
    const [plan] = await db
      .update(plans)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(plans.id, id))
      .returning();
    return plan;
  }

  // Subscription operations
  async getUserSubscription(userId: string): Promise<Subscription | undefined> {
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(and(
        eq(subscriptions.userId, userId),
        or(eq(subscriptions.status, "active"), eq(subscriptions.status, "pending"))
      ))
      .orderBy(desc(subscriptions.createdAt));
    return subscription;
  }

  async createSubscription(subscription: InsertSubscription): Promise<Subscription> {
    const [newSubscription] = await db.insert(subscriptions).values(subscription).returning();
    return newSubscription;
  }

  async updateSubscription(id: number, data: Partial<Subscription>): Promise<Subscription> {
    const [subscription] = await db
      .update(subscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(subscriptions.id, id))
      .returning();
    return subscription;
  }

  async getActiveSubscriptions(): Promise<Subscription[]> {
    return await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.status, "active"))
      .orderBy(desc(subscriptions.createdAt));
  }

  // Payment operations
  async createPayment(payment: InsertPayment): Promise<Payment> {
    const [newPayment] = await db.insert(payments).values(payment).returning();
    return newPayment;
  }

  async getUserPayments(userId: string): Promise<Payment[]> {
    return await db
      .select()
      .from(payments)
      .where(eq(payments.userId, userId))
      .orderBy(desc(payments.createdAt));
  }

  async getPaymentByStripeId(stripePaymentIntentId: string): Promise<Payment | undefined> {
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.stripePaymentIntentId, stripePaymentIntentId));
    return payment;
  }

  // Family member operations
  async getFamilyMembers(primaryUserId: string): Promise<FamilyMember[]> {
    return await db
      .select()
      .from(familyMembers)
      .where(and(
        eq(familyMembers.primaryUserId, primaryUserId),
        eq(familyMembers.isActive, true)
      ));
  }

  async addFamilyMember(member: InsertFamilyMember): Promise<FamilyMember> {
    const [newMember] = await db.insert(familyMembers).values(member).returning();
    return newMember;
  }

  // Admin operations
  async getAllUsers(limit = 50, offset = 0): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getUsersCount(): Promise<number> {
    const [result] = await db.select({ count: count() }).from(users);
    return result.count;
  }

  async getRevenueStats(): Promise<{ totalRevenue: number; monthlyRevenue: number }> {
    // This would need to be implemented with proper SQL aggregations
    // For now, returning placeholder values
    return { totalRevenue: 224913, monthlyRevenue: 224913 };
  }

  async getSubscriptionStats(): Promise<{ active: number; pending: number; cancelled: number }> {
    const activeCount = await db
      .select({ count: count() })
      .from(subscriptions)
      .where(eq(subscriptions.status, "active"));
    
    const pendingCount = await db
      .select({ count: count() })
      .from(subscriptions)
      .where(eq(subscriptions.status, "pending"));
    
    const cancelledCount = await db
      .select({ count: count() })
      .from(subscriptions)
      .where(eq(subscriptions.status, "cancelled"));

    return {
      active: activeCount[0]?.count || 0,
      pending: pendingCount[0]?.count || 0,
      cancelled: cancelledCount[0]?.count || 0,
    };
  }

  async getAgentEnrollments(agentId: string, startDate?: string, endDate?: string): Promise<User[]> {
    const conditions = [eq(users.enrolledByAgentId, agentId)];
    
    if (startDate && endDate) {
      conditions.push(
        gte(users.createdAt, new Date(startDate)),
        lte(users.createdAt, new Date(endDate))
      );
    }
    
    return await db.select().from(users).where(and(...conditions));
  }
  
  async recordEnrollmentModification(data: any): Promise<void> {
    await db.insert(enrollmentModifications).values({
      userId: data.userId,
      subscriptionId: data.subscriptionId,
      modifiedBy: data.modifiedBy,
      changeType: data.changeType,
      changeDetails: data.changeDetails,
      consentType: data.consentType,
      consentNotes: data.consentNotes,
      consentDate: data.consentDate,
    });
  }

  // Lead management operations
  async createLead(lead: InsertLead): Promise<Lead> {
    const [newLead] = await db.insert(leads).values(lead).returning();
    return newLead;
  }

  async getAgentLeads(agentId: string, status?: string): Promise<Lead[]> {
    const conditions = [eq(leads.assignedAgentId, agentId)];
    if (status) {
      conditions.push(eq(leads.status, status));
    }
    return await db.select().from(leads).where(and(...conditions)).orderBy(desc(leads.createdAt));
  }

  async getLead(id: number): Promise<Lead | undefined> {
    const [lead] = await db.select().from(leads).where(eq(leads.id, id));
    return lead;
  }

  async getLeadByEmail(email: string): Promise<Lead | undefined> {
    const [lead] = await db.select().from(leads).where(eq(leads.email, email));
    return lead;
  }

  async updateLead(id: number, data: Partial<Lead>): Promise<Lead> {
    const [updated] = await db.update(leads).set({ ...data, updatedAt: new Date() }).where(eq(leads.id, id)).returning();
    return updated;
  }

  async assignLeadToAgent(leadId: number, agentId: string): Promise<Lead> {
    const [updated] = await db.update(leads).set({ assignedAgentId: agentId, updatedAt: new Date() }).where(eq(leads.id, leadId)).returning();
    return updated;
  }

  // Lead activity operations
  async addLeadActivity(activity: InsertLeadActivity): Promise<LeadActivity> {
    const [newActivity] = await db.insert(leadActivities).values(activity).returning();
    return newActivity;
  }

  async getLeadActivities(leadId: number): Promise<LeadActivity[]> {
    return await db.select().from(leadActivities).where(eq(leadActivities.leadId, leadId)).orderBy(desc(leadActivities.createdAt));
  }

  // Lead stats
  async getAgentLeadStats(agentId: string): Promise<{ new: number; contacted: number; qualified: number; enrolled: number; closed: number }> {
    const stats = await db.select({
      status: leads.status,
      count: count()
    })
    .from(leads)
    .where(eq(leads.assignedAgentId, agentId))
    .groupBy(leads.status);

    const result = {
      new: 0,
      contacted: 0,
      qualified: 0,
      enrolled: 0,
      closed: 0
    };

    stats.forEach(stat => {
      if (stat.status && stat.status in result) {
        result[stat.status as keyof typeof result] = stat.count;
      }
    });

    return result;
  }

  async getAvailableAgentForLead(): Promise<string | null> {
    // Simple round-robin assignment - get agent with least assigned leads
    const agents = await db.select({
      agentId: users.id,
      leadCount: count(leads.id)
    })
    .from(users)
    .leftJoin(leads, eq(leads.assignedAgentId, users.id))
    .where(eq(users.role, 'agent'))
    .groupBy(users.id)
    .orderBy(count(leads.id))
    .limit(1);

    return agents[0]?.agentId || null;
  }
}

export const storage = new DatabaseStorage();
