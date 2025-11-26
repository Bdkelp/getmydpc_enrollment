/**
 * Clean Commission System - TypeScript Definitions
 * This replaces the old confused commission schema with a clean, simple design
 */

import { pgTable, text, integer, decimal, timestamp, serial, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./users"; // Assuming users schema exists
import { members } from "./members"; // Assuming members schema exists  
import { subscriptions } from "./subscriptions"; // Assuming subscriptions schema exists

// Clean commission table - simple and clear
export const agentCommissions = pgTable("agent_commissions", {
  id: serial("id").primaryKey(),
  
  // Core References (simple and clear)
  agentId: text("agent_id").references(() => users.id).notNull(),
  agentNumber: text("agent_number"), // Track by agent number (MPP00001, etc.)
  memberId: integer("member_id").references(() => members.id).notNull(),
  subscriptionId: integer("subscription_id").references(() => subscriptions.id),
  
  // Commission Details
  commissionAmount: decimal("commission_amount", { precision: 10, scale: 2 }).notNull(),
  planCost: decimal("plan_cost", { precision: 10, scale: 2 }).notNull(),
  planName: text("plan_name").notNull(),
  coverageType: text("coverage_type").notNull(),
  
  // Status Tracking
  status: text("status").notNull().default("pending"),
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  
  // Timestamps
  enrollmentDate: timestamp("enrollment_date", { withTimezone: true }).notNull().defaultNow(),
  paidDate: timestamp("paid_date", { withTimezone: true }),
}, (table) => [
  // Performance indexes
  index("idx_agent_commissions_agent_id").on(table.agentId),
  index("idx_agent_commissions_agent_number").on(table.agentNumber),
  index("idx_agent_commissions_member_id").on(table.memberId),
  index("idx_agent_commissions_payment_status").on(table.paymentStatus),
  index("idx_agent_commissions_enrollment_date").on(table.enrollmentDate),
]);

// Zod schemas for validation
export const insertAgentCommissionSchema = createInsertSchema(agentCommissions, {
  commissionAmount: z.number().positive().max(1000, "Commission cannot exceed $1000"),
  planCost: z.number().positive().max(5000, "Plan cost cannot exceed $5000"),
  planName: z.string().min(1, "Plan name is required"),
  coverageType: z.enum(["Individual", "Couple", "Children", "Adult/Minor"], {
    errorMap: () => ({ message: "Coverage type must be Individual, Couple, Children, or Adult/Minor" })
  }),
  status: z.enum(["pending", "active", "cancelled"]).default("pending"),
  paymentStatus: z.enum(["unpaid", "paid", "cancelled"]).default("unpaid"),
}).omit({
  id: true,
  enrollmentDate: true,
  paidDate: true,
});

export const selectAgentCommissionSchema = createSelectSchema(agentCommissions);

export const updateAgentCommissionSchema = insertAgentCommissionSchema.partial().omit({
  agentId: true,
  memberId: true,
});

// TypeScript types
export type AgentCommission = z.infer<typeof selectAgentCommissionSchema>;
export type InsertAgentCommission = z.infer<typeof insertAgentCommissionSchema>;
export type UpdateAgentCommission = z.infer<typeof updateAgentCommissionSchema>;

// Commission calculation constants
export const COMMISSION_RATES = {
  Individual: 50,
  Couple: 75,
  Children: 60,
  "Adult/Minor": 80,
} as const;

export const PLAN_MULTIPLIERS = {
  "MyPremierPlan": 1.0,
  "MyPremierPlan Plus": 1.2,
  "MyPremierElite Plan": 1.5,
} as const;

// Helper types
export type CoverageType = keyof typeof COMMISSION_RATES;
export type PlanType = keyof typeof PLAN_MULTIPLIERS;

// Commission calculation utility
export function calculateCommission(
  coverageType: CoverageType,
  planName: string,
  planCost: number
): { commission: number; rate: number } {
  const baseCommission = COMMISSION_RATES[coverageType] || COMMISSION_RATES.Individual;
  
  // Determine plan multiplier
  let multiplier = 1.0;
  if (planName.includes("Elite")) {
    multiplier = PLAN_MULTIPLIERS["MyPremierElite Plan"];
  } else if (planName.includes("Plus")) {
    multiplier = PLAN_MULTIPLIERS["MyPremierPlan Plus"];  
  } else {
    multiplier = PLAN_MULTIPLIERS["MyPremierPlan"];
  }
  
  const finalCommission = Math.round(baseCommission * multiplier * 100) / 100;
  
  return {
    commission: finalCommission,
    rate: multiplier
  };
}

// Commission summary interface for dashboard
export interface CommissionSummary {
  totalCommissions: number;
  totalAmount: number;
  paidAmount: number;
  unpaidAmount: number;
  thisMonthCommissions: number;
  thisMonthAmount: number;
}

// Agent commission view interface  
export interface AgentCommissionView extends AgentCommission {
  agentFirstName: string;
  agentLastName: string;
  agentNumber: string;
  memberFirstName: string;
  memberLastName: string;
  memberEmail: string;
}