import { supabase } from './lib/supabaseClient';
import crypto from 'crypto';

// Encryption utilities for sensitive data
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

export function encryptSensitiveData(data: string): string {
  const cipher = crypto.createCipher('aes-256-cbc', ENCRYPTION_KEY);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

export function decryptSensitiveData(encryptedData: string): string {
  const decipher = crypto.createDecipher('aes-256-cbc', ENCRYPTION_KEY);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export function getLastFourSSN(ssn: string): string {
  return ssn.replace(/\D/g, '').slice(-4);
}

export function validateDOB(dateOfBirth: string): boolean {
  const dob = new Date(dateOfBirth);
  const today = new Date();
  const age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    return age - 1 >= 18;
  }
  return age >= 18;
}

export function validatePhoneNumber(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length === 10 || (cleaned.length === 11 && cleaned[0] === '1');
}

export function encryptPaymentToken(token: string): string {
  return encryptSensitiveData(token);
}

export function decryptPaymentToken(encryptedToken: string): string {
  return decryptSensitiveData(encryptedToken);
}
import type {
  User,
  Plan,
  Subscription,
  Lead,
  Payment,
  Commission,
  FamilyMember,
  LeadActivity,
  UpsertUser, // Keep these types even if not directly used in the snippet
  InsertPlan,
  InsertSubscription,
  InsertPayment,
  InsertFamilyMember,
  InsertLead,
  InsertLeadActivity,
  InsertCommission,
} from "@shared/schema";
import { eq, desc, and, or, like, count, gte, lte, sql, isNull, sum } from "drizzle-orm"; // Keep these imports even if not directly used in the snippet
// Note: The crypto import below is redundant as it's already imported at the top.
// import crypto from "crypto"; // Keep these imports even if not directly used in the snippet

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserProfile(id: string, data: Partial<User>): Promise<User>;
  updateUserStripeInfo(id: string, stripeCustomerId?: string, stripeSubscriptionId?: string): Promise<User>;

  // Authentication operations
  createUser(user: Partial<User>): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  getUserByFacebookId(facebookId: string): Promise<User | undefined>;
  getUserByTwitterId(twitterId: string): Promise<User | undefined>;
  getUserByVerificationToken(token: string): Promise<User | undefined>;
  getUserByResetToken(token: string): Promise<User | undefined>;
  getUserByAgentNumber(agentNumber: string): Promise<User | undefined>;

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
  getAllUsers(limit?: number, offset?: number): Promise<{ users: User[]; totalCount: number }>;
  getUsersCount(): Promise<number>;
  getRevenueStats(): Promise<{ totalRevenue: number; monthlyRevenue: number }>;
  getSubscriptionStats(): Promise<{ active: number; pending: number; cancelled: number }>;

  // Agent operations
  getAgentEnrollments(agentId: string, startDate?: string, endDate?: string): Promise<User[]>;
  getAllEnrollments(startDate?: string, endDate?: string, agentId?: string): Promise<User[]>;

  // Enrollment modification operations
  recordEnrollmentModification(data: any): Promise<void>;

  // Lead management operations
  createLead(lead: InsertLead): Promise<Lead>;
  getAgentLeads(agentId: string, status?: string): Promise<Lead[]>;
  getAllLeads(status?: string, assignedAgentId?: string): Promise<Lead[]>;
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

  // Agent operations
  getAgents(): Promise<User[]>;

  // User approval operations
  getPendingUsers(): Promise<User[]>;
  approveUser(userId: string, approvedBy: string): Promise<User>;
  rejectUser(userId: string, reason: string): Promise<User>;

  // Commission operations
  createCommission(commission: InsertCommission): Promise<Commission>;
  getAgentCommissions(agentId: string, startDate?: string, endDate?: string): Promise<Commission[]>;
  getAllCommissions(startDate?: string, endDate?: string): Promise<Commission[]>;
  getCommissionBySubscriptionId(subscriptionId: number): Promise<Commission | undefined>;
  updateCommission(id: number, data: Partial<Commission>): Promise<Commission>;
  getCommissionStats(agentId?: string): Promise<{ totalEarned: number; totalPending: number; totalPaid: number }>;

  // Analytics
  getAnalytics(): Promise<any>;
  getAnalyticsOverview(days: number): Promise<any>;
  getAdminDashboardStats(): Promise<any>;
  getComprehensiveAnalytics(days?: number): Promise<any>;
}

// --- Supabase Implementation ---

// User operations
export async function createUser(userData: Partial<User>): Promise<User> {
  const { data, error } = await supabase
    .from('users')
    .insert([{ ...userData, created_at: new Date(), updated_at: new Date() }]) // Added created_at and updated_at
    .select()
    .single();

  if (error) {
    console.error('Error creating user:', error);
    throw new Error(`Failed to create user: ${error.message}`);
  }

  return data;
}

export async function getUser(id: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*, role') // Explicitly include role
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // No rows returned
    console.error('Error fetching user:', error);
    throw new Error(`Failed to get user: ${error.message}`);
  }

  return mapUserFromDB(data);
}

// Helper function to map database snake_case to camelCase
function mapUserFromDB(data: any): User | null {
  if (!data) return null;

  // Normalize role - handle legacy 'user' role as 'member'
  const normalizedRole = data.role === 'user' ? 'member' : (data.role || 'member');

  return {
    id: data.id,
    email: data.email,
    firstName: data.first_name || data.firstName || '',
    lastName: data.last_name || data.lastName || '',
    middleName: data.middle_name || data.middleName,
    profileImageUrl: data.profile_image_url || data.profileImageUrl,
    phone: data.phone,
    dateOfBirth: data.date_of_birth || data.dateOfBirth,
    gender: data.gender,
    address: data.address,
    address2: data.address2,
    city: data.city,
    state: data.state,
    zipCode: data.zip_code || data.zipCode,
    emergencyContactName: data.emergency_contact_name || data.emergencyContactName,
    emergencyContactPhone: data.emergency_contact_phone || data.emergencyContactPhone,
    stripeCustomerId: data.stripe_customer_id || data.stripeCustomerId,
    stripeSubscriptionId: data.stripe_subscription_id || data.stripeSubscriptionId,
    role: normalizedRole,
    agentNumber: data.agent_number || data.agentNumber,
    isActive: data.is_active !== undefined ? data.is_active : (data.isActive !== undefined ? data.isActive : true),
    approvalStatus: data.approval_status || data.approvalStatus || 'approved',
    approvedAt: data.approved_at || data.approvedAt,
    approvedBy: data.approved_by || data.approvedBy,
    rejectionReason: data.rejection_reason || data.rejectionReason,
    emailVerified: data.email_verified !== undefined ? data.email_verified : (data.emailVerified !== undefined ? data.emailVerified : false),
    emailVerifiedAt: data.email_verified_at || data.emailVerifiedAt,
    registrationIp: data.registration_ip || data.registrationIp,
    registrationUserAgent: data.registration_user_agent || data.registrationUserAgent,
    suspiciousFlags: data.suspicious_flags || data.suspiciousFlags,
    enrolledByAgentId: data.enrolled_by_agent_id || data.enrolledByAgentId,
    employerName: data.employer_name || data.employerName,
    divisionName: data.division_name || data.divisionName,
    memberType: data.member_type || data.memberType,
    ssn: data.ssn,
    dateOfHire: data.date_of_hire || data.dateOfHire,
    planStartDate: data.plan_start_date || data.planStartDate,
    created_at: data.created_at || data.created_at || new Date(),
    updated_at: data.updated_at || data.updated_at || new Date(),
    username: data.username,
    passwordHash: data.password_hash || data.passwordHash,
    emailVerificationToken: data.email_verification_token || data.emailVerificationToken,
    resetPasswordToken: data.reset_password_token || data.resetPasswordToken,
    resetPasswordExpiry: data.reset_password_expiry || data.resetPasswordExpiry,
    lastLoginAt: data.last_login_at || data.lastLoginAt,
    googleId: data.google_id || data.googleId,
    facebookId: data.facebook_id || data.facebookId,
    appleId: data.apple_id || data.appleId,
    microsoftId: data.microsoft_id || data.microsoftId,
    linkedinId: data.linkedin_id || data.linkedinId,
    twitterId: data.twitter_id || data.twitterId
  } as User;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // No rows returned
    console.error('Error fetching user by email:', error);
    return null;
  }

  return mapUserFromDB(data);
}

export async function updateUser(id: string, updates: Partial<User>): Promise<User> {
  const { data, error } = await supabase
    .from('users')
    .update({ ...updates, updated_at: new Date() }) // Added updated_at
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating user:', error);
    throw new Error(`Failed to update user: ${error.message}`);
  }

  return data;
}

export async function updateUserProfile(id: string, profileData: Partial<User>): Promise<User> {
  return updateUser(id, profileData);
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('username', username)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Error fetching user by username:', error);
    return null;
  }
  return data;
}

export async function getUserByGoogleId(googleId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('googleId', googleId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Error fetching user by Google ID:', error);
    return null;
  }
  return data;
}

export async function getUserByFacebookId(facebookId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('facebookId', facebookId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Error fetching user by Facebook ID:', error);
    return null;
  }
  return data;
}

export async function getUserByTwitterId(twitterId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('twitterId', twitterId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Error fetching user by Twitter ID:', error);
    return null;
  }
  return data;
}

export async function getUserByVerificationToken(token: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('emailVerificationToken', token)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Error fetching user by verification token:', error);
    return null;
  }
  return data;
}

export async function getUserByResetToken(token: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('resetPasswordToken', token)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Error fetching user by reset token:', error);
    return null;
  }
  return data;
}

export async function getUserByAgentNumber(agentNumber: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('agentNumber', agentNumber)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Error fetching user by agent number:', error);
    return null;
  }
  return data;
}


export async function upsertUser(userData: UpsertUser): Promise<User> {
  // Supabase upsert logic can be a bit more involved if preserving specific fields is critical.
  // For simplicity, we'll check existence and then insert or update.
  const existingUser = await getUser(userData.id);

  if (existingUser) {
    // If user exists, preserve their role and update other fields
    const { role, ...updateData } = userData;
    return updateUser(userData.id, updateData);
  } else {
    // New user, set default role
    return createUser({ ...userData, role: userData.role || "user" });
  }
}


export async function updateUserStripeInfo(id: string, stripeCustomerId?: string, stripeSubscriptionId?: string): Promise<User> {
  const updates: Partial<User> = { updated_at: new Date() };
  if (stripeCustomerId) updates.stripeCustomerId = stripeCustomerId;
  if (stripeSubscriptionId) updates.stripeSubscriptionId = stripeSubscriptionId;

  return updateUser(id, updates);
}

export async function getAllUsers(limit = 50, offset = 0): Promise<{ users: User[]; totalCount: number }> {
  try {
    console.log('[Storage] Fetching all users...');
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[Storage] Error fetching all users:', error);
      console.error('[Storage] Error details:', error.message);
      return { users: [], totalCount: 0 };
    }

    const { count, error: countError } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('[Storage] Error fetching user count:', countError);
    }

    console.log('[Storage] Found users:', count || data?.length || 0);

    // Map all users using the helper function
    const mappedUsers = (data || []).map(mapUserFromDB).filter(Boolean);

    // Log first user for debugging (without sensitive data)
    if (mappedUsers.length > 0) {
      console.log('[Storage] Sample mapped user:', {
        id: mappedUsers[0].id,
        email: mappedUsers[0].email,
        firstName: mappedUsers[0].firstName,
        lastName: mappedUsers[0].lastName,
        role: mappedUsers[0].role,
        approvalStatus: mappedUsers[0].approvalStatus
      });
    }

    return {
      users: mappedUsers,
      totalCount: count || mappedUsers.length
    };
  } catch (error: any) {
    console.error("[Storage] Unexpected error fetching all users:", error);
    console.error("[Storage] Error details:", error.message);
    return { users: [], totalCount: 0 };
  }
}


export async function getUsersCount(): Promise<number> {
  const { count, error } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('Error fetching user count:', error);
    throw new Error(`Failed to get user count: ${error.message}`);
  }
  return count || 0;
}

export async function getRevenueStats(): Promise<{ totalRevenue: number; monthlyRevenue: number }> {
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const { data: totalRevenueData, error: totalRevenueError } = await supabase
    .from('payments')
    .select('amount')
    .eq('status', 'completed');

  const { data: monthlyRevenueData, error: monthlyRevenueError } = await supabase
    .from('payments')
    .select('amount')
    .eq('status', 'completed')
    .gte('created_at', firstDayOfMonth.toISOString());

  if (totalRevenueError) {
    console.error('Error fetching total revenue:', totalRevenueError);
    throw new Error(`Failed to get total revenue: ${totalRevenueError.message}`);
  }
  if (monthlyRevenueError) {
    console.error('Error fetching monthly revenue:', monthlyRevenueError);
    throw new Error(`Failed to get monthly revenue: ${monthlyRevenueError.message}`);
  }

  const totalRevenue = totalRevenueData?.reduce((sum, payment) => sum + (payment.amount || 0), 0) || 0;
  const monthlyRevenue = monthlyRevenueData?.reduce((sum, payment) => sum + (payment.amount || 0), 0) || 0;

  return { totalRevenue, monthlyRevenue };
}

export async function getSubscriptionStats(): Promise<{ active: number; pending: number; cancelled: number }> {
  const { count: activeCount, error: activeError } = await supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active');
  const { count: pendingCount, error: pendingError } = await supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'pending');
  const { count: cancelledCount, error: cancelledError } = await supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'cancelled');

  if (activeError || pendingError || cancelledError) {
    console.error('Error fetching subscription stats:', activeError || pendingError || cancelledError);
    throw new Error('Failed to get subscription stats');
  }

  return {
    active: activeCount || 0,
    pending: pendingCount || 0,
    cancelled: cancelledCount || 0,
  };
}

export async function getAgentEnrollments(agentId: string, startDate?: string, endDate?: string): Promise<User[]> {
  let query = supabase
    .from('users')
    .select('*')
    .eq('enrolledByAgentId', agentId);

  if (startDate && endDate) {
    query = query.lt('created_at', endDate).gt('created_at', startDate); // Assuming created_at for enrollment date
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching agent enrollments:', error);
    throw new Error(`Failed to get agent enrollments: ${error.message}`);
  }

  return data || [];
}

export async function getAllEnrollments(startDate?: string, endDate?: string, agentId?: string): Promise<User[]> {
  let query = supabase
    .from('users')
    .select('*')
    .eq('role', 'user'); // Assuming users with role 'user' are enrolled

  if (startDate && endDate) {
    query = query.lt('created_at', endDate).gt('created_at', startDate);
  }

  if (agentId) {
    query = query.eq('enrolledByAgentId', agentId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching all enrollments:', error);
    throw new Error(`Failed to get enrollments: ${error.message}`);
  }

  return data || [];
}

export async function recordEnrollmentModification(data: any): Promise<void> {
  const { error } = await supabase.from('enrollment_modifications').insert([data]);
  if (error) {
    console.error('Error recording enrollment modification:', error);
    throw new Error(`Failed to record enrollment modification: ${error.message}`);
  }
}

// Lead operations
export async function createLead(leadData: Partial<Lead>): Promise<Lead> {
  const { data, error } = await supabase
    .from('leads')
    .insert([{ ...leadData, created_at: new Date(), updated_at: new Date() }])
    .select()
    .single();

  if (error) {
    console.error('Error creating lead:', error);
    throw new Error(`Failed to create lead: ${error.message}`);
  }

  return data;
}

export async function getAgentLeads(agentId: string, status?: string): Promise<Lead[]> {
  let query = supabase.from('leads').select('*').eq('assignedAgentId', agentId);
  if (status) {
    query = query.eq('status', status);
  }
  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching leads by agent:', error);
    throw new Error(`Failed to get leads: ${error.message}`);
  }

  return data || [];
}

export async function getLead(id: number): Promise<Lead | undefined> {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return undefined;
    console.error('Error fetching lead:', error);
    throw new Error(`Failed to get lead: ${error.message}`);
  }

  return data;
}

export async function getLeadByEmail(email: string): Promise<Lead | undefined> {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('email', email)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return undefined;
    console.error('Error fetching lead by email:', error);
    return undefined;
  }

  return data;
}

export async function updateLead(id: number, data: Partial<Lead>): Promise<Lead> {
  const { data: updatedLead, error } = await supabase
    .from('leads')
    .update({ ...data, updated_at: new Date() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating lead:', error);
    throw new Error(`Failed to update lead: ${error.message}`);
  }
  return updatedLead;
}

export async function assignLeadToAgent(leadId: number, agentId: string): Promise<Lead> {
  const { data: updatedLead, error } = await supabase
    .from('leads')
    .update({ assignedAgentId: agentId, status: 'qualified', updated_at: new Date() })
    .eq('id', leadId)
    .select()
    .single();

  if (error) {
    console.error('Error assigning lead to agent:', error);
    throw new Error(`Failed to assign lead to agent: ${error.message}`);
  }
  return updatedLead;
}

// Lead activity operations
export async function addLeadActivity(activity: InsertLeadActivity): Promise<LeadActivity> {
  const { data, error } = await supabase
    .from('lead_activities')
    .insert([{ ...activity, created_at: new Date() }])
    .select()
    .single();

  if (error) {
    console.error('Error creating lead activity:', error);
    throw new Error(`Failed to create lead activity: ${error.message}`);
  }

  return data;
}

export async function getLeadActivities(leadId: number): Promise<LeadActivity[]> {
  const { data, error } = await supabase
    .from('lead_activities')
    .select('*')
    .eq('leadId', leadId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching lead activities:', error);
    throw new Error(`Failed to get lead activities: ${error.message}`);
  }

  return data || [];
}

// Lead stats
export async function getAgentLeadStats(agentId: string): Promise<{ new: number; contacted: number; qualified: number; enrolled: number; closed: number }> {
  // Supabase doesn't directly support GROUP BY with conditional aggregation like Drizzle.
  // This will require fetching all leads and processing them client-side or using custom SQL.
  // For now, a simplified approach: count leads by status.
  const leads = await getAgentLeads(agentId); // Fetch all leads for the agent

  const stats = {
    new: 0,
    contacted: 0,
    qualified: 0,
    enrolled: 0,
    closed: 0,
  };

  leads.forEach(lead => {
    if (lead.status && lead.status in stats) {
      stats[lead.status as keyof typeof stats]++;
    }
  });

  return stats;
}

export async function getAvailableAgentForLead(): Promise<string | null> {
  // This is a complex query to implement efficiently in Supabase without custom SQL.
  // A simple approach would be to fetch all agents and their lead counts, then sort.
  const agentsWithLeadCount = await supabase.rpc('get_agents_with_lead_count'); // Assuming a PostgreSQL function exists for this

  if (agentsWithLeadCount.error) {
    console.error('Error fetching agents with lead count:', agentsWithLeadCount.error);
    return null;
  }

  const agents = agentsWithLeadCount.data;
  if (!agents || agents.length === 0) {
    return null;
  }

  // Find the agent with the minimum lead count
  agents.sort((a, b) => (a.leadCount || 0) - (b.leadCount || 0));
  return agents[0]?.agentId || null;
}

export async function getAllLeads(status?: string, assignedAgentId?: string): Promise<Lead[]> {
  let query = supabase.from('leads').select('*');

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  if (assignedAgentId === 'unassigned') {
    query = query.is('assignedAgentId', null);
  } else if (assignedAgentId && assignedAgentId !== 'all') {
    query = query.eq('assignedAgentId', assignedAgentId);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching all leads:', error);
    throw new Error(`Failed to get leads: ${error.message}`);
  }

  return data || [];
}

// Agent operations
export async function getAgents(): Promise<User[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('role', 'agent')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching agents:', error);
    throw new Error(`Failed to get agents: ${error.message}`);
  }

  return data || [];
}

// Get database stats - this would typically involve custom SQL or specific Supabase functions.
// Providing a placeholder implementation based on the original Drizzle queries.
export async function getDatabaseStats(): Promise<any[]> {
  const [userCountResult, leadCountResult, subCountResult, planCountResult] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }),
    supabase.from('leads').select('*', { count: 'exact', head: true }),
    supabase.from('subscriptions').select('*', { count: 'exact', head: true }),
    supabase.from('plans').select('*', { count: 'exact', head: true }),
  ]);

  return [
    { table: 'Users', count: userCountResult.count || 0 },
    { table: 'Leads', count: leadCountResult.count || 0 },
    { table: 'Subscriptions', count: subCountResult.count || 0 },
    { table: 'Plans', count: planCountResult.count || 0 },
  ];
}

export async function getTableData(tableName: string): Promise<any[]> {
  const { data, error } = await supabase.from(tableName).select('*').limit(100);
  if (error) {
    console.error(`Error fetching data for table ${tableName}:`, error);
    throw new Error(`Failed to get data for table ${tableName}: ${error.message}`);
  }
  return data || [];
}

export async function getAnalytics(): Promise<any> {
  try {
    const [users, subscriptions, payments, leads] = await Promise.all([
      getAllUsers(),
      getAllSubscriptions(),
      getAllPayments(),
      getAllLeads()
    ]);

    const activeSubscriptions = subscriptions.filter(s => s.status === 'active');
    const totalRevenue = payments
      .filter(p => p.status === 'completed')
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    const today = new Date();
    const monthlyRevenue = payments
      .filter(p =>
        p.status === 'completed' &&
        new Date(p.created_at).getMonth() === today.getMonth() &&
        new Date(p.created_at).getFullYear() === today.getFullYear()
      )
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    return {
      totalUsers: users.users.length,
      totalMembers: users.users.filter(u => u.role === 'member').length,
      activeSubscriptions: activeSubscriptions.length,
      totalRevenue,
      monthlyRevenue,
      totalLeads: leads.length,
      convertedLeads: leads.filter(l => l.status === 'converted').length
    };
  } catch (error) {
    console.error('Error getting analytics:', error);
    throw error;
  }
}

export async function getAnalyticsOverview(days: number): Promise<any> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const allEnrollments = await getAllEnrollments(); // Fetch all users with role 'user'
  const totalMembers = allEnrollments.length;

  if (totalMembers === 0) {
    return {
      totalMembers: 0,
      activeSubscriptions: 0,
      monthlyRevenue: 0,
      averageRevenue: 0,
      churnRate: 0,
      growthRate: 0,
      newEnrollmentsThisMonth: 0,
      cancellationsThisMonth: 0
    };
  }

  const newEnrollments = allEnrollments.filter(enrollment => {
    const enrollmentDate = new Date(enrollment.created_at);
    return enrollmentDate >= startDate && enrollmentDate <= endDate;
  }).length;

  const activeSubscriptions = allEnrollments.filter(enrollment =>
    enrollment.subscriptionStatus === 'active' // Assuming subscriptionStatus is available in User object or needs join
  ).length;

  const monthlyRevenue = allEnrollments
    .filter(enrollment => enrollment.subscriptionStatus === 'active') // Assuming subscriptionStatus
    .reduce((total, enrollment) => total + (parseFloat(enrollment.subscriptionAmount) || 0), 0); // Assuming subscriptionAmount

  const averageRevenue = totalMembers > 0 ? monthlyRevenue / totalMembers : 0;

  // Placeholder for churnRate, growthRate, cancellationsThisMonth
  const churnRate = 2.5;
  const growthRate = 15.2;
  const cancellationsThisMonth = 0;

  return {
    totalMembers,
    activeSubscriptions,
    monthlyRevenue,
    averageRevenue,
    churnRate,
    growthRate,
    newEnrollmentsThisMonth: newEnrollments,
    cancellationsThisMonth
  };
}

export async function getActiveSubscriptionsCount() {
  const { count, error } = await supabase
    .from('subscriptions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active');

  if (error) {
    console.error('Error fetching active subscriptions count:', error);
    throw new Error(`Failed to get active subscriptions count: ${error.message}`);
  }
  return count || 0;
}

export async function getPlanBreakdown(): Promise<any[]> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('planId, plans:planId(name), amount')
    .eq('status', 'active')
    .rpc('get_plan_breakdown'); // Assuming a Supabase RPC function for this

  if (error) {
    console.error('Error fetching plan breakdown:', error);
    throw new Error(`Failed to get plan breakdown: ${error.message}`);
  }

  const breakdown = data || [];
  const total = breakdown.reduce((sum, item) => sum + (item.amount || 0), 0);

  return breakdown.map(item => ({
    planId: item.planId,
    planName: item.plans.name,
    memberCount: item.memberCount || 0, // Assuming memberCount is returned by RPC
    monthlyRevenue: item.amount || 0,
    percentage: total > 0 ? ((item.amount || 0) / total) * 100 : 0
  }));
}

export async function getRecentEnrollments(limit: number): Promise<any[]> {
  const { data, error } = await supabase
    .from('users')
    .select('id, firstName, lastName, email, subscriptions:subscriptionId(planId, amount, created_at, status), plans:planId(name)')
    .eq('role', 'user')
    .order('created_at', { ascending: false }) // Ordering by user creation date
    .limit(limit);

  if (error) {
    console.error('Error fetching recent enrollments:', error);
    throw new Error(`Failed to get recent enrollments: ${error.message}`);
  }

  // Map to desired output format, handling potential nulls from joins
  return (data || []).map((user: any) => ({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    planName: user.plans?.name,
    amount: user.subscriptions?.amount,
    enrolledDate: user.subscriptions?.created_at || user.created_at, // Use subscription or user creation date
    status: user.subscriptions?.status
  }));
}

export async function getMonthlyTrends(): Promise<any[]> {
  // This requires a more complex Supabase query or an RPC function to aggregate data by month.
  // A direct translation of the Drizzle query is complex due to date manipulation in SQL.
  // Placeholder implementation:
  const trends = [];
  const now = new Date();

  for (let i = 5; i >= 0; i--) {
    const monthDate = new Date(now);
    monthDate.setMonth(monthDate.getMonth() - i);
    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

    // Fetch active subscriptions created in the month
    const enrollmentsResult = await supabase.from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .gte('created_at', monthStart.toISOString())
      .lte('created_at', monthEnd.toISOString());

    // Fetch cancelled subscriptions updated in the month
    const cancellationsResult = await supabase.from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'cancelled')
      .gte('updated_at', monthStart.toISOString())
      .lte('updated_at', monthEnd.toISOString());

    // Fetch revenue for active subscriptions in the month
    const revenueResult = await supabase.from('subscriptions')
      .select('amount')
      .eq('status', 'active')
      .gte('created_at', monthStart.toISOString())
      .lte('created_at', monthEnd.toISOString());

    const revenue = revenueResult.data?.reduce((sum, sub) => sum + (sub.amount || 0), 0) || 0;

    trends.push({
      month: monthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      enrollments: enrollmentsResult.count || 0,
      cancellations: cancellationsResult.count || 0,
      netGrowth: (enrollmentsResult.count || 0) - (cancellationsResult.count || 0),
      revenue: revenue
    });
  }

  return trends;
}

// User approval operations
export async function getPendingUsers(): Promise<User[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('approvalStatus', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching pending users:', error);
    throw new Error(`Failed to get pending users: ${error.message}`);
  }

  // Add suspicious flags based on simple checks
  return (data || []).map(user => {
    const suspiciousFlags: string[] = [];

    // Check for temporary email patterns
    const tempEmailPatterns = ['tempmail', 'throwaway', 'guerrilla', '10minute', 'mailinator'];
    if (user.email && tempEmailPatterns.some(pattern => user.email!.toLowerCase().includes(pattern))) {
      suspiciousFlags.push('Temporary email detected');
    }

    // Check if no user agent or suspicious user agent
    if (!user.registrationUserAgent || user.registrationUserAgent === 'email') {
      suspiciousFlags.push('No browser info');
    }

    // Check if email is not verified
    if (!user.emailVerified) {
      suspiciousFlags.push('Email not verified');
    }

    return {
      ...user,
      suspiciousFlags: suspiciousFlags
    };
  });
}

export async function approveUser(userId: string, approvedBy: string): Promise<User> {
  const { data, error } = await supabase
    .from('users')
    .update({
      approvalStatus: 'approved',
      approvedAt: new Date(),
      approvedBy: approvedBy,
      updated_at: new Date()
    })
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    console.error('Error approving user:', error);
    throw new Error(`Failed to approve user: ${error.message}`);
  }
  return data;
}

export async function rejectUser(userId: string, reason: string): Promise<User> {
  const { data, error } = await supabase
    .from('users')
    .update({
      approvalStatus: 'rejected',
      rejectionReason: reason,
      updated_at: new Date()
    })
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    console.error('Error rejecting user:', error);
    throw new Error(`Failed to reject user: ${error.message}`);
  }
  return data;
}

// Commission operations
export async function createCommission(commission: InsertCommission): Promise<Commission> {
  // Check if the agent is an admin. If so, skip commission creation.
  const agent = await getUser(commission.agentId);
  if (agent && agent.role === 'admin') {
    console.log(`Skipping commission for admin agent: ${commission.agentId}`);
    return { skipped: true, reason: 'admin_no_commission' } as any; // Return a specific object indicating skip
  }

  // Check if the enrolling user is an admin. If so, skip commission creation.
  // Assuming enrolling user is available in commission object or can be fetched
  // For now, let's assume enrolling user ID is passed or fetched via subscription
  // If subscriptionId is available, we can fetch the user who owns the subscription
  if (commission.subscriptionId) {
    const subscription = await supabase.from('subscriptions').select('userId').eq('id', commission.subscriptionId).single();
    if (subscription.data && subscription.data.userId) {
      const enrollingUser = await getUser(subscription.data.userId);
      if (enrollingUser && enrollingUser.role === 'admin') {
        console.log(`Skipping commission for enrolling admin user: ${subscription.data.userId}`);
        return { skipped: true, reason: 'admin_no_commission' } as any;
      }
    }
  }


  const { data, error } = await supabase
    .from('commissions')
    .insert([{ ...commission, created_at: new Date(), updated_at: new Date() }])
    .select()
    .single();

  if (error) {
    console.error('Error creating commission:', error);
    throw new Error(`Failed to create commission: ${error.message}`);
  }
  return data;
}

export async function getAgentCommissions(agentId: string, startDate?: string, endDate?: string): Promise<Commission[]> {
  let query = supabase.from('commissions').select('*').eq('agentId', agentId);

  if (startDate && endDate) {
    query = query.gte('created_at', startDate).lte('created_at', endDate);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching agent commissions:', error);
    throw new Error(`Failed to get agent commissions: ${error.message}`);
  }

  return data || [];
}

export async function getAllCommissions(startDate?: string, endDate?: string): Promise<Commission[]> {
  let query = supabase.from('commissions').select('*');

  if (startDate && endDate) {
    query = query.gte('created_at', startDate).lte('created_at', endDate);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching all commissions:', error);
    throw new Error(`Failed to get all commissions: ${error.message}`);
  }

  return data || [];
}

export async function getCommissionBySubscriptionId(subscriptionId: number): Promise<Commission | undefined> {
  const { data, error } = await supabase
    .from('commissions')
    .select('*')
    .eq('subscriptionId', subscriptionId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return undefined;
    console.error('Error fetching commission by subscription ID:', error);
    return undefined;
  }
  return data;
}

export async function getCommissionByUserId(userId: string, agentId: string): Promise<Commission | undefined> {
  const { data, error } = await supabase
    .from('commissions')
    .select('*')
    .eq('userId', userId)
    .eq('agentId', agentId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching commission by user and agent ID:', error);
    return undefined;
  }
  return data;
}

export async function updateCommission(id: number, data: Partial<Commission>): Promise<Commission> {
  const { data: updatedCommission, error } = await supabase
    .from('commissions')
    .update({ ...data, updated_at: new Date() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating commission:', error);
    throw new Error(`Failed to update commission: ${error.message}`);
  }
  return updatedCommission;
}

export async function getCommissionStats(agentId?: string): Promise<{ totalEarned: number; totalPending: number; totalPaid: number }> {
  // This requires custom aggregation or fetching all and processing.
  // Assuming a simplified approach by fetching relevant commissions.
  let query = supabase.from('commissions').select('commissionAmount, paymentStatus');

  if (agentId) {
    query = query.eq('agentId', agentId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching commission stats:', error);
    throw new Error(`Failed to get commission stats: ${error.message}`);
  }

  let totalEarned = 0;
  let totalPending = 0;
  let totalPaid = 0;

  (data || []).forEach(commission => {
    const amount = parseFloat(commission.commissionAmount?.toString() || '0');
    if (commission.paymentStatus === 'paid') {
      totalPaid += amount;
      totalEarned += amount;
    } else if (commission.paymentStatus === 'unpaid') {
      totalPending += amount;
    }
  });

  return { totalEarned, totalPending, totalPaid };
}

// Helper function to map database snake_case to camelCase for plans
function mapPlanFromDB(data: any): Plan | null {
  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    description: data.description,
    price: data.price,
    billingPeriod: data.billing_period || data.billingPeriod || 'monthly',
    features: data.features,
    maxMembers: data.max_members || data.maxMembers || 1,
    isActive: data.is_active !== undefined ? data.is_active : true,
    stripePriceId: data.stripe_price_id || data.stripePriceId,
    createdAt: data.created_at || data.createdAt,
    updatedAt: data.updated_at || data.updatedAt
  } as Plan;
}

// Plan operations (add missing ones from original Drizzle implementation)
export async function getPlans(): Promise<Plan[]> {
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .order('price', { ascending: true });

  if (error) {
    console.error('Error fetching plans:', error);
    throw new Error(`Failed to get plans: ${error.message}`);
  }

  return (data || []).map(mapPlanFromDB).filter(Boolean) as Plan[];
}

export async function getActivePlans(): Promise<Plan[]> {
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .eq('is_active', true)
    .order('price', { ascending: true });

  if (error) {
    console.error('Error fetching active plans:', error);
    throw new Error(`Failed to get active plans: ${error.message}`);
  }

  return (data || []).map(mapPlanFromDB).filter(Boolean) as Plan[];
}

export async function getPlanById(id: string): Promise<Plan | undefined> {
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching plan:', error);
    return null;
  }
  return mapPlanFromDB(data) || undefined;
}

export async function createPlan(plan: InsertPlan): Promise<Plan> {
  const { data, error } = await supabase
    .from('plans')
    .insert([{ ...plan, created_at: new Date(), updated_at: new Date() }])
    .select()
    .single();

  if (error) {
    console.error('Error creating plan:', error);
    throw new Error(`Failed to create plan: ${error.message}`);
  }
  return mapPlanFromDB(data)!;
}

export async function updatePlan(id: number, data: Partial<Plan>): Promise<Plan> {
  const { data: updatedPlan, error } = await supabase
    .from('plans')
    .update({ ...data, updated_at: new Date() })
    .eq('id', id.toString()) // Assuming ID is string/UUID in Supabase
    .select()
    .single();

  if (error) {
    console.error('Error updating plan:', error);
    throw new Error(`Failed to update plan: ${error.message}`);
  }
  return updatedPlan;
}

// Subscription operations (add missing ones)
export async function getActiveSubscriptions(): Promise<Subscription[]> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching active subscriptions:', error);
    throw new Error(`Failed to get active subscriptions: ${error.message}`);
  }

  return data || [];
}

// Payment operations (add missing ones)
export async function getPaymentByStripeId(stripePaymentIntentId: string): Promise<Payment | undefined> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('stripe_payment_intent_id', stripePaymentIntentId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return undefined;
    console.error('Error fetching payment by Stripe ID:', error);
    return undefined;
  }
  return data;
}

// Family member operations (add missing ones)
export async function addFamilyMember(member: InsertFamilyMember): Promise<FamilyMember> {
  const { data, error } = await supabase
    .from('family_members')
    .insert([{ ...member, created_at: new Date(), updated_at: new Date() }])
    .select()
    .single();

  if (error) {
    console.error('Error adding family member:', error);
    throw new Error(`Failed to add family member: ${error.message}`);
  }
  return data;
}

// Clear test data function (as provided in the snippet)
export async function clearTestData(): Promise<void> {
  try {
    console.log('🧹 Starting production data cleanup...');

    const preserveEmails = [
      'michael@mypremierplans.com',
      'travis@mypremierplans.com',
      'richard@mypremierplans.com',
      'joaquin@mypremierplans.com',
      'mdkeener@gmail.com'
    ];

    console.log('Deleting family members...');
    await supabase.from('family_members').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    console.log('Deleting commissions...');
    await supabase.from('commissions').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    console.log('Deleting payments...');
    await supabase.from('payments').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    console.log('Deleting subscriptions...');
    await supabase.from('subscriptions').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    console.log('Deleting test users (preserving admin/agent accounts)...');
    await supabase.from('users').delete().not('email', 'in', `(${preserveEmails.map(e => `"${e}"`).join(',')})`);

    console.log('✅ Production cleanup completed successfully');
  } catch (error: any) {
    console.error('❌ Error during production cleanup:', error);
    throw new Error(`Failed during production cleanup: ${error.message}`);
  }
}

// Payment operations implementation
export async function createPayment(payment: InsertPayment): Promise<Payment> {
  const { data, error } = await supabase
    .from('payments')
    .insert([{
      ...payment,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) {
    console.error('Error creating payment:', error);
    throw new Error(`Failed to create payment: ${error.message}`);
  }

  return data;
}

export async function getUserPayments(userId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching user payments:', error);
    throw new Error(`Failed to get user payments: ${error.message}`);
  }

  return data || [];
}

export async function getPaymentByTransactionId(transactionId: string): Promise<Payment | undefined> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('transaction_id', transactionId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return undefined;
    console.error('Error fetching payment by transaction ID:', error);
    return undefined;
  }

  return data;
}

export async function updatePayment(id: number, updates: Partial<Payment>): Promise<Payment> {
  const { data, error } = await supabase
    .from('payments')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating payment:', error);
    throw new Error(`Failed to update payment: ${error.message}`);
  }

  return data;
}

// Adding a placeholder for SupabaseStorage and its export
// Storage object with existing functions and necessary stubs
export const storage = {
  // Core user functions that exist
  getUser,
  createUser,
  updateUser,
  getUserByEmail,
  getUserByUsername,
  getUserByGoogleId,
  getUserByFacebookId,
  getUserByTwitterId,
  getUserByVerificationToken,
  getUserByResetToken,
  getUserByAgentNumber,
  upsertUser,
  updateUserProfile,
  updateUserStripeInfo,
  getAllUsers,
  getUsersCount,
  getRevenueStats,
  getSubscriptionStats,
  getAgentEnrollments,
  getAllEnrollments,
  recordEnrollmentModification,

  // Stub functions for operations needed by routes (to prevent errors)
  cleanTestData: async () => {},
  getUserSubscription: async (userId: string) => {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('userId', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.error('Error fetching user subscription:', error);
      return null;
    }

    return data;
  },
  getUserSubscriptions: async (userId: string) => {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('userId', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching user subscriptions:', error);
      return [];
    }

    return data || [];
  },
  createSubscription: async (sub: any) => sub,
  updateSubscription: async (id: number, data: any) => {
    const { data: updatedSub, error } = await supabase
      .from('subscriptions')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating subscription:', error);
      throw new Error(`Failed to update subscription: ${error.message}`);
    }

    return updatedSub;
  },
  getActiveSubscriptions: async () => [],

  createPayment,
  getUserPayments,
  getPaymentByStripeId,
  getPaymentByTransactionId,
  updatePayment,

  getFamilyMembers: async () => [],
  addFamilyMember: async (member: any) => member,

  createLead: async (lead: any) => lead,
  updateLead: async (id: string, data: any) => ({ id, ...data }),
  getLeadById: async () => undefined,
  getAgentLeads: async () => [],
  getAllLeads: async () => [],
  getLeadByEmail: async () => undefined,
  addLeadActivity: async (activity: any) => activity,
  getLeadActivities: async () => [],
  getAgents: async () => {
    const users = await storage.getAllUsers();
    const agents = users.users?.filter((user: any) => user.role === 'agent') || [];
    return agents.map((agent: any) => ({
      id: agent.id,
      firstName: agent.firstName,
      lastName: agent.lastName,
      name: `${agent.firstName} ${agent.lastName}`,
      email: agent.email,
      agentNumber: agent.agentNumber
    }));
  },
  assignLead: async (leadId: number, agentId: string) => {
    // Mock implementation - in real app this would update the database
    return { success: true, leadId, agentId };
  },
  getUnassignedLeadsCount: async () => 0,

  createCommission: async (commission: any) => {
    // Check if the agent is an admin. If so, skip commission creation.
    const agent = await getUser(commission.agentId);
    if (agent && agent.role === 'admin') {
      console.log(`Skipping commission for admin agent: ${commission.agentId}`);
      return { skipped: true, reason: 'admin_no_commission' } as any; // Return a specific object indicating skip
    }

    // Check if the enrolling user is an admin. If so, skip commission creation.
    if (commission.subscriptionId) {
      const { data: subscription, error: subError } = await supabase.from('subscriptions').select('userId').eq('id', commission.subscriptionId).single();
      if (subError) {
        console.error('Error fetching subscription for enrolling user check:', subError);
      } else if (subscription && subscription.userId) {
        const enrollingUser = await getUser(subscription.userId);
        if (enrollingUser && enrollingUser.role === 'admin') {
          console.log(`Skipping commission for enrolling admin user: ${subscription.userId}`);
          return { skipped: true, reason: 'admin_no_commission' } as any;
        }
      }
    }
    // Call the actual createCommission function if checks pass
    return storage.createCommission(commission);
  },
  updateCommissionStatus: async () => {},
  getAgentCommissions: async () => [],
  getAllCommissions: async () => [],
  updateCommissionPaymentStatus: async () => {},
  getCommissionStats: async () => ({ totalUnpaid: 0, totalPaid: 0 }),

  getAdminDashboardStats: async () => {
    try {
      console.log('[Storage] Fetching admin dashboard stats...');
      const allUsers = await supabase.from('users').select('*');
      const allSubscriptions = await supabase.from('subscriptions').select('*');
      const allCommissions = await supabase.from('commissions').select('*');

      const totalUsers = allUsers.data?.length || 0;
      const totalMembers = allUsers.data?.filter(user => user.role === 'member' || user.role === 'user').length || 0;
      const totalAgents = allUsers.data?.filter(user => user.role === 'agent').length || 0;
      const totalAdmins = allUsers.data?.filter(user => user.role === 'admin').length || 0;

      const activeSubscriptions = allSubscriptions.data?.filter(sub => sub.status === 'active').length || 0;
      const pendingSubscriptions = allSubscriptions.data?.filter(sub => sub.status === 'pending').length || 0;
      const cancelledSubscriptions = allSubscriptions.data?.filter(sub => sub.status === 'cancelled').length || 0;

      const monthlyRevenue = allSubscriptions.data
        ?.filter(sub => sub.status === 'active')
        .reduce((total, sub) => total + (sub.amount || 0), 0) || 0;

      const totalCommissions = allCommissions.data?.reduce((total, comm) => total + (comm.commissionAmount || 0), 0) || 0;
      const paidCommissions = allCommissions.data
        ?.filter(comm => comm.paymentStatus === 'paid')
        .reduce((total, comm) => total + (comm.commissionAmount || 0), 0) || 0;
      const pendingCommissions = allCommissions.data
        ?.filter(comm => comm.paymentStatus === 'unpaid' || comm.paymentStatus === 'pending')
        .reduce((total, comm) => total + (comm.commissionAmount || 0), 0) || 0;

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const newEnrollments = allSubscriptions.data?.filter(sub =>
        sub.createdAt && new Date(sub.createdAt) >= thirtyDaysAgo
      ).length || 0;

      const stats = {
        totalUsers,
        totalMembers,
        totalAgents,
        totalAdmins,
        activeSubscriptions,
        pendingSubscriptions,
        cancelledSubscriptions,
        monthlyRevenue,
        totalCommissions,
        paidCommissions,
        pendingCommissions,
        newEnrollments,
        churnRate: totalUsers > 0 ? ((cancelledSubscriptions / totalUsers) * 100) : 0,
        averageRevenue: activeSubscriptions > 0 ? (monthlyRevenue / activeSubscriptions) : 0
      };

      console.log('[Storage] Admin stats:', stats);
      return stats;
    } catch (error: any) {
      console.error('[Storage] Error fetching admin dashboard stats:', error);
      console.error('[Storage] Error details:', error.message);
      // Return a default object in case of error
      return {
        totalUsers: 0,
        totalMembers: 0,
        totalAgents: 0,
        totalAdmins: 0,
        activeSubscriptions: 0,
        pendingSubscriptions: 0,
        cancelledSubscriptions: 0,
        monthlyRevenue: 0,
        totalCommissions: 0,
        paidCommissions: 0,
        pendingCommissions: 0,
        newEnrollments: 0,
        churnRate: 0,
        averageRevenue: 0
      };
    }
  },
  getAdminCounts: async () => ({}),
  getDashboardData: async () => ({}),

  getPlans,
  getActivePlans,
  getPlan: getPlanById,
  createPlan: async (plan: any) => plan,
  updatePlan: async (id: number, data: any) => ({ id, ...data }),

  getComprehensiveAnalytics: async (days: number = 30) => {
    try {
      console.log('[Storage] Fetching comprehensive analytics...');

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      // Get all data
      const { data: allUsersData, error: usersError } = await supabase.from('users').select('*');
      const { data: allSubscriptionsData, error: subscriptionsError } = await supabase.from('subscriptions').select('*');
      const { data: allCommissionsData, error: commissionsError } = await supabase.from('commissions').select('*');
      const { data: allPlansData, error: plansError } = await supabase.from('plans').select('*');

      if (usersError || subscriptionsError || commissionsError || plansError) {
        console.error('Error fetching data for comprehensive analytics:', usersError, subscriptionsError, commissionsError, plansError);
        throw new Error('Failed to fetch data for analytics');
      }

      const allUsers = allUsersData || [];
      const allSubscriptions = allSubscriptionsData || [];
      const allCommissions = allCommissionsData || [];
      const allPlans = allPlansData || [];

      // Overview metrics
      const totalMembers = allUsers.filter(user => user.role === 'member' || user.role === 'user').length;
      const activeSubscriptions = allSubscriptions.filter(sub => sub.status === 'active').length;
      const monthlyRevenue = allSubscriptions
        .filter(sub => sub.status === 'active')
        .reduce((total, sub) => total + (sub.amount || 0), 0);

      const newEnrollmentsThisMonth = allSubscriptions.filter(sub =>
        sub.createdAt && new Date(sub.createdAt) >= cutoffDate
      ).length;

      const cancellationsThisMonth = allSubscriptions.filter(sub =>
        sub.status === 'cancelled' && sub.updatedAt && new Date(sub.updatedAt) >= cutoffDate
      ).length;

      // Plan breakdown
      const planBreakdown = allPlans.map(plan => {
        const planSubscriptions = allSubscriptions.filter(sub => sub.planId === plan.id && sub.status === 'active');
        const planRevenue = planSubscriptions.reduce((total, sub) => total + (sub.amount || 0), 0);

        return {
          planId: plan.id,
          planName: plan.name,
          memberCount: planSubscriptions.length,
          monthlyRevenue: planRevenue,
          percentage: monthlyRevenue > 0 ? (planRevenue / monthlyRevenue) * 100 : 0
        };
      });

      // Recent enrollments
      const recentEnrollments = allSubscriptions
        .filter(sub => sub.createdAt && new Date(sub.createdAt) >= cutoffDate)
        .map(sub => {
          const user = allUsers.find(u => u.id === sub.userId);
          const plan = allPlans.find(p => p.id === sub.planId);
          return {
            id: sub.id.toString(),
            firstName: user?.firstName || '',
            lastName: user?.lastName || '',
            email: user?.email || '',
            planName: plan?.name || '',
            amount: sub.amount || 0,
            enrolledDate: sub.createdAt?.toISOString() || '',
            status: sub.status
          };
        })
        .sort((a, b) => new Date(b.enrolledDate).getTime() - new Date(a.enrolledDate).getTime())
        .slice(0, 20);

      // Agent performance
      const agentPerformance = allUsers
        .filter(user => user.role === 'agent')
        .map(agent => {
          const agentCommissions = allCommissions.filter(comm => comm.agentId === agent.id);
          const agentSubscriptions = allSubscriptions.filter(sub => {
            // Assuming we have an enrolledByAgentId field or similar
            return agentCommissions.some(comm => comm.subscriptionId === sub.id);
          });

          const monthlyEnrollments = agentSubscriptions.filter(sub =>
            sub.createdAt && new Date(sub.createdAt) >= cutoffDate
          ).length;

          const totalCommissions = agentCommissions.reduce((total, comm) => total + (comm.commissionAmount || 0), 0);
          const paidCommissions = agentCommissions
            .filter(comm => comm.paymentStatus === 'paid')
            .reduce((total, comm) => total + (comm.commissionAmount || 0), 0);
          const pendingCommissions = agentCommissions
            .filter(comm => comm.paymentStatus !== 'paid')
            .reduce((total, comm) => total + (comm.commissionAmount || 0), 0);

          return {
            agentId: agent.id,
            agentName: `${agent.firstName} ${agent.lastName}`,
            agentNumber: agent.agentNumber || '',
            totalEnrollments: agentSubscriptions.length,
            monthlyEnrollments,
            totalCommissions,
            paidCommissions,
            pendingCommissions,
            conversionRate: agentSubscriptions.length > 0 ? (agentSubscriptions.filter(sub => sub.status === 'active').length / agentSubscriptions.length) * 100 : 0,
            averageCommission: agentCommissions.length > 0 ? totalCommissions / agentCommissions.length : 0
          };
        });

      // Member reports
      const memberReports = allUsers
        .filter(user => user.role === 'member' || user.role === 'user')
        .map(member => {
          const memberSubscriptions = allSubscriptions.filter(sub => sub.userId === member.id);
          const activeSub = memberSubscriptions.find(sub => sub.status === 'active');
          const totalPaid = memberSubscriptions.reduce((total, sub) => total + (sub.amount || 0), 0);

          const memberCommission = activeSub ? allCommissions.find(comm => comm.subscriptionId === activeSub.id) : null;
          const agent = memberCommission ? allUsers.find(u => u.id === memberCommission.agentId) : null;
          const plan = activeSub ? allPlans.find(p => p.id === activeSub.planId) : null;

          return {
            id: member.id,
            firstName: member.firstName,
            lastName: member.lastName,
            email: member.email,
            phone: member.phone || '',
            planName: plan?.name || '',
            status: activeSub?.status || 'inactive',
            enrolledDate: member.createdAt?.toISOString() || '',
            lastPayment: activeSub?.updatedAt?.toISOString() || '',
            totalPaid,
            agentName: agent ? `${agent.firstName} ${agent.lastName}` : 'Direct'
          };
        });

      // Commission reports
      const commissionReports = allCommissions.map(commission => {
        const agent = allUsers.find(u => u.id === commission.agentId);
        const subscription = allSubscriptions.find(s => s.id === commission.subscriptionId);
        const member = subscription ? allUsers.find(u => u.id === subscription.userId) : null;

        return {
          id: commission.id.toString(),
          agentName: agent ? `${agent.firstName} ${agent.lastName}` : 'Unknown',
          agentNumber: agent?.agentNumber || '',
          memberName: member ? `${member.firstName} ${member.lastName}` : 'Unknown',
          planName: commission.planName || '',
          commissionAmount: commission.commissionAmount || 0,
          totalPlanCost: commission.totalPlanCost || 0,
          status: commission.status,
          paymentStatus: commission.paymentStatus,
          createdDate: commission.createdAt?.toISOString() || '',
          paidDate: commission.paidAt?.toISOString() || null
        };
      });

      // Revenue breakdown
      const totalRevenue = allSubscriptions.reduce((total, sub) => total + (sub.amount || 0), 0);
      const subscriptionRevenue = allSubscriptions
        .filter(sub => sub.status === 'active')
        .reduce((total, sub) => total + (sub.amount || 0), 0);

      const revenueBreakdown = {
        totalRevenue,
        subscriptionRevenue,
        oneTimeRevenue: 0, // Add when you have one-time payments
        refunds: 0, // Add when you track refunds
        netRevenue: totalRevenue,
        projectedAnnualRevenue: subscriptionRevenue * 12,
        averageRevenuePerUser: activeSubscriptions > 0 ? subscriptionRevenue / activeSubscriptions : 0,
        revenueByMonth: [
          {
            month: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
            revenue: subscriptionRevenue,
            subscriptions: subscriptionRevenue,
            oneTime: 0,
            refunds: 0
          }
        ]
      };

      // Monthly trends (simplified for now)
      const monthlyTrends = [
        {
          month: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
          enrollments: newEnrollmentsThisMonth,
          cancellations: cancellationsThisMonth,
          netGrowth: newEnrollmentsThisMonth - cancellationsThisMonth,
          revenue: subscriptionRevenue
        }
      ];

      const analytics = {
        overview: {
          totalMembers,
          activeSubscriptions,
          monthlyRevenue,
          averageRevenue: activeSubscriptions > 0 ? monthlyRevenue / activeSubscriptions : 0,
          churnRate: totalMembers > 0 ? (cancellationsThisMonth / totalMembers) * 100 : 0,
          growthRate: totalMembers > 0 ? (newEnrollmentsThisMonth / totalMembers) * 100 : 0,
          newEnrollmentsThisMonth,
          cancellationsThisMonth
        },
        planBreakdown,
        recentEnrollments,
        monthlyTrends,
        agentPerformance,
        memberReports,
        commissionReports,
        revenueBreakdown
      };

      console.log('[Storage] Comprehensive analytics generated');
      return analytics;
    } catch (error: any) {
      console.error('[Storage] Error fetching comprehensive analytics:', error);
      console.error('[Storage] Error details:', error.message);
      throw error;
    }
  }
} as any;