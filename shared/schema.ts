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
  role: varchar("role").default("user"), // user, admin, agent
  agentNumber: varchar("agent_number").unique(), // Unique agent identifier for production tracking
  isActive: boolean("is_active").default(true),
  approvalStatus: varchar("approval_status").default("pending"), // pending, approved, rejected
  approvedAt: timestamp("approved_at"),
  approvedBy: varchar("approved_by"), // Admin who approved the user
  rejectionReason: text("rejection_reason"), // If rejected, the reason
  emailVerified: boolean("email_verified").default(false),
  emailVerifiedAt: timestamp("email_verified_at"),
  registrationIp: varchar("registration_ip"), // Track IP for bot detection
  registrationUserAgent: text("registration_user_agent"), // Track user agent
  suspiciousFlags: jsonb("suspicious_flags"), // Bot detection flags
  enrolledByAgentId: varchar("enrolled_by_agent_id"), // Track which agent enrolled this user
  // Employment information
  employerName: varchar("employer_name"),
  divisionName: varchar("division_name"),
  memberType: varchar("member_type"), // employee, spouse, dependent
  ssn: varchar("ssn"), // encrypted
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
  status: varchar("status").notNull(), // succeeded, failed, pending, refunded
  stripePaymentIntentId: varchar("stripe_payment_intent_id").unique(),
  stripeChargeId: varchar("stripe_charge_id"),
  paymentMethod: varchar("payment_method"), // card, bank_transfer, etc
  createdAt: timestamp("created_at").defaultNow(),
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

// Family members table (for family plans)
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
  ssn: varchar("ssn"), // encrypted
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
}));

export const plansRelations = relations(plans, ({ many }) => ({
  subscriptions: many(subscriptions),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  user: one(users, { fields: [subscriptions.userId], references: [users.id] }),
  plan: one(plans, { fields: [subscriptions.planId], references: [plans.id] }),
  payments: many(payments),
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

// Registration schema for multi-step form
export const registrationSchema = z.object({
  // Personal information
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  middleName: z.string().optional(),
  ssn: z.string().optional(),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(10, "Valid phone number is required"),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  gender: z.string().optional(),
  // Address information
  address: z.string().min(1, "Address is required"),
  address2: z.string().optional(),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  zipCode: z.string().min(5, "Valid ZIP code is required"),
  // Employment information (required for group enrollments only)
  employerName: z.string().optional(),
  divisionName: z.string().optional(),
  dateOfHire: z.string().optional(),
  memberType: z.string().min(1, "Member type is required"),
  planStartDate: z.string().min(1, "Plan start date is required"),
  // Emergency contact
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
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
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type LeadActivity = typeof leadActivities.$inferSelect;
export type InsertLeadActivity = z.infer<typeof insertLeadActivitySchema>;
