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

// App Users table (agents and admins ONLY)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique().notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  phone: varchar("phone"),
  role: varchar("role").notNull().default("agent"), // only 'agent' or 'admin'
  agentNumber: varchar("agent_number").unique(),
  isActive: boolean("is_active").default(true),
  emailVerified: boolean("email_verified").default(false),
  emailVerifiedAt: timestamp("email_verified_at"),
  lastLoginAt: timestamp("last_login_at"),
  lastActivityAt: timestamp("last_activity_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Members table (MPP product subscribers - NO app access)
export const members = pgTable("members", {
  id: serial("id").primaryKey(),
  email: varchar("email").unique(),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  middleName: varchar("middle_name"),
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
  approvalStatus: varchar("approval_status").default("pending"),
  approvedAt: timestamp("approved_at"),
  approvedBy: varchar("approved_by").references(() => users.id), // references app user (admin)
  rejectionReason: text("rejection_reason"),
  registrationIp: varchar("registration_ip"),
  suspiciousFlags: jsonb("suspicious_flags"),
  enrolledByAgentId: varchar("enrolled_by_agent_id").references(() => users.id), // references app user (agent)
  employerName: varchar("employer_name"),
  divisionName: varchar("division_name"),
  memberType: varchar("member_type"),
  ssn: varchar("ssn"),
  dateOfHire: varchar("date_of_hire"),
  planStartDate: varchar("plan_start_date"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Plans table
export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  billingPeriod: varchar("billing_period").default("monthly"),
  features: jsonb("features"),
  maxMembers: integer("max_members").default(1),
  isActive: boolean("is_active").default(true),
  stripePriceId: varchar("stripe_price_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Subscriptions table (links members to plans)
export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").references(() => members.id).notNull(),
  planId: integer("plan_id").references(() => plans.id).notNull(),
  status: varchar("status").notNull(),
  pendingReason: varchar("pending_reason"),
  pendingDetails: text("pending_details"),
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
  memberId: integer("member_id").references(() => members.id).notNull(),
  subscriptionId: integer("subscription_id").references(() => subscriptions.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency").default("USD"),
  status: varchar("status").notNull(),
  transactionId: varchar("transaction_id").unique(),
  stripePaymentIntentId: varchar("stripe_payment_intent_id").unique(),
  stripeChargeId: varchar("stripe_charge_id"),
  paymentMethod: varchar("payment_method"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Commission tracking table (links agents to member subscriptions)
export const commissions = pgTable("commissions", {
  id: serial("id").primaryKey(),
  agentId: varchar("agent_id").references(() => users.id).notNull(), // app user (agent)
  memberId: integer("member_id").references(() => members.id).notNull(), // MPP member
  subscriptionId: integer("subscription_id").references(() => subscriptions.id).notNull(),
  planName: varchar("plan_name").notNull(),
  planType: varchar("plan_type").notNull(),
  planTier: varchar("plan_tier").notNull(),
  commissionAmount: decimal("commission_amount", { precision: 10, scale: 2 }).notNull(),
  totalPlanCost: decimal("total_plan_cost", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status").notNull().default("pending"),
  paymentStatus: varchar("payment_status").default("unpaid"),
  paidDate: timestamp("paid_date"),
  cancellationDate: timestamp("cancellation_date"),
  cancellationReason: text("cancellation_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

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
  assignedAgentId: varchar("assigned_agent_id", { length: 255 }).references(() => users.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const leadActivities = pgTable("lead_activities", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").references(() => leads.id),
  agentId: varchar("agent_id", { length: 255 }).references(() => users.id),
  activityType: varchar("activity_type", { length: 50 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const familyMembers = pgTable("family_members", {
  id: serial("id").primaryKey(),
  primaryMemberId: integer("primary_member_id").references(() => members.id).notNull(),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  middleName: varchar("middle_name"),
  dateOfBirth: varchar("date_of_birth"),
  gender: varchar("gender"),
  ssn: varchar("ssn"),
  email: varchar("email"),
  phone: varchar("phone"),
  relationship: varchar("relationship"),
  memberType: varchar("member_type").notNull(),
  address: text("address"),
  address2: text("address2"),
  city: varchar("city"),
  state: varchar("state"),
  zipCode: varchar("zip_code"),
  planStartDate: varchar("plan_start_date"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Enrollment modifications audit table
export const enrollmentModifications = pgTable("enrollment_modifications", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").references(() => members.id).notNull(),
  subscriptionId: integer("subscription_id").references(() => subscriptions.id),
  modifiedBy: varchar("modified_by").references(() => users.id).notNull(), // app user (agent/admin)
  changeType: varchar("change_type").notNull(),
  changeDetails: jsonb("change_details"),
  consentType: varchar("consent_type"),
  consentNotes: text("consent_notes"),
  consentDate: timestamp("consent_date"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  enrolledMembers: many(members, { relationName: "enrolledBy" }),
  approvedMembers: many(members, { relationName: "approvedBy" }),
  commissions: many(commissions),
  leads: many(leads),
}));

export const membersRelations = relations(members, ({ one, many }) => ({
  enrolledByAgent: one(users, { 
    fields: [members.enrolledByAgentId], 
    references: [users.id],
    relationName: "enrolledBy"
  }),
  approvedByAdmin: one(users, { 
    fields: [members.approvedBy], 
    references: [users.id],
    relationName: "approvedBy"
  }),
  subscriptions: many(subscriptions),
  payments: many(payments),
  familyMembers: many(familyMembers),
  commissions: many(commissions),
}));

export const plansRelations = relations(plans, ({ many }) => ({
  subscriptions: many(subscriptions),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  member: one(members, { fields: [subscriptions.memberId], references: [members.id] }),
  plan: one(plans, { fields: [subscriptions.planId], references: [plans.id] }),
  payments: many(payments),
  commissions: many(commissions),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  member: one(members, { fields: [payments.memberId], references: [members.id] }),
  subscription: one(subscriptions, { fields: [payments.subscriptionId], references: [subscriptions.id] }),
}));

export const familyMembersRelations = relations(familyMembers, ({ one }) => ({
  primaryMember: one(members, { fields: [familyMembers.primaryMemberId], references: [members.id] }),
}));

export const commissionsRelations = relations(commissions, ({ one }) => ({
  agent: one(users, { fields: [commissions.agentId], references: [users.id] }),
  member: one(members, { fields: [commissions.memberId], references: [members.id] }),
  subscription: one(subscriptions, { fields: [commissions.subscriptionId], references: [subscriptions.id] }),
}));

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
export type User = typeof users.$inferSelect;
export type Member = typeof members.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type FamilyMember = typeof familyMembers.$inferSelect;
export type Commission = typeof commissions.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type LeadActivity = typeof leadActivities.$inferSelect;
export type InsertMember = z.infer<typeof insertMemberSchema>;