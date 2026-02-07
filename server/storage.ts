import { supabase } from './lib/supabaseClient'; // Use Supabase for everything
import { neonPool, query } from './lib/neonDb'; // Legacy Neon functions for dashboard queries still in use
import { normalizeRole } from './auth/roles';
import { generateUniqueMemberIdentifier } from './utils/member-id-generator';
import crypto from 'crypto';

// Encryption utilities for sensitive data
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const IV_LENGTH = 16; // For AES, this is always 16

export function encryptSensitiveData(data: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex'); // Ensure 32 bytes key
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decryptSensitiveData(encryptedData: string): string {
  const parts = encryptedData.split(':');
  const iv = Buffer.from(parts.shift()!, 'hex');
  const encrypted = parts.join(':');
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex'); // Ensure 32 bytes key
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
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

// Helper functions for member field formatting (matching database CHAR fields)
export function formatPhoneNumber(phone: string): string {
  // Remove all non-digits and return exactly 10 digits
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11 && cleaned[0] === '1') {
    return cleaned.slice(1); // Remove country code
  }
  return cleaned.slice(0, 10); // Ensure 10 digits max
}

export function formatDateMMDDYYYY(date: string): string {
  // Convert date to MMDDYYYY format (8 chars)
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const year = String(d.getFullYear());
  return month + day + year; // MMDDYYYY
}

export function formatSSN(ssn: string): string {
  // Remove all non-digits and return exactly 9 digits
  return ssn.replace(/\D/g, '').slice(0, 9);
}

export function formatZipCode(zip: string): string {
  // Return exactly 5 digits
  return zip.replace(/\D/g, '').slice(0, 5);
}

export interface PlatformSettingRecord<T = any> {
  key: string;
  value: T;
  updatedAt?: string;
  updatedBy?: string;
}

export interface AgentPerformanceGoalOverrideRecord {
  agentId: string;
  goals: PerformanceGoals;
  updatedAt?: string;
  updatedBy?: string | null;
}

export interface ResolvedPerformanceGoals {
  defaults: PerformanceGoals;
  override: PerformanceGoals | null;
  resolved: PerformanceGoals;
}

export async function getPlatformSetting<T = any>(key: string): Promise<PlatformSettingRecord<T> | null> {
  try {
    const { data, error } = await supabase
      .from('platform_settings')
      .select('key, value, updated_at, updated_by')
      .eq('key', key)
      .limit(1);

    if (error) {
      console.warn(`[Storage] Failed to read platform setting ${key}:`, error.message);
      return null;
    }

    const record = Array.isArray(data) ? data[0] : null;
    if (!record) {
      return null;
    }

    return {
      key: record.key ?? key,
      value: record.value as T,
      updatedAt: record.updated_at || record.updatedAt,
      updatedBy: record.updated_by || record.updatedBy,
    };
  } catch (error: any) {
    console.error(`[Storage] Unexpected error reading platform setting ${key}:`, error.message);
    return null;
  }
}

export async function upsertPlatformSetting<T = any>(key: string, value: T, updatedBy?: string): Promise<T> {
  try {
    const basePayload: Record<string, any> = { key, value };
    const attemptUpsert = async (payload: Record<string, any>) => {
      const { error } = await supabase
        .from('platform_settings')
        .upsert(payload, { onConflict: 'key' });
      if (error) {
        throw error;
      }
    };

    if (updatedBy) {
      basePayload.updated_by = updatedBy;
    }

    try {
      await attemptUpsert(basePayload);
    } catch (error: any) {
      const fkViolation = typeof error?.message === 'string'
        && error.message.includes('platform_settings_updated_by_fkey');
      if (fkViolation && basePayload.updated_by) {
        console.warn(
          `[Storage] platform_settings updated_by reference failed for key ${key}. Falling back without updated_by (user ${basePayload.updated_by}).`,
        );
        const fallbackPayload = { ...basePayload };
        delete fallbackPayload.updated_by;
        await attemptUpsert(fallbackPayload);
      } else {
        throw error;
      }
    }

    return value;
  } catch (error: any) {
    console.error(`[Storage] Failed to upsert platform setting ${key}:`, error.message);
    throw new Error(`Failed to update platform setting ${key}`);
  }
}

const ensurePerformanceGoals = (input?: Partial<PerformanceGoals> | null): PerformanceGoals =>
  input ? normalizePerformanceGoals(input) : defaultPerformanceGoals;

const mapGoalRow = (row: any): AgentPerformanceGoalOverrideRecord => ({
  agentId: row.agent_id,
  goals: ensurePerformanceGoals(row.goals),
  updatedAt: row.updated_at || row.updatedAt,
  updatedBy: row.updated_by || row.updatedBy,
});

type FamilyMemberRow = {
  id: number;
  first_name: string;
  last_name: string;
  middle_name?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  ssn?: string | null;
  email?: string | null;
  phone?: string | null;
  relationship?: string | null;
  member_type: string;
  is_active?: boolean | null;
  created_at?: string | null;
};

const mapFamilyMemberRowToRecord = (row: FamilyMemberRow) => ({
  id: row.id?.toString(),
  firstName: row.first_name,
  lastName: row.last_name,
  middleName: row.middle_name || undefined,
  dateOfBirth: row.date_of_birth || undefined,
  gender: row.gender || undefined,
  ssn: row.ssn || undefined,
  email: row.email || undefined,
  phone: row.phone || undefined,
  relationship: row.relationship || undefined,
  memberType: row.member_type,
  isActive: Boolean(row.is_active ?? true),
});

type EnrollmentRow = Record<string, any> & {
  plan_name?: string | null;
};

const mapEnrollmentRowToDetails = (row: EnrollmentRow, familyRows: FamilyMemberRow[]) => ({
  id: row.id?.toString(),
  userId: row.enrolled_by_agent_id || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  customerNumber: row.customer_number,
  memberPublicId: row.member_public_id,
  firstName: row.first_name,
  lastName: row.last_name,
  middleName: row.middle_name,
  email: row.email,
  phone: row.phone,
  dateOfBirth: row.date_of_birth,
  gender: row.gender,
  ssn: row.ssn,
  address: row.address,
  address2: row.address2,
  city: row.city,
  state: row.state,
  zipCode: row.zip_code,
  employerName: row.employer_name,
  divisionName: row.division_name,
  dateOfHire: row.date_of_hire,
  planId: row.plan_id,
  planName: row.plan_name || null,
  memberType: row.coverage_type || row.member_type,
  planStartDate: row.plan_start_date,
  totalMonthlyPrice: row.total_monthly_price,
  status: row.status,
  emergencyContactName: row.emergency_contact_name,
  emergencyContactPhone: row.emergency_contact_phone,
  enrolledBy: row.agent_number || null,
  enrolledByAgentId: row.enrolled_by_agent_id,
  subscriptionId: row.subscription_id || null,
  familyMembers: (familyRows || []).map(mapFamilyMemberRowToRecord),
});

export async function getEnrollmentDetails(enrollmentId: number) {
  if (!Number.isFinite(enrollmentId)) {
    return null;
  }

  const memberResult = await query(
    `SELECT m.*, p.name AS plan_name
     FROM members m
     LEFT JOIN plans p ON p.id = m.plan_id
     WHERE m.id = $1
     LIMIT 1`,
    [enrollmentId],
  );

  if (!memberResult.rows?.length) {
    return null;
  }

  const familyResult = await query(
    `SELECT * FROM family_members WHERE primary_member_id = $1 ORDER BY created_at ASC`,
    [enrollmentId],
  );

  return mapEnrollmentRowToDetails(memberResult.rows[0], familyResult.rows || []);
}

export async function getPerformanceGoalDefaults(): Promise<PerformanceGoals> {
  const record = await getPlatformSetting<PerformanceGoals>(PERFORMANCE_GOALS_SETTING_KEY);
  return ensurePerformanceGoals(record?.value);
}

export async function updatePerformanceGoalDefaults(
  goals: PerformanceGoals,
  updatedBy?: string,
): Promise<PerformanceGoals> {
  const normalized = ensurePerformanceGoals(goals);
  await upsertPlatformSetting(PERFORMANCE_GOALS_SETTING_KEY, normalized, updatedBy);
  return normalized;
}

export async function getAgentPerformanceGoalOverride(agentId: string): Promise<PerformanceGoals | null> {
  if (!agentId) return null;

  const { data, error } = await supabase
    .from('agent_performance_goals')
    .select('goals')
    .eq('agent_id', agentId)
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    if (handleAgentPerformanceGoalsError(error, `read agent performance goals for ${agentId}`)) {
      return null;
    }
    console.error(`[Storage] Failed to read agent performance goals for ${agentId}:`, error.message);
    throw new Error('Failed to read agent performance goals');
  }

  return data?.goals ? ensurePerformanceGoals(data.goals) : null;
}

export async function upsertAgentPerformanceGoalOverride(
  agentId: string,
  goals: PerformanceGoals,
  updatedBy?: string,
): Promise<PerformanceGoals> {
  if (!agentId) {
    throw new Error('Agent ID is required for goal overrides');
  }

  const normalized = ensurePerformanceGoals(goals);

  const payload: Record<string, any> = {
    agent_id: agentId,
    goals: normalized,
    updated_at: new Date().toISOString(),
  };

  if (updatedBy) {
    payload.updated_by = updatedBy;
  }

  const { error } = await supabase
    .from('agent_performance_goals')
    .upsert(payload, { onConflict: 'agent_id' });

  if (error) {
    if (handleAgentPerformanceGoalsError(error, `save agent performance goals for ${agentId}`)) {
      throw new Error('Agent performance goals table is missing. Run the latest migrations to enable overrides.');
    }
    console.error(`[Storage] Failed to upsert agent performance goals for ${agentId}:`, error.message);
    throw new Error('Failed to save agent performance goals');
  }

  return normalized;
}

export async function deleteAgentPerformanceGoalOverride(agentId: string): Promise<void> {
  if (!agentId) return;
  const { error } = await supabase
    .from('agent_performance_goals')
    .delete()
    .eq('agent_id', agentId);

  if (error) {
    if (handleAgentPerformanceGoalsError(error, `delete agent performance goals for ${agentId}`)) {
      return;
    }
    console.error(`[Storage] Failed to delete agent performance goals for ${agentId}:`, error.message);
    throw new Error('Failed to delete agent performance goals');
  }
}

export async function listAgentPerformanceGoalOverrides(): Promise<AgentPerformanceGoalOverrideRecord[]> {
  const { data, error } = await supabase
    .from('agent_performance_goals')
    .select('agent_id, goals, updated_at, updated_by')
    .order('updated_at', { ascending: false });

  if (error) {
    if (handleAgentPerformanceGoalsError(error, 'list agent performance goals')) {
      return [];
    }
    console.error('[Storage] Failed to list agent performance goals:', error.message);
    throw new Error('Failed to list agent performance goals');
  }

  return (data || []).map(mapGoalRow);
}

export async function resolvePerformanceGoalsForAgent(agentId?: string | null): Promise<ResolvedPerformanceGoals> {
  const defaults = await getPerformanceGoalDefaults();
  if (!agentId) {
    return {
      defaults,
      override: null,
      resolved: defaults,
    };
  }

  const override = await getAgentPerformanceGoalOverride(agentId);
  return {
    defaults,
    override,
    resolved: override ? mergePerformanceGoals(defaults, override) : defaults,
  };
}

function normalizeStartDate(startDate?: string): string | undefined {
  if (!startDate) return undefined;
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

function normalizeEndDate(endDate?: string): string | undefined {
  if (!endDate) return undefined;
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  return end.toISOString();
}

const isLoginSessionTableMissing = (error: any) => {
  if (!error) return false;
  const message = [error.message, error.details, error.hint, error.code]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return message.includes('login_sessions') && message.includes('does not exist');
};

const warnMissingLoginSessionTable = (operation: string) => {
  console.warn(
    `[Storage] login_sessions table not found; skipping ${operation}. Add the table in Supabase to enable this tracking.`
  );
};

const handleLoginSessionError = (error: any, operation: string) => {
  if (isLoginSessionTableMissing(error)) {
    warnMissingLoginSessionTable(operation);
    return true;
  }
  return false;
};

const isAgentPerformanceGoalsTableMissing = (error: any) => {
  if (!error) return false;
  const fingerprint = [error.code, error.message, error.details, error.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return fingerprint.includes('agent_performance_goals') &&
    (fingerprint.includes('does not exist') || fingerprint.includes('relation'));
};

const warnMissingAgentPerformanceGoalsTable = (operation: string) => {
  console.warn(
    `[Storage] agent_performance_goals table not found; skipping ${operation}. Run migrations/20250120_add_agent_performance_goals_table.sql to enable performance goal overrides.`
  );
};

const handleAgentPerformanceGoalsError = (error: any, operation: string) => {
  if (isAgentPerformanceGoalsTableMissing(error)) {
    warnMissingAgentPerformanceGoalsTable(operation);
    return true;
  }
  return false;
};
import type {
  User,
  Member,
  Group,
  InsertGroup,
  GroupMember,
  InsertGroupMember,
  Plan,
  Subscription,
  Lead,
  Payment,
  Commission,
  FamilyMember,
  LeadActivity,
  UpsertUser,
  InsertPlan,
  InsertSubscription,
  InsertPayment,
  InsertFamilyMember,
  InsertLead,
  InsertLeadActivity,
  InsertCommission,
} from "@shared/schema";
import {
  defaultPerformanceGoals,
  mergePerformanceGoals,
  normalizePerformanceGoals,
  PERFORMANCE_GOALS_SETTING_KEY,
} from "@shared/performanceGoals";
import type { PerformanceGoals } from "@shared/performanceGoals";

type UserLookupOptions = {
  fallbackEmail?: string | null;
};

export interface IStorage {
  // User operations (Supabase-authenticated agents/admins)
  getUser(id: string, options?: UserLookupOptions): Promise<User | null>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserProfile(id: string, data: Partial<User>, options?: UserLookupOptions): Promise<User>;
  // Authentication operations
  createUser(user: Partial<User>): Promise<User>;
  updateUser(id: string, data: Partial<User>, options?: UserLookupOptions): Promise<User>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByAgentNumber(agentNumber: string): Promise<User | undefined>;

  // Plan operations
  getPlans(): Promise<Plan[]>;
  getActivePlans(): Promise<Plan[]>;
  getPlan(id: number): Promise<Plan | undefined>;
  createPlan(plan: InsertPlan): Promise<Plan>;
  updatePlan(id: number, data: Partial<Plan>): Promise<Plan>;

  // Subscription operations
  getUserSubscription(user_Id: string): Promise<Subscription | undefined>;
  createSubscription(subscription: InsertSubscription): Promise<Subscription>;
  updateSubscription(id: number, data: Partial<Subscription>): Promise<Subscription>;
  getActiveSubscriptions(): Promise<Subscription[]>;

  // Payment operations
  createPayment(payment: InsertPayment): Promise<Payment>;
  getUserPayments(user_Id: string): Promise<Payment[]>;
  getPaymentByTransactionId(transactionId: string): Promise<Payment | undefined>;

  // Member operations (healthcare customers - NO authentication)
  createMember(member: Partial<Member>): Promise<Member>;
  getMember(id: number): Promise<Member | undefined>;
  getMemberByEmail(email: string): Promise<Member | undefined>;
  getMemberByCustomerNumber(customerNumber: string): Promise<Member | undefined>;
  getAllMembers(limit?: number, offset?: number): Promise<{ members: Member[]; totalCount: number }>;
  updateMember(id: number, data: Partial<Member>): Promise<Member>;
  getMembersByAgent(agentId: string): Promise<Member[]>;

  // Family member operations
  getFamilyMembers(primary_user_id: string): Promise<FamilyMember[]>;
  addFamilyMember(member: InsertFamilyMember): Promise<FamilyMember>;

  // Admin operations
  getAllUsers(limit?: number, offset?: number): Promise<{ users: User[]; totalCount: number }>;
  getUsersCount(): Promise<number>;
  getRevenueStats(): Promise<{ totalRevenue: number; monthlyRevenue: number }>;
  getSubscriptionStats(): Promise<{ active: number; pending: number; cancelled: number }>;

  // Agent operations
  getAgentEnrollments(agentId: string, startDate?: string, endDate?: string, agentNumber?: string | null): Promise<User[]>;
  getAllEnrollments(startDate?: string, endDate?: string, agentId?: string): Promise<User[]>;

  // Enrollment modification operations
  recordEnrollmentModification(data: any): Promise<void>;

  // Banking information audit operations
  recordBankingInfoChange(data: {
    userId: string;
    modifiedBy: string;
    oldBankingInfo: any;
    newBankingInfo: any;
    changeType: string;
  }): Promise<void>;
  getBankingChangeHistory(userId: string): Promise<any[]>;

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

  // Commission operations (NEW: Using new agent_commissions table)
  createCommission(commission: InsertCommission): Promise<Commission>;
  getAgentCommissions(agent_Id: string, start_Date?: string, endDate?: string): Promise<Commission[]>;
  getAllCommissions(start_Date?: string, endDate?: string): Promise<Commission[]>;
  getCommissionBySubscriptionId(subscription_Id: number): Promise<Commission | undefined>;
  getCommissionByMemberId(memberId: number): Promise<Commission | null>;
  updateCommission(id: number, data: Partial<Commission>): Promise<Commission>;
  getCommissionStats(agent_Id?: string): Promise<{ totalEarned: number; totalPending: number; totalPaid: number }>;
  
  // NEW: Agent Commissions table functions (using new clean schema)
  getAgentCommissionsNew(agent_Id: string, start_Date?: string, endDate?: string): Promise<any[]>;
  getAllCommissionsNew(start_Date?: string, endDate?: string): Promise<any[]>;
  getCommissionTotals(agentId?: string): Promise<any>;

  // Analytics
  getAnalytics(): Promise<any>;
  getAnalyticsOverview(days: number): Promise<any>;
  getAdminDashboardStats(): Promise<any>;
  getComprehensiveAnalytics(days?: number): Promise<any>;

  // Performance goals
  getPerformanceGoalDefaults(): Promise<PerformanceGoals>;
  updatePerformanceGoalDefaults(goals: PerformanceGoals, updatedBy?: string): Promise<PerformanceGoals>;
  getAgentPerformanceGoalOverride(agentId: string): Promise<PerformanceGoals | null>;
  upsertAgentPerformanceGoalOverride(agentId: string, goals: PerformanceGoals, updatedBy?: string): Promise<PerformanceGoals>;
  deleteAgentPerformanceGoalOverride(agentId: string): Promise<void>;
  listAgentPerformanceGoalOverrides(): Promise<AgentPerformanceGoalOverrideRecord[]>;
  resolvePerformanceGoalsForAgent(agentId?: string | null): Promise<ResolvedPerformanceGoals>;

  // Login session tracking
  createLoginSession(sessionData: {
    userId: string;
    ipAddress?: string;
    userAgent?: string;
    deviceType?: string;
    browser?: string;
    location?: string;
  }): Promise<any>;
  updateLoginSession(sessionId: string, updates: {
    logoutTime?: Date;
    sessionDurationMinutes?: number;
    isActive?: boolean;
  }): Promise<any>;
  getUserLoginSessions(userId: string, limit?: number): Promise<any[]>;
  getAllLoginSessions(limit?: number): Promise<any[]>;
}

// --- Supabase Implementation ---

// User operations
export async function createUser(userData: Partial<User>): Promise<User> {
  try {
    // Use Supabase to insert user
    // NOTE: The users table in Supabase uses email as primary key, not id
    let agentNumber = userData.agentNumber;
    // Users table should ONLY have 'admin' or 'agent' roles - default to 'agent'
    // Never set 'member' here - members are in separate members table
    const normalizedRole = normalizeRole(userData.role);
    if (!normalizedRole && userData.role) {
      console.warn(`[Storage] Unexpected role "${userData.role}" provided during createUser - defaulting to agent`);
    }
    const role = normalizedRole || 'agent';
    
    // Generate agent number if SSN is available
    if ((role === 'agent' || role === 'admin' || role === 'super_admin') && userData.ssn && !agentNumber) {
      const { generateAgentNumber } = await import('./utils/agent-number-generator.js');
      const ssnLast4 = userData.ssn.slice(-4);
      try {
        agentNumber = generateAgentNumber(role, ssnLast4);
        console.log(`[Agent Number] Generated: ${agentNumber} for ${role} ${userData.email}`);
      } catch (error: any) {
        console.warn(`[Agent Number] Generation failed: ${error.message}`);
      }
    }
    
    // If no agent number yet, generate a temporary one based on email/timestamp
    // This happens during auto-creation from login before user profile is complete
    if (!agentNumber) {
      const timestamp = Date.now().toString().slice(-6);
      const emailHash = userData.email?.slice(0, 2).toUpperCase() || 'XX';
      agentNumber = `MPP${emailHash}${timestamp}`;
      console.log(`[Agent Number] Generated temporary: ${agentNumber} for ${userData.email}`);
    }
    
    // Build insert object with only columns that exist in Supabase
    const insertData: any = {
      email: userData.email,
      first_name: userData.firstName || '',
      last_name: userData.lastName || '',
      phone: userData.phone || null,
      role,
      agent_number: agentNumber,
      is_active: userData.isActive !== undefined ? userData.isActive : true,
      approval_status: userData.approvalStatus || 'approved',
      email_verified: userData.emailVerified !== undefined ? userData.emailVerified : false,
      // Note: created_by column does not exist in Supabase users table schema
      created_at: userData.createdAt || new Date(),
      updated_at: userData.updatedAt || new Date()
    };
    
    // Include ID if provided (for admin-created users with Supabase Auth ID)
    if (userData.id) {
      insertData.id = userData.id;
    }
    
    console.log('[Storage] createUser: Inserting user with data:', {
      id: insertData.id,
      email: insertData.email,
      role: insertData.role,
      agent_number: insertData.agent_number,
      approval_status: insertData.approval_status
    });
    
    const { data, error } = await supabase
      .from('users')
      .insert([insertData])
      .select()
      .single();
    if (error) {
      console.error('Error creating user:', error);
      throw new Error(`Failed to create user: ${error.message}`);
    }
    return mapUserFromDB(data);
  } catch (error: any) {
    console.error('Error creating user:', error);
    throw new Error(`Failed to create user: ${error.message}`);
  }
}

export async function getUser(id: string, options?: UserLookupOptions): Promise<User | null> {
  try {
    const fallbackEmail = normalizeEmailInput(options?.fallbackEmail);
    const primaryIdentifier = resolveUserIdentifier(id);

    const lookupQueue: Array<{ column: 'id' | 'email'; value: string; reason: string }> = [];

    if (primaryIdentifier) {
      lookupQueue.push({ ...primaryIdentifier, reason: 'primary' });
    }

    if (fallbackEmail) {
      const alreadyUsingFallback = primaryIdentifier?.column === 'email' && primaryIdentifier.value === fallbackEmail;
      if (!alreadyUsingFallback) {
        lookupQueue.push({ column: 'email', value: fallbackEmail, reason: 'fallbackEmail' });
      }
    }

    if (lookupQueue.length === 0) {
      console.warn('[Storage] getUser: No valid identifier or fallback email provided');
      return null;
    }

    for (const target of lookupQueue) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq(target.column, target.value)
        .single();

      if (error) {
        if ((error as any)?.code === 'PGRST116') {
          console.warn(`[Storage] getUser: No record found via ${target.column} (${target.reason})`);
          continue;
        }

        if (isRecoverableIdentifierError(error)) {
          console.warn(`[Storage] getUser: Identifier mismatch via ${target.column} (${target.reason}) - ${error.message}`);
          continue;
        }

        console.error(`[Storage] getUser: Supabase error via ${target.column} (${target.reason})`, error);
        throw error;
      }

      if (data) {
        console.log(`[Storage] getUser: Found user via ${target.column} (${target.reason}):`, data.email);
        console.log('[Storage] getUser: Raw role from DB:', {
          role: data.role,
          roleType: typeof data.role,
          roleLength: data.role?.length,
          roleBytes: data.role ? Buffer.from(data.role).toString('hex') : 'null'
        });

        const mappedUser = mapUserFromDB(data);
        console.log('[Storage] getUser: Mapped user role:', mappedUser?.role);
        return mappedUser;
      }
    }

    console.warn('[Storage] getUser: Exhausted all lookup strategies without finding a user');
    return null;
  } catch (error: any) {
    console.error('[Storage] Error in getUser:', error);
    return null;
  }
}

function normalizeIdentifierInput(identifier: unknown): string | null {
  if (identifier === null || identifier === undefined) {
    return null;
  }

  const stringValue = String(identifier).trim();
  return stringValue.length > 0 ? stringValue : null;
}

function isRecoverableIdentifierError(error: any): boolean {
  if (!error) return false;
  const code = (error.code || error.details || '').toString();
  const message = (error.message || '').toString().toLowerCase();
  if (code === '22P02') {
    return true;
  }
  return message.includes('invalid input syntax for type uuid');
}

function isValidUuid(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(trimmed);
}

function looksLikeEmail(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.includes('@');
}

function normalizeEmailInput(value: unknown): string | null {
  const normalized = normalizeIdentifierInput(value);
  if (!normalized) {
    return null;
  }
  return looksLikeEmail(normalized) ? normalized : null;
}

function resolveUserIdentifier(identifier: unknown): { column: 'id' | 'email'; value: string } | null {
  const normalized = normalizeIdentifierInput(identifier);
  if (!normalized) {
    return null;
  }

  if (looksLikeEmail(normalized)) {
    return { column: 'email', value: normalized };
  }

  if (isValidUuid(normalized)) {
    return { column: 'id', value: normalized };
  }

  // Default to using the id column to preserve legacy behavior for non-email identifiers
  return { column: 'id', value: normalized };
}

// Helper function to map database snake_case to camelCase
function mapUserFromDB(data: any): User | null {
  if (!data) return null;

  // Users table should contain 'super_admin', 'admin', and 'agent' roles
  // Legacy 'user' or 'member' should never appear here - they belong in members table
  // If somehow a null role is found, default to 'agent' (most common)
  const normalizedRole = normalizeRole(data.role);
  if (!normalizedRole && data.role) {
    console.warn(`[Storage] Unexpected role "${data.role}" in users table for ${data.email} - defaulting to agent`);
  }
  const roleValue = normalizedRole || 'agent';

  return {
    // The Supabase users table doesn't have an id column - use email as identifier
    id: data.id || data.email,
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
    role: roleValue,
    agentNumber: data.agent_number || data.agentNumber,
    isActive: data.is_active !== undefined ? data.is_active : (data.isActive !== undefined ? data.isActive : true),
    approvalStatus: data.approval_status || data.approvalStatus || 'approved',
    approvedAt: data.approved_at || data.approvedAt,
    approvedBy: data.approved_by || data.approvedBy,
    rejectionReason: data.rejection_reason || data.rejectionReason,
    emailVerified: (data.email_verified ?? data.emailVerified ?? true) === true,
    emailVerifiedAt: data.email_verified_at || data.emailVerifiedAt,
    registrationIp: data.registration_ip || data.registrationIp,
    registrationUserAgent: data.registration_user_agent || data.registrationUserAgent,
    suspiciousFlags: data.suspicious_flags || data.suspiciousFlags,
    createdAt: data.created_at || new Date(),
    updatedAt: data.updated_at || new Date(),
    lastLoginAt: data.last_login_at || data.lastLoginAt,
    lastActivityAt: data.last_activity_at || data.lastActivityAt,
    // Agent hierarchy fields
    uplineAgentId: data.upline_agent_id || data.uplineAgentId,
    hierarchyLevel: data.hierarchy_level || data.hierarchyLevel || 0,
    canReceiveOverrides: data.can_receive_overrides || data.canReceiveOverrides || false,
    overrideCommissionRate: data.override_commission_rate || data.overrideCommissionRate || '0',
    // Banking information for commission payouts
    bankName: data.bank_name || data.bankName,
    routingNumber: data.routing_number || data.routingNumber,
    accountNumber: data.account_number || data.accountNumber,
    accountType: data.account_type || data.accountType,
    accountHolderName: data.account_holder_name || data.accountHolderName
  } as User;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    console.log('[Storage] getUserByEmail called with:', email);
    // Use Supabase to fetch user by email
    // The users table doesn't have an 'id' column - use email as the primary identifier
    // Column names in Supabase are snake_case (first_name, agent_number, etc.)
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    // DEBUG: Log the actual data structure
    if (data) {
      console.log('[Storage] getUserByEmail RAW data:', JSON.stringify(data, null, 2));
      console.log('[Storage] getUserByEmail data.id:', data.id);
      console.log('[Storage] getUserByEmail data keys:', Object.keys(data));
    }
    
    if (error || !data) {
      if (error && error.code !== 'PGRST116') {
        console.error('[Storage] getUserByEmail error:', error);
        console.error('[Storage] getUserByEmail error details:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
      } else {
        console.log('[Storage] getUserByEmail: User not found (expected for new users)');
      }
      return null;
    }
    console.log('[Storage] getUserByEmail: User found, mapping data');
    const mappedUser = mapUserFromDB(data);
    
    // FALLBACK: If id is still undefined, use email as the identifier
    // This handles cases where the id column doesn't exist in the database
    if (!mappedUser.id && mappedUser.email) {
      console.warn('[Storage] getUserByEmail: id is undefined, using email as fallback identifier');
      mappedUser.id = mappedUser.email;
    }
    
    console.log('[Storage] getUserByEmail: Mapped user:', { id: mappedUser?.id, email: mappedUser?.email, role: mappedUser?.role });
    return mappedUser;
  } catch (error: any) {
    console.error('[Storage] getUserByEmail fatal error:', error);
    console.error('[Storage] getUserByEmail error stack:', error.stack);
    return null;
  }
}

export async function updateUser(id: string, updates: Partial<User>, options?: UserLookupOptions): Promise<User> {
  try {
    // Build update object with only columns that exist in Supabase
    // Supabase users table columns: email, username, first_name, last_name, phone, role, agent_number, is_active, created_at
    const updateData: any = {};
    
    if (updates.email !== undefined) updateData.email = updates.email;
    if (updates.firstName !== undefined) updateData.first_name = updates.firstName;
    if (updates.lastName !== undefined) updateData.last_name = updates.lastName;
    if (updates.middleName !== undefined) updateData.middle_name = updates.middleName;
    if (updates.phone !== undefined) updateData.phone = updates.phone;
    if (updates.dateOfBirth !== undefined) updateData.date_of_birth = updates.dateOfBirth;
    if (updates.gender !== undefined) updateData.gender = updates.gender;
    if (updates.address !== undefined) updateData.address = updates.address;
    if (updates.address2 !== undefined) updateData.address2 = updates.address2;
    if (updates.city !== undefined) updateData.city = updates.city;
    if (updates.state !== undefined) updateData.state = updates.state;
    if (updates.zipCode !== undefined) updateData.zip_code = updates.zipCode;
    if (updates.emergencyContactName !== undefined) updateData.emergency_contact_name = updates.emergencyContactName;
    if (updates.emergencyContactPhone !== undefined) updateData.emergency_contact_phone = updates.emergencyContactPhone;
    if (updates.role !== undefined) updateData.role = updates.role;
    if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
    if (updates.agentNumber !== undefined) updateData.agent_number = updates.agentNumber;
    // Agent hierarchy fields
    if (updates.uplineAgentId !== undefined) updateData.upline_agent_id = updates.uplineAgentId;
    if (updates.hierarchyLevel !== undefined) updateData.hierarchy_level = updates.hierarchyLevel;
    if (updates.canReceiveOverrides !== undefined) updateData.can_receive_overrides = updates.canReceiveOverrides;
    if (updates.overrideCommissionRate !== undefined) updateData.override_commission_rate = updates.overrideCommissionRate;
    // Banking information for commission payouts
    if (updates.bankName !== undefined) updateData.bank_name = updates.bankName;
    if (updates.routingNumber !== undefined) updateData.routing_number = updates.routingNumber;
    if (updates.accountNumber !== undefined) updateData.account_number = updates.accountNumber;
    if (updates.accountType !== undefined) updateData.account_type = updates.accountType;
    if (updates.accountHolderName !== undefined) updateData.account_holder_name = updates.accountHolderName;
    if (updates.profileImageUrl !== undefined) updateData.profile_image_url = updates.profileImageUrl;
    
    // Ignore fields that don't exist in Supabase:
    // - lastLoginAt, approvalStatus, approvedAt, approvedBy
    // - googleId, facebookId, twitterId, emailVerified, etc.
    
    const fallbackEmail = normalizeEmailInput(options?.fallbackEmail);

    if (Object.keys(updateData).length === 0) {
      console.log('[Storage] updateUser: No valid fields to update, returning existing user');
      const currentUser = await getUser(id, { fallbackEmail });
      if (currentUser) return currentUser;
      throw new Error('User not found');
    }

    const primaryIdentifier = resolveUserIdentifier(id) || (fallbackEmail ? { column: 'email' as const, value: fallbackEmail } : null);
    if (!primaryIdentifier) {
      throw new Error('Unable to determine identifier for user update');
    }

    console.log('[Storage] updateUser: Updating user', primaryIdentifier.value, 'using column', primaryIdentifier.column, 'with data:', updateData);
    console.log('[Storage] updateUser: Update data keys:', Object.keys(updateData));
    console.log('[Storage] updateUser: profileImageUrl in updates?', 'profile_image_url' in updateData);

    const bankingFields = ['bank_name', 'routing_number', 'account_number', 'account_type', 'account_holder_name'];
    const hasBankingUpdates = bankingFields.some(field => updateData[field] !== undefined);

    let oldBankingInfo = null;
    if (hasBankingUpdates) {
      const currentUser = await getUser(id, { fallbackEmail });
      if (currentUser) {
        oldBankingInfo = {
          bankName: currentUser.bankName,
          routingNumber: currentUser.routingNumber,
          accountNumber: currentUser.accountNumber,
          accountType: currentUser.accountType,
          accountHolderName: currentUser.accountHolderName
        };
      }
    }

    const updateQueue: Array<{ column: 'id' | 'email'; value: string; reason: string }> = [
      { ...primaryIdentifier, reason: 'primary' }
    ];

    if (fallbackEmail) {
      const alreadyQueued = primaryIdentifier.column === 'email' && primaryIdentifier.value === fallbackEmail;
      if (!alreadyQueued) {
        updateQueue.push({ column: 'email', value: fallbackEmail, reason: 'fallbackEmail' });
      }
    }

    let updatedRecord: any = null;
    let schemaCacheError: any = null;
    for (const target of updateQueue) {
      const { data, error } = await supabase
        .from('users')
        .update(updateData)
        .eq(target.column, target.value)
        .select()
        .single();

      if (error) {
        const errorCode = (error as any)?.code;
        if (errorCode === 'PGRST116') {
          console.warn(`[Storage] updateUser: No rows matched via ${target.column} (${target.reason})`);
          continue;
        }
        if (errorCode === 'PGRST204') {
          schemaCacheError = error;
          console.warn('[Storage] updateUser: Supabase schema cache miss detected, preparing direct SQL fallback');
          break;
        }
        if (isRecoverableIdentifierError(error)) {
          console.warn(`[Storage] updateUser: Identifier mismatch via ${target.column} (${target.reason}) - ${error.message}`);
          continue;
        }
        console.error(`[Storage] updateUser error via ${target.column} (${target.reason})`, error);
        throw new Error(`Failed to update user: ${error.message}`);
      }

      if (data) {
        updatedRecord = data;
        break;
      }
    }

    if (!updatedRecord && schemaCacheError) {
      console.warn('[Storage] updateUser: Attempting direct SQL fallback due to schema cache error');
      updatedRecord = await updateUserViaDirectQuery(updateQueue, updateData);
      if (updatedRecord) {
        console.log('[Storage] updateUser: Direct SQL fallback succeeded');
      }
    }

    if (!updatedRecord) {
      if (schemaCacheError) {
        throw new Error(`Failed to update user via Supabase client: ${schemaCacheError.message}`);
      }
      throw new Error('User not found');
    }

    const auditUserId = updatedRecord.id || id;
    
    // If banking info was updated and update was successful, log the change
    if (hasBankingUpdates && oldBankingInfo) {
      const newBankingInfo = {
        bankName: updatedRecord.bank_name ?? updateData.bank_name,
        routingNumber: updatedRecord.routing_number ?? updateData.routing_number,
        accountNumber: updatedRecord.account_number ?? updateData.account_number,
        accountType: updatedRecord.account_type ?? updateData.account_type,
        accountHolderName: updatedRecord.account_holder_name ?? updateData.account_holder_name
      };
      
      // Log the banking change (don't await to avoid blocking the response)
      recordBankingInfoChange({
        userId: auditUserId,
        modifiedBy: auditUserId,
        oldBankingInfo,
        newBankingInfo,
        changeType: 'self_update'
      }).catch(auditError => {
        console.error('[Storage] Failed to log banking change audit:', auditError);
      });
    }

    const mapped = mapUserFromDB(updatedRecord);
    if (!mapped) {
      throw new Error('Failed to map updated user record');
    }

    return mapped;
  } catch (error: any) {
    console.error('Error updating user:', error);
    console.error('[Storage] updateUser error details:', {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      stack: error?.stack,
    });

    // For non-critical updates like last_login_at, don't throw - just return the existing user
    const isNonCriticalUpdate = Object.keys(updates).length === 1 && updates.lastLoginAt !== undefined;
    if (isNonCriticalUpdate) {
      console.warn(`Non-critical user update failed for ${id}, continuing anyway:`, error.message);
      const currentUser = await getUser(id, { fallbackEmail: options?.fallbackEmail });
      if (currentUser) {
        return currentUser;
      }
    }

    throw new Error(`Failed to update user: ${error.message}`);
  }
}

export async function updateUserProfile(id: string, profileData: Partial<User>, options?: UserLookupOptions): Promise<User> {
  return updateUser(id, profileData, options);
}

export async function getUserByUsername(username: string): Promise<User | null> {
  try {
    const result = await query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) return null;
    return mapUserFromDB(result.rows[0]);
  } catch (error: any) {
    console.error('Error fetching user by username:', error);
    return null;
  }
}

export async function getUserByGoogleId(googleId: string): Promise<User | null> {
  try {
    const result = await query(
      'SELECT * FROM users WHERE google_id = $1',
      [googleId]
    );

    if (result.rows.length === 0) return null;
    return mapUserFromDB(result.rows[0]);
  } catch (error: any) {
    console.error('Error fetching user by Google ID:', error);
    return null;
  }
}

export async function getUserByFacebookId(facebookId: string): Promise<User | null> {
  try {
    const result = await query(
      'SELECT * FROM users WHERE facebook_id = $1',
      [facebookId]
    );

    if (result.rows.length === 0) return null;
    return mapUserFromDB(result.rows[0]);
  } catch (error: any) {
    console.error('Error fetching user by Facebook ID:', error);
    return null;
  }
}

export async function getUserByTwitterId(twitterId: string): Promise<User | null> {
  try {
    const result = await query(
      'SELECT * FROM users WHERE twitter_id = $1',
      [twitterId]
    );

    if (result.rows.length === 0) return null;
    return mapUserFromDB(result.rows[0]);
  } catch (error: any) {
    console.error('Error fetching user by Twitter ID:', error);
    return null;
  }
}

export async function getUserByVerificationToken(token: string): Promise<User | null> {
  try {
    const result = await query(
      'SELECT * FROM users WHERE email_verification_token = $1',
      [token]
    );

    if (result.rows.length === 0) return null;
    return mapUserFromDB(result.rows[0]);
  } catch (error: any) {
    console.error('Error fetching user by verification token:', error);
    return null;
  }
}

export async function getUserByResetToken(token: string): Promise<User | null> {
  try {
    const result = await query(
      'SELECT * FROM users WHERE reset_password_token = $1',
      [token]
    );

    if (result.rows.length === 0) return null;
    return mapUserFromDB(result.rows[0]);
  } catch (error: any) {
    console.error('Error fetching user by reset token:', error);
    return null;
  }
}

export async function getUserByAgentNumber(agentNumber: string): Promise<User | null> {
  try {
    const result = await query(
      'SELECT * FROM users WHERE agent_number = $1',
      [agentNumber]
    );

    if (result.rows.length === 0) return null;
    return mapUserFromDB(result.rows[0]);
  } catch (error: any) {
    console.error('Error fetching user by agent number:', error);
    return null;
  }
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




export async function getAllUsers(limit = 50, offset = 0): Promise<{ users: User[]; totalCount: number }> {
  try {
    console.log('[Storage] Fetching all active users via Supabase...');

    // Use Supabase instead of Neon to avoid connection issues
    // FILTER: Only return active users with approved status (exclude suspended/removed users)
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
      .eq('is_active', true)
      .eq('approval_status', 'approved')
      .order('created_at', { ascending: false });

    if (usersError) {
      console.error('[Storage] Supabase users error:', usersError);
      throw usersError;
    }

    if (!users) {
      console.warn('[Storage] No users returned from Supabase');
      return { users: [], totalCount: 0 };
    }

    // Fetch subscriptions separately
    const { data: subscriptions, error: subsError } = await supabase
      .from('subscriptions')
      .select('*');

    if (subsError) {
      console.warn('[Storage] Supabase subscriptions error (continuing without):', subsError);
    }

    // Map subscriptions to users and convert to camelCase
    const usersWithSubscriptions = users.map(user => {
      const userSubscription = subscriptions?.find(sub => sub.user_id === user.id);
      const mappedUser = mapUserFromDB(user);
      return {
        ...mappedUser,
        subscription: userSubscription || null
      };
    }).filter(u => u !== null);

    console.log('[Storage] Successfully fetched active users:', {
      totalUsers: usersWithSubscriptions.length,
      roles: usersWithSubscriptions.slice(0, 5).map(u => ({ email: u.email, role: u.role, isActive: u.isActive }))
    });

    return {
      users: usersWithSubscriptions,
      totalCount: usersWithSubscriptions.length
    };
  } catch (error: any) {
    console.error('[Storage] Error in getAllUsers:', error);
    throw error;
  }
}

// Get only members (from the members table - NOT from users table!)
// NOTE: Members are enrolled customers in the members table, NOT in the users table
// Users table should ONLY contain 'admin' and 'agent' roles for staff/agents
export async function getMembersOnly(limit = 50, offset = 0): Promise<{ users: User[]; totalCount: number }> {
  try {
    console.log('[Storage] Fetching members from members table...');

    // Call getAllDPCMembers which queries the members table directly
    const members = await getAllDPCMembers();
    
    // Apply limit and offset if needed
    const slicedMembers = members.slice(offset, offset + limit);

    console.log('[Storage] Successfully fetched members:', {
      totalMembers: members.length
    });

    return {
      users: slicedMembers as any[],
      totalCount: members.length
    };
  } catch (error: any) {
    console.error('[Storage] Error in getMembersOnly:', error);
    throw error;
  }
}


export async function getUsersCount(): Promise<number> {
  try {
    const result = await query(
      'SELECT COUNT(*) as count FROM users'
    );
    return parseInt(result.rows[0].count) || 0;
  } catch (error: any) {
    console.error('Error fetching user count:', error);
    throw new Error(`Failed to get user count: ${error.message}`);
  }
}

export async function getRevenueStats(): Promise<{ totalRevenue: number; monthlyRevenue: number }> {
  try {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Get total revenue
    const totalResult = await query(
      'SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = $1',
      ['completed']
    );

    // Get monthly revenue
    const monthlyResult = await query(
      'SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = $1 AND created_at >= $2',
      ['completed', firstDayOfMonth.toISOString()]
    );

    return {
      totalRevenue: parseFloat(totalResult.rows[0].total) || 0,
      monthlyRevenue: parseFloat(monthlyResult.rows[0].total) || 0
    };
  } catch (error: any) {
    console.error('Error fetching revenue stats:', error);
    throw new Error(`Failed to get revenue stats: ${error.message}`);
  }
}

export async function getSubscriptionStats(): Promise<{ active: number; pending: number; cancelled: number }> {
  try {
    const result = await query(`
      SELECT 
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled
      FROM subscriptions
    `);

    const stats = result.rows[0];
    return {
      active: parseInt(stats.active) || 0,
      pending: parseInt(stats.pending) || 0,
      cancelled: parseInt(stats.cancelled) || 0
    };
  } catch (error: any) {
    console.error('Error fetching subscription stats:', error);
    throw new Error(`Failed to get subscription stats: ${error.message}`);
  }
}

export async function getAgentEnrollments(
  agentId: string,
  startDate?: string,
  endDate?: string,
  agentNumber?: string | null,
): Promise<User[]> {
  try {
    console.log('[Storage] getAgentEnrollments called with:', { agentId, agentNumber, startDate, endDate });
    const normalizedAgentNumber = agentNumber?.trim() || null;
    
    // Query members table from Neon database (not users table)
    const params: any[] = [];
    let paramCount = 1;

    let agentFilter = '';
    if (agentId) {
      agentFilter = `(m.enrolled_by_agent_id::uuid = $${paramCount}::uuid`;
      params.push(agentId);
      paramCount++;

      if (normalizedAgentNumber) {
        agentFilter += ` OR m.agent_number = $${paramCount}`;
        params.push(normalizedAgentNumber);
        paramCount++;
      }
      agentFilter += ')';
    } else if (normalizedAgentNumber) {
      agentFilter = `m.agent_number = $${paramCount}`;
      params.push(normalizedAgentNumber);
      paramCount++;
    } else {
      throw new Error('Agent identifier required to fetch enrollments');
    }

    let sql = `
      SELECT 
        m.*, 
        p.name as plan_name,
        p.price as plan_price,
        ac.commission_amount,
        ac.payment_status as commission_status
      FROM members m
      LEFT JOIN plans p ON m.plan_id = p.id
      LEFT JOIN agent_commissions ac ON ac.member_id = m.id::text AND ac.agent_id = $1
      WHERE ${agentFilter}
    `;

    if (startDate && endDate) {
      sql += ` AND m.created_at >= $${paramCount} AND m.created_at <= $${paramCount + 1}`;
      params.push(startDate, endDate);
      paramCount += 2;
    }

    sql += ' ORDER BY m.created_at DESC';

    const result = await query(sql, params);
    
    console.log('[Storage] getAgentEnrollments - SQL:', sql);
    console.log('[Storage] getAgentEnrollments - Found', result.rows.length, 'enrollments');
    
    // DEBUG: Show ALL members to compare
    const allMembers = await query('SELECT id, email, first_name, last_name, enrolled_by_agent_id, is_active, created_at FROM members ORDER BY created_at DESC LIMIT 10');
    console.log('[Storage] DEBUG - ALL MEMBERS (last 10):');
    allMembers.rows.forEach((m: any) => {
      console.log(`  ID: ${m.id}, Email: ${m.email}, Name: ${m.first_name} ${m.last_name}, EnrolledBy: ${m.enrolled_by_agent_id}, IsActive: ${m.is_active}, Created: ${m.created_at}`);
    });
    
    // Map member data to User format for compatibility, including plan and commission info
    return result.rows.map((row: any) => ({
      id: row.id.toString(),
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      middleName: row.middle_name,
      phone: row.phone,
      dateOfBirth: row.date_of_birth,
      gender: row.gender,
      address: row.address,
      address2: row.address2,
      city: row.city,
      state: row.state,
      zipCode: row.zip_code,
      emergencyContactName: row.emergency_contact_name,
      emergencyContactPhone: row.emergency_contact_phone,
      role: 'member',
      agentNumber: row.agent_number,
      isActive: row.is_active,
      emailVerified: row.email_verified || false,
      enrolledByAgentId: row.enrolled_by_agent_id,
      employerName: row.employer_name,
      memberType: row.coverage_type,
      ssn: row.ssn,
      dateOfHire: row.date_of_hire,
      planStartDate: row.plan_start_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      customerNumber: row.customer_number,
      memberPublicId: row.member_public_id,
      // Include plan and commission info
      planId: row.plan_id,
      planName: row.plan_name,
      planPrice: row.plan_price,
      totalMonthlyPrice: row.total_monthly_price,
      commissionAmount: row.commission_amount,
      commissionStatus: row.commission_status,
      status: row.status,
      enrolledBy: 'Agent',
      subscriptionId: row.subscription_id
    } as any));
  } catch (error: any) {
    console.error('Error fetching agent enrollments:', error);
    throw new Error(`Failed to get agent enrollments: ${error.message}`);
  }
}

export async function getAllEnrollments(startDate?: string, endDate?: string, agentId?: string): Promise<User[]> {
  try {
    // Query members table from Neon database with plan and commission data
    // Admin view: Show ALL members regardless of is_active status
    let sql = `
      SELECT 
        m.*,
        p.name as plan_name,
        p.price as plan_price,
        ac.commission_amount,
        ac.payment_status as commission_status,
        u.email as agent_email,
        u.first_name as agent_first_name,
        u.last_name as agent_last_name,
        u.agent_number as agent_number
      FROM members m
      LEFT JOIN plans p ON m.plan_id = p.id
      LEFT JOIN agent_commissions ac ON ac.member_id = m.id::text
      LEFT JOIN users u ON m.enrolled_by_agent_id::uuid = u.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 1;

    if (startDate && endDate) {
      sql += ` AND m.created_at::date BETWEEN $${paramCount++}::date AND $${paramCount++}::date`;
      params.push(startDate, endDate);
    }

    if (agentId) {
      sql += ` AND m.enrolled_by_agent_id::uuid = $${paramCount++}::uuid`;
      params.push(agentId);
    }

    sql += " ORDER BY m.created_at DESC";

    const result = await query(sql, params);
    
    console.log('[Storage] getAllEnrollments - Query params:', { startDate, endDate, agentId });
    console.log('[Storage] getAllEnrollments - Row count:', result.rows.length);
    
    // Map member data to User format for compatibility, including plan and commission data
    return result.rows.map((row: any) => ({
      id: row.id.toString(),
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      middleName: row.middle_name,
      phone: row.phone,
      dateOfBirth: row.date_of_birth,
      gender: row.gender,
      address: row.address,
      address2: row.address2,
      city: row.city,
      state: row.state,
      zipCode: row.zip_code,
      emergencyContactName: row.emergency_contact_name,
      emergencyContactPhone: row.emergency_contact_phone,
      role: 'member',
      agentNumber: row.agent_number,
      isActive: row.is_active,
      emailVerified: row.email_verified || false,
      enrolledByAgentId: row.enrolled_by_agent_id,
      employerName: row.employer_name,
      memberType: row.coverage_type,
      ssn: row.ssn,
      dateOfHire: row.date_of_hire,
      planStartDate: row.plan_start_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      customerNumber: row.customer_number,
      memberPublicId: row.member_public_id,
      // Include plan and commission info
      planId: row.plan_id,
      planName: row.plan_name,
      planPrice: row.plan_price,
      totalMonthlyPrice: row.total_monthly_price,
      commissionAmount: row.commission_amount,
      commissionStatus: row.commission_status,
      status: row.status,
      enrolledBy: row.agent_first_name && row.agent_last_name 
        ? `${row.agent_first_name} ${row.agent_last_name}` 
        : 'Unknown',
      subscriptionId: row.subscription_id
    } as any));
  } catch (error: any) {
    console.error('Error fetching all enrollments:', error);
    throw new Error(`Failed to get enrollments: ${error.message}`);
  }
}

// Helper function to get all downline agents recursively (for agent tree view)
async function getDownlineAgentIds(agentId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('upline_agent_id', agentId)
      .eq('role', 'agent');

    if (error) {
      console.error('[Storage] Error fetching downline agents:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Get direct downline IDs
    const directDownline = data.map(agent => agent.id);
    
    // Recursively get downline of downline
    const nestedDownline = await Promise.all(
      directDownline.map(id => getDownlineAgentIds(id))
    );

    // Flatten and combine all levels
    return [...directDownline, ...nestedDownline.flat()];
  } catch (error: any) {
    console.error('[Storage] Error in getDownlineAgentIds:', error);
    return [];
  }
}

export async function getEnrollmentsByAgent(agentId: string, startDate?: string, endDate?: string): Promise<User[]> {
  try {
    // Get all downline agents for this agent
    const downlineAgentIds = await getDownlineAgentIds(agentId);
    const allAgentIds = [agentId, ...downlineAgentIds];

    console.log('[Storage] getEnrollmentsByAgent - Agent hierarchy:', {
      agentId,
      downlineCount: downlineAgentIds.length,
      allAgentIds: allAgentIds.slice(0, 5) // Show first 5 for debugging
    });

    // Query members table from Neon database with plan and commission data
    // Include enrollments by this agent AND all downline agents
    let sql = `
      SELECT 
        m.*,
        p.name as plan_name,
        p.price as plan_price,
        ac.commission_amount,
        ac.payment_status as commission_status,
        u.email as agent_email,
        u.first_name as agent_first_name,
        u.last_name as agent_last_name,
        u.agent_number as enrolling_agent_number
      FROM members m
      LEFT JOIN plans p ON m.plan_id = p.id
      LEFT JOIN agent_commissions ac ON ac.member_id = m.id::text
      LEFT JOIN users u ON m.enrolled_by_agent_id::uuid = u.id::uuid
      WHERE m.enrolled_by_agent_id::uuid = ANY($1::uuid[])
    `;
    const params: any[] = [allAgentIds];
    let paramCount = 2;

    if (startDate && endDate) {
      sql += ` AND m.created_at::date BETWEEN $${paramCount++}::date AND $${paramCount++}::date`;
      params.push(startDate, endDate);
    }

    sql += " ORDER BY m.created_at DESC";

    const result = await query(sql, params);
    
    console.log('[Storage] getEnrollmentsByAgent - Query params:', { 
      agentCount: allAgentIds.length,
      startDate, 
      endDate 
    });
    console.log('[Storage] getEnrollmentsByAgent - Row count:', result.rows.length);
    
    if (result.rows.length > 0) {
      console.log('[Storage] getEnrollmentsByAgent - Sample enrollment:', {
        id: result.rows[0].id,
        email: result.rows[0].email,
        name: `${result.rows[0].first_name} ${result.rows[0].last_name}`,
        enrolledBy: result.rows[0].enrolling_agent_number,
        plan: result.rows[0].plan_name
      });
    }
    
    // Map member data to User format for compatibility, including plan and commission data
    return result.rows.map((row: any) => {
      // Determine if this enrollment is from a downline agent or self
      const isSelfEnrollment = row.enrolled_by_agent_id === agentId;
      const enrolledByLabel = isSelfEnrollment 
        ? 'Agent (Self)' 
        : `Downline (${row.enrolling_agent_number || 'Agent'})`;

      return {
        id: row.id.toString(),
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        middleName: row.middle_name,
        phone: row.phone,
        dateOfBirth: row.date_of_birth,
        gender: row.gender,
        address: row.address,
        address2: row.address2,
        city: row.city,
        state: row.state,
        zipCode: row.zip_code,
        emergencyContactName: row.emergency_contact_name,
        emergencyContactPhone: row.emergency_contact_phone,
        role: 'member',
        agentNumber: row.agent_number,
        isActive: row.is_active,
        emailVerified: row.email_verified || false,
        enrolledByAgentId: row.enrolled_by_agent_id,
        employerName: row.employer_name,
        memberType: row.coverage_type,
        ssn: row.ssn,
        dateOfHire: row.date_of_hire,
        planStartDate: row.plan_start_date,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        customerNumber: row.customer_number,
        memberPublicId: row.member_public_id,
        // Include plan and commission info
        planId: row.plan_id,
        planName: row.plan_name,
        planPrice: row.plan_price,
        totalMonthlyPrice: row.total_monthly_price,
        commissionAmount: row.commission_amount,
        commissionStatus: row.commission_status,
        status: row.status,
        enrolledBy: enrolledByLabel,
        enrolledByAgentEmail: row.agent_email,
        enrolledByAgentName: row.agent_first_name && row.agent_last_name 
          ? `${row.agent_first_name} ${row.agent_last_name}` 
          : row.agent_email,
        enrollingAgentNumber: row.enrolling_agent_number,
        subscriptionId: row.subscription_id
      } as any;
    });
  } catch (error: any) {
    console.error('Error fetching agent enrollments:', error);
    throw new Error(`Failed to get agent enrollments: ${error.message}`);
  }
}

export async function updateMemberStatus(
  memberId: string | number,
  status: string,
  options?: { reason?: string }
): Promise<any> {
  const allowedStatuses = [
    'pending_activation',
    'active',
    'inactive',
    'cancelled',
    'suspended'
  ];

  if (!status || !allowedStatuses.includes(status)) {
    throw new Error(`Invalid status value: ${status}`);
  }

  const numericId = typeof memberId === 'string' ? parseInt(memberId, 10) : memberId;
  if (!numericId || Number.isNaN(numericId)) {
    throw new Error(`Invalid member ID: ${memberId}`);
  }

  const timestamp = new Date().toISOString();
  const updates: Record<string, any> = {
    status,
    updated_at: timestamp
  };

  if (status === 'active') {
    updates.is_active = true;
    updates.cancellation_date = null;
    updates.cancellation_reason = null;
  } else if (status === 'pending_activation') {
    updates.is_active = false;
    updates.cancellation_date = null;
    updates.cancellation_reason = null;
  } else {
    updates.is_active = false;
    updates.cancellation_date = timestamp;
    if (options?.reason) {
      updates.cancellation_reason = options.reason;
    }
  }

  try {
    console.log('[Storage] Updating member status', { memberId: numericId, status });

    const { data, error } = await supabase
      .from('members')
      .update(updates)
      .eq('id', numericId)
      .select('*')
      .single();

    if (error) {
      console.error('[Storage] Error updating member status:', error);
      throw new Error(`Failed to update member status: ${error.message}`);
    }

    return data;
  } catch (error: any) {
    console.error('[Storage] Unhandled error in updateMemberStatus:', error);
    throw error;
  }
}

export async function activateMembershipNow(
  memberId: string | number,
  options?: { note?: string; initiatedBy?: string }
): Promise<any> {
  const numericId = typeof memberId === 'string' ? parseInt(memberId, 10) : memberId;
  if (!numericId || Number.isNaN(numericId)) {
    throw new Error(`Invalid member ID: ${memberId}`);
  }

  const now = new Date().toISOString();
  const updates = {
    status: 'active',
    is_active: true,
    membership_start_date: now,
    updated_at: now,
    cancellation_date: null,
    cancellation_reason: null
  };

  try {
    console.log('[Storage] Manual membership activation', { memberId: numericId, initiatedBy: options?.initiatedBy });

    const { data, error } = await supabase
      .from('members')
      .update(updates)
      .eq('id', numericId)
      .select('*')
      .single();

    if (error) {
      console.error('[Storage] Error activating membership immediately:', error);
      throw new Error(`Failed to activate membership: ${error.message}`);
    }

    return data;
  } catch (error: any) {
    console.error('[Storage] Unhandled error in activateMembershipNow:', error);
    throw error;
  }
}

export async function recordEnrollmentModification(data: any): Promise<void> {
  try {
    await query(
      'INSERT INTO enrollment_modifications (user_id, modified_by, changes, created_at) VALUES ($1, $2, $3, $4)',
      [data.user_id || data.userId, data.modified_by || data.modifiedBy, JSON.stringify(data.changes || data), new Date()]
    );
  } catch (error: any) {
    console.error('Error recording enrollment modification:', error);
    throw new Error(`Failed to record enrollment modification: ${error.message}`);
  }
}

// Record banking information changes for audit trail
export async function recordBankingInfoChange(data: {
  userId: string;
  modifiedBy: string;
  oldBankingInfo: any;
  newBankingInfo: any;
  changeType: string;
}): Promise<void> {
  try {
    const changeDetails = {
      changeType: data.changeType,
      oldValues: data.oldBankingInfo,
      newValues: data.newBankingInfo,
      timestamp: new Date().toISOString(),
      userAgent: 'DPC Enrollment System'
    };

    await query(
      'INSERT INTO enrollment_modifications (user_id, modified_by, change_type, change_details, created_at) VALUES ($1, $2, $3, $4, $5)',
      [data.userId, data.modifiedBy, 'banking_info_update', JSON.stringify(changeDetails), new Date()]
    );
    
    console.log(`[Audit] Banking info change recorded for user ${data.userId} by ${data.modifiedBy}`);
  } catch (error: any) {
    console.error('Error recording banking info change:', error);
    // Don't throw - banking updates should not fail due to audit logging issues
    console.warn('Banking info update will proceed despite audit logging failure');
  }
}

// Get banking information change history for a user
export async function getBankingChangeHistory(userId: string): Promise<any[]> {
  try {
    const result = await query(
      `SELECT 
        id, 
        modified_by, 
        change_details, 
        created_at 
       FROM enrollment_modifications 
       WHERE user_id = $1 AND change_type = 'banking_info_update' 
       ORDER BY created_at DESC`,
      [userId]
    );
    
    return result.rows.map(row => ({
      id: row.id,
      modifiedBy: row.modified_by,
      changeDetails: row.change_details,
      createdAt: row.created_at
    }));
  } catch (error: any) {
    console.error('Error fetching banking change history:', error);
    return [];
  }
}

// DPC Member operations (Neon database)
export async function getAllDPCMembers(): Promise<any[]> {
  try {
    const result = await query(`
      SELECT 
        id,
        customer_number,
        first_name,
        last_name,
        middle_name,
        email,
        phone,
        date_of_birth,
        gender,
        ssn,
        address,
        address2,
        city,
        state,
        zip_code,
        emergency_contact_name,
        emergency_contact_phone,
        employer_name,
        division_name,
        member_type,
        date_of_hire,
        plan_start_date,
        enrolled_by_agent_id,
        agent_number,
        enrollment_date,
        is_active,
        status,
        cancellation_date,
        cancellation_reason,
        created_at,
        updated_at
      FROM members 
      ORDER BY created_at DESC
    `);
    
    return result.rows.map((row: any) => ({
      id: row.customer_number, // Use customer_number as ID for frontend
      customerNumber: row.customer_number,
      memberPublicId: row.member_public_id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      middleName: row.middle_name,
      phone: row.phone,
      dateOfBirth: row.date_of_birth,
      gender: row.gender,
      address: row.address,
      address2: row.address2,
      city: row.city,
      state: row.state,
      zipCode: row.zip_code,
      emergencyContactName: row.emergency_contact_name,
      emergencyContactPhone: row.emergency_contact_phone,
      employerName: row.employer_name,
      divisionName: row.division_name,
      memberType: row.member_type,
      dateOfHire: row.date_of_hire,
      planStartDate: row.plan_start_date,
      role: 'member',
      agentNumber: row.agent_number,
      enrolledByAgentId: row.enrolled_by_agent_id,
      enrollmentDate: row.enrollment_date,
      isActive: row.is_active && row.status === 'active',
      status: row.status,
      approvalStatus: row.is_active && row.status === 'active' ? 'approved' : 
                       row.status === 'suspended' ? 'suspended' : 'inactive',
      cancellationDate: row.cancellation_date,
      cancellationReason: row.cancellation_reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      emailVerified: true // Members are pre-verified through enrollment process
    }));
  } catch (error: any) {
    console.error('Error fetching DPC members:', error);
    throw new Error(`Failed to fetch DPC members: ${error.message}`);
  }
}

export async function suspendDPCMember(customerId: string, reason?: string): Promise<any> {
  try {
    const result = await query(`
      UPDATE members 
      SET 
        status = 'suspended',
        is_active = false,
        cancellation_reason = $2,
        updated_at = NOW()
      WHERE customer_number = $1
      RETURNING *
    `, [customerId, reason || 'Suspended by administrator']);
    
    if (result.rows.length === 0) {
      throw new Error('Member not found');
    }
    
    console.log(`✅ DPC Member ${customerId} suspended successfully`);
    return result.rows[0];
  } catch (error: any) {
    console.error('Error suspending DPC member:', error);
    throw new Error(`Failed to suspend DPC member: ${error.message}`);
  }
}

export async function reactivateDPCMember(customerId: string): Promise<any> {
  try {
    const result = await query(`
      UPDATE members 
      SET 
        status = 'active',
        is_active = true,
        cancellation_reason = NULL,
        cancellation_date = NULL,
        updated_at = NOW()
      WHERE customer_number = $1
      RETURNING *
    `, [customerId]);
    
    if (result.rows.length === 0) {
      throw new Error('Member not found');
    }
    
    console.log(`✅ DPC Member ${customerId} reactivated successfully`);
    return result.rows[0];
  } catch (error: any) {
    console.error('Error reactivating DPC member:', error);
    throw new Error(`Failed to reactivate DPC member: ${error.message}`);
  }
}

// Lead operations
export async function createLead(leadData: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>): Promise<Lead> {
  try {
    console.log('[Storage] Creating lead with data:', leadData);

    // Validate required fields
    if (!leadData.firstName || !leadData.lastName || !leadData.email || !leadData.phone) {
      throw new Error('Missing required fields: firstName, lastName, email, phone');
    }

    // Supabase leads table uses snake_case columns (as shown in screenshot)
    // Map JavaScript camelCase to PostgreSQL snake_case
    // ONLY include columns that currently exist in the table:
    // id, first_name, last_name, email, phone, message, status, created_at
    const dbData: any = {
      first_name: leadData.firstName.trim(),
      last_name: leadData.lastName.trim(),
      email: leadData.email.trim().toLowerCase(),
      phone: leadData.phone.trim(),
      message: leadData.message ? leadData.message.trim() : '',
      status: leadData.status || 'new'
      // created_at will be auto-generated by database DEFAULT
    };

    // NOTE: Optional columns (source, assigned_agent_id, notes) can be added if provided
    // These columns now exist after running add_missing_leads_columns.sql migration
    if (leadData.source) {
      dbData.source = leadData.source;
    }
    if (leadData.assignedAgentId !== undefined) {
      dbData.assigned_agent_id = leadData.assignedAgentId;
    }
    if (leadData.notes) {
      dbData.notes = leadData.notes;
    }

    console.log('[Storage] Mapped data for database:', dbData);

    const { data, error } = await supabase
      .from('leads')
      .insert([dbData])
      .select()
      .single();

    if (error) {
      console.error('[Storage] Supabase error creating lead:', {
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      throw new Error(`Database error: ${error.message}`);
    }

    console.log('[Storage] Lead created successfully:', data);

    // Map back to camelCase for return
    return mapLeadFromDB(data);
  } catch (error: any) {
    console.error('[Storage] Error in createLead:', error);
    throw new Error(`Failed to create lead: ${error.message}`);
  }
}

export async function getAgentLeads(agentId: string, status?: string): Promise<Lead[]> {
  try {
    let sql = 'SELECT * FROM leads WHERE assigned_agent_id::uuid = $1::uuid';
    const params: any[] = [agentId];

    if (status) {
      sql += ' AND status = $2';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC';

    const result = await query(sql, params);
    const data = result.rows || [];

    // Map snake_case to camelCase
    const mappedData = (data || []).map(lead => ({
      id: lead.id,
      firstName: lead.first_name,
      lastName: lead.last_name,
      email: lead.email,
      phone: lead.phone,
      message: lead.message,
      source: lead.source,
      status: lead.status,
      assignedAgentId: lead.assigned_agent_id,
      createdAt: lead.created_at,
      updatedAt: lead.updated_at,
      notes: lead.notes
    }));

    return mappedData;
  } catch (error) {
    console.error('[Storage] Error fetching agent leads:', error);
    throw error;
  }
}

export async function getLead(id: number): Promise<Lead | undefined> {
  try {
    const result = await query(
      'SELECT * FROM leads WHERE id = $1',
      [id]
    );

    const data = result.rows[0];
    if (!data) return undefined;

    // Map snake_case to camelCase
    return {
      id: data.id,
      firstName: data.first_name,
      lastName: data.last_name,
      email: data.email,
      phone: data.phone,
      message: data.message,
      source: data.source,
      status: data.status,
      assignedAgentId: data.assigned_agent_id,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      notes: data.notes
    };
  } catch (error: any) {
    console.error('Error fetching lead:', error);
    return undefined;
  }
}

export async function getLeadByEmail(email: string): Promise<Lead | undefined> {
  try {
    const result = await query(
      'SELECT * FROM leads WHERE email = $1',
      [email]
    );

    const data = result.rows[0];
    if (!data) return undefined;

    // Map snake_case to camelCase
    return {
      id: data.id,
      firstName: data.first_name,
      lastName: data.last_name,
      email: data.email,
      phone: data.phone,
      message: data.message,
      source: data.source,
      status: data.status,
      assignedAgentId: data.assigned_agent_id,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      notes: data.notes
    };
  } catch (error: any) {
    console.error('Error fetching lead by email:', error);
    return undefined;
  }
}

export async function updateLead(id: number, data: Partial<Lead>): Promise<Lead> {
  // Map JavaScript camelCase to PostgreSQL snake_case
  const updateData: any = { updated_at: new Date().toISOString() };

  if (data.firstName !== undefined) updateData.first_name = data.firstName;
  if (data.lastName !== undefined) updateData.last_name = data.lastName;
  if (data.email !== undefined) updateData.email = data.email;
  if (data.phone !== undefined) updateData.phone = data.phone;
  if (data.message !== undefined) updateData.message = data.message;
  if (data.source !== undefined) updateData.source = data.source;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.assignedAgentId !== undefined) updateData.assigned_agent_id = data.assignedAgentId;
  if (data.notes !== undefined) updateData.notes = data.notes;

  const { data: updatedLead, error } = await supabase
    .from('leads')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating lead:', error);
    throw new Error(`Failed to update lead: ${error.message}`);
  }

  // Map snake_case back to camelCase
  return updatedLead ? {
    id: updatedLead.id,
    firstName: updatedLead.first_name,
    lastName: updatedLead.last_name,
    email: updatedLead.email,
    phone: updatedLead.phone,
    message: updatedLead.message,
    source: updatedLead.source,
    status: updatedLead.status,
    assignedAgentId: updatedLead.assigned_agent_id,
    createdAt: updatedLead.created_at,
    updatedAt: updatedLead.updated_at,
    notes: updatedLead.notes
  } : undefined as any; // Should not happen if error is not thrown
}

export async function assignLeadToAgent(leadId: number, agentId: string): Promise<Lead> {
  try {
    const { data, error } = await supabase
      .from('leads')
      .update({
        assigned_agent_id: agentId,
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId)
      .select()
      .single();

    if (error) {
      console.error('[Storage] Error assigning lead:', error);
      throw error;
    }

    // Map snake_case back to camelCase
    const mappedLead = {
      id: data.id,
      firstName: data.first_name,
      lastName: data.last_name,
      email: data.email,
      phone: data.phone,
      message: data.message,
      source: data.source,
      status: data.status,
      assignedAgentId: data.assigned_agent_id,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      notes: data.notes
    };

    return mappedLead;
  } catch (error) {
    console.error('[Storage] Error assigning lead:', error);
    throw error;
  }
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
  agents.sort((a: any, b: any) => (a.leadCount || 0) - (b.leadCount || 0));
  return agents[0]?.agentId || null;
}

// Helper function to map database snake_case to camelCase for leads
function mapLeadFromDB(dbLead: any): Lead | null {
  if (!dbLead) return null;

  return {
    id: dbLead.id,
    firstName: dbLead.first_name || dbLead.firstName,        // Handle both formats
    lastName: dbLead.last_name || dbLead.lastName,           // Handle both formats
    email: dbLead.email,
    phone: dbLead.phone,
    message: dbLead.message,
    source: dbLead.source,
    status: dbLead.status,
    assignedAgentId: dbLead.assigned_agent_id || dbLead.assignedAgentId,
    createdAt: dbLead.created_at || dbLead.createdAt,
    updatedAt: dbLead.updated_at || dbLead.updatedAt,
    notes: dbLead.notes
  };
}

export interface PartnerLeadMetadata {
  agencyName: string;
  agencyWebsite?: string | null;
  statesServed?: string | null;
  experienceLevel?: string | null;
  volumeEstimate?: string | null;
}

export interface PartnerLeadAdminNote {
  id: string;
  message: string;
  createdAt: string;
  createdBy?: string | null;
}

export interface PartnerLeadRecord extends Lead {
  agencyName: string;
  agencyWebsite?: string | null;
  statesServed?: string | null;
  experienceLevel?: string | null;
  volumeEstimate?: string | null;
  metadata?: PartnerLeadMetadata;
  adminNotes: PartnerLeadAdminNote[];
}

interface PartnerLeadNotesPayload {
  metadata?: PartnerLeadMetadata | null;
  adminNotes?: PartnerLeadAdminNote[] | null;
}

const parsePartnerLeadNotes = (raw: any): PartnerLeadNotesPayload => {
  if (!raw) {
    return {};
  }

  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed) {
      return {};
    }

    if (parsed.metadata || parsed.adminNotes) {
      return {
        metadata: parsed.metadata || undefined,
        adminNotes: Array.isArray(parsed.adminNotes) ? parsed.adminNotes : [],
      };
    }

    if (parsed.agencyName || parsed.agencyWebsite || parsed.statesServed) {
      return {
        metadata: parsed,
        adminNotes: [],
      };
    }

    return {};
  } catch (error) {
    console.warn('[Storage] Unable to parse partner lead notes payload:', error);
    return {};
  }
};

const buildPartnerLeadRecord = (row: any): PartnerLeadRecord => {
  const { metadata, adminNotes } = parsePartnerLeadNotes(row.notes);
  const normalizedMetadata = metadata || {
    agencyName: row.agencyName || row.agency_name || '',
    agencyWebsite: row.agencyWebsite || row.agency_website || null,
    statesServed: row.statesServed || row.states_served || null,
    experienceLevel: row.experienceLevel || row.experience_level || null,
    volumeEstimate: row.volumeEstimate || row.volume_estimate || null,
  };

  const agencyName = normalizedMetadata?.agencyName || `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Prospective partner';

  return {
    id: row.id,
    firstName: row.first_name || row.firstName,
    lastName: row.last_name || row.lastName,
    email: row.email,
    phone: row.phone,
    message: row.message,
    source: row.source,
    status: row.status,
    assignedAgentId: row.assigned_agent_id || row.assignedAgentId,
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
    notes: row.notes,
    agencyName,
    agencyWebsite: normalizedMetadata?.agencyWebsite || null,
    statesServed: normalizedMetadata?.statesServed || null,
    experienceLevel: normalizedMetadata?.experienceLevel || null,
    volumeEstimate: normalizedMetadata?.volumeEstimate || null,
    metadata: normalizedMetadata || undefined,
    adminNotes: adminNotes || [],
  };
};

export async function getAllLeads(statusFilter?: string, assignedAgentFilter?: string): Promise<Lead[]> {
  try {
    console.log('[Storage] Getting all leads with filters:', { statusFilter, assignedAgentFilter });

    // Use raw SQL to handle snake_case column names from database
    let query = `
      SELECT 
        id,
        first_name as "firstName",
        last_name as "lastName", 
        email,
        phone,
        message,
        source,
        status,
        assigned_agent_id as "assignedAgentId",
        created_at as "createdAt",
        updated_at as "updatedAt",
        notes
      FROM leads
    `;

    const conditions = [];
    const params: any[] = [];

    if (statusFilter && statusFilter !== 'all') {
      conditions.push(`status = $${params.length + 1}`);
      params.push(statusFilter);
    }

    if (assignedAgentFilter) {
      if (assignedAgentFilter === 'unassigned') {
        conditions.push('assigned_agent_id IS NULL');
      } else if (assignedAgentFilter !== 'all') {
        conditions.push(`assigned_agent_id::uuid = $${params.length + 1}::uuid`);
        params.push(assignedAgentFilter);
      }
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    const { data, error } = await supabase
      .rpc('execute_sql', {
        sql_query: query,
        params: params
      });

    if (error) {
      console.error('[Storage] Supabase error:', error);
      // Fallback to direct query
      let supabaseQuery = supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (statusFilter && statusFilter !== 'all') {
        supabaseQuery = supabaseQuery.eq('status', statusFilter);
      }

      if (assignedAgentFilter) {
        if (assignedAgentFilter === 'unassigned') {
          supabaseQuery = supabaseQuery.is('assigned_agent_id', null);
        } else if (assignedAgentFilter !== 'all') {
          supabaseQuery = supabaseQuery.eq('assigned_agent_id', assignedAgentFilter);
        }
      }

      const { data: fallbackData, error: fallbackError } = await supabaseQuery;

      if (fallbackError) {
        throw fallbackError;
      }

      // Map snake_case to camelCase
      const mappedData = (fallbackData || []).map(lead => ({
        id: lead.id,
        firstName: lead.first_name,
        lastName: lead.last_name,
        email: lead.email,
        phone: lead.phone,
        message: lead.message,
        source: lead.source,
        status: lead.status,
        assignedAgentId: lead.assigned_agent_id,
        createdAt: lead.created_at,
        updatedAt: lead.updated_at,
        notes: lead.notes
      }));

      console.log(`[Storage] Retrieved ${mappedData.length} leads from database (fallback)`);
      return mappedData;
    }

    console.log(`[Storage] Retrieved ${data?.length || 0} leads from database`);
    return data || [];
  } catch (error) {
    console.error('[Storage] Error fetching leads:', error);
    throw error;
  }
}

export async function getPartnerLeads(statusFilter?: string): Promise<PartnerLeadRecord[]> {
  try {
    let supabaseQuery = supabase
      .from('leads')
      .select('*')
      .eq('source', 'partner_lead')
      .order('created_at', { ascending: false });

    if (statusFilter && statusFilter !== 'all') {
      supabaseQuery = supabaseQuery.eq('status', statusFilter);
    }

    const { data, error } = await supabaseQuery;

    if (error) {
      console.error('[Storage] Failed to fetch partner leads:', error);
      throw new Error('Failed to fetch partner leads');
    }

    return (data || []).map(buildPartnerLeadRecord);
  } catch (error) {
    console.error('[Storage] Unexpected error fetching partner leads:', error);
    throw error instanceof Error ? error : new Error('Failed to fetch partner leads');
  }
}

export interface PartnerLeadUpdateInput {
  status?: string;
  adminNote?: string;
  assignedAgentId?: string | null;
  updatedBy?: string;
}

export async function updatePartnerLeadStatus(leadId: number, updates: PartnerLeadUpdateInput): Promise<PartnerLeadRecord> {
  if (!leadId || Number.isNaN(leadId)) {
    throw new Error('Valid lead ID is required');
  }

  const { data: existingLead, error: fetchError } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .eq('source', 'partner_lead')
    .maybeSingle();

  if (fetchError) {
    console.error('[Storage] Failed to load partner lead for update:', fetchError);
    throw new Error('Unable to load partner lead');
  }

  if (!existingLead) {
    throw new Error('Partner lead not found');
  }

  const currentNotes = parsePartnerLeadNotes(existingLead.notes);
  const updatedNotes: PartnerLeadNotesPayload = {
    metadata: currentNotes.metadata || undefined,
    adminNotes: currentNotes.adminNotes ? [...currentNotes.adminNotes] : [],
  };

  if (updates.adminNote && updates.adminNote.trim().length > 0) {
    updatedNotes.adminNotes = updatedNotes.adminNotes || [];
    updatedNotes.adminNotes.push({
      id: (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)),
      message: updates.adminNote.trim(),
      createdAt: new Date().toISOString(),
      createdBy: updates.updatedBy || null,
    });
  }

  const payload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.status) {
    payload.status = updates.status;
  }

  if (updates.assignedAgentId !== undefined) {
    payload.assigned_agent_id = updates.assignedAgentId;
  }

  payload.notes = JSON.stringify({
    metadata: updatedNotes.metadata || null,
    adminNotes: updatedNotes.adminNotes || [],
    updatedAt: new Date().toISOString(),
    updatedBy: updates.updatedBy || null,
  });

  const { data: updatedLead, error: updateError } = await supabase
    .from('leads')
    .update(payload)
    .eq('id', leadId)
    .eq('source', 'partner_lead')
    .select('*')
    .single();

  if (updateError) {
    console.error('[Storage] Failed to update partner lead:', updateError);
    throw new Error(updateError.message || 'Failed to update partner lead');
  }

  return buildPartnerLeadRecord(updatedLead);
}

// Agent operations
export async function getAgents(): Promise<User[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .ilike('role', 'agent%')
    .order('first_name', { ascending: true, nullsFirst: false })
    .order('last_name', { ascending: true, nullsFirst: false })
    .order('agent_number', { ascending: true, nullsFirst: false });

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
    const { users } = await getAllUsers(); // Use the corrected getAllUsers
    const allSubscriptions = await getActiveSubscriptions(); // Assuming this fetches all subscriptions, not just active
    const allPayments = await supabase.from('payments').select('*').eq('status', 'completed').then(res => res.data || []); // Fetch completed payments
    const allLeads = await getAllLeads(); // Use the corrected getAllLeads

    const activeSubscriptionsCount = allSubscriptions.length;
    const totalRevenue = allPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    const today = new Date();
    const monthlyRevenue = allPayments
      .filter(p =>
        new Date(p.created_at).getMonth() === today.getMonth() &&
        new Date(p.created_at).getFullYear() === today.getFullYear()
      )
      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    return {
      totalUsers: users.length,
      totalMembers: users.filter(u => u.role === 'member').length,
      activeSubscriptions: activeSubscriptionsCount,
      totalRevenue,
      monthlyRevenue,
      totalLeads: allLeads.length,
      convertedLeads: allLeads.filter(l => l.status === 'converted').length
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
    if (!enrollment.createdAt) return false;
    const enrollmentDate = new Date(enrollment.createdAt);
    return enrollmentDate >= startDate && enrollmentDate <= endDate;
  }).length;

  // Note: User type doesn't have subscriptionStatus or subscriptionAmount
  // These would need to be fetched from subscriptions table
  // For now, returning placeholder values
  const activeSubscriptions = 0; // TODO: Join with subscriptions table

  const monthlyRevenue = 0; // TODO: Join with subscriptions table

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
    .eq('status', 'active');

  if (error) {
    console.error('Error fetching plan breakdown:', error);
    throw new Error(`Failed to get plan breakdown: ${error.message}`);
  }

  const breakdown = data || [];
  const total = breakdown.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);

  return breakdown.map((item: any) => ({
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
  // NOTE: Removed admin skip - admins and super_admins can also enroll members and earn commissions
  // All roles with agent numbers can earn commissions

  // Insert commission into database (Supabase PostgreSQL)
  try {
    const result = await query(`
      INSERT INTO commissions (
        agent_id,
        agent_number,
        subscription_id,
        user_id,
        member_id,
        plan_name,
        plan_type,
        plan_tier,
        commission_amount,
        total_plan_cost,
        status,
        payment_status,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
      RETURNING *
    `, [
      commission.agentId,
      commission.agentNumber || 'HOUSE',
      commission.subscriptionId || null,
      commission.userId || null,     // For staff enrollments
      commission.memberId || null,   // For member enrollments
      commission.planName,
      commission.planType,
      commission.planTier,
      commission.commissionAmount,
      commission.totalPlanCost,
      commission.status || 'pending',
      commission.paymentStatus || 'unpaid'
    ]);

    console.log(`✅ Commission created in Neon database: $${commission.commissionAmount} for agent ${commission.agentId}`);
    return result.rows[0];
  } catch (error: any) {
    console.error('❌ Error creating commission in Neon:', error);
    throw new Error(`Failed to create commission: ${error.message}`);
  }
}

export async function getAgentCommissions(agentId: string, startDate?: string, endDate?: string): Promise<Commission[]> {
  try {
    let sql = `
      SELECT 
        c.id,
        c.agent_id,
        c.subscription_id,
        c.member_id,
        c.plan_name,
        c.plan_type,
        c.plan_tier,
        c.commission_amount,
        c.total_plan_cost,
        c.status,
        c.payment_status,
        c.paid_date,
        c.created_at,
        c.updated_at,
        m.first_name,
        m.last_name,
        m.email as member_email
      FROM agent_commissions c
      LEFT JOIN members m ON c.member_id = m.id
      WHERE c.agent_id = $1
    `;
    const params: any[] = [agentId];

    if (startDate && endDate) {
      sql += ' AND c.created_at >= $2 AND c.created_at <= $3';
      params.push(startDate, endDate);
    }

    sql += ' ORDER BY c.created_at DESC';

    const result = await query(sql, params);
    
    // Transform snake_case to camelCase for frontend
    return (result.rows || []).map(row => ({
      id: row.id,
      subscriptionId: row.subscription_id,
      userId: row.agent_id,
      userName: `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unknown',
      planName: row.plan_name,
      planType: row.plan_type,
      planTier: row.plan_tier,
      commissionAmount: parseFloat(row.commission_amount || 0),
      totalPlanCost: parseFloat(row.total_plan_cost || 0),
      status: row.status,
      paymentStatus: row.payment_status,
      paidDate: row.paid_date,
      createdAt: row.created_at
    }));
  } catch (error: any) {
    console.error('Error fetching agent commissions:', error);
    throw new Error(`Failed to get agent commissions: ${error.message}`);
  }
}

export async function getAllCommissions(startDate?: string, endDate?: string): Promise<Commission[]> {
  try {
    let sql = 'SELECT * FROM agent_commissions';
    const params: any[] = [];

    if (startDate && endDate) {
      sql += ' WHERE created_at >= $1 AND created_at <= $2';
      params.push(startDate, endDate);
    }

    sql += ' ORDER BY created_at DESC';

    const result = await query(sql, params);
    return result.rows || [];
  } catch (error: any) {
    console.error('Error fetching all commissions:', error);
    throw new Error(`Failed to get all commissions: ${error.message}`);
  }
}

export async function getCommissionBySubscriptionId(subscriptionId: number): Promise<Commission | undefined> {
  try {
    const result = await query(
      'SELECT * FROM agent_commissions WHERE subscription_id = $1 LIMIT 1',
      [subscriptionId]
    );
    
    if (result.rows.length === 0) return undefined;
    return result.rows[0];
  } catch (error: any) {
    console.error('Error fetching commission by subscription ID:', error);
    return undefined;
  }
}

// DEPRECATED: Old commissions table removed - use agent_commissions instead
export async function getCommissionByUserId(userId: string, agentId: string): Promise<Commission | undefined> {
  // Check agent_commissions table instead
  const { data, error } = await supabase
    .from('agent_commissions')
    .select('*')
    .eq('member_id', userId)
    .eq('agent_id', agentId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching commission by member and agent ID:', error);
    return undefined;
  }
  return data as any;
}

export async function getCommissionByMemberId(memberId: number): Promise<Commission | null> {
  try {
    console.log('[Storage] Looking up commission for member ID:', memberId);
    const result = await query(
      `SELECT * FROM agent_commissions 
       WHERE member_id = $1::text 
       AND payment_status IN ('unpaid', 'pending')
       ORDER BY created_at DESC 
       LIMIT 1`,
      [memberId]
    );
    
    if (!result.rows || result.rows.length === 0) {
      console.log('[Storage] No unpaid commission found for member:', memberId);
      return null;
    }
    
    const row = result.rows[0];
    console.log('[Storage] Found commission:', row.id, 'Amount:', row.commission_amount);
    return {
      id: row.id,
      agentId: row.agent_id,
      subscriptionId: row.subscription_id,
      memberId: row.member_id,
      planName: row.plan_name,
      planType: row.plan_type,
      planTier: row.plan_tier,
      commissionAmount: parseFloat(row.commission_amount),
      totalPlanCost: parseFloat(row.total_plan_cost),
      status: row.status,
      paymentStatus: row.payment_status,
      paidDate: row.paid_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  } catch (error: any) {
    console.error('[Storage] Error getting commission by member ID:', error);
    return null;
  }
}

export async function updateCommission(id: number, data: Partial<Commission>): Promise<Commission> {
  const { data: updatedCommission, error } = await supabase
    .from('agent_commissions')
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
  try {
    let sql = 'SELECT commission_amount, payment_status FROM agent_commissions';
    const params: any[] = [];

    if (agentId) {
      sql += ' WHERE agent_id = $1';
      params.push(agentId);
    }

    const result = await query(sql, params);
    const data = result.rows || [];

    let totalEarned = 0;
    let totalPending = 0;
    let totalPaid = 0;

    data.forEach(commission => {
      const amount = parseFloat(commission.commission_amount?.toString() || '0');
      if (commission.payment_status === 'paid') {
        totalPaid += amount;
        totalEarned += amount;
      } else if (commission.payment_status === 'unpaid' || commission.payment_status === 'pending') {
        totalPending += amount;
      }
    });

    return { 
      totalEarned: parseFloat(totalEarned.toFixed(2)), 
      totalPending: parseFloat(totalPending.toFixed(2)), 
      totalPaid: parseFloat(totalPaid.toFixed(2)) 
    };
  } catch (error: any) {
    console.error('Error fetching commission stats:', error);
    throw new Error(`Failed to get commission stats: ${error.message}`);
  }
}

// ========== NEW AGENT COMMISSIONS TABLE FUNCTIONS ==========
// Using the new agent_commissions table with clean schema

export async function getAgentCommissionsNew(agentId: string, startDate?: string, endDate?: string): Promise<any[]> {
  try {
    console.log('[Storage] Fetching commissions via Supabase for agent:', agentId);
    
    // First, get basic commissions data without complex joins to avoid foreign key issues
    let query = supabase
      .from('agent_commissions')
      .select('*')
      .eq('agent_id', agentId);

    if (startDate && endDate) {
      query = query.gte('created_at', startDate).lte('created_at', endDate);
    }

    const { data: commissions, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('[Storage] Supabase error fetching commissions:', error);
      throw error;
    }

    console.log('[Storage] Found', commissions?.length || 0, 'commissions');
    
    if (!commissions || commissions.length === 0) {
      return [];
    }

    // Get unique member IDs, agent IDs, and enrollment IDs for batch lookup
    const memberIds = [...new Set(commissions.map(c => c.member_id).filter(Boolean))];
    const agentIds = [...new Set(commissions.map(c => c.agent_id).filter(Boolean))];
    const enrollmentIds = [...new Set(commissions.map(c => c.enrollment_id).filter(Boolean))];

    // Batch fetch members data from members table (primary source for enrollees)
    const { data: members, error: membersError } = await supabase
      .from('members')
      .select('id, first_name, last_name, email, customer_number, coverage_type')
      .in('id', memberIds.map(id => parseInt(id)));

    if (membersError) {
      console.warn('[Storage] Could not fetch member details:', membersError);
    }

    // Batch fetch agents data from users table (agents/admins/super_admins)
    const { data: agents, error: agentsError } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, role, agent_number')
      .in('id', agentIds);

    if (agentsError) {
      console.warn('[Storage] Could not fetch agent details:', agentsError);
    }

    // Batch fetch subscription/enrollment data for plan info  
    const { data: enrollments, error: enrollmentsError } = await supabase
      .from('subscriptions')
      .select(`
        id,
        plan_id,
        member_id,
        user_id,
        plans:plans(name, tier)
      `)
      .in('id', enrollmentIds.map(id => parseInt(id)));

    if (enrollmentsError) {
      console.warn('[Storage] Could not fetch enrollment details:', enrollmentsError);
    }

    // Create lookup maps
    const membersMap = new Map(
      (members || [])
        .filter(m => m?.id !== undefined && m?.id !== null)
        .map(m => [m.id.toString(), m])
    );
    const agentsMap = new Map(
      (agents || [])
        .filter(a => a?.id !== undefined && a?.id !== null)
        .map(a => [a.id.toString(), a])
    );
    const enrollmentsMap = new Map(
      (enrollments || [])
        .filter(e => e?.id !== undefined && e?.id !== null)
        .map(e => [e.id.toString(), e])
    );

    console.log('[Storage] Sample raw commission:', {
      id: commissions[0].id,
      commission_amount: commissions[0].commission_amount,
      member_id: commissions[0].member_id,
      agent_id: commissions[0].agent_id
    });
    
    // Format for frontend - transform to match expected structure
    const formatted = commissions.map((commission: any) => {
      const memberKey = commission?.member_id !== undefined && commission?.member_id !== null
        ? commission.member_id.toString()
        : undefined;
      const enrollmentKey = commission?.enrollment_id !== undefined && commission?.enrollment_id !== null
        ? commission.enrollment_id.toString()
        : undefined;
      const agentKey = commission?.agent_id !== undefined && commission?.agent_id !== null
        ? commission.agent_id.toString()
        : undefined;

      const member = memberKey ? membersMap.get(memberKey) : undefined;
      const agent = agentKey ? agentsMap.get(agentKey) : undefined;
      const enrollment = enrollmentKey ? enrollmentsMap.get(enrollmentKey) : undefined;
      const plan = enrollment?.plans;

      // Build plan display name (e.g., "MPP Base - Member Only", "MPP Plus - Member/Child")
      const planTier = plan?.tier || 'Base';
      const planName = plan?.name || 'MyPremierPlan';
      const coverageType = member?.coverage_type || 'Member Only';
      const planDisplay = `${planTier} - ${coverageType}`;

      return {
        id: commission.id,
        agentId: commission.agent_id,
        agentNumber: commission.agent_number || agent?.agent_number || 'N/A',
        memberId: commission.member_id,
        membershipId: member?.customer_number || commission.member_id, // Use customer_number as membership ID
        enrollmentId: commission.enrollment_id,
        commissionAmount: parseFloat(commission.commission_amount || 0),
        coverageType: commission.coverage_type || 'other',
        status: commission.status || 'pending',
        paymentStatus: commission.payment_status || 'unpaid',
        // Map member data from lookup
        totalPlanCost: parseFloat(commission.base_premium || 0),
        userName: member?.first_name && member?.last_name 
          ? `${member.first_name} ${member.last_name} (${member.customer_number || commission.member_id})` 
          : member?.email || `Member ${commission.member_id}`,
        planTier: planTier,
        planType: coverageType,
        planName: planDisplay, // Full plan display: "MPP Base - Member Only"
        notes: commission.notes || '',
        createdAt: commission.created_at,
        updatedAt: commission.updated_at,
        paymentDate: commission.paid_date,
        // Additional fields for display
        memberEmail: member?.email || '',
        firstName: member?.first_name || '',
        lastName: member?.last_name || '',
        planPrice: parseFloat(commission.base_premium || 0),
        // Agent info
        agentEmail: agent?.email || '',
        agentName: agent?.first_name && agent?.last_name 
          ? `${agent.first_name} ${agent.last_name}` 
          : agent?.email || 'Unknown Agent'
      };
    });
    
    if (formatted.length > 0) {
      console.log('[Storage] Sample formatted commission:', {
        id: formatted[0].id,
        commissionAmount: formatted[0].commissionAmount,
        userName: formatted[0].userName,
        memberEmail: formatted[0].memberEmail
      });
    }
    return formatted;
  } catch (error: any) {
    console.error('[Storage] Error in getAgentCommissionsNew:', error);
    throw new Error(`Failed to get agent commissions: ${error.message}`);
  }
}

export async function getAllCommissionsNew(startDate?: string, endDate?: string): Promise<any[]> {
  try {
    console.log('[Storage] Fetching all commissions from agent_commissions table');
    
    let query = supabase
      .from('agent_commissions')
      .select('*');

    if (startDate && endDate) {
      query = query.gte('created_at', startDate).lte('created_at', endDate);
    }

    const { data: commissions, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('[Storage] Error fetching all commissions:', error);
      throw new Error(`Failed to get all commissions: ${error.message}`);
    }

    console.log('[Storage] Found', commissions?.length || 0, 'total commissions');
    
    if (!commissions || commissions.length === 0) {
      return [];
    }

    // Get unique member IDs, agent IDs, and enrollment IDs for batch lookup
    const memberIds = [...new Set(commissions.map(c => c.member_id).filter(Boolean))];
    const agentIds = [...new Set(commissions.map(c => c.agent_id).filter(Boolean))];
    const enrollmentIds = [...new Set(commissions.map(c => c.enrollment_id).filter(Boolean))];

    // Batch fetch members data from members table (primary source for enrollees)
    const { data: members, error: membersError } = await supabase
      .from('members')
      .select('id, first_name, last_name, email, customer_number, coverage_type')
      .in('id', memberIds.map(id => parseInt(id)));

    if (membersError) {
      console.warn('[Storage] Could not fetch member details:', membersError);
    }

    // Batch fetch agents data from users table (agents/admins/super_admins)
    const { data: agents, error: agentsError } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, role, agent_number')
      .in('id', agentIds);

    if (agentsError) {
      console.warn('[Storage] Could not fetch agent details:', agentsError);
    }

    // Batch fetch subscription/enrollment data for plan info
    const { data: enrollments, error: enrollmentsError } = await supabase
      .from('subscriptions')
      .select(`
        id,
        plan_id,
        member_id,
        user_id,
        plans:plans(name, tier)
      `)
      .in('id', enrollmentIds.map(id => parseInt(id)));

    if (enrollmentsError) {
      console.warn('[Storage] Could not fetch enrollment details:', enrollmentsError);
    }

    // Create lookup maps
    const membersMap = new Map((members || []).map(m => [m.id.toString(), m]));
    const agentsMap = new Map((agents || []).map(a => [a.id, a]));
    const enrollmentsMap = new Map((enrollments || []).map(e => [e.id.toString(), e]));
    
    // Format for frontend - enhanced for admin view
    const formatted = commissions.map(commission => {
      const member = membersMap.get(commission.member_id);
      const agent = agentsMap.get(commission.agent_id);
      const enrollment = enrollmentsMap.get(commission.enrollment_id);
      const plan = enrollment?.plans;

      // Build plan display name (e.g., "MPP Base - Member Only", "MPP Plus - Member/Child")
      const planTier = plan?.tier || 'Base';
      const planName = plan?.name || 'MyPremierPlan';
      const coverageType = member?.coverage_type || 'Member Only';
      const planDisplay = `${planTier} - ${coverageType}`;

      return {
        id: commission.id,
        agentId: commission.agent_id,
        agentNumber: commission.agent_number || agent?.agent_number || 'N/A',
        memberId: commission.member_id,
        membershipId: member?.customer_number || commission.member_id,
        enrollmentId: commission.enrollment_id,
        commissionAmount: parseFloat(commission.commission_amount || 0),
        coverageType: commission.coverage_type || 'other',
        status: commission.status || 'pending',
        paymentStatus: commission.payment_status || 'unpaid',
        basePremium: parseFloat(commission.base_premium || 0),
        notes: commission.notes || '',
        createdAt: commission.created_at,
        updatedAt: commission.updated_at,
        paymentDate: commission.paid_date,
        // Member information
        memberEmail: member?.email || '',
        memberName: member?.first_name && member?.last_name 
          ? `${member.first_name} ${member.last_name} (${member.customer_number || commission.member_id})` 
          : member?.email || `Member ${commission.member_id}`,
        memberFirstName: member?.first_name || '',
        memberLastName: member?.last_name || '',
        // Agent information
        agentEmail: agent?.email || '',
        agentName: agent?.first_name && agent?.last_name 
          ? `${agent.first_name} ${agent.last_name}` 
          : agent?.email || 'Unknown Agent',
        agentFirstName: agent?.first_name || '',
        agentLastName: agent?.last_name || '',
        // Plan information
        planTier: planTier,
        planType: coverageType,
        planName: planDisplay, // Full plan display: "MPP Base - Member Only"
        planPrice: parseFloat(commission.base_premium || 0),
        totalPlanCost: parseFloat(commission.base_premium || 0),
        userName: member?.first_name && member?.last_name 
          ? `${member.first_name} ${member.last_name} (${member.customer_number || commission.member_id})` 
          : member?.email || `Member ${commission.member_id}`
      };
    });

    console.log('[Storage] Sample formatted admin commission:', {
      id: formatted[0]?.id,
      commissionAmount: formatted[0]?.commissionAmount,
      agentName: formatted[0]?.agentName,
      memberName: formatted[0]?.memberName
    });

    return formatted;
  } catch (error: any) {
    console.error('[Storage] Error in getAllCommissionsNew:', error);
    throw new Error(`Failed to get all commissions: ${error.message}`);
  }
}

export async function markCommissionsAsPaid(commissionIds: string[], paymentDate?: string): Promise<void> {
  try {
    console.log('[Storage] markCommissionsAsPaid - Input:', { 
      commissionIds, 
      paymentDate,
      idsType: typeof commissionIds,
      firstIdType: typeof commissionIds[0]
    });

    // Convert string IDs to integers for database query
    const intIds = commissionIds.map(id => {
      const parsed = parseInt(id, 10);
      if (isNaN(parsed)) {
        throw new Error(`Invalid commission ID: ${id}`);
      }
      return parsed;
    });
    
    console.log('[Storage] Converted IDs:', intIds);

    const updateData = {
      payment_status: 'paid',
      paid_date: paymentDate || new Date().toISOString()
    };

    console.log('[Storage] Update payload:', updateData);
    
    const { data, error } = await supabase
      .from('agent_commissions')
      .update(updateData)
      .in('id', intIds)
      .select();

    if (error) {
      console.error('[Storage] Supabase error:', error);
      throw new Error(`Failed to mark commissions as paid: ${error.message}`);
    }

    console.log(`[Storage] Marked ${commissionIds.length} commission(s) as paid, updated ${data?.length || 0} rows`);
  } catch (error: any) {
    console.error('[Storage] Error in markCommissionsAsPaid:', error);
    throw new Error(`Failed to mark commissions as paid: ${error.message}`);
  }
}

export async function updateCommissionPayoutStatus(
  commissionId: string,
  payoutData: {
    paymentStatus: 'paid' | 'pending' | 'unpaid';
    paymentDate?: string;
    notes?: string;
  }
): Promise<any> {
  try {
    console.log('[Storage] Updating commission payout status:', commissionId, payoutData);

    const updatePayload: any = {
      payment_status: payoutData.paymentStatus,
      updated_at: new Date().toISOString()
    };

    // If marking as paid, set the payment date
    if (payoutData.paymentStatus === 'paid') {
      updatePayload.paid_date = payoutData.paymentDate || new Date().toISOString();
    }

    // Add notes if provided
    if (payoutData.notes) {
      updatePayload.notes = payoutData.notes;
    }

    const { data, error } = await supabase
      .from('agent_commissions')
      .update(updatePayload)
      .eq('id', commissionId)
      .select();

    if (error) {
      throw new Error(`Failed to update commission payout status: ${error.message}`);
    }

    console.log('[Storage] Commission payout status updated successfully');
    return data?.[0] || null;
  } catch (error: any) {
    console.error('[Storage] Error in updateCommissionPayoutStatus:', error);
    throw new Error(`Failed to update commission payout status: ${error.message}`);
  }
}

export async function updateMultipleCommissionPayouts(
  updates: Array<{
    commissionId: string;
    paymentStatus: 'paid' | 'pending' | 'unpaid';
    paymentDate?: string;
  }>
): Promise<void> {
  try {
    console.log('[Storage] Batch updating commission payouts for', updates.length, 'commissions');

    // Process updates in batches of 100 to avoid hitting rate limits
    const batchSize = 100;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);

      // Update each commission individually (Supabase doesn't support batch conditional updates)
      await Promise.all(
        batch.map(update => {
          const updatePayload: any = {
            payment_status: update.paymentStatus,
            updated_at: new Date().toISOString()
          };

          if (update.paymentStatus === 'paid') {
            updatePayload.paid_date = update.paymentDate || new Date().toISOString();
          }

          return supabase
            .from('agent_commissions')
            .update(updatePayload)
            .eq('id', update.commissionId);
        })
      );
    }

    console.log('[Storage] Batch payout update completed');
  } catch (error: any) {
    console.error('[Storage] Error in updateMultipleCommissionPayouts:', error);
    throw new Error(`Failed to batch update commission payouts: ${error.message}`);
  }
}

export async function getCommissionsForPayout(
  agentId?: string,
  paymentStatus?: string,
  minAmount?: number
): Promise<any[]> {
  try {
    console.log('[Storage] Fetching commissions for payout:', { agentId, paymentStatus, minAmount });

    let query = supabase
      .from('agent_commissions')
      .select(`
        id,
        agent_id,
        member_id,
        enrollment_id,
        commission_amount,
        coverage_type,
        status,
        payment_status,
        paid_date,
        created_at,
        updated_at,
        base_premium,
        notes
      `);

    if (agentId) {
      query = query.eq('agent_id', agentId);
    }

    if (paymentStatus) {
      query = query.eq('payment_status', paymentStatus);
    }

    const { data: commissions, error } = await query.order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get commissions for payout: ${error.message}`);
    }

    // Filter by minimum amount if specified
    let filtered = commissions || [];
    if (minAmount) {
      filtered = filtered.filter(c => parseFloat(c.commission_amount || '0') >= minAmount);
    }

    // Get agent and member details
    const agentIds = [...new Set(filtered.map((c: any) => c.agent_id).filter(Boolean))];
    const memberIds = [...new Set(filtered.map((c: any) => c.member_id).filter(Boolean))];

    const { data: agents } = await supabase
      .from('users')
      .select('id, first_name, last_name, email')
      .in('id', agentIds);

    const { data: members } = await supabase
      .from('users')
      .select('id, first_name, last_name, email')
      .in('id', memberIds);

    const agentsMap = new Map(agents?.map(a => [a.id, a]) || []);
    const membersMap = new Map(members?.map(m => [m.id, m]) || []);

    // Enhance with agent and member details
    const enhanced = filtered.map((commission: any) => {
      const agent = agentsMap.get(commission.agent_id);
      const member = membersMap.get(commission.member_id);

      return {
        ...commission,
        commissionAmount: parseFloat(commission.commission_amount || '0'),
        agentName: agent?.first_name && agent?.last_name 
          ? `${agent.first_name} ${agent.last_name}` 
          : agent?.email || 'Unknown',
        agentEmail: agent?.email || '',
        memberName: member?.first_name && member?.last_name 
          ? `${member.first_name} ${member.last_name}` 
          : member?.email || 'Unknown',
        memberEmail: member?.email || '',
        formattedAmount: `$${parseFloat(commission.commission_amount || '0').toFixed(2)}`,
        isPaid: commission.payment_status === 'paid'
      };
    });

    console.log('[Storage] Found', enhanced.length, 'commissions for payout');
    return enhanced;
  } catch (error: any) {
    console.error('[Storage] Error in getCommissionsForPayout:', error);
    throw new Error(`Failed to get commissions for payout: ${error.message}`);
  }
}

export async function markCommissionPaymentCaptured(
  memberId: string, 
  paymentIntentId: string,
  transactionId?: string
): Promise<void> {
  try {
    // Calculate eligible payout date (14 days from now)
    const capturedAt = new Date();
    const eligibleDate = new Date(capturedAt);
    eligibleDate.setDate(eligibleDate.getDate() + 14);

    const { error} = await supabase
      .from('agent_commissions')
      .update({
        payment_captured: true,
        payment_intent_id: paymentIntentId,
        payment_captured_at: capturedAt.toISOString(),
        eligible_for_payout_at: eligibleDate.toISOString(),
        status: 'approved', // Move from pending to approved once payment captured
        updated_at: new Date().toISOString()
      })
      .eq('member_id', memberId)
      .eq('payment_captured', false); // Only update if not already captured

    if (error) {
      console.error('[Storage] Error marking commission payment as captured:', error);
      throw new Error(`Failed to mark commission payment as captured: ${error.message}`);
    }

    console.log(`[Storage] ✅ Commission payment captured for member ${memberId}, eligible for payout on ${eligibleDate.toISOString().split('T')[0]}`);
  } catch (error: any) {
    console.error('[Storage] Error in markCommissionPaymentCaptured:', error);
    throw new Error(`Failed to mark commission payment as captured: ${error.message}`);
  }
}

export async function clawbackCommission(
  commissionId: string,
  reason: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('agent_commissions')
      .update({
        is_clawed_back: true,
        clawback_reason: reason,
        clawback_date: new Date().toISOString(),
        payment_status: 'unpaid', // Revert to unpaid
        status: 'cancelled', // Mark as cancelled
        updated_at: new Date().toISOString()
      })
      .eq('id', commissionId);

    if (error) {
      throw new Error(`Failed to clawback commission: ${error.message}`);
    }

    console.log(`[Storage] ⚠️  Commission ${commissionId} clawed back: ${reason}`);
  } catch (error: any) {
    console.error('[Storage] Error in clawbackCommission:', error);
    throw new Error(`Failed to clawback commission: ${error.message}`);
  }
}

export async function getAgentHierarchy(): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select(`
        id,
        email,
        role,
        first_name,
        last_name,
        agent_number,
        upline_agent_id,
        override_commission_rate,
        hierarchy_level,
        can_receive_overrides,
        upline:upline_agent_id(email)
      `)
      .ilike('role', 'agent%')
      .order('hierarchy_level', { ascending: true })
      .order('agent_number', { ascending: true });

    if (error) {
      throw new Error(`Failed to get agent hierarchy: ${error.message}`);
    }

    // Get downline counts for each agent
    const agentsWithCounts = await Promise.all((data || []).map(async (agent) => {
      const { count } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('upline_agent_id', agent.id)
        .ilike('role', 'agent%');

      return {
        id: agent.id,
        email: agent.email,
        firstName: agent.first_name,
        lastName: agent.last_name,
        agentNumber: agent.agent_number,
        uplineAgentId: agent.upline_agent_id,
        uplineEmail: agent.upline?.email,
        overrideCommissionRate: parseFloat(agent.override_commission_rate || '0'),
        hierarchyLevel: agent.hierarchy_level || 0,
        canReceiveOverrides: agent.can_receive_overrides || false,
        downlineCount: count || 0
      };
    }));

    return agentsWithCounts;
  } catch (error: any) {
    console.error('[Storage] Error in getAgentHierarchy:', error);
    throw new Error(`Failed to get agent hierarchy: ${error.message}`);
  }
}

export async function updateAgentHierarchy(
  agentId: string,
  uplineId: string | null,
  overrideAmount: number,
  changedBy: string,
  reason?: string
): Promise<void> {
  try {
    // Get current upline for history
    const { data: currentAgent } = await supabase
      .from('users')
      .select('upline_agent_id')
      .eq('id', agentId)
      .single();

    // Update agent upline and override rate
    const { error: updateError } = await supabase
      .from('users')
      .update({
        upline_agent_id: uplineId,
        override_commission_rate: overrideAmount,
        can_receive_overrides: !!uplineId // Can receive overrides if has upline
      })
      .eq('id', agentId);

    if (updateError) {
      throw new Error(`Failed to update agent hierarchy: ${updateError.message}`);
    }

    // Record hierarchy change in history
    const { error: historyError } = await supabase
      .from('agent_hierarchy_history')
      .insert({
        agent_id: agentId,
        previous_upline_id: currentAgent?.upline_agent_id,
        new_upline_id: uplineId,
        changed_by_admin_id: changedBy,
        reason: reason || 'Manual update'
      });

    if (historyError) {
      console.error('[Storage] Error recording hierarchy history:', historyError);
      // Don't fail the update if history recording fails
    }

    console.log(`[Storage] ✅ Updated agent hierarchy for ${agentId}, new upline: ${uplineId || 'none'}, override: $${overrideAmount}`);
  } catch (error: any) {
    console.error('[Storage] Error in updateAgentHierarchy:', error);
    throw new Error(`Failed to update agent hierarchy: ${error.message}`);
  }
}

export async function getCommissionTotals(agentId?: string): Promise<{
  mtd: { earned: number; paid: number; pending: number };
  ytd: { earned: number; paid: number; pending: number };
  lifetime: { earned: number; paid: number; pending: number };
  byAgent?: Array<{ agentId: string; agentName: string; mtd: number; ytd: number; lifetime: number }>;
}> {
  try {
    console.log('[Storage] Calculating commission totals for agent:', agentId);

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // First day of current month
    const mtdStart = new Date(currentYear, currentMonth, 1).toISOString();
    // First day of current year
    const ytdStart = new Date(currentYear, 0, 1).toISOString();
    // Today
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    let query = supabase
      .from('agent_commissions')
      .select('commission_amount, payment_status, created_at, agent_id');

    if (agentId) {
      query = query.eq('agent_id', agentId);
    }

    const { data: allCommissions, error } = await query;

    if (error) {
      throw new Error(`Failed to get commission totals: ${error.message}`);
    }

    // Helper to calculate totals from commissions array
    const calculateTotals = (commissions: any[]) => {
      let earned = 0;
      let paid = 0;
      let pending = 0;

      commissions.forEach((commission: any) => {
        const amount = parseFloat(commission.commission_amount?.toString() || '0');
        earned += amount;
        
        if (commission.payment_status === 'paid') {
          paid += amount;
        } else {
          pending += amount;
        }
      });

      return {
        earned: parseFloat(earned.toFixed(2)),
        paid: parseFloat(paid.toFixed(2)),
        pending: parseFloat(pending.toFixed(2))
      };
    };

    // Filter commissions by date range
    const mtdCommissions = (allCommissions || []).filter((c: any) => 
      new Date(c.created_at) >= new Date(mtdStart) && new Date(c.created_at) <= new Date(today)
    );

    const ytdCommissions = (allCommissions || []).filter((c: any) =>
      new Date(c.created_at) >= new Date(ytdStart) && new Date(c.created_at) <= new Date(today)
    );

    console.log('[Storage] MTD commissions:', mtdCommissions.length, 'YTD commissions:', ytdCommissions.length);

    const result: any = {
      mtd: calculateTotals(mtdCommissions),
      ytd: calculateTotals(ytdCommissions),
      lifetime: calculateTotals(allCommissions || [])
    };

    // If no specific agent requested, also get breakdown by agent
    if (!agentId && allCommissions && allCommissions.length > 0) {
      // Get unique agent IDs
      const agentIds = [...new Set((allCommissions || []).map(c => c.agent_id).filter(Boolean))];

      // Fetch agent details
      const { data: agents } = await supabase
        .from('users')
        .select('id, first_name, last_name')
        .in('id', agentIds);

      const agentsMap = new Map(agents?.map(a => [a.id, a]) || []);

      // Calculate totals per agent
      result.byAgent = agentIds.map(aid => {
        const agentCommissions = (allCommissions || []).filter(c => c.agent_id === aid);
        const agent = agentsMap.get(aid);
        const agentName = agent?.first_name && agent?.last_name 
          ? `${agent.first_name} ${agent.last_name}` 
          : `Agent ${aid}`;

        const mtdTotal = calculateTotals(
          agentCommissions.filter((c: any) => 
            new Date(c.created_at) >= new Date(mtdStart) && new Date(c.created_at) <= new Date(today)
          )
        );

        const ytdTotal = calculateTotals(
          agentCommissions.filter((c: any) =>
            new Date(c.created_at) >= new Date(ytdStart) && new Date(c.created_at) <= new Date(today)
          )
        );

        const lifetimeTotal = calculateTotals(agentCommissions);

        return {
          agentId: aid,
          agentName,
          mtd: mtdTotal.earned,
          ytd: ytdTotal.earned,
          lifetime: lifetimeTotal.earned
        };
      }).sort((a, b) => b.lifetime - a.lifetime); // Sort by lifetime earnings descending
    }

    console.log('[Storage] Commission totals calculated:', {
      mtd: result.mtd.earned,
      ytd: result.ytd.earned,
      lifetime: result.lifetime.earned
    });

    return result;
  } catch (error: any) {
    console.error('[Storage] Error calculating commission totals:', error);
    throw new Error(`Failed to get commission totals: ${error.message}`);
  }
}

export async function getCommissionStatsNew(agentId?: string): Promise<{ 
  totalEarned: number; 
  totalPending: number; 
  totalPaid: number;
  byStatus: Record<string, number>;
  byPaymentStatus: Record<string, number>;
}> {
  try {
    let query = supabase.from('agent_commissions').select('commission_amount, status, payment_status');

    if (agentId) {
      query = query.eq('agent_id', agentId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get commission stats: ${error.message}`);
    }

    let totalEarned = 0;
    let totalPending = 0;
    let totalPaid = 0;
    const byStatus: Record<string, number> = {};
    const byPaymentStatus: Record<string, number> = {};

    (data || []).forEach((commission: any) => {
      const amount = parseFloat(commission.commission_amount?.toString() || '0');
      
      // Add to totalEarned (all commissions regardless of payment status)
      totalEarned += amount;
      
      // Separate paid vs pending
      if (commission.payment_status === 'paid') {
        totalPaid += amount;
      } else {
        totalPending += amount;
      }

      // Count by status
      byStatus[commission.status] = (byStatus[commission.status] || 0) + 1;
      byPaymentStatus[commission.payment_status] = (byPaymentStatus[commission.payment_status] || 0) + 1;
    });

    return { 
      totalEarned: parseFloat(totalEarned.toFixed(2)), 
      totalPending: parseFloat(totalPending.toFixed(2)), 
      totalPaid: parseFloat(totalPaid.toFixed(2)),
      byStatus,
      byPaymentStatus
    };
  } catch (error: any) {
    console.error('Error fetching commission stats (new table):', error);
    throw new Error(`Failed to get commission stats: ${error.message}`);
  }
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
    createdAt: data.created_at || data.createdAt,
    updatedAt: data.updated_at || data.updatedAt
  } as Plan;
}

// Plan operations (add missing ones from original Drizzle implementation)
export async function getPlans(): Promise<Plan[]> {
  try {
    console.log('[Storage] getPlans called');
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .order('price', { ascending: true });
    console.log('[Storage] getPlans Supabase response:', { dataCount: data?.length || 0, error: error ? error.message : 'none' });
    if (error) {
      console.error('[Storage] getPlans error:', error);
      console.error('[Storage] getPlans error details:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });
      throw new Error(`Failed to get plans: ${error.message}`);
    }
    console.log('[Storage] getPlans: Mapping data for', data?.length || 0, 'plans');
    const mappedPlans = (data || []).map(mapPlanFromDB).filter(Boolean) as Plan[];
    console.log('[Storage] getPlans: Successfully mapped', mappedPlans.length, 'plans');
    if (mappedPlans.length > 0) {
      console.log('[Storage] getPlans: Sample plan:', {
        id: mappedPlans[0].id,
        name: mappedPlans[0].name,
        price: mappedPlans[0].price,
        isActive: mappedPlans[0].isActive
      });
    }
    return mappedPlans;
  } catch (error: any) {
    console.error('[Storage] getPlans fatal error:', error);
    console.error('[Storage] getPlans error stack:', error.stack);
    throw new Error(`Failed to get plans: ${error.message}`);
  }
}

export async function getActivePlans(): Promise<Plan[]> {
  try {
    const result = await query(
      'SELECT * FROM plans WHERE is_active = true ORDER BY price ASC'
    );
    return (result.rows || []).map(mapPlanFromDB).filter(Boolean) as Plan[];
  } catch (error: any) {
    console.error('Error fetching active plans:', error);
    throw new Error(`Failed to get active plans: ${error.message}`);
  }
}

export async function getPlanById(id: string): Promise<Plan | undefined> {
  try {
    const result = await query(
      'SELECT * FROM plans WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) return undefined;
    return mapPlanFromDB(result.rows[0]) || undefined;
  } catch (error: any) {
    console.error('Error fetching plan:', error);
    return undefined;
  }
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

// Payment operations

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
    await supabase.from('agent_commissions').delete().neq('id', '00000000-0000-0000-0000-000000000000');

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
export async function createPayment(paymentData: {
  userId?: string | null; // Agent/admin user ID (for commission tracking)
  memberId?: number | string | null; // Member ID (for billing/plan management)
  subscriptionId?: string | null;
  amount: string;
  currency?: string;
  status: string;
  paymentMethod: string;
  transactionId?: string;
  authorizationCode?: string;
  epxAuthGuid?: string | null;
  metadata?: Record<string, any>;
}): Promise<any> {
  console.log('[Storage] Creating payment record at', new Date().toISOString(), ':', {
    userId: paymentData.userId,
    memberId: paymentData.memberId,
    amount: paymentData.amount,
    status: paymentData.status,
    paymentMethod: paymentData.paymentMethod,
    transactionId: paymentData.transactionId,
    hasMetadata: !!paymentData.metadata
  });

  try {
    // Use direct PostgreSQL query to Neon - no more Supabase schema cache issues!
    const insertQuery = `
      INSERT INTO payments (
        user_id,
        member_id,
        amount,
        status,
        currency,
        payment_method,
        epx_auth_guid,
        transaction_id,
        subscription_id,
        metadata,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()
      )
      RETURNING *;
    `;

    const values = [
      paymentData.userId || null,
      paymentData.memberId || null,
      paymentData.amount,
      paymentData.status,
      paymentData.currency || 'USD',
      paymentData.paymentMethod || 'card',
      paymentData.epxAuthGuid || null,
      paymentData.transactionId || null,
      paymentData.subscriptionId || null,
      paymentData.metadata ? JSON.stringify(paymentData.metadata) : null
    ];

    console.log('[Storage] Executing direct SQL insert to Neon database');
    const result = await query(insertQuery, values);

    if (!result.rows || result.rows.length === 0) {
      throw new Error('Payment creation failed - no data returned');
    }

    const createdPayment = result.rows[0];
    console.log('[Storage] Payment created successfully in Neon:', createdPayment.id);

    return createdPayment;

  } catch (error: any) {
    console.error('[Storage] Payment creation exception:', {
      message: error.message,
      stack: error.stack,
      paymentData
    });
    throw error;
  }
}

export async function getUserPayments(userId: string): Promise<Payment[]> {
  try {
    // Use direct Neon query instead of Supabase
    const result = await query(
      'SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows || [];
  } catch (error: any) {
    console.error('Error fetching user payments:', error);
    throw new Error(`Failed to get user payments: ${error.message}`);
  }
}

export async function getPaymentById(id: number): Promise<Payment | undefined> {
  try {
    const result = await query(
      'SELECT * FROM payments WHERE id = $1 LIMIT 1',
      [id]
    );
    return result.rows[0] || undefined;
  } catch (error: any) {
    console.error('Error fetching payment by ID:', error);
    return undefined;
  }
}

export async function getPaymentByTransactionId(transactionId: string): Promise<Payment | undefined> {
  try {
    // Use direct Neon query instead of Supabase. Match either the stored transaction_id
    // or the original hosted checkout order number persisted in metadata.
    const result = await query(
      `
        SELECT *
        FROM payments
        WHERE transaction_id = $1
           OR (metadata->>'orderNumber') = $1
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [transactionId]
    );
    return result.rows[0] || undefined;
  } catch (error: any) {
    console.error('Error fetching payment by transaction ID:', error);
    return undefined;
  }
}

export async function getLatestPaymentWithAuthGuid(memberId: number): Promise<Payment | undefined> {
  try {
    const result = await query(
      'SELECT * FROM payments WHERE member_id = $1 AND epx_auth_guid IS NOT NULL ORDER BY created_at DESC LIMIT 1',
      [memberId]
    );
    return result.rows[0] || undefined;
  } catch (error: any) {
    console.error('Error fetching latest payment with auth GUID:', error);
    return undefined;
  }
}

export async function updatePayment(id: number, updates: Partial<Payment>): Promise<Payment> {
  try {
    // Map camelCase to snake_case for database columns
    const fieldMapping: Record<string, string> = {
      userId: 'user_id',
      memberId: 'member_id',
      subscriptionId: 'subscription_id',
      paymentMethod: 'payment_method',
      transactionId: 'transaction_id',
      authorizationCode: 'authorization_code',
      epxAuthGuid: 'epx_auth_guid',
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    };

    // Build UPDATE query dynamically for Neon
    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = fields.map((field, index) => {
      // Convert camelCase to snake_case
      const dbField = fieldMapping[field] || field;
      // Special handling for metadata - convert to JSON
      if (field === 'metadata') {
        return `${dbField} = $${index + 2}::jsonb`;
      }
      return `${dbField} = $${index + 2}`;
    }).join(', ');

    // Convert metadata to JSON string if present
    const processedValues = values.map((value, index) => {
      if (fields[index] === 'metadata' && typeof value === 'object') {
        return JSON.stringify(value);
      }
      return value;
    });

    const updateQuery = `
      UPDATE payments 
      SET ${setClause}, updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;

    const result = await query(updateQuery, [id, ...processedValues]);

    if (!result.rows || result.rows.length === 0) {
      throw new Error('Payment not found');
    }

    return result.rows[0];
  } catch (error: any) {
    console.error('Error updating payment:', error);
    throw new Error(`Failed to update payment: ${error.message}`);
  }
}

// Adding a placeholder for SupabaseStorage and its export
// Storage object with existing functions and necessary stubs
// Missing function that was referenced in debug-payments.ts
export async function getPaymentsWithFilters(filters: { limit?: number; offset?: number; status?: string; environment?: string } = {}): Promise<Payment[]> {
  let query = supabase
    .from('payments')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  if (filters.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
  }

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  if (filters.environment) {
    query = query.eq('metadata->environment', filters.environment);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching payments with filters:', error);
    throw new Error(`Failed to get payments: ${error.message}`);
  }

  return data || [];
}

export async function getRecentPaymentsDetailed(options: { limit?: number; status?: string } = {}): Promise<any[]> {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 200);
  const values: any[] = [];
  const whereClauses: string[] = [];

  if (options.status) {
    values.push(options.status);
    whereClauses.push(`p.status = $${values.length}`);
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const sql = `
    SELECT
      p.*,
      m.first_name AS member_first_name,
      m.last_name AS member_last_name,
      m.email AS member_email,
      m.customer_number AS member_customer_number
    FROM payments p
    LEFT JOIN members m ON p.member_id = m.id
    ${whereSql}
    ORDER BY p.created_at DESC
    LIMIT ${limit}
  `;

  const result = await query(sql, values);
  return result.rows || [];
}

export type DiscountValueType = 'fixed' | 'percentage';
export type DiscountDurationType = 'once' | 'limited_months' | 'indefinite';

export interface DiscountCodeRecord {
  id: string;
  code: string;
  description: string;
  discountType: DiscountValueType;
  discountValue: number;
  durationType: DiscountDurationType;
  durationMonths: number | null;
  isActive: boolean;
  maxUses: number | null;
  currentUses: number;
  validFrom: string | null;
  validUntil: string | null;
  createdAt: string | null;
  createdBy: string | null;
  updatedAt: string | null;
}

function mapDiscountCode(record: any): DiscountCodeRecord {
  if (!record) {
    throw new Error('[Storage] Discount code record not found');
  }

  return {
    id: record.id,
    code: record.code,
    description: record.description,
    discountType: record.discount_type ?? record.discountType,
    discountValue: Number(record.discount_value ?? record.discountValue ?? 0),
    durationType: record.duration_type ?? record.durationType,
    durationMonths: record.duration_months ?? record.durationMonths ?? null,
    isActive: record.is_active ?? record.isActive ?? true,
    maxUses: record.max_uses ?? record.maxUses ?? null,
    currentUses: record.current_uses ?? record.currentUses ?? 0,
    validFrom: record.valid_from ?? record.validFrom ?? null,
    validUntil: record.valid_until ?? record.validUntil ?? null,
    createdAt: record.created_at ?? record.createdAt ?? null,
    createdBy: record.created_by ?? record.createdBy ?? null,
    updatedAt: record.updated_at ?? record.updatedAt ?? null,
  };
}

export interface DiscountCodeInput {
  code: string;
  description: string;
  discountType: DiscountValueType;
  discountValue: number;
  durationType: DiscountDurationType;
  durationMonths?: number | null;
  maxUses?: number | null;
  validFrom?: string | null;
  validUntil?: string | null;
}

interface DiscountCodeDbPayload {
  code: string;
  description: string;
  discount_type: DiscountValueType;
  discount_value: number;
  duration_type: DiscountDurationType;
  duration_months: number | null;
  max_uses: number | null;
  valid_from: string | null;
  valid_until: string | null;
  created_by?: string | null;
}

function buildDiscountCodePayload(
  input: DiscountCodeInput,
  options: { includeCreatedBy?: boolean; createdBy?: string | null } = {}
): DiscountCodeDbPayload {
  const normalizedCode = input.code.trim().toUpperCase();
  const discountValue = Number(input.discountValue);

  if (!normalizedCode) {
    throw new Error('Discount code is required');
  }

  if (Number.isNaN(discountValue) || discountValue <= 0) {
    throw new Error('Discount value must be a positive number');
  }

  const durationMonths = input.durationType === 'limited_months'
    ? (input.durationMonths && input.durationMonths > 0 ? input.durationMonths : null)
    : null;

  const maxUses = input.maxUses && input.maxUses > 0 ? input.maxUses : null;

  const payload: DiscountCodeDbPayload = {
    code: normalizedCode,
    description: input.description,
    discount_type: input.discountType,
    discount_value: discountValue,
    duration_type: input.durationType,
    duration_months: durationMonths,
    max_uses: maxUses,
    valid_from: input.validFrom || null,
    valid_until: input.validUntil || null,
  };

  if (options.includeCreatedBy) {
    payload.created_by = options.createdBy ?? null;
  }

  return payload;
}

export async function getAllDiscountCodes(): Promise<DiscountCodeRecord[]> {
  const result = await query('SELECT * FROM discount_codes ORDER BY created_at DESC');
  return (result.rows || []).map(mapDiscountCode);
}

export async function getDiscountCodeByCode(code: string): Promise<DiscountCodeRecord | null> {
  const normalizedCode = code.trim().toUpperCase();
  if (!normalizedCode) {
    return null;
  }

  const result = await query('SELECT * FROM discount_codes WHERE code = $1 LIMIT 1', [normalizedCode]);
  const record = result.rows?.[0];
  return record ? mapDiscountCode(record) : null;
}

export async function createDiscountCode(
  input: DiscountCodeInput,
  options: { createdBy?: string | null } = {}
): Promise<DiscountCodeRecord> {
  const payload = buildDiscountCodePayload(input, { includeCreatedBy: true, createdBy: options.createdBy ?? null });

  const result = await query(
    `INSERT INTO discount_codes (
      code,
      description,
      discount_type,
      discount_value,
      duration_type,
      duration_months,
      max_uses,
      valid_from,
      valid_until,
      created_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING *`,
    [
      payload.code,
      payload.description,
      payload.discount_type,
      payload.discount_value,
      payload.duration_type,
      payload.duration_months,
      payload.max_uses,
      payload.valid_from,
      payload.valid_until,
      payload.created_by ?? null,
    ]
  );

  const record = result.rows?.[0];
  if (!record) {
    throw new Error('Failed to create discount code');
  }

  return mapDiscountCode(record);
}

export async function updateDiscountCode(id: string, input: DiscountCodeInput): Promise<DiscountCodeRecord> {
  const payload = buildDiscountCodePayload(input);

  const result = await query(
    `UPDATE discount_codes SET
      code = $1,
      description = $2,
      discount_type = $3,
      discount_value = $4,
      duration_type = $5,
      duration_months = $6,
      max_uses = $7,
      valid_from = $8,
      valid_until = $9,
      updated_at = NOW()
    WHERE id = $10
    RETURNING *`,
    [
      payload.code,
      payload.description,
      payload.discount_type,
      payload.discount_value,
      payload.duration_type,
      payload.duration_months,
      payload.max_uses,
      payload.valid_from,
      payload.valid_until,
      id,
    ]
  );

  const record = result.rows?.[0];
  if (!record) {
    throw new Error('Discount code not found');
  }

  return mapDiscountCode(record);
}

export async function toggleDiscountCodeActive(id: string, isActive: boolean): Promise<DiscountCodeRecord> {
  const result = await query(
    `UPDATE discount_codes SET is_active = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [isActive, id]
  );

  const record = result.rows?.[0];
  if (!record) {
    throw new Error('Discount code not found');
  }

  return mapDiscountCode(record);
}

export async function deleteDiscountCode(id: string): Promise<void> {
  const result = await query('DELETE FROM discount_codes WHERE id = $1 RETURNING id', [id]);

  if (!result.rows?.length) {
    throw new Error('Discount code not found');
  }
}

export async function getDiscountCodeUsageCount(id: string): Promise<number> {
  const result = await query(
    'SELECT COUNT(*)::int AS count FROM member_discount_codes WHERE discount_code_id = $1',
    [id]
  );

  const count = result.rows?.[0]?.count ?? 0;
  return Number(count) || 0;
}

// ============================================================
// Group Enrollment helpers
// ============================================================

const GROUP_TABLE = 'groups';
const GROUP_MEMBER_TABLE = 'group_members';

const mapGroupFromDB = (record: any): Group => ({
  id: record.id,
  name: record.name,
  groupType: record.group_type ?? record.groupType ?? null,
  payorType: record.payor_type ?? record.payorType,
  discountCode: record.discount_code ?? record.discountCode ?? null,
  discountCodeId: record.discount_code_id ?? record.discountCodeId ?? null,
  status: record.status,
  metadata: record.metadata ?? null,
  createdBy: record.created_by ?? record.createdBy ?? null,
  updatedBy: record.updated_by ?? record.updatedBy ?? null,
  registrationCompletedAt: record.registration_completed_at ?? record.registrationCompletedAt ?? null,
  hostedCheckoutLink: record.hosted_checkout_link ?? record.hostedCheckoutLink ?? null,
  hostedCheckoutStatus: record.hosted_checkout_status ?? record.hostedCheckoutStatus ?? null,
  createdAt: record.created_at ?? record.createdAt ?? null,
  updatedAt: record.updated_at ?? record.updatedAt ?? null,
});

const mapGroupMemberFromDB = (record: any): GroupMember => ({
  id: record.id,
  groupId: record.group_id ?? record.groupId,
  memberId: record.member_id ?? record.memberId ?? null,
  tier: record.tier,
  payorType: record.payor_type ?? record.payorType,
  employerAmount: record.employer_amount ?? record.employerAmount ?? null,
  memberAmount: record.member_amount ?? record.memberAmount ?? null,
  discountAmount: record.discount_amount ?? record.discountAmount ?? null,
  totalAmount: record.total_amount ?? record.totalAmount ?? null,
  paymentStatus: record.payment_status ?? record.paymentStatus ?? null,
  status: record.status ?? null,
  firstName: record.first_name ?? record.firstName,
  lastName: record.last_name ?? record.lastName,
  email: record.email,
  phone: record.phone ?? null,
  dateOfBirth: record.date_of_birth ?? record.dateOfBirth ?? null,
  metadata: record.metadata ?? null,
  registrationPayload: record.registration_payload ?? record.registrationPayload ?? null,
  registeredAt: record.registered_at ?? record.registeredAt ?? null,
  updatedAt: record.updated_at ?? record.updatedAt ?? null,
  enrollmentCompletedAt: record.enrollment_completed_at ?? record.enrollmentCompletedAt ?? null,
  notes: record.notes ?? null,
});

const mapGroupToDBPayload = (group: Partial<Group> | Partial<InsertGroup>): Record<string, any> => {
  const payload: Record<string, any> = {};

  if (group.name !== undefined) payload.name = group.name;
  if (group.groupType !== undefined) payload.group_type = group.groupType;
  if (group.payorType !== undefined) payload.payor_type = group.payorType;
  if (group.discountCode !== undefined) payload.discount_code = group.discountCode;
  if (group.discountCodeId !== undefined) payload.discount_code_id = group.discountCodeId;
  if (group.status !== undefined) payload.status = group.status;
  if (group.metadata !== undefined) payload.metadata = group.metadata;
  if (group.createdBy !== undefined) payload.created_by = group.createdBy;
  if (group.updatedBy !== undefined) payload.updated_by = group.updatedBy;
  if (group.registrationCompletedAt !== undefined) payload.registration_completed_at = group.registrationCompletedAt;
  if (group.hostedCheckoutLink !== undefined) payload.hosted_checkout_link = group.hostedCheckoutLink;
  if (group.hostedCheckoutStatus !== undefined) payload.hosted_checkout_status = group.hostedCheckoutStatus;
  if (group.createdAt !== undefined) payload.created_at = group.createdAt;
  if (group.updatedAt !== undefined) payload.updated_at = group.updatedAt;

  return payload;
};

const mapGroupMemberToDBPayload = (
  member: Partial<GroupMember> | Partial<InsertGroupMember>,
): Record<string, any> => {
  const payload: Record<string, any> = {};

  if (member.groupId !== undefined) payload.group_id = member.groupId;
  if (member.memberId !== undefined) payload.member_id = member.memberId;
  if (member.tier !== undefined) payload.tier = member.tier;
  if (member.payorType !== undefined) payload.payor_type = member.payorType;
  if (member.employerAmount !== undefined) payload.employer_amount = member.employerAmount;
  if (member.memberAmount !== undefined) payload.member_amount = member.memberAmount;
  if (member.discountAmount !== undefined) payload.discount_amount = member.discountAmount;
  if (member.totalAmount !== undefined) payload.total_amount = member.totalAmount;
  if (member.paymentStatus !== undefined) payload.payment_status = member.paymentStatus;
  if (member.status !== undefined) payload.status = member.status;
  if (member.firstName !== undefined) payload.first_name = member.firstName;
  if (member.lastName !== undefined) payload.last_name = member.lastName;
  if (member.email !== undefined) payload.email = member.email;
  if (member.phone !== undefined) payload.phone = member.phone;
  if (member.dateOfBirth !== undefined) payload.date_of_birth = member.dateOfBirth;
  if (member.metadata !== undefined) payload.metadata = member.metadata;
  if (member.registrationPayload !== undefined) payload.registration_payload = member.registrationPayload;
  if (member.registeredAt !== undefined) payload.registered_at = member.registeredAt;
  if (member.updatedAt !== undefined) payload.updated_at = member.updatedAt;
  if (member.enrollmentCompletedAt !== undefined) payload.enrollment_completed_at = member.enrollmentCompletedAt;
  if (member.notes !== undefined) payload.notes = member.notes;

  return payload;
};

export interface ListGroupsOptions {
  status?: string;
  payorType?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ListGroupMembersOptions {
  groupId: string;
  status?: string;
}

export async function createGroup(group: InsertGroup): Promise<Group> {
  const payload = mapGroupToDBPayload(group);
  payload.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from(GROUP_TABLE)
    .insert([payload])
    .select('*')
    .single();

  if (error) {
    console.error('[Storage] Failed to create group:', error);
    throw new Error(`Failed to create group: ${error.message}`);
  }

  return mapGroupFromDB(data);
}

export async function updateGroup(id: string, updates: Partial<Group>): Promise<Group> {
  const payload = mapGroupToDBPayload({ ...updates, updatedAt: new Date().toISOString() });

  const { data, error } = await supabase
    .from(GROUP_TABLE)
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('[Storage] Failed to update group:', error);
    throw new Error(`Failed to update group: ${error.message}`);
  }

  return mapGroupFromDB(data);
}

export async function getGroupById(id: string): Promise<Group | null> {
  const { data, error } = await supabase
    .from(GROUP_TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[Storage] Failed to fetch group:', error);
    throw new Error(`Failed to fetch group: ${error.message}`);
  }

  return data ? mapGroupFromDB(data) : null;
}

export async function listGroups(options: ListGroupsOptions = {}): Promise<{ groups: Group[]; count: number | null }> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  let request = supabase
    .from(GROUP_TABLE)
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (options.status) {
    request = request.eq('status', options.status);
  }

  if (options.payorType) {
    request = request.eq('payor_type', options.payorType);
  }

  if (options.search) {
    request = request.ilike('name', `%${options.search}%`);
  }

  const to = offset + limit - 1;
  const { data, error, count } = await request.range(offset, to);

  if (error) {
    console.error('[Storage] Failed to list groups:', error);
    throw new Error(`Failed to list groups: ${error.message}`);
  }

  return {
    groups: (data || []).map(mapGroupFromDB),
    count: count ?? null,
  };
}

export async function addGroupMember(groupId: string, member: InsertGroupMember): Promise<GroupMember> {
  const payload = mapGroupMemberToDBPayload({ ...member, groupId });
  payload.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from(GROUP_MEMBER_TABLE)
    .insert([payload])
    .select('*')
    .single();

  if (error) {
    console.error('[Storage] Failed to add group member:', error);
    throw new Error(`Failed to add group member: ${error.message}`);
  }

  return mapGroupMemberFromDB(data);
}

export async function updateGroupMember(id: number, updates: Partial<GroupMember>): Promise<GroupMember> {
  const payload = mapGroupMemberToDBPayload({ ...updates, updatedAt: new Date().toISOString() });

  const { data, error } = await supabase
    .from(GROUP_MEMBER_TABLE)
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('[Storage] Failed to update group member:', error);
    throw new Error(`Failed to update group member: ${error.message}`);
  }

  return mapGroupMemberFromDB(data);
}

export async function deleteGroupMember(id: number): Promise<void> {
  const { error } = await supabase
    .from(GROUP_MEMBER_TABLE)
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[Storage] Failed to delete group member:', error);
    throw new Error(`Failed to delete group member: ${error.message}`);
  }
}

export async function getGroupMemberById(id: number): Promise<GroupMember | null> {
  const { data, error } = await supabase
    .from(GROUP_MEMBER_TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[Storage] Failed to fetch group member:', error);
    throw new Error(`Failed to fetch group member: ${error.message}`);
  }

  return data ? mapGroupMemberFromDB(data) : null;
}

export async function listGroupMembers(options: ListGroupMembersOptions): Promise<GroupMember[]> {
  let request = supabase
    .from(GROUP_MEMBER_TABLE)
    .select('*')
    .eq('group_id', options.groupId)
    .order('registered_at', { ascending: true });

  if (options.status) {
    request = request.eq('status', options.status);
  }

  const { data, error } = await request;

  if (error) {
    console.error('[Storage] Failed to list group members:', error);
    throw new Error(`Failed to list group members: ${error.message}`);
  }

  return (data || []).map(mapGroupMemberFromDB);
}

export async function setGroupMemberPaymentStatus(
  memberId: number,
  paymentStatus: string,
  updates: Partial<GroupMember> = {},
): Promise<GroupMember> {
  const payload = mapGroupMemberToDBPayload({ ...updates, paymentStatus, updatedAt: new Date().toISOString() });

  const { data, error } = await supabase
    .from(GROUP_MEMBER_TABLE)
    .update(payload)
    .eq('id', memberId)
    .select('*')
    .single();

  if (error) {
    console.error('[Storage] Failed to update payment status for group member:', error);
    throw new Error(`Failed to update payment status: ${error.message}`);
  }

  return mapGroupMemberFromDB(data);
}

export async function completeGroupRegistration(
  groupId: string,
  options: { hostedCheckoutLink?: string; hostedCheckoutStatus?: string; status?: string } = {}
): Promise<Group> {
  const payload = mapGroupToDBPayload({
    status: options.status ?? 'registered',
    hostedCheckoutLink: options.hostedCheckoutLink,
    hostedCheckoutStatus: options.hostedCheckoutStatus,
    registrationCompletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const { data, error } = await supabase
    .from(GROUP_TABLE)
    .update(payload)
    .eq('id', groupId)
    .select('*')
    .single();

  if (error) {
    console.error('[Storage] Failed to complete group registration:', error);
    throw new Error(`Failed to complete group registration: ${error.message}`);
  }

  return mapGroupFromDB(data);
}

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
  getAllUsers,
  getUsersCount,
  getRevenueStats,
  getSubscriptionStats,
  getAgentEnrollments,
  getAllEnrollments,
  getEnrollmentsByAgent,
  getEnrollmentDetails,
  updateMemberStatus,
  activateMembershipNow,
  getMembersOnly,
  recordEnrollmentModification,
  recordBankingInfoChange,
  getBankingChangeHistory,
  createGroup,
  updateGroup,
  getGroupById,
  listGroups,
  addGroupMember,
  updateGroupMember,
  deleteGroupMember,
  getGroupMemberById,
  listGroupMembers,
  setGroupMemberPaymentStatus,
  completeGroupRegistration,

  getPerformanceGoalDefaults,
  updatePerformanceGoalDefaults,
  getAgentPerformanceGoalOverride,
  upsertAgentPerformanceGoalOverride,
  deleteAgentPerformanceGoalOverride,
  listAgentPerformanceGoalOverrides,
  resolvePerformanceGoalsForAgent,

  // Stub functions for operations needed by routes (to prevent errors)
  cleanTestData: async () => {},
  getUserSubscription: async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)  // Use snake_case column name
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(); // Use maybeSingle instead of single to avoid errors when no records

      if (error) {
        console.error('Error fetching user subscription:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Unexpected error fetching user subscription for', userId, ':', error);
      return null;
    }
  },
  getUserSubscriptions: async (userId: string) => {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)  // Use snake_case column name
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching user subscriptions:', error);
      return [];
    }

    // Map the results to camelCase
    return (data || []).map(sub => ({
      id: sub.id,
      userId: sub.user_id,
      planId: sub.plan_id,
      status: sub.status,
      pendingReason: sub.pending_reason,
      pendingDetails: sub.pending_details,
      startDate: sub.start_date,
      endDate: sub.end_date,
      nextBillingDate: sub.next_billing_date,
      amount: sub.amount,
      createdAt: sub.created_at,
      updatedAt: sub.updated_at
    }));
  },
  createSubscription: async (sub: any) => {
    try {
      console.log('[Storage] Creating subscription:', sub);
      
      // Use direct Neon database connection to bypass Supabase RLS
      const insertQuery = `
        INSERT INTO subscriptions (
          user_id,
          member_id,
          plan_id,
          status,
          amount,
          start_date,
          end_date,
          pending_reason,
          pending_details,
          next_billing_date,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()
        )
        RETURNING *;
      `;

      const values = [
        sub.userId || null,
        sub.memberId || null,
        sub.planId,
        sub.status || 'pending_payment',
        sub.amount,
        sub.currentPeriodStart || sub.startDate || new Date().toISOString(),
        sub.currentPeriodEnd || sub.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        sub.pendingReason || null,
        sub.pendingDetails || null,
        sub.nextBillingDate || null
      ];

      console.log('[Storage] Executing direct SQL insert to Neon database');
      const result = await query(insertQuery, values);

      if (!result.rows || result.rows.length === 0) {
        throw new Error('Subscription creation failed - no data returned');
      }

      const data = result.rows[0];
      console.log('[Storage] ✅ Subscription created successfully:', data.id);

      // Return with camelCase for application layer
      return {
        id: data.id,
        userId: data.user_id,
        memberId: data.member_id,
        planId: data.plan_id,
        status: data.status,
        pendingReason: data.pending_reason,
        pendingDetails: data.pending_details,
        startDate: data.start_date,
        endDate: data.end_date,
        nextBillingDate: data.next_billing_date,
        currentPeriodStart: data.start_date, // Map for compatibility
        currentPeriodEnd: data.end_date, // Map for compatibility
        amount: parseFloat(data.amount),
        createdAt: data.created_at,
        updatedAt: data.updated_at
      };
    } catch (error: any) {
      console.error('[Storage] Exception in createSubscription:', error);
      throw error;
    }
  },
  updateSubscription: async (id: number, updates: any) => {
    // Convert camelCase to snake_case for database
    const dbUpdates: any = {};

    // Map the fields that might be updated
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.pendingReason !== undefined) dbUpdates.pending_reason = updates.pendingReason;
    if (updates.pendingDetails !== undefined) dbUpdates.pending_details = updates.pendingDetails;
    if (updates.amount !== undefined) dbUpdates.amount = updates.amount;
    if (updates.nextBillingDate !== undefined) dbUpdates.next_billing_date = updates.nextBillingDate;
    if (updates.updatedAt !== undefined) dbUpdates.updated_at = updates.updatedAt;
    else dbUpdates.updated_at = new Date().toISOString();

    const { data: updatedSub, error } = await supabase
      .from('subscriptions')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating subscription:', error);
      throw new Error(`Failed to update subscription: ${error.message}`);
    }

    // Map back to camelCase
    return {
      id: updatedSub.id,
      userId: updatedSub.user_id,
      planId: updatedSub.plan_id,
      status: updatedSub.status,
      pendingReason: updatedSub.pending_reason,
      pendingDetails: updatedSub.pending_details,
      startDate: updatedSub.start_date,
      endDate: updatedSub.end_date,
      nextBillingDate: updatedSub.next_billing_date,
      amount: updatedSub.amount,
      createdAt: updatedSub.created_at,
      updatedAt: updatedSub.updated_at
    };
  },
  getActiveSubscriptions,  // Use real function defined above

  createPayment,

  getUserPayments,
  getPaymentById,
  getPaymentByTransactionId,
  getLatestPaymentWithAuthGuid,
  updatePayment,
  getPaymentsWithFilters,

  getFamilyMembers: async () => [],
  addFamilyMember: async (member: any) => member,

  createLead,
  updateLead,
  getLead: async (id: number) => {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return undefined;
      console.error('Error fetching lead:', error);
      return undefined;
    }
    // Map snake_case to camelCase
    return data ? {
      id: data.id,
      firstName: data.first_name,
      lastName: data.last_name,
      email: data.email,
      phone: data.phone,
      message: data.message,
      source: data.source,
      status: data.status,
      assignedAgentId: data.assigned_agent_id,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      notes: data.notes
    } : undefined;
  },
  getAgentLeads,
  getAllLeads,
  getPartnerLeads,
  updatePartnerLeadStatus,
  getLeadByEmail,
  addLeadActivity,  // Use real function defined above
  getLeadActivities,  // Use real function defined above
  getAgents: async () => {
    const { users } = await getAllUsers(); // Use the corrected getAllUsers
    const agents = users?.filter((user: any) => user.role === 'agent') || [];
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
    return await assignLeadToAgent(leadId, agentId);
  },
  getUnassignedLeadsCount: async () => 0,

  createCommission,
  updateCommission,
  getAgentCommissions,
  getRecentPaymentsDetailed,
  getAllCommissions,
  getCommissionBySubscriptionId,
  getCommissionByMemberId,
  getCommissionByUserId,
  updateCommissionStatus: async (id: number, status: string) => {
    return updateCommission(id, { status: status as any });
  },
  updateCommissionPaymentStatus: async (id: number, paymentStatus: string) => {
    return updateCommission(id, { paymentStatus: paymentStatus as any });
  },
  getCommissionStats,

  // NEW: Agent Commissions table functions
  getAgentCommissionsNew,
  getAllCommissionsNew,
  getCommissionTotals,
  getCommissionStatsNew,
  markCommissionsAsPaid,
  updateCommissionPayoutStatus,
  updateMultipleCommissionPayouts,
  getCommissionsForPayout,

  // Login session methods
  createLoginSession: async (sessionData: {
    userId: string;
    ipAddress?: string;
    userAgent?: string;
    deviceType?: string;
    browser?: string;
    location?: string;
  }) => {
    const { data, error } = await supabase
      .from('login_sessions')
      .insert([{
        user_id: sessionData.userId,
        ip_address: sessionData.ipAddress,
        user_agent: sessionData.userAgent,
        device_type: sessionData.deviceType,
        browser: sessionData.browser,
        location: sessionData.location,
        login_time: new Date().toISOString(),
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      if (handleLoginSessionError(error, 'createLoginSession')) {
        return null;
      }
      console.error('Error creating login session:', error);
      throw new Error(`Failed to create login session: ${error.message}`);
    }
    return data;
  },

  updateLoginSession: async (sessionId: string, updates: {
    logoutTime?: Date;
    sessionDurationMinutes?: number;
    isActive?: boolean;
  }) => {
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (updates.logoutTime) updateData.logout_time = updates.logoutTime.toISOString();
    if (updates.sessionDurationMinutes) updateData.session_duration_minutes = updates.sessionDurationMinutes;
    if (updates.isActive !== undefined) updateData.is_active = updates.isActive;

    const { data, error } = await supabase
      .from('login_sessions')
      .update(updateData)
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      if (handleLoginSessionError(error, 'updateLoginSession')) {
        return null;
      }
      console.error('Error updating login session:', error);
      throw new Error(`Failed to update login session: ${error.message}`);
    }
    return data;
  },

  getUserLoginSessions: async (userId: string, limit = 10) => {
    const { data, error } = await supabase
      .from('login_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('login_time', { ascending: false })
      .limit(limit);

    if (error) {
      if (handleLoginSessionError(error, 'getUserLoginSessions')) {
        return [];
      }
      console.error('Error fetching user login sessions:', error);
      return [];
    }
    return data || [];
  },

  getAllLoginSessions: async (limit = 50) => {
    try {
      // First get the login sessions
      const { data: sessions, error: sessionsError } = await supabase
        .from('login_sessions')
        .select('*')
        .order('login_time', { ascending: false })
        .limit(limit);

      if (sessionsError) {
        if (handleLoginSessionError(sessionsError, 'getAllLoginSessions')) {
          return [];
        }
        console.error('Error fetching all login sessions:', sessionsError);
        return [];
      }

      if (!sessions || sessions.length === 0) {
        return [];
      }

      // Get unique user IDs from sessions
      const userIds = [...new Set(sessions.map(s => s.user_id).filter(Boolean))];

      if (userIds.length === 0) {
        return sessions;
      }

      // Fetch user details separately
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, firstName, lastName, email, role')
        .in('id', userIds);

      if (usersError) {
        console.error('Error fetching users for sessions:', usersError);
        // Return sessions without user data
        return sessions;
      }

      // Map users to sessions
      const usersMap = new Map(users?.map(u => [u.id, u]) || []);
      const sessionsWithUsers = sessions.map(session => ({
        ...session,
        user: session.user_id ? usersMap.get(session.user_id) : null
      }));

      return sessionsWithUsers;
    } catch (error) {
      console.error('Unexpected error fetching login sessions:', error);
      return [];
    }
  },

  getAdminDashboardStats: async () => {
    try {
      console.log('[Storage] Fetching admin dashboard stats...');

      // Get users from Supabase (agents/admins only stored there)
      const { data: allUsersData, error: usersError } = await supabase.from('users').select('*');
      if (usersError) {
        console.error('[Storage] Error fetching users:', usersError);
      }
      const allUsers = allUsersData || [];

      // Get members, subscriptions, and commissions from Supabase (same database as users)
      // Include ALL members regardless of status (active, pending_activation, etc.)
      const membersResult = await query('SELECT * FROM members');
      const subscriptionsResult = await query('SELECT * FROM subscriptions');
      const commissionsResult = await query('SELECT * FROM agent_commissions');

      const allMembers = membersResult.rows || [];
      const allSubscriptions = subscriptionsResult.rows || [];
      const allCommissions = commissionsResult.rows || [];

      console.log('[Storage] Raw dashboard data counts:', {
        users: allUsers.length,
        members: allMembers.length,
        subscriptions: allSubscriptions.length,
        commissions: allCommissions.length
      });

      const totalAgents = allUsers.filter(user => user.role === 'agent').length;
      const totalAdmins = allUsers.filter(user => user.role === 'admin' || user.role === 'super_admin').length;
      const totalMembers = allMembers.length; // Total enrolled (all statuses)
      const activeMembers = allMembers.filter(m => m.status === 'active').length;
      const totalUsers = totalAgents + totalAdmins + totalMembers;

      const activeSubscriptions = allSubscriptions.filter(sub => sub.status === 'active').length;
      const pendingSubscriptions = allSubscriptions.filter(sub => sub.status === 'pending').length;
      const cancelledSubscriptions = allSubscriptions.filter(sub => sub.status === 'cancelled').length;

      // Calculate revenue from ALL members (active + pending_activation)
      // Members table has total_monthly_price which is the actual enrolled plan price
      const monthlyRevenue = allMembers
        .filter(member => member.status === 'active' || member.status === 'pending_activation')
        .reduce((total, member) => total + parseFloat(member.total_monthly_price || 0), 0);

      // Calculate commissions
      const totalCommissions = allCommissions.reduce((total, comm) => 
        total + parseFloat(comm.commission_amount || 0), 0);
      const paidCommissions = allCommissions
        .filter(comm => comm.payment_status === 'paid')
        .reduce((total, comm) => total + parseFloat(comm.commission_amount || 0), 0);
      const pendingCommissions = allCommissions
        .filter(comm => comm.payment_status === 'unpaid' || comm.payment_status === 'pending')
        .reduce((total, comm) => total + parseFloat(comm.commission_amount || 0), 0);

      // Calculate new enrollments (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const newEnrollments = allMembers.filter(member =>
        member.created_at && new Date(member.created_at) >= thirtyDaysAgo
      ).length || 0;

      const stats = {
        totalUsers,
        totalMembers,
        totalAgents,
        totalAdmins,
        activeSubscriptions,
        pendingSubscriptions,
        cancelledSubscriptions,
        monthlyRevenue: parseFloat(monthlyRevenue.toFixed(2)),
        totalCommissions: parseFloat(totalCommissions.toFixed(2)),
        paidCommissions: parseFloat(paidCommissions.toFixed(2)),
        pendingCommissions: parseFloat(pendingCommissions.toFixed(2)),
        newEnrollments,
        churnRate: totalMembers > 0 ? parseFloat(((cancelledSubscriptions / totalMembers) * 100).toFixed(2)) : 0,
        averageRevenue: activeSubscriptions > 0 ? parseFloat((monthlyRevenue / activeSubscriptions).toFixed(2)) : 0
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

      // Query from Supabase database - where all data lives
      // Include all members regardless of is_active flag
      const membersResult = await query('SELECT * FROM members ORDER BY created_at DESC');
      const agentsResult = await query('SELECT * FROM users WHERE role = $1 ORDER BY created_at DESC', ['agent']);
      const commissionsResult = await query('SELECT * FROM agent_commissions ORDER BY created_at DESC');
      const plansResult = await query('SELECT * FROM plans WHERE is_active = true');

      const allMembers = membersResult.rows || [];
      const allAgents = agentsResult.rows || [];
      const allCommissions = commissionsResult.rows || [];
      const allPlans = plansResult.rows || [];

      console.log('[Analytics] Raw data counts:', {
        members: allMembers.length,
        agents: allAgents.length,
        commissions: allCommissions.length,
        plans: allPlans.length
      });

      // Overview metrics - count active members from members table
      const activeMembers = allMembers.filter(member => member.status === 'active');
      const monthlyRevenue = activeMembers.reduce((total, member) => 
        total + parseFloat(member.total_monthly_price || 0), 0
      );

      // Use proper date comparison
      const newEnrollmentsThisMonth = allMembers.filter(member =>
        member.created_at && new Date(member.created_at) >= cutoffDate && member.status === 'active'
      ).length;

      const cancellationsThisMonth = allMembers.filter(member =>
        member.status === 'cancelled' && 
        member.cancellation_date && 
        new Date(member.cancellation_date) >= cutoffDate
      ).length;

      const totalMembers = allMembers.length;

      console.log('[Analytics] Calculated metrics:', {
        totalMembers,
        activeMembers: activeMembers.length,
        monthlyRevenue,
        newEnrollments: newEnrollmentsThisMonth,
        cancellations: cancellationsThisMonth
      });

      // Plan breakdown
      const planBreakdown = allPlans.map(plan => {
        const planMembers = allMembers.filter(m => m.plan_id === plan.id && m.status === 'active');
        const planRevenue = planMembers.reduce((total, m) => 
          total + parseFloat(m.total_monthly_price || 0), 0
        );

        return {
          planId: plan.id,
          planName: plan.name,
          memberCount: planMembers.length,
          monthlyRevenue: planRevenue,
          percentage: monthlyRevenue > 0 ? (planRevenue / monthlyRevenue) * 100 : 0
        };
      });

      // Recent enrollments
      const recentEnrollments = allMembers
        .filter(m => m.created_at && new Date(m.created_at) >= cutoffDate)
        .map(m => {
          const plan = allPlans.find(p => p.id === m.plan_id);
          return {
            id: m.id.toString(),
            memberId: m.id?.toString() || '',
            memberPublicId: m.member_public_id || '',
            customerNumber: m.customer_number || '',
            firstName: m.first_name || '',
            lastName: m.last_name || '',
            email: m.email || '',
            planName: plan?.name || '',
            amount: parseFloat(m.total_monthly_price || 0),
            enrolledDate: m.created_at || '',
            status: m.status
          };
        })
        .sort((a, b) => new Date(b.enrolledDate).getTime() - new Date(a.enrolledDate).getTime())
        .slice(0, 20);

      // Agent performance
      const agentPerformance = allAgents.map(agent => {
        const agentCommissions = allCommissions.filter(comm => comm.agent_id === agent.id);
        const agentMembers = allMembers.filter(m => m.enrolled_by_agent_id === agent.id || m.enrolled_by_agent_id === agent.id.toString());

        const monthlyEnrollments = agentMembers.filter(m =>
          m.created_at && new Date(m.created_at) >= cutoffDate
        ).length;

        const totalCommissions = agentCommissions.reduce((total, comm) => 
          total + parseFloat(comm.commission_amount || 0), 0
        );
        const paidCommissions = agentCommissions
          .filter(comm => comm.payment_status === 'paid')
          .reduce((total, comm) => total + parseFloat(comm.commission_amount || 0), 0);
        const pendingCommissions = agentCommissions
          .filter(comm => comm.payment_status !== 'paid')
          .reduce((total, comm) => total + parseFloat(comm.commission_amount || 0), 0);

        return {
          agentId: agent.id,
          agentName: `${agent.first_name || ''} ${agent.last_name || ''}`.trim(),
          agentNumber: agent.agent_number || '',
          totalEnrollments: agentMembers.length,
          monthlyEnrollments,
          totalCommissions,
          paidCommissions,
          pendingCommissions,
          conversionRate: agentMembers.length > 0 ? (agentMembers.filter(m => m.status === 'active').length / agentMembers.length) * 100 : 0,
          averageCommission: agentCommissions.length > 0 ? totalCommissions / agentCommissions.length : 0
        };
      });

      // Member reports
      const memberReports = allMembers.map(member => {
        const plan = allPlans.find(p => p.id === member.plan_id);
        const agent = allAgents.find(a => a.id === member.enrolled_by_agent_id);

        return {
          id: member.id,
          memberId: member.id?.toString() || '',
          memberPublicId: member.member_public_id || '',
          customerNumber: member.customer_number || '',
          firstName: member.first_name || '',
          lastName: member.last_name || '',
          email: member.email || '',
          phone: member.phone || '',
          planName: plan?.name || '',
          status: member.status || 'inactive',
          enrolledDate: member.created_at || '',
          lastPayment: member.updated_at || '',
          totalPaid: parseFloat(member.total_monthly_price || 0),
          agentName: agent ? `${agent.first_name || ''} ${agent.last_name || ''}`.trim() : 'Direct'
        };
      });

      // Commission reports
      const commissionReports = allCommissions.map(commission => {
        const agent = allAgents.find(a => a.id === commission.agent_id);
        const member = allMembers.find(m => m.id === commission.member_id);
        const plan = allPlans.find(p => p.id === commission.plan_id);

        return {
          id: commission.id.toString(),
          memberId: commission.member_id?.toString() || '',
          memberPublicId: member?.member_public_id || '',
          membershipId: member?.customer_number || '',
          agentName: agent ? `${agent.first_name || ''} ${agent.last_name || ''}`.trim() : 'Unknown',
          agentNumber: agent?.agent_number || '',
          memberName: member ? `${member.first_name || ''} ${member.last_name || ''}`.trim() : 'Unknown',
          planName: plan?.name || '',
          commissionAmount: parseFloat(commission.commission_amount || 0),
          totalPlanCost: parseFloat(member?.total_monthly_price || 0),
          status: commission.status || 'pending',
          paymentStatus: commission.payment_status || 'pending',
          createdDate: commission.created_at || '',
          paymentDate: commission.paid_date || null
        };
      });

      // Revenue breakdown
      const totalRevenue = allMembers.reduce((total, m) => 
        total + parseFloat(m.total_monthly_price || 0), 0
      );
      const subscriptionRevenue = activeMembers.reduce((total, m) => 
        total + parseFloat(m.total_monthly_price || 0), 0
      );

      const revenueBreakdown = {
        totalRevenue,
        subscriptionRevenue,
        oneTimeRevenue: 0, // Add when you have one-time payments
        refunds: 0, // Add when you track refunds
        netRevenue: totalRevenue,
        projectedAnnualRevenue: subscriptionRevenue * 12,
        averageRevenuePerUser: activeMembers.length > 0 ? subscriptionRevenue / activeMembers.length : 0,
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
          activeSubscriptions: activeMembers.length,
          monthlyRevenue,
          averageRevenue: activeMembers.length > 0 ? monthlyRevenue / activeMembers.length : 0,
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
  },

  // ============================================================
  // MEMBER OPERATIONS (Healthcare customers - NO authentication)
  // ============================================================

  createMember: async (memberData: Partial<Member>): Promise<Member> => {
    try {
      const resolvedCustomerNumber = (memberData.customerNumber || '').toString().trim().toUpperCase() ||
        await generateUniqueMemberIdentifier({ prefix: 'CUST', column: 'customer_number' });

      const resolvedMemberPublicId = (memberData as any).memberPublicId?.toString().trim().toUpperCase() ||
        await generateUniqueMemberIdentifier({ prefix: 'MEMB', column: 'member_public_id' });

      // Format fields to match database CHAR requirements
      const formattedData = {
        ...memberData,
        customerNumber: resolvedCustomerNumber,
        memberPublicId: resolvedMemberPublicId,
        // Format phone numbers to 10 digits only (no formatting)
        phone: memberData.phone ? formatPhoneNumber(memberData.phone) : null,
        emergencyContactPhone: memberData.emergencyContactPhone ? formatPhoneNumber(memberData.emergencyContactPhone) : null,
        // Format dates to MMDDYYYY (8 chars)
        dateOfBirth: memberData.dateOfBirth ? formatDateMMDDYYYY(memberData.dateOfBirth) : null,
        dateOfHire: memberData.dateOfHire ? formatDateMMDDYYYY(memberData.dateOfHire) : null,
        planStartDate: memberData.planStartDate ? formatDateMMDDYYYY(memberData.planStartDate) : null,
        // Format SSN to 9 digits (plain text storage for non-insurance DPC)
        ssn: memberData.ssn ? formatSSN(memberData.ssn) : null,
        // Format ZIP to 5 digits
        zipCode: memberData.zipCode ? formatZipCode(memberData.zipCode) : null,
        // Ensure state is uppercase 2 chars
        state: memberData.state ? memberData.state.toUpperCase().slice(0, 2) : null,
        // Gender to uppercase single char
        gender: memberData.gender ? memberData.gender.toUpperCase().slice(0, 1) : null,
      };

      // Use database function to generate customer number
      const result = await query(`
        INSERT INTO members (
          customer_number, member_public_id, first_name, last_name, middle_name, email,
          phone, date_of_birth, gender, ssn, address, address2, city, state, zip_code,
          emergency_contact_name, emergency_contact_phone,
          employer_name, division_name, member_type,
          date_of_hire, plan_start_date,
          enrolled_by_agent_id, agent_number, enrollment_date, first_payment_date, membership_start_date,
          payment_token, payment_method_type,
          is_active, status,
          plan_id, coverage_type, total_monthly_price, add_rx_valet
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17,
          $18, $19, $20,
          $21, $22,
          $23, $24, $25, $26, $27,
          $28, $29,
          $30, $31,
          $32, $33, $34, $35
        ) RETURNING *
      `, [
        formattedData.customerNumber,
        formattedData.memberPublicId,
        formattedData.firstName,
        formattedData.lastName,
        formattedData.middleName,
        formattedData.email,
        formattedData.phone,
        formattedData.dateOfBirth,
        formattedData.gender,
        formattedData.ssn,
        formattedData.address,
        formattedData.address2,
        formattedData.city,
        formattedData.state,
        formattedData.zipCode,
        formattedData.emergencyContactName,
        formattedData.emergencyContactPhone,
        formattedData.employerName,
        formattedData.divisionName,
        formattedData.memberType,
        formattedData.dateOfHire,
        formattedData.planStartDate,
        formattedData.enrolledByAgentId,
        formattedData.agentNumber,
        formattedData.enrollmentDate,
        formattedData.firstPaymentDate,
        formattedData.membershipStartDate,
        formattedData.paymentToken,
        formattedData.paymentMethodType,
        formattedData.isActive ?? true,
        formattedData.status ?? 'active',
        formattedData.planId,
        formattedData.coverageType,
        formattedData.totalMonthlyPrice,
        formattedData.addRxValet ?? false,
      ]);

      const dbMember = result.rows[0];
      console.log('[Storage] Created member:', dbMember.customer_number, dbMember.member_public_id);
      console.log('[Storage] Member details:', {
        id: dbMember.id,
        email: dbMember.email,
        enrolledByAgentId: dbMember.enrolled_by_agent_id,
        agentNumber: dbMember.agent_number,
        isActive: dbMember.is_active
      });
      console.log('[Storage] Database returned columns:', Object.keys(dbMember));
      
      // Map snake_case database columns to camelCase JavaScript properties
      const member = {
        ...dbMember,
        firstName: dbMember.first_name,
        lastName: dbMember.last_name,
        middleName: dbMember.middle_name,
        customerNumber: dbMember.customer_number,
        memberPublicId: dbMember.member_public_id,
        dateOfBirth: dbMember.date_of_birth,
        zipCode: dbMember.zip_code,
        emergencyContactName: dbMember.emergency_contact_name,
        emergencyContactPhone: dbMember.emergency_contact_phone,
        employerName: dbMember.employer_name,
        divisionName: dbMember.division_name,
        memberType: dbMember.member_type,
        dateOfHire: dbMember.date_of_hire,
        planStartDate: dbMember.plan_start_date,
        enrolledByAgentId: dbMember.enrolled_by_agent_id,
        agentNumber: dbMember.agent_number,
        enrollmentDate: dbMember.enrollment_date,
        firstPaymentDate: dbMember.first_payment_date,
        membershipStartDate: dbMember.membership_start_date,
        paymentToken: dbMember.payment_token,
        paymentMethodType: dbMember.payment_method_type,
        isActive: dbMember.is_active,
        cancellationDate: dbMember.cancellation_date,
        cancellationReason: dbMember.cancellation_reason,
        createdAt: dbMember.created_at,
        updatedAt: dbMember.updated_at,
        planId: dbMember.plan_id,
        coverageType: dbMember.coverage_type,
        totalMonthlyPrice: dbMember.total_monthly_price,
        addRxValet: dbMember.add_rx_valet
      };
      
      console.log('[Storage] Mapped to camelCase, has firstName?', !!member.firstName, 'lastName?', !!member.lastName);
      return member;
    } catch (error: any) {
      console.error('[Storage] Error creating member:', error);
      throw new Error(`Failed to create member: ${error.message}`);
    }
  },

  getMember: async (id: number): Promise<Member | undefined> => {
    try {
      const result = await query('SELECT * FROM members WHERE id = $1', [id]);
      return result.rows[0];
    } catch (error: any) {
      console.error('[Storage] Error fetching member:', error);
      throw new Error(`Failed to get member: ${error.message}`);
    }
  },

  getMemberByEmail: async (email: string): Promise<Member | undefined> => {
    try {
      const result = await query('SELECT * FROM members WHERE email = $1', [email]);
      return result.rows[0];
    } catch (error: any) {
      console.error('[Storage] Error fetching member by email:', error);
      throw new Error(`Failed to get member: ${error.message}`);
    }
  },

  getMemberByCustomerNumber: async (customerNumber: string): Promise<Member | undefined> => {
    try {
      const result = await query('SELECT * FROM members WHERE customer_number = $1', [customerNumber]);
      return result.rows[0];
    } catch (error: any) {
      console.error('[Storage] Error fetching member by customer number:', error);
      throw new Error(`Failed to get member: ${error.message}`);
    }
  },

  getAllMembers: async (limit: number = 50, offset: number = 0): Promise<{ members: Member[]; totalCount: number }> => {
    try {
      const countResult = await query('SELECT COUNT(*) FROM members');
      const totalCount = parseInt(countResult.rows[0].count);

      const result = await query(
        'SELECT * FROM members ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [limit, offset]
      );

      return {
        members: result.rows,
        totalCount
      };
    } catch (error: any) {
      console.error('[Storage] Error fetching all members:', error);
      throw new Error(`Failed to get members: ${error.message}`);
    }
  },

  updateMember: async (id: number, data: Partial<Member>): Promise<Member> => {
    try {
      const normalizeTimestamp = (value?: string | Date | null) => {
        if (!value) return undefined;
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) {
          return undefined;
        }
        return date.toISOString();
      };

      // Format fields if provided
      const formattedData = {
        ...data,
        phone: data.phone ? formatPhoneNumber(data.phone) : undefined,
        emergencyContactPhone: data.emergencyContactPhone ? formatPhoneNumber(data.emergencyContactPhone) : undefined,
        dateOfBirth: data.dateOfBirth ? formatDateMMDDYYYY(data.dateOfBirth) : undefined,
        dateOfHire: data.dateOfHire ? formatDateMMDDYYYY(data.dateOfHire) : undefined,
        planStartDate: data.planStartDate ? formatDateMMDDYYYY(data.planStartDate) : undefined,
        ssn: data.ssn ? formatSSN(data.ssn) : undefined,
        zipCode: data.zipCode ? formatZipCode(data.zipCode) : undefined,
        state: data.state?.toUpperCase().slice(0, 2),
        gender: data.gender?.toUpperCase().slice(0, 1),
        firstPaymentDate: normalizeTimestamp(data.firstPaymentDate ?? undefined),
        membershipStartDate: normalizeTimestamp(data.membershipStartDate ?? undefined),
        enrollmentDate: normalizeTimestamp(data.enrollmentDate ?? undefined)
      } as Record<string, any>;

      const columnMapping: Record<string, string> = {
        firstName: 'first_name',
        lastName: 'last_name',
        middleName: 'middle_name',
        emergencyContactName: 'emergency_contact_name',
        emergencyContactPhone: 'emergency_contact_phone',
        employerName: 'employer_name',
        divisionName: 'division_name',
        memberType: 'member_type',
        dateOfBirth: 'date_of_birth',
        dateOfHire: 'date_of_hire',
        planStartDate: 'plan_start_date',
        planId: 'plan_id',
        coverageType: 'coverage_type',
        totalMonthlyPrice: 'total_monthly_price',
        addRxValet: 'add_rx_valet',
        agentNumber: 'agent_number',
        enrolledByAgentId: 'enrolled_by_agent_id',
        customerNumber: 'customer_number',
        memberPublicId: 'member_public_id',
        paymentToken: 'payment_token',
        paymentMethodType: 'payment_method_type',
        firstPaymentDate: 'first_payment_date',
        membershipStartDate: 'membership_start_date',
        enrollmentDate: 'enrollment_date',
        zipCode: 'zip_code',
        isActive: 'is_active'
      };

      // Build dynamic UPDATE query
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      Object.entries(formattedData).forEach(([key, value]) => {
        if (value !== undefined) {
          const dbField = columnMapping[key] || key;
          updates.push(`${dbField} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      });

      updates.push(`updated_at = NOW()`);
      values.push(id);

      const result = await query(
        `UPDATE members SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        throw new Error('Member not found');
      }

      console.log('[Storage] Updated member:', id);
      return result.rows[0];
    } catch (error: any) {
      console.error('[Storage] Error updating member:', error);
      throw new Error(`Failed to update member: ${error.message}`);
    }
  },

  getMembersByAgent: async (agentId: string): Promise<Member[]> => {
    try {
      const result = await query(
        'SELECT * FROM members WHERE enrolled_by_agent_id::uuid = $1::uuid ORDER BY created_at DESC',
        [agentId]
      );
      return result.rows;
    } catch (error: any) {
      console.error('[Storage] Error fetching members by agent:', error);
      throw new Error(`Failed to get members by agent: ${error.message}`);
    }
  }
} as any;