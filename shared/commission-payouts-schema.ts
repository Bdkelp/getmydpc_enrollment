/**
 * Commission Payouts Schema - Monthly Recurring Payment Tracking
 * 
 * This table tracks individual monthly commission payments for recurring subscriptions.
 * Each payout represents one month of commission for an active member subscription.
 */

import { pgTable, serial, integer, uuid, decimal, timestamp, text, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { agentCommissions } from "./clean-commission-schema";
import { payments } from "./schema";

export const commissionPayouts = pgTable("commission_payouts", {
  id: serial("id").primaryKey(),
  
  // Link to base commission relationship
  commissionId: uuid("commission_id")
    .references(() => agentCommissions.id, { onDelete: "cascade" })
    .notNull(),
  
  // Payout Period
  payoutMonth: date("payout_month", { mode: "string" }).notNull(), // YYYY-MM-01 format
  
  // Payment Tracking
  paymentCapturedAt: timestamp("payment_captured_at", { withTimezone: true }),
  paymentEligibleDate: timestamp("payment_eligible_date", { withTimezone: true }),
  
  // Amount
  payoutAmount: decimal("payout_amount", { precision: 10, scale: 2 }).notNull(),
  
  // Commission Type (direct or override)
  commissionType: text("commission_type").notNull().default("direct"), // 'direct' or 'override'
  overrideForAgentId: text("override_for_agent_id"), // If override, which downline agent
  
  // Status
  status: text("status").notNull().default("pending"),
  paidDate: timestamp("paid_date", { withTimezone: true }),
  
  // References
  memberPaymentId: integer("member_payment_id").references(() => payments.id),
  epxTransactionId: text("epx_transaction_id"),
  batchId: text("batch_id"),
  
  // Metadata
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  // Performance indexes
  index("idx_commission_payouts_commission_id").on(table.commissionId),
  index("idx_commission_payouts_payout_month").on(table.payoutMonth),
  index("idx_commission_payouts_status").on(table.status),
  index("idx_commission_payouts_payment_eligible_date").on(table.paymentEligibleDate),
  index("idx_commission_payouts_batch_id").on(table.batchId),
]);

// Zod validation schemas
export const insertCommissionPayoutSchema = createInsertSchema(commissionPayouts, {
  commissionId: z.string().uuid(),
  payoutMonth: z.string().regex(/^\d{4}-\d{2}-01$/, "Must be first day of month (YYYY-MM-01)"),
  payoutAmount: z.number().positive().max(1000, "Payout cannot exceed $1000"),
  status: z.enum(["pending", "paid", "cancelled", "ineligible"], {
    errorMap: () => ({ message: "Status must be: pending, paid, cancelled, or ineligible" })
  }).default("pending"),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectCommissionPayoutSchema = createSelectSchema(commissionPayouts);

export const updateCommissionPayoutSchema = insertCommissionPayoutSchema.partial().omit({
  commissionId: true,
  payoutMonth: true,
});

// TypeScript types
export type CommissionPayout = z.infer<typeof selectCommissionPayoutSchema>;
export type InsertCommissionPayout = z.infer<typeof insertCommissionPayoutSchema>;
export type UpdateCommissionPayout = z.infer<typeof updateCommissionPayoutSchema>;

// Helper type for API responses with joined data
export interface CommissionPayoutWithDetails extends CommissionPayout {
  agentId?: string;
  agentNumber?: string;
  agentName?: string;
  memberId?: string;
  memberName?: string;
  planName?: string;
  coverageType?: string;
}

// Status enum for type safety
export const PayoutStatus = {
  PENDING: "pending" as const,
  PAID: "paid" as const,
  CANCELLED: "cancelled" as const,
  INELIGIBLE: "ineligible" as const,
};

export type PayoutStatusType = typeof PayoutStatus[keyof typeof PayoutStatus];
