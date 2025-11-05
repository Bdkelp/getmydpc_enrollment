import { supabase } from './lib/supabaseClient'; // Use Supabase for everything
import { neonPool, query } from './lib/neonDb'; // Legacy Neon functions for dashboard queries still in use
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
import type {
  User,
  Member,
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

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserProfile(id: string, data: Partial<User>): Promise<User>;
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
    const role = userData.role || 'agent';
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
    
    // Build insert object with only columns that exist in Supabase
    const insertData: any = {
      email: userData.email,
      username: userData.email?.split('@')[0] || null, // Use email prefix as username
      first_name: userData.firstName || '',
      last_name: userData.lastName || '',
      phone: userData.phone || null,
      role,
      agent_number: agentNumber || null,
      is_active: userData.isActive !== undefined ? userData.isActive : true,
      created_at: userData.createdAt || new Date()
    };
    
    console.log('[Storage] createUser: Inserting user with data:', {
      email: insertData.email,
      role: insertData.role,
      agent_number: insertData.agent_number
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

export async function getUser(id: string): Promise<User | null> {
  try {
    console.log('[Storage] getUser called with UUID:', id);
    
    // Look up user by UUID (Supabase Auth ID)
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !data) {
      console.log('[Storage] getUser: User not found for UUID:', id);
      return null;
    }
    
    console.log('[Storage] getUser: Found user:', data.email);
    return mapUserFromDB(data);
  } catch (error: any) {
    console.error('[Storage] Error in getUser:', error);
    return null;
  }
}

// Helper function to map database snake_case to camelCase
function mapUserFromDB(data: any): User | null {
  if (!data) return null;

  // Users table should ONLY contain 'admin' and 'agent' roles
  // Legacy 'user' or 'member' should never appear here - they belong in members table
  // If somehow a null role is found, default to 'agent' (most common)
  const normalizedRole = data.role || 'agent';
  
  if (!['admin', 'agent'].includes(normalizedRole)) {
    console.warn(`[Storage] Unexpected role "${normalizedRole}" in users table for ${data.email} - defaulting to agent`);
  }

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
    createdAt: data.created_at || new Date(),
    updatedAt: data.updated_at || new Date(),
    username: data.username,
    passwordHash: data.password_hash || data.passwordHash,
    emailVerificationToken: data.email_verification_token || data.emailVerificationToken,
    resetPasswordToken: data.reset_password_token || data.resetPasswordExpiry,
    resetPasswordExpiry: data.reset_password_expiry || data.resetPasswordExpiry,
    lastLoginAt: data.last_login_at || data.lastLoginAt,
    lastActivityAt: data.last_activity_at || data.lastActivityAt,
    stripeCustomerId: data.stripe_customer_id || data.stripeCustomerId,
    stripeSubscriptionId: data.stripe_subscription_id || data.stripeSubscriptionId,
    googleId: data.google_id || data.googleId,
    facebookId: data.facebook_id || data.facebookId,
    appleId: data.apple_id || data.appleId,
    microsoftId: data.microsoft_id || data.microsoftId,
    linkedinId: data.linkedin_id || data.linkedinId,
    twitterId: data.twitter_id || data.twitterId,
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
    console.log('[Storage] getUserByEmail Supabase response:', { data: data ? 'found' : 'null', error: error ? error.message : 'none' });
    
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

export async function updateUser(id: string, updates: Partial<User>): Promise<User> {
  try {
    // Build update object with only columns that exist in Supabase
    // Supabase users table columns: email, username, first_name, last_name, phone, role, agent_number, is_active, created_at
    const updateData: any = {};
    
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
    if (updates.employerName !== undefined) updateData.employer_name = updates.employerName;
    if (updates.divisionName !== undefined) updateData.division_name = updates.divisionName;
    // Banking information for commission payouts
    if (updates.bankName !== undefined) updateData.bank_name = updates.bankName;
    if (updates.routingNumber !== undefined) updateData.routing_number = updates.routingNumber;
    if (updates.accountNumber !== undefined) updateData.account_number = updates.accountNumber;
    if (updates.accountType !== undefined) updateData.account_type = updates.accountType;
    if (updates.accountHolderName !== undefined) updateData.account_holder_name = updates.accountHolderName;
    
    // Ignore fields that don't exist in Supabase:
    // - lastLoginAt, approvalStatus, approvedAt, approvedBy, profileImageUrl
    // - googleId, facebookId, twitterId, emailVerified, etc.
    
    if (Object.keys(updateData).length === 0) {
      // No valid updates, just return the existing user
      console.log('[Storage] updateUser: No valid fields to update, returning existing user');
      const currentUser = await getUser(id); // Get user by UUID
      if (currentUser) return currentUser;
      throw new Error('User not found');
    }

    console.log('[Storage] updateUser: Updating user', id, 'with data:', updateData);
    
    // Check if banking information is being updated for audit logging
    const bankingFields = ['bank_name', 'routing_number', 'account_number', 'account_type', 'account_holder_name'];
    const hasBankingUpdates = bankingFields.some(field => updateData[field] !== undefined);
    
    let oldBankingInfo = null;
    if (hasBankingUpdates) {
      // Get current banking info before update for audit trail
      const currentUser = await getUser(id);
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
    
    // Use Supabase update - id is the UUID from Supabase Auth
    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', id) // Use UUID as identifier (primary key in users table)
      .select()
      .single();
    
    // If banking info was updated and update was successful, log the change
    if (hasBankingUpdates && data && oldBankingInfo) {
      const newBankingInfo = {
        bankName: updateData.bank_name,
        routingNumber: updateData.routing_number,
        accountNumber: updateData.account_number,
        accountType: updateData.account_type,
        accountHolderName: updateData.account_holder_name
      };
      
      // Log the banking change (don't await to avoid blocking the response)
      recordBankingInfoChange({
        userId: id,
        modifiedBy: id, // User is modifying their own info
        oldBankingInfo,
        newBankingInfo,
        changeType: 'self_update'
      }).catch(auditError => {
        console.error('[Storage] Failed to log banking change audit:', auditError);
      });
    }

    if (error) {
      console.error('[Storage] updateUser error:', error);
      throw new Error(`Failed to update user: ${error.message}`);
    }

    if (!data) {
      throw new Error('User not found');
    }

    return mapUserFromDB(data);
  } catch (error: any) {
    console.error('Error updating user:', error);

    // For non-critical updates like last_login_at, don't throw - just return the existing user
    const isNonCriticalUpdate = Object.keys(updates).length === 1 && updates.lastLoginAt !== undefined;
    if (isNonCriticalUpdate) {
      console.warn(`Non-critical user update failed for ${id}, continuing anyway:`, error.message);
      const currentUser = await getUser(id);
      if (currentUser) {
        return currentUser;
      }
    }

    throw new Error(`Failed to update user: ${error.message}`);
  }
}

export async function updateUserProfile(id: string, profileData: Partial<User>): Promise<User> {
  return updateUser(id, profileData);
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
    console.log('[Storage] Fetching all users via Supabase...');

    // Use Supabase instead of Neon to avoid connection issues
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
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

    console.log('[Storage] Successfully fetched users:', {
      totalUsers: usersWithSubscriptions.length,
      roles: usersWithSubscriptions.slice(0, 5).map(u => ({ email: u.email, role: u.role }))
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

export async function getAgentEnrollments(agentId: string, startDate?: string, endDate?: string): Promise<User[]> {
  try {
    // Query members table from Neon database (not users table)
    let sql = `
      SELECT 
        m.*,
        p.name as plan_name,
        p.price as plan_price,
        c.commission_amount,
        c.payment_status as commission_status
      FROM members m
      LEFT JOIN plans p ON m.plan_id = p.id
      LEFT JOIN commissions c ON c.member_id = m.id
      WHERE m.enrolled_by_agent_id = $1 AND m.is_active = true
    `;
    const params: any[] = [agentId];

    if (startDate && endDate) {
      sql += ' AND m.created_at >= $2 AND m.created_at <= $3';
      params.push(startDate, endDate);
    }

    sql += ' ORDER BY m.created_at DESC';

    const result = await query(sql, params);
    
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
      // Include plan and commission info
      planId: row.plan_id,
      planName: row.plan_name,
      planPrice: row.plan_price,
      totalMonthlyPrice: row.total_monthly_price,
      commissionAmount: row.commission_amount,
      commissionStatus: row.commission_status
    } as any));
  } catch (error: any) {
    console.error('Error fetching agent enrollments:', error);
    throw new Error(`Failed to get agent enrollments: ${error.message}`);
  }
}

export async function getAllEnrollments(startDate?: string, endDate?: string, agentId?: string): Promise<User[]> {
  try {
    // Query members table from Neon database with plan and commission data
    let sql = `
      SELECT 
        m.*,
        p.name as plan_name,
        p.price as plan_price,
        c.commission_amount,
        c.payment_status as commission_status
      FROM members m
      LEFT JOIN plans p ON m.plan_id = p.id
      LEFT JOIN commissions c ON c.member_id = m.id
      WHERE m.is_active = true
    `;
    const params: any[] = [];
    let paramCount = 1;

    if (startDate && endDate) {
      sql += ` AND m.created_at >= $${paramCount++} AND m.created_at <= $${paramCount++}`;
      params.push(startDate, endDate);
    }

    if (agentId) {
      sql += ` AND m.enrolled_by_agent_id = $${paramCount++}`;
      params.push(agentId);
    }

    sql += " ORDER BY m.created_at DESC";

    const result = await query(sql, params);
    
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
      // Include plan and commission info
      planId: row.plan_id,
      planName: row.plan_name,
      planPrice: row.plan_price,
      totalMonthlyPrice: row.total_monthly_price,
      commissionAmount: row.commission_amount,
      commissionStatus: row.commission_status
    } as any));
  } catch (error: any) {
    console.error('Error fetching all enrollments:', error);
    throw new Error(`Failed to get enrollments: ${error.message}`);
  }
}

export async function getEnrollmentsByAgent(agentId: string, startDate?: string, endDate?: string): Promise<User[]> {
  try {
    // Query members table from Neon database with plan and commission data
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
      WHERE m.enrolled_by_agent_id = $1 AND m.is_active = true
    `;
    const params: any[] = [agentId];
    let paramCount = 2;

    if (startDate && endDate) {
      sql += ` AND m.created_at >= $${paramCount++} AND m.created_at <= $${paramCount++}`;
      params.push(startDate, endDate);
    }

    sql += " ORDER BY m.created_at DESC";

    const result = await query(sql, params);
    
    console.log('[Storage] getEnrollmentsByAgent - Query params:', { agentId, startDate, endDate });
    console.log('[Storage] getEnrollmentsByAgent - Row count:', result.rows.length);
    if (result.rows.length > 0) {
      console.log('[Storage] getEnrollmentsByAgent - Sample raw data:', {
        id: result.rows[0].id,
        email: result.rows[0].email,
        first_name: result.rows[0].first_name,
        plan_name: result.rows[0].plan_name,
        plan_price: result.rows[0].plan_price,
        commission_amount: result.rows[0].commission_amount,
        commission_status: result.rows[0].commission_status,
        enrolled_by_agent_id: result.rows[0].enrolled_by_agent_id
      });
    }
    
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
      // Include plan and commission info
      planId: row.plan_id,
      planName: row.plan_name,
      planPrice: row.plan_price,
      totalMonthlyPrice: row.total_monthly_price,
      commissionAmount: row.commission_amount,
      commissionStatus: row.commission_status
    } as any));
  } catch (error: any) {
    console.error('Error fetching agent enrollments:', error);
    throw new Error(`Failed to get agent enrollments: ${error.message}`);
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
    let sql = 'SELECT * FROM leads WHERE assigned_agent_id = $1';
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
        conditions.push(`assigned_agent_id = $${params.length + 1}`);
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
  // Check if the agent is an admin. If so, skip commission creation.
  const agent = await getUser(commission.agentId);
  if (agent && agent.role === 'admin') {
    console.log(`Skipping commission for admin agent: ${commission.agentId}`);
    return { skipped: true, reason: 'admin_no_commission' } as any; // Return a specific object indicating skip
  }

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
      FROM commissions c
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
    let sql = 'SELECT * FROM commissions';
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
      'SELECT * FROM commissions WHERE subscription_id = $1 LIMIT 1',
      [subscriptionId]
    );
    
    if (result.rows.length === 0) return undefined;
    return result.rows[0];
  } catch (error: any) {
    console.error('Error fetching commission by subscription ID:', error);
    return undefined;
  }
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

export async function getCommissionByMemberId(memberId: number): Promise<Commission | null> {
  try {
    console.log('[Storage] Looking up commission for member ID:', memberId);
    const result = await query(
      `SELECT * FROM commissions 
       WHERE member_id = $1 
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
  try {
    let sql = 'SELECT commission_amount, payment_status FROM commissions';
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

    // Get unique member IDs and agent IDs for batch lookup
    const memberIds = [...new Set(commissions.map(c => c.member_id).filter(Boolean))];
    const agentIds = [...new Set(commissions.map(c => c.agent_id).filter(Boolean))];

    // Batch fetch users data (both agents and members are in users table)
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, role')
      .in('id', [...memberIds, ...agentIds]);

    if (usersError) {
      console.warn('[Storage] Could not fetch user details:', usersError);
    }

    // Create lookup maps
    const usersMap = new Map((users || []).map(u => [u.id, u]));

    console.log('[Storage] Sample raw commission:', {
      id: commissions[0].id,
      commission_amount: commissions[0].commission_amount,
      member_id: commissions[0].member_id,
      agent_id: commissions[0].agent_id
    });
    
    // Format for frontend - transform to match expected structure
    const formatted = commissions.map((commission: any) => {
      const member = usersMap.get(commission.member_id);
      const agent = usersMap.get(commission.agent_id);

      return {
        id: commission.id,
        agentId: commission.agent_id,
        memberId: commission.member_id,
        enrollmentId: commission.enrollment_id,
        commissionAmount: parseFloat(commission.commission_amount || 0),
        coverageType: commission.coverage_type || 'other',
        status: commission.status || 'pending',
        paymentStatus: commission.payment_status || 'unpaid',
        // Map member data from lookup
        totalPlanCost: parseFloat(commission.base_premium || 0),
        userName: member?.first_name && member?.last_name 
          ? `${member.first_name} ${member.last_name}` 
          : member?.email || `Member ${commission.member_id}`,
        planTier: commission.coverage_type || 'N/A',
        planType: commission.coverage_type || 'other',
        notes: commission.notes || '',
        createdAt: commission.created_at,
        updatedAt: commission.updated_at,
        paidDate: commission.paid_at,
        // Additional fields for display
        memberEmail: member?.email || '',
        firstName: member?.first_name || '',
        lastName: member?.last_name || '',
        planName: commission.coverage_type || 'Unknown',
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

    // Get unique member IDs and agent IDs for batch lookup
    const memberIds = [...new Set(commissions.map(c => c.member_id).filter(Boolean))];
    const agentIds = [...new Set(commissions.map(c => c.agent_id).filter(Boolean))];

    // Batch fetch users data (both agents and members are in users table)
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, role, agent_number')
      .in('id', [...memberIds, ...agentIds]);

    if (usersError) {
      console.warn('[Storage] Could not fetch user details:', usersError);
    }

    // Create lookup maps
    const usersMap = new Map((users || []).map(u => [u.id, u]));
    
    // Format for frontend - enhanced for admin view
    const formatted = commissions.map(commission => {
      const member = usersMap.get(commission.member_id);
      const agent = usersMap.get(commission.agent_id);

      return {
        id: commission.id,
        agentId: commission.agent_id,
        memberId: commission.member_id,
        enrollmentId: commission.enrollment_id,
        commissionAmount: parseFloat(commission.commission_amount || 0),
        coverageType: commission.coverage_type || 'other',
        status: commission.status || 'pending',
        paymentStatus: commission.payment_status || 'unpaid',
        basePremium: parseFloat(commission.base_premium || 0),
        notes: commission.notes || '',
        createdAt: commission.created_at,
        updatedAt: commission.updated_at,
        paidDate: commission.paid_at,
        // Member information
        memberEmail: member?.email || '',
        memberName: member?.first_name && member?.last_name 
          ? `${member.first_name} ${member.last_name}` 
          : member?.email || `Member ${commission.member_id}`,
        memberFirstName: member?.first_name || '',
        memberLastName: member?.last_name || '',
        // Agent information
        agentEmail: agent?.email || '',
        agentName: agent?.first_name && agent?.last_name 
          ? `${agent.first_name} ${agent.last_name}` 
          : agent?.email || 'Unknown Agent',
        agentNumber: agent?.agent_number || '',
        agentFirstName: agent?.first_name || '',
        agentLastName: agent?.last_name || '',
        // Additional display fields
        planTier: commission.coverage_type || 'N/A',
        planType: commission.coverage_type || 'other',
        planName: commission.coverage_type || 'Unknown',
        planPrice: parseFloat(commission.base_premium || 0),
        totalPlanCost: parseFloat(commission.base_premium || 0),
        userName: member?.first_name && member?.last_name 
          ? `${member.first_name} ${member.last_name}` 
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
    const { error } = await supabase
      .from('agent_commissions')
      .update({
        payment_status: 'paid',
        payment_date: paymentDate || new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .in('id', commissionIds);

    if (error) {
      throw new Error(`Failed to mark commissions as paid: ${error.message}`);
    }

    console.log(`[Storage] Marked ${commissionIds.length} commission(s) as paid`);
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
      updatePayload.paid_at = payoutData.paymentDate || new Date().toISOString();
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
            updatePayload.paid_at = update.paymentDate || new Date().toISOString();
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
        paid_at,
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
        first_name,
        last_name,
        agent_number,
        upline_agent_id,
        override_commission_rate,
        hierarchy_level,
        can_receive_overrides,
        upline:upline_agent_id(email)
      `)
      .eq('role', 'agent')
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
        .eq('upline_agent_id', agent.id);

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
export async function createPayment(paymentData: {
  userId: string;
  subscriptionId?: string | null;
  amount: string;
  currency?: string;
  status: string;
  paymentMethod: string;
  transactionId?: string;
  authorizationCode?: string;
  metadata?: Record<string, any>;
}): Promise<any> {
  console.log('[Storage] Creating payment record at', new Date().toISOString(), ':', {
    userId: paymentData.userId,
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
        amount,
        status,
        currency,
        payment_method,
        transaction_id,
        subscription_id,
        metadata,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
      )
      RETURNING *;
    `;

    const values = [
      paymentData.userId,
      paymentData.amount,
      paymentData.status,
      paymentData.currency || 'USD',
      paymentData.paymentMethod || 'card',
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

export async function getPaymentByTransactionId(transactionId: string): Promise<Payment | undefined> {
  try {
    // Use direct Neon query instead of Supabase
    const result = await query(
      'SELECT * FROM payments WHERE transaction_id = $1 LIMIT 1',
      [transactionId]
    );
    return result.rows[0] || undefined;
  } catch (error: any) {
    console.error('Error fetching payment by transaction ID:', error);
    return undefined;
  }
}

export async function updatePayment(id: number, updates: Partial<Payment>): Promise<Payment> {
  try {
    // Map camelCase to snake_case for database columns
    const fieldMapping: Record<string, string> = {
      userId: 'user_id',
      subscriptionId: 'subscription_id',
      paymentMethod: 'payment_method',
      transactionId: 'transaction_id',
      authorizationCode: 'authorization_code',
      stripePaymentIntentId: 'stripe_payment_intent_id',
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
  recordEnrollmentModification,
  recordBankingInfoChange,
  getBankingChangeHistory,

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
      stripeSubscriptionId: sub.stripe_subscription_id,
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
          plan_id,
          status,
          amount,
          start_date,
          end_date,
          pending_reason,
          pending_details,
          next_billing_date,
          stripe_subscription_id,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()
        )
        RETURNING *;
      `;

      const values = [
        sub.userId,
        sub.planId,
        sub.status || 'pending_payment',
        sub.amount,
        sub.currentPeriodStart || sub.startDate || new Date().toISOString(),
        sub.currentPeriodEnd || sub.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        sub.pendingReason || null,
        sub.pendingDetails || null,
        sub.nextBillingDate || null,
        sub.stripeSubscriptionId || null
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
        stripeSubscriptionId: data.stripe_subscription_id,
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
    if (updates.stripeSubscriptionId !== undefined) dbUpdates.stripe_subscription_id = updates.stripeSubscriptionId;
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
      stripeSubscriptionId: updatedSub.stripe_subscription_id,
      createdAt: updatedSub.created_at,
      updatedAt: updatedSub.updated_at
    };
  },
  getActiveSubscriptions,  // Use real function defined above

  createPayment,

  getUserPayments,
  getPaymentByTransactionId,
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
  getAllCommissions,
  getCommissionBySubscriptionId,
  getCommissionByMemberId,
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
      const membersResult = await query('SELECT * FROM members WHERE status = $1', ['active']);
      const subscriptionsResult = await query('SELECT * FROM subscriptions');
      const commissionsResult = await query('SELECT * FROM commissions');

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
      const totalMembers = allMembers.length;
      const totalUsers = totalAgents + totalAdmins + totalMembers;

      const activeSubscriptions = allSubscriptions.filter(sub => sub.status === 'active').length;
      const pendingSubscriptions = allSubscriptions.filter(sub => sub.status === 'pending').length;
      const cancelledSubscriptions = allSubscriptions.filter(sub => sub.status === 'cancelled').length;

      // Calculate revenue from active members (not subscriptions - legacy table)
      // Members table has total_monthly_price which is the actual enrolled plan price
      const monthlyRevenue = allMembers
        .filter(member => member.status === 'active')
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
      const membersResult = await query('SELECT * FROM members WHERE is_active = true ORDER BY created_at DESC');
      const agentsResult = await query('SELECT * FROM users WHERE role = $1 ORDER BY created_at DESC', ['agent']);
      const commissionsResult = await query('SELECT * FROM commissions ORDER BY created_at DESC');
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
        const agentMembers = allMembers.filter(m => m.enrolled_by_agent_id === agent.id);

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
          agentName: agent ? `${agent.first_name || ''} ${agent.last_name || ''}`.trim() : 'Unknown',
          agentNumber: agent?.agent_number || '',
          memberName: member ? `${member.first_name || ''} ${member.last_name || ''}`.trim() : 'Unknown',
          planName: plan?.name || '',
          commissionAmount: parseFloat(commission.commission_amount || 0),
          totalPlanCost: parseFloat(member?.total_monthly_price || 0),
          status: commission.status || 'pending',
          paymentStatus: commission.payment_status || 'pending',
          createdDate: commission.created_at || '',
          paidDate: commission.paid_at || null
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
      // Format fields to match database CHAR requirements
      const formattedData = {
        ...memberData,
        // Customer number will be generated by database function
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
          customer_number, first_name, last_name, middle_name, email,
          phone, date_of_birth, gender, ssn, address, address2, city, state, zip_code,
          emergency_contact_name, emergency_contact_phone,
          employer_name, division_name, member_type,
          date_of_hire, plan_start_date,
          enrolled_by_agent_id, agent_number, is_active, status,
          plan_id, coverage_type, total_monthly_price, add_rx_valet
        ) VALUES (
          generate_customer_number(), $1, $2, $3, $4,
          $5, $6, $7, $8, $9, $10, $11, $12, $13,
          $14, $15,
          $16, $17, $18,
          $19, $20,
          $21, $22, $23, $24,
          $25, $26, $27, $28
        ) RETURNING *
      `, [
        formattedData.firstName, formattedData.lastName, formattedData.middleName, formattedData.email,
        formattedData.phone, formattedData.dateOfBirth, formattedData.gender, formattedData.ssn,
        formattedData.address, formattedData.address2, formattedData.city, formattedData.state, formattedData.zipCode,
        formattedData.emergencyContactName, formattedData.emergencyContactPhone,
        formattedData.employerName, formattedData.divisionName, formattedData.memberType,
        formattedData.dateOfHire, formattedData.planStartDate,
        formattedData.enrolledByAgentId, formattedData.agentNumber, formattedData.isActive ?? true, formattedData.status ?? 'active',
        formattedData.planId, formattedData.coverageType, formattedData.totalMonthlyPrice, formattedData.addRxValet ?? false
      ]);

      const dbMember = result.rows[0];
      console.log('[Storage] Created member:', dbMember.customer_number);
      console.log('[Storage] Database returned columns:', Object.keys(dbMember));
      
      // Map snake_case database columns to camelCase JavaScript properties
      const member = {
        ...dbMember,
        firstName: dbMember.first_name,
        lastName: dbMember.last_name,
        middleName: dbMember.middle_name,
        customerNumber: dbMember.customer_number,
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
        isActive: dbMember.is_active,
        enrollmentDate: dbMember.enrollment_date,
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
      };

      // Build dynamic UPDATE query
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      Object.entries(formattedData).forEach(([key, value]) => {
        if (value !== undefined) {
          updates.push(`${key} = $${paramIndex}`);
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
        'SELECT * FROM members WHERE enrolled_by_agent_id = $1 ORDER BY created_at DESC',
        [agentId]
      );
      return result.rows;
    } catch (error: any) {
      console.error('[Storage] Error fetching members by agent:', error);
      throw new Error(`Failed to get members by agent: ${error.message}`);
    }
  }
} as any;