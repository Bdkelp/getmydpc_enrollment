import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  integer,
  decimal,
  boolean,
  serial,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Session storage table (legacy - not actively used, Supabase handles sessions)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table - ONLY for agents/admins with login access (NOT members)
export const users = pgTable("users", {
  id: uuid("id").primaryKey().notNull(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  middleName: varchar("middle_name"),
  profileImageUrl: varchar("profile_image_url"),
  phone: varchar("phone"),
  dateOfBirth: varchar("date_of_birth"),
  gender: varchar("gender"),
  address: text("address"),
  address2: text("address2"),
  city: varchar("city"),
  state: varchar("state"),
  zipCode: varchar("zip_code"),
  emergencyContactName: varchar("emergency_contact_name"),
  emergencyContactPhone: varchar("emergency_contact_phone"),
  // Role & Agent Information
  role: varchar("role").default("agent"), // agent, admin, super_admin (NO "member" - members are in separate table)
  agentNumber: varchar("agent_number").notNull(), // Required for all users: MPP0001, MPP0002, etc.
  isActive: boolean("is_active").default(true),
  // Approval Workflow
  approvalStatus: varchar("approval_status").default("pending"), // pending, approved, rejected, suspended
  approvedAt: timestamp("approved_at"),
  approvedBy: uuid("approved_by"), // Admin who approved the user
  rejectionReason: text("rejection_reason"), // If rejected, the reason
  // Email Verification
  emailVerified: boolean("email_verified").default(false),
  emailVerifiedAt: timestamp("email_verified_at"),
  // Password Management
  passwordChangeRequired: boolean("password_change_required").default(false), // Force password change on next login
  lastPasswordChangeAt: timestamp("last_password_change_at"),
  // Security & Bot Detection
  registrationIp: varchar("registration_ip"), // Track IP for bot detection
  registrationUserAgent: text("registration_user_agent"), // Track user agent
  suspiciousFlags: jsonb("suspicious_flags"), // Bot detection flags
  // Session Tracking
  lastLoginAt: timestamp("last_login_at"),
  lastActivityAt: timestamp("last_activity_at"),
  // Agent Hierarchy (for downline/upline structure)
  uplineAgentId: uuid("upline_agent_id"),
  hierarchyLevel: integer("hierarchy_level").default(0),
  canReceiveOverrides: boolean("can_receive_overrides").default(false),
  overrideCommissionRate: decimal("override_commission_rate", { precision: 5, scale: 2 }).default("0"),
  // Banking Information (for commission payouts)
  bankName: varchar("bank_name"),
  routingNumber: varchar("routing_number", { length: 9 }), // 9-digit ABA routing number
  accountNumber: varchar("account_number"), // Bank account number
  accountType: varchar("account_type"), // checking, savings
  accountHolderName: varchar("account_holder_name"), // Name on the account (may differ from user name)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Members table - Enrolled healthcare customers (NO authentication access)
// Field types match fresh_start_migration.sql - using CHAR for fixed-length fields
export const members = pgTable("members", {
  id: serial("id").primaryKey(),
  // Customer identifier: 10-character alphanumeric (e.g., A3B7K9M2P5)
  customerNumber: varchar("customer_number", { length: 10 }).unique().notNull(),
  // Personal information
  firstName: varchar("first_name", { length: 50 }).notNull(),
  lastName: varchar("last_name", { length: 50 }).notNull(),
  middleName: varchar("middle_name", { length: 50 }),
  email: varchar("email", { length: 100 }).unique().notNull(),
  // Phone: US numbers - stored as digits only, but allow extra space for formatting during input
  phone: varchar("phone", { length: 20 }), // Allow formatted input, backend strips to 10 digits
  // Date of Birth: MMDDYYYY format (8 chars: 01151990 = Jan 15, 1990)
  dateOfBirth: varchar("date_of_birth", { length: 8 }), // CHAR(8) in DB
  // Gender: M, F, O (1 char)
  gender: varchar("gender", { length: 1 }), // CHAR(1) in DB
  // SSN: 9 digits encrypted (stored encrypted, needs space for IV + encrypted data)
  ssn: varchar("ssn", { length: 200 }), // Encrypted SSN storage - needs more space for encryption
  // Address information
  address: varchar("address", { length: 100 }),
  address2: varchar("address2", { length: 50 }),
  city: varchar("city", { length: 50 }),
  // State: US state code (2 chars: TX, CA)
  state: varchar("state", { length: 2 }), // CHAR(2) in DB
  // ZIP code: 5 digits only (78701)
  zipCode: varchar("zip_code", { length: 5 }), // CHAR(5) in DB
  // Emergency contact
  emergencyContactName: varchar("emergency_contact_name", { length: 100 }),
  // Emergency phone: Allow formatted input, backend strips to 10 digits
  emergencyContactPhone: varchar("emergency_contact_phone", { length: 20 }), // Allow formatted input
  // Employment information
  employerName: varchar("employer_name", { length: 100 }),
  divisionName: varchar("division_name", { length: 100 }),
  memberType: varchar("member_type", { length: 20 }), // employee, spouse, dependent
  // Date of Hire: MMDDYYYY format (8 chars)
  dateOfHire: varchar("date_of_hire", { length: 8 }), // CHAR(8) in DB
  // Plan Start Date: MMDDYYYY format (8 chars)
  planStartDate: varchar("plan_start_date", { length: 8 }), // CHAR(8) in DB
  // Enrollment tracking
  enrolledByAgentId: varchar("enrolled_by_agent_id", { length: 255 }).references(() => users.id),
  agentNumber: varchar("agent_number", { length: 20 }), // MPP0001, MPP0002, etc.
  enrollmentDate: timestamp("enrollment_date").defaultNow(), // When they enrolled/paid (variable date)
  firstPaymentDate: timestamp("first_payment_date"), // First payment date (same as enrollmentDate, used for recurring billing)
  membershipStartDate: timestamp("membership_start_date"), // When membership actually begins (1st or 15th only)
  // Payment token storage (for recurring billing)
  paymentToken: varchar("payment_token", { length: 255 }), // BRIC token from EPX Hosted Checkout
  paymentMethodType: varchar("payment_method_type", { length: 20 }), // CreditCard, BankAccount
  // Plan and pricing information
  planId: integer("plan_id").references(() => plans.id), // Selected plan
  coverageType: varchar("coverage_type", { length: 50 }), // Member Only, Member/Spouse, Member/Child, Family
  totalMonthlyPrice: decimal("total_monthly_price", { precision: 10, scale: 2 }), // Total price including add-ons
  addRxValet: boolean("add_rx_valet").default(false), // ProChoice Rx add-on ($21/month)
  // Status
  isActive: boolean("is_active").default(true),
  status: varchar("status", { length: 20 }).default("pending_activation"), // pending_activation, active, cancelled, suspended, pending
  cancellationDate: timestamp("cancellation_date"),
  cancellationReason: text("cancellation_reason"),
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_members_customer_number").on(table.customerNumber),
  index("idx_members_email").on(table.email),
  index("idx_members_enrolled_by").on(table.enrolledByAgentId),
  index("idx_members_status").on(table.status),
  index("idx_members_phone").on(table.phone),
  index("idx_members_last_name").on(table.lastName),
]);

// Plans table
export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  billingPeriod: varchar("billing_period").default("monthly"), // monthly, yearly
  features: jsonb("features"), // Array of features
  maxMembers: integer("max_members").default(1),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Subscriptions table
export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id), // For staff subscriptions (nullable)
  memberId: integer("member_id").references(() => members.id), // For member subscriptions (nullable)
  // Note: Either userId OR memberId must be set, enforced by CHECK constraint in migration
  planId: integer("plan_id").references(() => plans.id).notNull(),
  status: varchar("status").notNull(), // active, cancelled, suspended, pending
  pendingReason: varchar("pending_reason"), // payment_required, verification_needed, missing_documents, agent_review
  pendingDetails: text("pending_details"), // Additional details about why it's pending
  startDate: timestamp("start_date").defaultNow(),
  endDate: timestamp("end_date"),
  nextBillingDate: timestamp("next_billing_date"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  epxSubscriptionId: varchar("epx_subscription_id", { length: 100 }).unique(), // EPX recurring billing subscription ID
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_subscriptions_member_id").on(table.memberId),
]);

// Payments table
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id), // For staff payments (nullable)
  memberId: integer("member_id").references(() => members.id), // For member payments (nullable)
  // Note: Either userId OR memberId must be set, enforced by CHECK constraint in migration
  subscriptionId: integer("subscription_id").references(() => subscriptions.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency").default("USD"), // Payment currency
  status: varchar("status").notNull(), // succeeded, failed, pending, refunded
  transactionId: varchar("transaction_id").unique(), // External transaction ID
  paymentMethod: varchar("payment_method"), // card, bank_transfer, etc
  epxAuthGuid: varchar("epx_auth_guid", { length: 255 }),
  metadata: jsonb("metadata"), // Additional payment metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_payments_member_id").on(table.memberId),
]);

// Enrollment modifications audit table
export const enrollmentModifications = pgTable("enrollment_modifications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id), // nullable - could be member
  memberId: integer("member_id").references(() => members.id), // nullable - for member modifications
  subscriptionId: integer("subscription_id").references(() => subscriptions.id),
  modifiedBy: varchar("modified_by").references(() => users.id).notNull(), // Agent or admin who made the change
  changeType: varchar("change_type").notNull(), // plan_change, info_update, status_change, etc.
  changeDetails: jsonb("change_details"), // JSON with before/after values
  consentType: varchar("consent_type"), // verbal, written, email
  consentNotes: text("consent_notes"), // Details about how consent was obtained
  consentDate: timestamp("consent_date"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Commission tracking table
// REMOVED: Old commissions table - now using agent_commissions instead
// See clean-commission-schema.ts for the new structure

// Leads table
export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  firstName: varchar("first_name", { length: 255 }).notNull(),
  lastName: varchar("last_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }).notNull(),
  message: text("message"),
  source: varchar("source", { length: 50 }).default("contact_form"),
  status: varchar("status", { length: 50 }).default("new"),
  assignedAgentId: varchar("assigned_agent_id", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const leadActivities = pgTable("lead_activities", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").references(() => leads.id),
  agentId: varchar("agent_id", { length: 255 }),
  activityType: varchar("activity_type", { length: 50 }), // call, email, meeting, note
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Admin notifications for system alerts
export const adminNotifications = pgTable("admin_notifications", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 50 }).notNull(), // epx_subscription_failed, payment_failed, etc
  memberId: integer("member_id").references(() => members.id),
  subscriptionId: integer("subscription_id").references(() => subscriptions.id),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"), // Additional context
  resolved: boolean("resolved").default(false),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_admin_notifications_resolved").on(table.resolved),
  index("idx_admin_notifications_type").on(table.type),
  index("idx_admin_notifications_created_at").on(table.createdAt),
]);

export const familyMembers = pgTable("family_members", {
  id: serial("id").primaryKey(),
  primaryUserId: varchar("primary_user_id").references(() => users.id), // For staff (nullable)
  primaryMemberId: integer("primary_member_id").references(() => members.id), // For members (nullable)
  // Note: Either primaryUserId OR primaryMemberId must be set, enforced by CHECK constraint in migration
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  middleName: varchar("middle_name"),
  dateOfBirth: varchar("date_of_birth"),
  gender: varchar("gender"),
  ssn: varchar("ssn"),
  email: varchar("email"),
  phone: varchar("phone"),
  relationship: varchar("relationship"), // spouse, child, parent, etc
  memberType: varchar("member_type").notNull(), // spouse, dependent
  address: text("address"),
  address2: text("address2"),
  city: varchar("city"),
  state: varchar("state"),
  zipCode: varchar("zip_code"),
  planStartDate: varchar("plan_start_date"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table: any) => [
  index("idx_family_members_primary_member_id").on(table.primaryMemberId),
]);

// ============================================================
// EPX SERVER POST - RECURRING BILLING TABLES
// ============================================================

// Payment Tokens (Card on File - BRIC tokens)
export const paymentTokens = pgTable("payment_tokens", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").references(() => members.id, { onDelete: "cascade" }).notNull(),
  
  // EPX BRIC Token (treat like password - secure storage)
  bricToken: varchar("bric_token", { length: 255 }).notNull().unique(),
  
  // Card display information (for member UI)
  cardLastFour: varchar("card_last_four", { length: 4 }),
  cardType: varchar("card_type", { length: 50 }), // Visa, Mastercard, Discover, Amex
  expiryMonth: varchar("expiry_month", { length: 2 }),
  expiryYear: varchar("expiry_year", { length: 4 }),
  
  // Card network tracking (CRITICAL for recurring charges)
  originalNetworkTransId: varchar("original_network_trans_id", { length: 255 }),
  
  // Token management
  isActive: boolean("is_active").default(true),
  isPrimary: boolean("is_primary").default(false),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
}, (table: any) => [
  index("idx_payment_tokens_member_id").on(table.memberId),
  index("idx_payment_tokens_bric").on(table.bricToken),
]);

// Billing Schedule (recurring billing management)
export const billingSchedule = pgTable("billing_schedule", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").references(() => members.id, { onDelete: "cascade" }).notNull(),
  paymentTokenId: integer("payment_token_id").references(() => paymentTokens.id, { onDelete: "restrict" }).notNull(),
  
  // Billing configuration
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  frequency: varchar("frequency", { length: 20 }).default("monthly"), // monthly, quarterly, annual
  
  // Schedule tracking
  nextBillingDate: timestamp("next_billing_date").notNull(),
  lastBillingDate: timestamp("last_billing_date"),
  lastSuccessfulBilling: timestamp("last_successful_billing"),
  
  // Status management
  status: varchar("status", { length: 20 }).default("active"), // active, paused, cancelled, suspended
  
  // Failure tracking
  consecutiveFailures: integer("consecutive_failures").default(0),
  lastFailureReason: text("last_failure_reason"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  cancelledAt: timestamp("cancelled_at"),
  cancellationReason: text("cancellation_reason"),
}, (table: any) => [
  index("idx_billing_schedule_member").on(table.memberId),
  index("idx_billing_schedule_token").on(table.paymentTokenId),
  index("idx_billing_schedule_next_billing").on(table.nextBillingDate),
  index("idx_billing_schedule_status").on(table.status),
]);

// Recurring Billing Log (audit trail)
export const recurringBillingLog = pgTable("recurring_billing_log", {
  id: serial("id").primaryKey(),
  
  // References
  subscriptionId: integer("subscription_id").references(() => subscriptions.id, { onDelete: "cascade" }),
  memberId: integer("member_id").references(() => members.id, { onDelete: "cascade" }).notNull(),
  paymentTokenId: integer("payment_token_id").references(() => paymentTokens.id),
  billingScheduleId: integer("billing_schedule_id").references(() => billingSchedule.id),
  
  // Charge details
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  billingDate: timestamp("billing_date").notNull(),
  attemptNumber: integer("attempt_number").default(1),
  
  // Status
  status: varchar("status", { length: 50 }).notNull(), // success, failed, pending, retry
  
  // EPX response data
  epxTransactionId: varchar("epx_transaction_id", { length: 255 }),
  epxNetworkTransId: varchar("epx_network_trans_id", { length: 255 }),
  epxAuthCode: varchar("epx_auth_code", { length: 50 }),
  epxResponseCode: varchar("epx_response_code", { length: 10 }),
  epxResponseMessage: text("epx_response_message"),
  
  // Failure handling
  failureReason: text("failure_reason"),
  nextRetryDate: timestamp("next_retry_date"),
  
  // Link to payments table if successful
  paymentId: integer("payment_id").references(() => payments.id),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  processedAt: timestamp("processed_at"),
}, (table: any) => [
  index("idx_billing_log_subscription").on(table.subscriptionId),
  index("idx_billing_log_member").on(table.memberId),
  index("idx_billing_log_status").on(table.status),
    index("idx_billing_log_billing_date").on(table.billingDate),
]);

// Member Change Requests (for plan changes, upgrades, cancellations)
export const memberChangeRequests = pgTable("member_change_requests", {
  id: serial("id").primaryKey(),
  
  // References
  memberId: integer("member_id").references(() => members.id, { onDelete: "cascade" }).notNull(),
  requestedBy: varchar("requested_by", { length: 255 }).references(() => users.id).notNull(), // Agent who submitted
  reviewedBy: varchar("reviewed_by", { length: 255 }).references(() => users.id), // Admin who reviewed
  
  // Change details
  changeType: varchar("change_type", { length: 50 }).notNull(), // plan_upgrade, plan_downgrade, add_family_member, cancel, update_payment
  currentPlanId: integer("current_plan_id").references(() => plans.id),
  requestedPlanId: integer("requested_plan_id").references(() => plans.id),
  
  // JSON field for flexible change data
  changeDetails: jsonb("change_details"), // Stores any additional change information
  requestReason: text("request_reason"), // Why the change is needed
  
  // Status
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, approved, rejected, completed
  
  // Review
  reviewNotes: text("review_notes"), // Admin notes on approval/rejection
  reviewedAt: timestamp("reviewed_at"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("idx_change_requests_member").on(table.memberId),
  index("idx_change_requests_status").on(table.status),
  index("idx_change_requests_requested_by").on(table.requestedBy),
]);

// Platform-wide configuration storage (runtime toggles, etc.)
export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
});

// Relations
export const usersRelations = relations(users, ({ many, one }: any) => ({
  subscriptions: many(subscriptions),
  payments: many(payments),
  familyMembers: many(familyMembers),
  // commissions removed - use agent_commissions table
}));

export const membersRelations = relations(members, ({ many, one }: any) => ({
  subscriptions: many(subscriptions),
  payments: many(payments),
  familyMembers: many(familyMembers),
  // commissions removed - use agent_commissions table
  enrolledByAgent: one(users, { fields: [members.enrolledByAgentId], references: [users.id] }),
}));

export const plansRelations = relations(plans, ({ many }: any) => ({
  subscriptions: many(subscriptions),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }: any) => ({
  user: one(users, { fields: [subscriptions.userId], references: [users.id] }),
  member: one(members, { fields: [subscriptions.memberId], references: [members.id] }),
  plan: one(plans, { fields: [subscriptions.planId], references: [plans.id] }),
  payments: many(payments),
  // commissions removed - use agent_commissions table
}));

export const paymentsRelations = relations(payments, ({ one }: any) => ({
  user: one(users, { fields: [payments.userId], references: [users.id] }),
  member: one(members, { fields: [payments.memberId], references: [members.id] }),
  subscription: one(subscriptions, { fields: [payments.subscriptionId], references: [subscriptions.id] }),
}));

export const familyMembersRelations = relations(familyMembers, ({ one }: any) => ({
  primaryUser: one(users, { fields: [familyMembers.primaryUserId], references: [users.id] }),
  primaryMember: one(members, { fields: [familyMembers.primaryMemberId], references: [members.id] }),
}));

export const leadsRelations = relations(leads, ({ one, many }: any) => ({
  assignedAgent: one(users, {
    fields: [leads.assignedAgentId],
    references: [users.id],
  }),
  activities: many(leadActivities),
}));

export const leadActivitiesRelations = relations(leadActivities, ({ one }: any) => ({
  lead: one(leads, {
    fields: [leadActivities.leadId],
    references: [leads.id],
  }),
  agent: one(users, {
    fields: [leadActivities.agentId],
    references: [users.id],
  }),
}));

// REMOVED: commissionsRelations - old commissions table deprecated
// Use agent_commissions table instead (see clean-commission-schema.ts)

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMemberSchema = createInsertSchema(members).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPlanSchema = createInsertSchema(plans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
});

export const insertFamilyMemberSchema = createInsertSchema(familyMembers).omit({
  id: true,
  createdAt: true,
});

export const insertLeadSchema = createInsertSchema(leads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLeadActivitySchema = createInsertSchema(leadActivities).omit({
  id: true,
  createdAt: true,
});

// REMOVED: insertCommissionSchema - old commissions table deprecated
// Use agent_commissions table insert schema from clean-commission-schema.ts

// EPX Server Post insert schemas
export const insertPaymentTokenSchema = createInsertSchema(paymentTokens).omit({
  id: true,
  createdAt: true,
});

export const insertBillingScheduleSchema = createInsertSchema(billingSchedule).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRecurringBillingLogSchema = createInsertSchema(recurringBillingLog).omit({
  id: true,
  createdAt: true,
});

// Custom validation functions
const isValidUSAPhone = (phone: string) => {
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, '');
  // Check if it's 10 digits (US number without country code) or 11 digits (with country code 1)
  return cleaned.length === 10 || (cleaned.length === 11 && cleaned[0] === '1');
};

const isPastDate = (dateString: string) => {
  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
};

const isWithinNext30Days = (dateString: string) => {
  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thirtyDaysFromNow = new Date(today);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  return date >= today && date <= thirtyDaysFromNow;
};

// Registration schema for multi-step form
export const registrationSchema = z.object({
  // Personal information
  firstName: z.string().min(1, "First name is required").regex(/^[a-zA-Z\s'-]+$/, "First name can only contain letters, spaces, hyphens, and apostrophes"),
  lastName: z.string().min(1, "Last name is required").regex(/^[a-zA-Z\s'-]+$/, "Last name can only contain letters, spaces, hyphens, and apostrophes"),
  middleName: z.string().regex(/^[a-zA-Z\s'-]*$/, "Middle name can only contain letters, spaces, hyphens, and apostrophes").optional(),
  ssn: z.string().optional(),
  email: z.string().email("Valid email address is required").toLowerCase(),
  phone: z.string()
    .min(10, "Phone number must be at least 10 digits")
    .refine(isValidUSAPhone, "Must be a valid USA phone number (10 or 11 digits)"),
  dateOfBirth: z.string()
    .min(1, "Date of birth is required")
    .refine(isPastDate, "Date of birth must be in the past"),
  gender: z.string().optional(),
  // Address information
  address: z.string().min(1, "Address is required"),
  address2: z.string().optional(),
  city: z.string().min(1, "City is required").regex(/^[a-zA-Z\s'-]+$/, "City name can only contain letters, spaces, hyphens, and apostrophes"),
  state: z.string().length(2, "State must be 2-letter abbreviation").toUpperCase(),
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/, "ZIP code must be 5 digits or 5+4 format"),
  // Employment information (required for group enrollments only)
  employerName: z.string().optional(),
  divisionName: z.string().optional(),
  dateOfHire: z.string().optional(),
  memberType: z.string().min(1, "Member type is required"),
  planStartDate: z.string()
    .min(1, "Plan start date is required")
    .refine(isWithinNext30Days, "Plan start date must be today or within the next 30 days"),
  // Emergency contact
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string()
    .optional()
    .refine((val) => !val || isValidUSAPhone(val), "Must be a valid USA phone number"),
  // Plan selection
  planId: z.number().min(1, "Plan selection is required"),
  termsAccepted: z.boolean().refine(val => val === true, "Terms must be accepted"),
  communicationsConsent: z.boolean().default(false),
  privacyNoticeAcknowledged: z.boolean().refine(val => val === true, "Privacy notice must be acknowledged"),
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type Member = typeof members.$inferSelect;
export type InsertMember = z.infer<typeof insertMemberSchema>;
export type Plan = typeof plans.$inferSelect;
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type FamilyMember = typeof familyMembers.$inferSelect;
export type InsertFamilyMember = z.infer<typeof insertFamilyMemberSchema>;
export type RegistrationData = z.infer<typeof registrationSchema>;
export type Lead = typeof leads.$inferSelect;
// Commission types now come from clean-commission-schema.ts (agent_commissions table)
export type { AgentCommission as Commission, InsertAgentCommission as InsertCommission } from './clean-commission-schema';
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type LeadActivity = typeof leadActivities.$inferSelect;
export type InsertLeadActivity = z.infer<typeof insertLeadActivitySchema>;

// EPX Server Post types
export type PaymentToken = typeof paymentTokens.$inferSelect;
export type InsertPaymentToken = z.infer<typeof insertPaymentTokenSchema>;
export type BillingSchedule = typeof billingSchedule.$inferSelect;
export type InsertBillingSchedule = z.infer<typeof insertBillingScheduleSchema>;
export type RecurringBillingLog = typeof recurringBillingLog.$inferSelect;
export type InsertRecurringBillingLog = z.infer<typeof insertRecurringBillingLogSchema>;
export type PlatformSetting = typeof platformSettings.$inferSelect;
export type InsertPlatformSetting = typeof platformSettings.$inferInsert;