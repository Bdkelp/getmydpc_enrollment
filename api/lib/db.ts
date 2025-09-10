import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from '../../shared/schema';
import { eq, and, desc, asc, sql, or, gte, lte, isNull, not } from 'drizzle-orm';

// Get database URL from environment variable
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Create database connection
const queryClient = neon(DATABASE_URL);
const db = drizzle(queryClient, { schema });

// Export database instance and schema
export { db, schema };

// User operations
export async function getUser(id: string) {
  const result = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  return result[0] || null;
}

export async function getUserByEmail(email: string) {
  const result = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  return result[0] || null;
}

export async function getUserByAgentNumber(agentNumber: string) {
  const result = await db.select().from(schema.users).where(eq(schema.users.agentNumber, agentNumber)).limit(1);
  return result[0] || null;
}

export async function createUser(userData: Partial<schema.User>) {
  const result = await db.insert(schema.users).values({
    ...userData,
    createdAt: new Date(),
    updatedAt: new Date()
  }).returning();
  return result[0];
}

export async function updateUser(id: string, data: Partial<schema.User>) {
  const result = await db.update(schema.users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.users.id, id))
    .returning();
  return result[0];
}

// Plan operations
export async function getPlans() {
  return await db.select().from(schema.plans).orderBy(asc(schema.plans.price));
}

export async function getActivePlans() {
  return await db.select().from(schema.plans)
    .where(eq(schema.plans.isActive, true))
    .orderBy(asc(schema.plans.price));
}

export async function getPlan(id: number) {
  const result = await db.select().from(schema.plans).where(eq(schema.plans.id, id)).limit(1);
  return result[0] || null;
}

// Lead operations
export async function getAllLeads(status?: string, assignedAgentId?: string) {
  let query = db.select().from(schema.leads);
  
  const conditions = [];
  if (status) conditions.push(eq(schema.leads.status, status));
  if (assignedAgentId) conditions.push(eq(schema.leads.assignedAgentId, assignedAgentId));
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }
  
  return await query.orderBy(desc(schema.leads.createdAt));
}

export async function getAgentLeads(agentId: string, status?: string) {
  let query = db.select().from(schema.leads).where(eq(schema.leads.assignedAgentId, agentId));
  
  if (status) {
    query = query.where(and(
      eq(schema.leads.assignedAgentId, agentId),
      eq(schema.leads.status, status)
    ));
  }
  
  return await query.orderBy(desc(schema.leads.createdAt));
}

export async function createLead(leadData: schema.InsertLead) {
  const result = await db.insert(schema.leads).values({
    ...leadData,
    createdAt: new Date(),
    updatedAt: new Date()
  }).returning();
  return result[0];
}

export async function updateLead(id: number, data: Partial<schema.Lead>) {
  const result = await db.update(schema.leads)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.leads.id, id))
    .returning();
  return result[0];
}

// Subscription operations
export async function getUserSubscriptions(userId: string) {
  return await db.select().from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .orderBy(desc(schema.subscriptions.createdAt));
}

export async function getUserSubscription(userId: string) {
  const result = await db.select().from(schema.subscriptions)
    .where(and(
      eq(schema.subscriptions.userId, userId),
      eq(schema.subscriptions.status, 'active')
    ))
    .limit(1);
  return result[0] || null;
}

export async function createSubscription(data: schema.InsertSubscription) {
  const result = await db.insert(schema.subscriptions).values({
    ...data,
    createdAt: new Date(),
    updatedAt: new Date()
  }).returning();
  return result[0];
}

export async function updateSubscription(id: number, data: Partial<schema.Subscription>) {
  const result = await db.update(schema.subscriptions)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.subscriptions.id, id))
    .returning();
  return result[0];
}

// Payment operations
export async function createPayment(data: schema.InsertPayment) {
  const result = await db.insert(schema.payments).values({
    ...data,
    createdAt: new Date(),
    updatedAt: new Date()
  }).returning();
  return result[0];
}

export async function getPaymentByTransactionId(transactionId: string) {
  const result = await db.select().from(schema.payments)
    .where(eq(schema.payments.transactionId, transactionId))
    .limit(1);
  return result[0] || null;
}

export async function updatePayment(id: number, data: Partial<schema.Payment>) {
  const result = await db.update(schema.payments)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.payments.id, id))
    .returning();
  return result[0];
}

export async function getUserPayments(userId: string) {
  return await db.select().from(schema.payments)
    .where(eq(schema.payments.userId, userId))
    .orderBy(desc(schema.payments.createdAt));
}

// Commission operations
export async function createCommission(data: schema.InsertCommission) {
  const result = await db.insert(schema.commissions).values({
    ...data,
    createdAt: new Date(),
    updatedAt: new Date()
  }).returning();
  return result[0];
}

export async function getAgentCommissions(agentId: string, startDate?: string, endDate?: string) {
  let query = db.select().from(schema.commissions).where(eq(schema.commissions.agentId, agentId));
  
  const conditions = [eq(schema.commissions.agentId, agentId)];
  if (startDate) conditions.push(gte(schema.commissions.createdAt, new Date(startDate)));
  if (endDate) conditions.push(lte(schema.commissions.createdAt, new Date(endDate)));
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }
  
  return await query.orderBy(desc(schema.commissions.createdAt));
}

export async function getCommissionBySubscriptionId(subscriptionId: number) {
  const result = await db.select().from(schema.commissions)
    .where(eq(schema.commissions.subscriptionId, subscriptionId))
    .limit(1);
  return result[0] || null;
}

export async function getCommissionByUserId(userId: string, agentId: string) {
  const result = await db.select().from(schema.commissions)
    .where(and(
      eq(schema.commissions.userId, userId),
      eq(schema.commissions.agentId, agentId)
    ))
    .limit(1);
  return result[0] || null;
}

// Family member operations
export async function getFamilyMembers(primaryUserId: string) {
  return await db.select().from(schema.familyMembers)
    .where(eq(schema.familyMembers.primaryUserId, primaryUserId))
    .orderBy(asc(schema.familyMembers.firstName));
}

export async function addFamilyMember(data: schema.InsertFamilyMember) {
  const result = await db.insert(schema.familyMembers).values({
    ...data,
    createdAt: new Date(),
    updatedAt: new Date()
  }).returning();
  return result[0];
}

// Admin operations
export async function getAllUsers(limit = 100, offset = 0) {
  const users = await db.select().from(schema.users)
    .orderBy(desc(schema.users.createdAt))
    .limit(limit)
    .offset(offset);
  
  const totalCount = await db.select({ count: sql`count(*)` }).from(schema.users);
  
  return {
    users,
    totalCount: Number(totalCount[0]?.count || 0)
  };
}

export async function getMembersOnly(limit = 100, offset = 0) {
  const users = await db.select().from(schema.users)
    .where(eq(schema.users.role, 'member'))
    .orderBy(desc(schema.users.createdAt))
    .limit(limit)
    .offset(offset);
  
  const totalCount = await db.select({ count: sql`count(*)` }).from(schema.users)
    .where(eq(schema.users.role, 'member'));
  
  return {
    users,
    totalCount: Number(totalCount[0]?.count || 0)
  };
}

export async function getAgents() {
  return await db.select().from(schema.users)
    .where(eq(schema.users.role, 'agent'))
    .orderBy(asc(schema.users.firstName));
}

export async function getPendingUsers() {
  return await db.select().from(schema.users)
    .where(eq(schema.users.approvalStatus, 'pending'))
    .orderBy(desc(schema.users.createdAt));
}

export async function getAgentEnrollments(agentId: string, startDate?: string, endDate?: string) {
  let query = db.select().from(schema.users).where(eq(schema.users.enrolledByAgentId, agentId));
  
  const conditions = [eq(schema.users.enrolledByAgentId, agentId)];
  if (startDate) conditions.push(gte(schema.users.createdAt, new Date(startDate)));
  if (endDate) conditions.push(lte(schema.users.createdAt, new Date(endDate)));
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }
  
  return await query.orderBy(desc(schema.users.createdAt));
}

export async function getAllEnrollments(startDate?: string, endDate?: string, agentId?: string) {
  let query = db.select().from(schema.users)
    .where(and(
      eq(schema.users.role, 'member'),
      eq(schema.users.approvalStatus, 'approved')
    ));
  
  const conditions = [
    eq(schema.users.role, 'member'),
    eq(schema.users.approvalStatus, 'approved')
  ];
  
  if (startDate) conditions.push(gte(schema.users.createdAt, new Date(startDate)));
  if (endDate) conditions.push(lte(schema.users.createdAt, new Date(endDate)));
  if (agentId) conditions.push(eq(schema.users.enrolledByAgentId, agentId));
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }
  
  return await query.orderBy(desc(schema.users.createdAt));
}

export async function getEnrollmentsByAgent(agentId: string, startDate?: string, endDate?: string) {
  return getAgentEnrollments(agentId, startDate, endDate);
}

// Stats operations
export async function getUsersCount() {
  const result = await db.select({ count: sql`count(*)` }).from(schema.users);
  return Number(result[0]?.count || 0);
}

export async function getRevenueStats() {
  const totalRevenue = await db.select({ sum: sql`sum(amount)` }).from(schema.payments)
    .where(eq(schema.payments.status, 'completed'));
  
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  
  const monthlyRevenue = await db.select({ sum: sql`sum(amount)` }).from(schema.payments)
    .where(and(
      eq(schema.payments.status, 'completed'),
      gte(schema.payments.createdAt, monthStart)
    ));
  
  return {
    totalRevenue: Number(totalRevenue[0]?.sum || 0),
    monthlyRevenue: Number(monthlyRevenue[0]?.sum || 0)
  };
}

export async function getSubscriptionStats() {
  const active = await db.select({ count: sql`count(*)` }).from(schema.subscriptions)
    .where(eq(schema.subscriptions.status, 'active'));
  
  const pending = await db.select({ count: sql`count(*)` }).from(schema.subscriptions)
    .where(eq(schema.subscriptions.status, 'pending'));
  
  const cancelled = await db.select({ count: sql`count(*)` }).from(schema.subscriptions)
    .where(eq(schema.subscriptions.status, 'cancelled'));
  
  return {
    active: Number(active[0]?.count || 0),
    pending: Number(pending[0]?.count || 0),
    cancelled: Number(cancelled[0]?.count || 0)
  };
}

export async function getCommissionStats(agentId?: string) {
  const conditions = agentId ? [eq(schema.commissions.agentId, agentId)] : [];
  
  const totalEarned = await db.select({ sum: sql`sum(commission_amount)` })
    .from(schema.commissions)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  
  const totalPending = await db.select({ sum: sql`sum(commission_amount)` })
    .from(schema.commissions)
    .where(and(
      ...conditions,
      eq(schema.commissions.paymentStatus, 'unpaid'),
      eq(schema.commissions.status, 'active')
    ));
  
  const totalPaid = await db.select({ sum: sql`sum(commission_amount)` })
    .from(schema.commissions)
    .where(and(
      ...conditions,
      eq(schema.commissions.paymentStatus, 'paid')
    ));
  
  return {
    totalEarned: Number(totalEarned[0]?.sum || 0),
    totalPending: Number(totalPending[0]?.sum || 0),
    totalPaid: Number(totalPaid[0]?.sum || 0)
  };
}

// Lead stats
export async function getAgentLeadStats(agentId: string) {
  const statuses = ['new', 'contacted', 'qualified', 'enrolled', 'closed'];
  const stats: any = {};
  
  for (const status of statuses) {
    const result = await db.select({ count: sql`count(*)` })
      .from(schema.leads)
      .where(and(
        eq(schema.leads.assignedAgentId, agentId),
        eq(schema.leads.status, status)
      ));
    stats[status] = Number(result[0]?.count || 0);
  }
  
  return stats;
}

// Login session tracking
export async function createLoginSession(sessionData: {
  userId: string;
  ipAddress?: string;
  userAgent?: string;
  deviceType?: string;
  browser?: string;
  location?: string;
}) {
  const result = await db.insert(schema.loginSessions).values({
    ...sessionData,
    loginTime: new Date(),
    isActive: true
  }).returning();
  return result[0];
}

// Admin dashboard stats
export async function getAdminDashboardStats() {
  const totalMembers = await db.select({ count: sql`count(*)` }).from(schema.users)
    .where(eq(schema.users.role, 'member'));
  
  const activeSubscriptions = await db.select({ count: sql`count(*)` }).from(schema.subscriptions)
    .where(eq(schema.subscriptions.status, 'active'));
  
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  
  const monthlyRevenue = await db.select({ sum: sql`sum(amount)` }).from(schema.payments)
    .where(and(
      eq(schema.payments.status, 'completed'),
      gte(schema.payments.createdAt, monthStart)
    ));
  
  const pendingApprovals = await db.select({ count: sql`count(*)` }).from(schema.users)
    .where(eq(schema.users.approvalStatus, 'pending'));
  
  const totalAgents = await db.select({ count: sql`count(*)` }).from(schema.users)
    .where(eq(schema.users.role, 'agent'));
  
  const newLeads = await db.select({ count: sql`count(*)` }).from(schema.leads)
    .where(eq(schema.leads.status, 'new'));
  
  return {
    totalMembers: Number(totalMembers[0]?.count || 0),
    activeSubscriptions: Number(activeSubscriptions[0]?.count || 0),
    monthlyRevenue: Number(monthlyRevenue[0]?.sum || 0),
    pendingApprovals: Number(pendingApprovals[0]?.count || 0),
    totalAgents: Number(totalAgents[0]?.count || 0),
    newLeads: Number(newLeads[0]?.count || 0)
  };
}

// Comprehensive analytics
export async function getComprehensiveAnalytics(days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  // Overview stats
  const overview = await getAdminDashboardStats();
  
  // Recent enrollments
  const recentEnrollments = await db.select({
    id: schema.users.id,
    firstName: schema.users.firstName,
    lastName: schema.users.lastName,
    email: schema.users.email,
    createdAt: schema.users.createdAt,
    enrolledByAgentId: schema.users.enrolledByAgentId
  })
    .from(schema.users)
    .where(and(
      eq(schema.users.role, 'member'),
      gte(schema.users.createdAt, startDate)
    ))
    .orderBy(desc(schema.users.createdAt))
    .limit(10);
  
  // Revenue by day
  const revenueByDay = await db.select({
    date: sql`DATE(created_at)`,
    amount: sql`SUM(amount)`
  })
    .from(schema.payments)
    .where(and(
      eq(schema.payments.status, 'completed'),
      gte(schema.payments.createdAt, startDate)
    ))
    .groupBy(sql`DATE(created_at)`)
    .orderBy(sql`DATE(created_at)`);
  
  // Top agents
  const topAgents = await db.select({
    agentId: schema.commissions.agentId,
    totalCommissions: sql`SUM(commission_amount)`,
    enrollmentCount: sql`COUNT(DISTINCT user_id)`
  })
    .from(schema.commissions)
    .where(gte(schema.commissions.createdAt, startDate))
    .groupBy(schema.commissions.agentId)
    .orderBy(desc(sql`SUM(commission_amount)`))
    .limit(5);
  
  return {
    overview,
    recentEnrollments,
    revenueByDay,
    topAgents
  };
}

// Payment filters
export async function getPaymentsWithFilters(filters: {
  startDate?: string;
  endDate?: string;
  status?: string;
  transactionId?: string;
  customerId?: string;
  limit?: number;
}) {
  let query = db.select().from(schema.payments);
  
  const conditions = [];
  if (filters.status) conditions.push(eq(schema.payments.status, filters.status));
  if (filters.transactionId) conditions.push(eq(schema.payments.transactionId, filters.transactionId));
  if (filters.customerId) conditions.push(eq(schema.payments.userId, filters.customerId));
  if (filters.startDate) conditions.push(gte(schema.payments.createdAt, new Date(filters.startDate)));
  if (filters.endDate) conditions.push(lte(schema.payments.createdAt, new Date(filters.endDate)));
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }
  
  query = query.orderBy(desc(schema.payments.createdAt));
  
  if (filters.limit) {
    query = query.limit(filters.limit);
  }
  
  return await query;
}

// Lead assignment
export async function assignLead(leadId: number, agentId: string | null) {
  const result = await db.update(schema.leads)
    .set({ 
      assignedAgentId: agentId,
      updatedAt: new Date() 
    })
    .where(eq(schema.leads.id, leadId))
    .returning();
  return result[0];
}