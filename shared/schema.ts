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
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table (required for Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
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
  stripeCustomerId: varchar("stripe_customer_id").unique(),
  stripeSubscriptionId: varchar("stripe_subscription_id").unique(),
  role: varchar("role").default("member"), // member (enrolled healthcare member), admin (system administrator), agent (insurance/sales agent)
  agentNumber: varchar("agent_number"), // Agent identifier for production tracking
  isActive: boolean("is_active").default(true),
  approvalStatus: varchar("approval_status").default("pending"), // pending, approved, rejected, suspended
  approvedAt: timestamp("approved_at"),
  approvedBy: varchar("approved_by"), // Admin who approved the user
  rejectionReason: text("rejection_reason"), // If rejected, the reason
  emailVerified: boolean("email_verified").default(false),
  emailVerifiedAt: timestamp("email_verified_at"),
  registrationIp: varchar("registration_ip"), // Track IP for bot detection
  registrationUserAgent: text("registration_user_agent"), // Track user agent
  suspiciousFlags: jsonb("suspicious_flags"), // Bot detection flags
  enrolledByAgentId: varchar("enrolled_by_agent_id"), // Track which agent enrolled this user
  // Authentication fields
  username: varchar("username"),
  passwordHash: text("password_hash"),
  emailVerificationToken: text("email_verification_token"),
  resetPasswordToken: text("reset_password_token"),
  resetPasswordExpiry: timestamp("reset_password_expiry"),
  // Social login IDs
  googleId: varchar("google_id"),
  facebookId: varchar("facebook_id"),
  appleId: varchar("apple_id"),
  microsoftId: varchar("microsoft_id"),
  linkedinId: varchar("linkedin_id"),
  twitterId: varchar("twitter_id"),
  // Session tracking
  lastLoginAt: timestamp("last_login_at"),
  lastActivityAt: timestamp("last_activity_at"),
  // Employment information
  employerName: varchar("employer_name"),
  divisionName: varchar("division_name"),
  memberType: varchar("member_type"), // employee, spouse, dependent
  ssn: varchar("ssn"), // Encrypted SSN storage
  dateOfHire: varchar("date_of_hire"),
  planStartDate: varchar("plan_start_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

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
  stripePriceId: varchar("stripe_price_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Subscriptions table
export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  planId: integer("plan_id").references(() => plans.id).notNull(),
  status: varchar("status").notNull(), // active, cancelled, suspended, pending
  pendingReason: varchar("pending_reason"), // payment_required, verification_needed, missing_documents, agent_review
  pendingDetails: text("pending_details"), // Additional details about why it's pending
  startDate: timestamp("start_date").defaultNow(),
  endDate: timestamp("end_date"),
  nextBillingDate: timestamp("next_billing_date"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  stripeSubscriptionId: varchar("stripe_subscription_id").unique(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Payments table
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  subscriptionId: integer("subscription_id").references(() => subscriptions.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency").default("USD"), // Payment currency
  status: varchar("status").notNull(), // succeeded, failed, pending, refunded
  transactionId: varchar("transaction_id").unique(), // External transaction ID
  stripePaymentIntentId: varchar("stripe_payment_intent_id").unique(),
  stripeChargeId: varchar("stripe_charge_id"),
  paymentMethod: varchar("payment_method"), // card, bank_transfer, etc
  metadata: jsonb("metadata"), // Additional payment metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Enrollment modifications audit table
export const enrollmentModifications = pgTable("enrollment_modifications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
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
export const commissions = pgTable("commissions", {
  id: serial("id").primaryKey(),
  agentId: varchar("agent_id").references(() => users.id).notNull(),
  subscriptionId: integer("subscription_id").references(() => subscriptions.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(), // The enrolled member
  planName: varchar("plan_name").notNull(),
  planType: varchar("plan_type").notNull(), // IE, C, CH, AM
  planTier: varchar("plan_tier").notNull(), // MyPremierPlan, MyPremierPlan Plus, MyPremierElite Plan
  commissionAmount: decimal("commission_amount", { precision: 10, scale: 2 }).notNull(),
  totalPlanCost: decimal("total_plan_cost", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status").notNull().default("pending"), // pending, active, cancelled, paid
  paymentStatus: varchar("payment_status").default("unpaid"), // unpaid, paid, cancelled
  paidDate: timestamp("paid_date"),
  cancellationDate: timestamp("cancellation_date"),
  cancellationReason: text("cancellation_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Leads table
export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  email: varchar("email").notNull(),
  phone: varchar("phone").notNull(),
  message: text("message"),
  source: varchar("source").default("contact_form"),
  status: varchar("status").default("new"),
  assignedAgentId: varchar("assigned_agent_id"),
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

export const familyMembers = pgTable("family_members", {
  id: serial("id").primaryKey(),
  primaryUserId: varchar("primary_user_id").references(() => users.id).notNull(),
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
});

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  subscriptions: many(subscriptions),
  payments: many(payments),
  familyMembers: many(familyMembers),
  commissions: many(commissions),
}));

export const plansRelations = relations(plans, ({ many }) => ({
  subscriptions: many(subscriptions),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  user: one(users, { fields: [subscriptions.userId], references: [users.id] }),
  plan: one(plans, { fields: [subscriptions.planId], references: [plans.id] }),
  payments: many(payments),
  commissions: many(commissions),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  user: one(users, { fields: [payments.userId], references: [users.id] }),
  subscription: one(subscriptions, { fields: [payments.subscriptionId], references: [subscriptions.id] }),
}));

export const familyMembersRelations = relations(familyMembers, ({ one }) => ({
  primaryUser: one(users, { fields: [familyMembers.primaryUserId], references: [users.id] }),
}));

export const leadsRelations = relations(leads, ({ one, many }) => ({
  assignedAgent: one(users, {
    fields: [leads.assignedAgentId],
    references: [users.id],
  }),
  activities: many(leadActivities),
}));

export const leadActivitiesRelations = relations(leadActivities, ({ one }) => ({
  lead: one(leads, {
    fields: [leadActivities.leadId],
    references: [leads.id],
  }),
  agent: one(users, {
    fields: [leadActivities.agentId],
    references: [users.id],
  }),
}));

export const commissionsRelations = relations(commissions, ({ one }) => ({
  agent: one(users, { fields: [commissions.agentId], references: [users.id] }),
  user: one(users, { fields: [commissions.userId], references: [users.id] }),
  subscription: one(subscriptions, { fields: [commissions.subscriptionId], references: [subscriptions.id] }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
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

export const insertCommissionSchema = createInsertSchema(commissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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
export type Commission = typeof commissions.$inferSelect;
export type InsertCommission = z.infer<typeof insertCommissionSchema>;
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type LeadActivity = typeof leadActivities.$inferSelect;
export type InsertLeadActivity = z.infer<typeof insertLeadActivitySchema>;