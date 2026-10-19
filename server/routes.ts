Warning: truncated output (original token count: 103352)
Total output lines: 12529

// @ts-nocheck - Temporarily disable strict type checking for legacy code
import { Router } from "express";
import { storage } from "./storage";
import { authenticateToken, type AuthRequest } from "./auth/supabaseAuth";
import { hasAtLeastRole, isFullAccessEmail, normalizeRole } from "./auth/roles";
import {
  calculateCommission,
  getPlanTierFromName,
  getPlanTypeFromMemberType,
  RX_VALET_COMMISSION,
} from "./commissionCalculator"; // FIXED: Using actual commission rates
import {
  sendLeadSubmissionEmails,
  sendManualConfirmationEmail,
  sendPartnerInquiryEmails,
} from "./utils/notifications";
import {
  sendEmailVerification,
  sendUserCredentialsEmail,
  sendAnalyticsReportEmail,
} from "./email";
import { supabase } from "./lib/supabaseClient"; // Use Supabase for everything
import { getSupabaseClientDiagnostics } from "./lib/supabaseClient";
import {
  adminOverrideCarryForwardForBatch,
  applyCancellationToLedger,
  buildDraftPayoutBatches,
  buildHexonaCsvFromBatch,
  buildQuickBooksCsvFromBatch,
  getBatchDetails,
  getPayoutDashboardData,
  markBatchAsPaid,
  prepareBatchForExport,
  syncCommissionLedgerFromFeed,
} from "./services/commission-ledger-service";
import { displaySSN } from "@shared/display-ssn";
import { RX_ADDON_MONTHLY_PRICE } from "@shared/pricing";
import {
  requestPbmChange,
  updatePbmFulfillment,
  withdrawPbmChange,
  type PbmFulfillmentStatus,
} from "./services/pbm-membership-service";
import {
  addDaysLocal,
  formatLocalDate,
  parseLocalDate,
} from "@shared/localDate";
import supabaseAuthRoutes from "./routes/supabase-auth";
import adminHierarchyRoutes from "./routes/admin-hierarchy";
import adminLoginSessionsRoutes from "./routes/admin-login-sessions";
import adminUsersRoutes from "./routes/admin-users";
import { requireDevelopmentMode } from "./middleware/debug-route-guard";
import {
  evaluateRefundEligibility,
  getCancellationReasonLabel,
  normalizeCancellationReasonCode,
} from "./services/cancellation-refund-eligibility-service";
import {
  calculateNextBillingDate,
  isMembershipActive,
  daysUntilMembershipStarts,
} from "./utils/membership-dates";
import {
  formatPlanStartDateISO,
  getAvailablePlanStartDates,
  isPlanStartDateAllowed,
} from "@shared/planStartDates";
// import epxHostedRoutes from "./routes/epx-hosted-routes"; // Moved to server/index.ts to avoid duplicate registration

const router = Router();

const PERIOD_FILTERS = new Set([
  "today",
  "week",
  "month",
  "quarter",
  "year",
  "last-30",
  "last-90",
  "custom",
  "all-time",
]);

const startOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};
const normalizePaymentStatusLabel = (value: unknown): string =>
  String(value || "")
    .trim()
    .toLowerCase();
const buildPaymentVerificationSummary = (payment: any) => {
  const metadata =
    payment?.metadata && typeof payment.metadata === "object"
      ? payment.metadata
      : {};
  const status = normalizePaymentStatusLabel(payment?.status);
  const callbackStatus = normalizePaymentStatusLabel(
    metadata.callbackStatus ||
      metadata.hostedCallbackStatus ||
      metadata.epxCallbackStatus ||
      metadata.Status,
  );
  const authResp = normalizePaymentStatusLabel(
    metadata.AUTH_RESP || metadata.authResp,
  );

  const callbackApproved =
    metadata.callbackApproved === true ||
    metadata.hostedCallbackApproved === true ||
    ["approved", "success", "succeeded", "completed"].includes(
      callbackStatus,
    ) ||
    ["00", "0"].includes(authResp);

  const processorConfirmed =
    ["succeeded", "success", "completed"].includes(status) ||
    callbackApproved ||
    metadata.processorApproved === true;

  const requiresReview =
    metadata.requiresReview === true || metadata.reviewRequired === true;

  let finalizationState:
    | "finalized"
    | "requires_review"
    | "pending"
    | "failed"
    | "unknown" = "unknown";
  if (processorConfirmed && requiresReview) {
    finalizationState = "requires_review";
  } else if (processorConfirmed) {
    finalizationState = "finalized";
  } else if (["pending", "processing", "authorized"].includes(status)) {
    finalizationState = "pending";
  } else if (["failed", "declined", "canceled", "cancelled"].includes(status)) {
    finalizationState = "failed";
  }

  const normalizedCommissionStatus = normalizePaymentStatusLabel(
    payment?.commission_status || payment?.commissionStatus,
  );
  const commissionState =
    normalizedCommissionStatus ||
    (metadata.commissionCreated === true ||
    metadata.commissionTriggered === true
      ? "created"
      : processorConfirmed
        ? "pending_or_unknown"
        : "not_applicable");

  return {
    processorConfirmed,
    callbackApproved,
    finalizationState,
    commissionState,
    transactionId: payment?.transaction_id || payment?.transactionId || null,
    authGuidPresent: Boolean(payment?.epx_auth_guid),
    archivedFromAttention: metadata.attentionArchived === true,
  };
};

const endOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};

function parseDateInput(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseFlexibleMemberDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  const raw = String(value).trim();
  if (!raw) return undefined;

  if (/^\d{8}$/.test(raw)) {
    const month = Number(raw.slice(0, 2)) - 1;
    const day = Number(raw.slice(2, 4));
    const year = Number(raw.slice(4));
    const parsed = new Date(year, month, day);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function toIsoDateOrNull(value: unknown): string | null {
  const parsed = parseFlexibleMemberDate(value);
  return parsed ? parsed.toISOString() : null;
}

function calculateMonthsAsMember(
  anchorDate: Date,
  reference = new Date(),
): number {
  let months = (reference.getFullYear() - anchorDate.getFullYear()) * 12;
  months += reference.getMonth() - anchorDate.getMonth();
  if (reference.getDate() < anchorDate.getDate()) {
    months -= 1;
  }
  return Math.max(0, months);
}

function diffInDays(later: Date, earlier: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((later.getTime() - earlier.getTime()) / msPerDay);
}

function getDateRangeFromQuery(
  period?: string,
  customStart?: string,
  customEnd?: string,
) {
  const normalizedPeriod =
    typeof period === "string" && PERIOD_FILTERS.has(period)
      ? period
      : undefined;
  const now = new Date();
  let start: Date | undefined;
  let end: Date | undefined;

  switch (normalizedPeriod) {
    case "today":
      start = startOfDay(now);
      end = endOfDay(now);
      break;
    case "week": {
      const temp = startOfDay(now);
      const weekday = temp.getDay();
      temp.setDate(temp.getDate() - weekday);
      start = temp;
      end = endOfDay(now);
      break;
    }
    case "month":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = endOfDay(now);
      break;
    case "quarter": {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      start = new Date(now.getFullYear(), quarterStartMonth, 1);
      end = endOfDay(now);
      break;
    }
    case "year":
      start = new Date(now.getFullYear(), 0, 1);
      end = endOfDay(now);
      break;
    case "last-30": {
      const temp = new Date(now);
      temp.setDate(temp.getDate() - 30);
      start = startOfDay(temp);
      end = endOfDay(now);
      break;
    }
    case "last-90": {
      const temp = new Date(now);
      temp.setDate(temp.getDate() - 90);
      start = startOfDay(temp);
      end = endOfDay(now);
      break;
    }
    case "custom":
      start = parseDateInput(customStart);
      end = parseDateInput(customEnd);
      if (start) start = startOfDay(start);
      if (end) end = endOfDay(end);
      break;
    case "all-time":
    default:
      start = parseDateInput(customStart);
      end = parseDateInput(customEnd);
      if (start) start = startOfDay(start);
      if (end) end = endOfDay(end);
      break;
  }

  if (start && !end) {
    end = endOfDay(now);
  }

  return { start, end };
}

function filterRecordsByDate(records: any[] = [], start?: Date, end?: Date) {
  if (!start && !end) {
    return records;
  }

  const startMs = start ? start.getTime() : Number.NEGATIVE_INFINITY;
  const endMs = end ? end.getTime() : Number.POSITIVE_INFINITY;

  return records.filter((record) => {
    const timestamp = record?.createdAt || record?.created_at;
    if (!timestamp) return false;
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return false;
    const value = date.getTime();
    return value >= startMs && value <= endMs;
  });
}

function sumEnrollmentRevenue(records: any[] = []) {
  return records.reduce((total, enrollment) => {
    const raw =
      enrollment?.totalMonthlyPrice ??
      enrollment?.total_monthly_price ??
      enrollment?.planPrice ??
      enrollment?.plan_price ??
      0;
    const amount = typeof raw === "number" ? raw : parseFloat(String(raw));
    if (Number.isNaN(amount)) {
      return total;
    }
    return total + amount;
  }, 0);
}

function sumCommissionAmounts(records: any[] = []) {
  return records.reduce((total, commission) => {
    const raw =
      commission?.commissionAmount ?? commission?.commission_amount ?? 0;
    const amount = typeof raw === "number" ? raw : parseFloat(String(raw));
    if (Number.isNaN(amount)) {
      return total;
    }
    return total + amount;
  }, 0);
}

async function getOptionalAuthenticatedUser(req: any): Promise<any | null> {
  try {
    const authHeader = req.headers?.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return null;
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return null;
    }

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user?.id) {
      return null;
    }

    const dbUser = await storage.getUser(user.id);
    return dbUser || null;
  } catch {
    return null;
  }
}

// Helper functions leverage centralized role hierarchy
const isAdmin = (role: string | undefined): boolean => {
  return hasAtLeastRole(role, "admin");
};

const isAgentRole = (role: string | undefined): boolean => {
  return role === "agent" || hasAtLeastRole(role, "super_admin");
};

const hasAgentOrAdminAccess = (role: string | undefined): boolean => {
  const normalized = normalizeRole(role);
  return (
    normalized === "agent" ||
    normalized === "agency_admin" ||
    normalized === "agency_manager" ||
    hasAtLeastRole(role, "admin")
  );
};

const isAgencyScopedRole = (role: string | undefined): boolean => {
  const normalized = normalizeRole(role);
  return normalized === "agency_admin" || normalized === "agency_manager";
};

type ScopeResolution =
  | { ok: true; allAgents: boolean; agentIds: string[] }
  | { ok: false; status: number; message: string };

async function resolveScopedAgentIds(
  user: { id: string; role?: string },
  requestedAgentIdRaw: unknown,
  options: { allowAdminAll?: boolean } = {},
): Promise<ScopeResolution> {
  const requestedAgentId =
    typeof requestedAgentIdRaw === "string" &&
    requestedAgentIdRaw.trim().length > 0
      ? requestedAgentIdRaw.trim()
      : undefined;

  const normalized = normalizeRole(user.role);

  if (!normalized) {
    return { ok: false, status: 403, message: "Role not recognized" };
  }

  if (hasAtLeastRole(normalized, "admin")) {
    if (requestedAgentId) {
      return { ok: true, allAgents: false, agentIds: [requestedAgentId] };
    }

    if (options.allowAdminAll) {
      return { ok: true, allAgents: true, agentIds: [] };
    }

    return { ok: true, allAgents: false, agentIds: [user.id] };
  }

  if (isAgencyScopedRole(normalized)) {
    const assignedAgentIds = await storage.getAgencyAssignedAgentIds(user.id);
    const includeFullDownline = normalized === "agency_admin";

    const hierarchyFromSelf = includeFullDownline
      ? await storage.getHierarchyDownlineUserIds(user.id)
      : await storage.getDirectDownlineUserIds(user.id);

    const hierarchyFromAssignedRoots = (
      await Promise.all(
        assignedAgentIds.map((id) =>
          includeFullDownline
            ? storage.getHierarchyDownlineUserIds(id)
            : storage.getDirectDownlineUserIds(id),
        ),
      )
    ).flat();

    const scopedIds = Array.from(
      new Set([
        user.id,
        ...assignedAgentIds,
        ...hierarchyFromSelf,
        ...hierarchyFromAssignedRoots,
      ]),
    );

    if (requestedAgentId) {
      if (!scopedIds.includes(requestedAgentId)) {
        return {
          ok: false,
          status: 403,
          message: "Requested agent is outside your assigned scope",
        };
      }
      return { ok: true, allAgents: false, agentIds: [requestedAgentId] };
    }

    return { ok: true, allAgents: false, agentIds: scopedIds };
  }

  if (normalized === "agent") {
    if (requestedAgentId && requestedAgentId !== user.id) {
      return {
        ok: false,
        status: 403,
        message: "Agents may only view their own data",
      };
    }

    return { ok: true, allAgents: false, agentIds: [user.id] };
  }

  return { ok: false, status: 403, message: "Insufficient permissions" };
}

async function getScopedEnrollments(
  agentIds: string[],
  startDate?: string,
  endDate?: string,
): Promise<any[]> {
  const pages = await Promise.all(
    agentIds.map(async (id) => {
      try {
        return await storage.getEnrollmentsByAgent(id, startDate, endDate, {
          includeDownline: false,
        });
      } catch (error: any) {
        console.warn(
          "[Scoped Enrollments] Failed for scoped agent; continuing with remaining scope",
          {
            agentId: id,
            error: error?.message || error,
          },
        );
        return [];
      }
    }),
  );

  const deduped = new Map<string, any>();
  for (const page of pages) {
    for (const row of page || []) {
      const key = String(row?.id || "").trim();
      if (!key) continue;
      deduped.set(key, row);
    }
  }

  return Array.from(deduped.values()).sort((a: any, b: any) => {
    const left = new Date(a?.createdAt || a?.created_at || 0).getTime();
    const right = new Date(b?.createdAt || b?.created_at || 0).getTime();
    return right - left;
  });
}

async function getScopedCommissions(
  agentIds: string[],
  startDate?: string,
  endDate?: string,
): Promise<any[]> {
  const pages = await Promise.all(
    agentIds.map((id) =>
      storage.getAgentCommissionsNew(id, startDate, endDate),
    ),
  );

  const deduped = new Map<string, any>();
  for (const page of pages) {
    for (const row of page || []) {
      const key = String(
        row?.id ||
          `${row?.agentId || row?.agent_id || ""}-${row?.memberId || row?.member_id || ""}-${row?.commissionDate || row?.createdAt || ""}`,
      );
      deduped.set(key, row);
    }
  }

  return Array.from(deduped.values());
}

async function getScopedLifecycleSummary(
  agentIds: string[],
  horizonDays: number,
): Promise<any> {
  const summaries = await Promise.all(
    agentIds.map((agentId) =>
      storage.getLifecycleAlertSummary({ agentId, horizonDays }),
    ),
  );

  const aggregate = {
    generatedAt: new Date().toISOString(),
    horizonDays,
    billing: {
      dueSoon: 0,
      overdue: 0,
      failed: 0,
      stalePending: 0,
      totalAttention: 0,
      nextCycleDate: null as string | null,
    },
    commissions: {
      dueSoon: 0,
      overdue: 0,
      unscheduled: 0,
      pending: 0,
      totalAttention: 0,
      nextEligibleDate: null as string | null,
    },
    totals: {
      totalAttention: 0,
    },
    billingItems: [] as any[],
    commissionItems: [] as any[],
  };

  const billingItemMap = new Map<string, any>();
  const commissionItemMap = new Map<string, any>();

  for (const summary of summaries) {
    if (!summary) continue;

    aggregate.billing.dueSoon += Number(summary?.billing?.dueSoon || 0);
    aggregate.billing.overdue += Number(summary?.billing?.overdue || 0);
    aggregate.billing.failed += Number(summary?.billing?.failed || 0);
    aggregate.billing.stalePending += Number(
      summary?.billing?.stalePending || 0,
    );
    aggregate.billing.totalAttention += Number(
      summary?.billing?.totalAttention || 0,
    );

    aggregate.commissions.dueSoon += Number(summary?.commissions?.dueSoon || 0);
    aggregate.commissions.overdue += Number(summary?.commissions?.overdue || 0);
    aggregate.commissions.unscheduled += Number(
      summary?.commissions?.unscheduled || 0,
    );
    aggregate.commissions.pending += Number(summary?.commissions?.pending || 0);
    aggregate.commissions.totalAttention += Number(
      summary?.commissions?.totalAttention || 0,
    );

    aggregate.totals.totalAttention += Number(
      summary?.totals?.totalAttention || 0,
    );

    const nextCycle = summary?.billing?.nextCycleDate;
    if (
      nextCycle &&
      (!aggregate.billing.nextCycleDate ||
        new Date(nextCycle).getTime() <
          new Date(aggregate.billing.nextCycleDate).getTime())
    ) {
      aggregate.billing.nextCycleDate = nextCycle;
    }

    const nextEligible = summary?.commissions?.nextEligibleDate;
    if (
      nextEligible &&
      (!aggregate.commissions.nextEligibleDate ||
        new Date(nextEligible).getTime() <
          new Date(aggregate.commissions.nextEligibleDate).getTime())
    ) {
      aggregate.commissions.nextEligibleDate = nextEligible;
    }

    for (const item of summary?.billingItems || []) {
      const key = `${item?.kind || ""}-${item?.subscriptionId || ""}-${item?.memberId || ""}-${item?.referenceDate || ""}`;
      if (!billingItemMap.has(key)) {
        billingItemMap.set(key, item);
      }
    }

    for (const item of summary?.commissionItems || []) {
      const key = `${item?.kind || ""}-${item?.commissionId || ""}-${item?.memberId || ""}`;
      if (!commissionItemMap.has(key)) {
        commissionItemMap.set(key, item);
      }
    }
  }

  aggregate.billingItems = Array.from(billingItemMap.values());
  aggregate.commissionItems = Array.from(commissionItemMap.values());

  return aggregate;
}

const hasEnrollmentAttributionAccess = (role: string | undefined): boolean => {
  const normalized = normalizeRole(role);
  return (
    normalized === "agent" ||
    normalized === "agency_admin" ||
    normalized === "agency_manager" ||
    hasAtLeastRole(role, "admin")
  );
};

function getCurrentAssignedAgentId(groupMetadata: unknown): string | null {
  if (!groupMetadata || typeof groupMetadata !== "object") {
    return null;
  }

  const metadata = groupMetadata as Record<string, any>;
  const assignment =
    metadata.assignment && typeof metadata.assignment === "object"
      ? metadata.assignment
      : {};
  const candidate =
    assignment.currentAssignedAgentId ?? metadata.assignedAgentId;

  if (typeof candidate !== "string") {
    return null;
  }

  const normalized = candidate.trim();
  return normalized.length > 0 ? normalized : null;
}

async function getGroupEnrollmentRecordsForAgent(
  agentId: string,
): Promise<any[]> {
  const groups: any[] = [];
  const pageSize = 200;
  let offset = 0;

  while (true) {
    const response = await storage.listGroups({ limit: pageSize, offset });
    const page = Array.isArray(response?.groups) ? response.groups : [];

    if (page.length === 0) {
      break;
    }

    groups.push(...page);
    offset += page.length;

    if (page.length < pageSize) {
      break;
    }
  }

  const ownedGroups = groups.filter((group) => {
    if (!group || !["registered", "active"].includes(group.status)) {
      return false;
    }

    return getCurrentAssignedAgentId(group.metadata) === agentId;
  });

  const memberPages = await Promise.all(
    ownedGroups.map((group) => storage.listGroupMembers({ groupId: group.id })),
  );

  const records: any[] = [];
  ownedGroups.forEach((group, idx) => {
    const members = Array.isArray(memberPages[idx]) ? memberPages[idx] : [];
    members
      .filter((member: any) => member?.status !== "terminated")
      .forEach((member: any) => {
        const total = parseFloat(String(member?.totalAmount ?? 0));
        records.push({
          id: `group-${group.id}-${member.id}`,
          createdAt:
            member?.registeredAt || member?.updatedAt || group?.createdAt,
          totalMonthlyPrice: Number.isFinite(total) ? total : 0,
          isActive:
            member?.status === "active" || member?.status === "registered",
          status: member?.status || "draft",
          source: "group",
          groupId: group.id,
          groupName: group.name,
          firstName: member?.firstName || "",
          lastName: member?.lastName || "",
          email: member?.email || "",
        });
      });
  });

  return records;
}

const canRevealEnrollmentSsnForRole = (role: string | undefined): boolean => {
  return Boolean(role === "authorized" || isAdmin(role));
};

const shouldRevealEnrollmentSsn = (req: AuthRequest): boolean => {
  if (!canRevealEnrollmentSsnForRole(req.user?.role)) {
    return false;
  }

  if (req.query?.revealSsn === "false" || req.body?.revealSsn === false) {
    return false;
  }

  return true;
};

const isTruthyFlag = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const maskLastFour = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length >= 4) {
    return `****${digits.slice(-4)}`;
  }
  return "****";
};

const resolveReadableBankValue = (value?: string | null): string | null => {
  if (!value || typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.includes(":") ? null : trimmed;
};

const maskProcessorReference = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.length > 8
    ? `${trimmed.slice(0, 4)}****${trimmed.slice(-4)}`
    : "********";
};

async function canManageMemberForUser(
  memberId: string,
  user: AuthRequest["user"],
): Promise<boolean> {
  if (!user) {
    return false;
  }

  if (isAdmin(user.role) || isFullAccessEmail(user.email)) {
    return true;
  }

  const parsedMemberId = Number(memberId);
  if (!Number.isFinite(parsedMemberId)…91352 tokens truncated…tId);
        } else if (transactionId) {
          payment = await storage.getPaymentByTransactionId(transactionId);
        }

        if (!payment) {
          return res.status(404).json({
            success: false,
            error: "Payment not found",
          });
        }

        const oldStatus = payment.status;

        // Update payment status
        await storage.updatePayment(payment.id, {
          status: newStatus,
          metadata: {
            ...(payment.metadata || {}),
            manualStatusUpdate: {
              updatedBy: req.user?.email || "admin",
              updatedAt: new Date().toISOString(),
              oldStatus,
              newStatus,
              reason:
                reason ||
                "Manual status update via force-status-update endpoint",
              paymentId: payment.id,
              transactionId: payment.transaction_id,
            },
          },
        });

        // If status changed to succeeded and there's a member, update member status
        if (
          newStatus === "succeeded" &&
          payment.member_id &&
          oldStatus !== "succeeded"
        ) {
          try {
            await storage.updateMember(Number(payment.member_id), {
              status: "active",
              isActive: true,
              firstPaymentDate: payment.created_at || new Date().toISOString(),
            });
          } catch (memberError) {
            console.error(
              "[Payments] Failed to activate member after manual status update",
              memberError,
            );
          }
        }

        console.log("[Payments] Manual status update", {
          paymentId: payment.id,
          transactionId: payment.transaction_id,
          oldStatus,
          newStatus,
          updatedBy: req.user?.email || "admin",
          reason,
        });

        res.json({
          success: true,
          payment: {
            id: payment.id,
            transactionId: payment.transaction_id,
            oldStatus,
            newStatus,
            updatedAt: new Date().toISOString(),
          },
        });
      } catch (error: any) {
        console.error("[Payments] Error forcing status update:", error);
        res.status(500).json({
          success: false,
          error: "Failed to update payment status",
        });
      }
    },
  );

  /**
   * GET /api/payments/reconciliation/pending
   * Admin endpoint to find stuck payments that have been pending too long
   * Returns payments that are still "pending" after a threshold time (default 1 hour)
   * Requires admin authentication
   */
  router.get(
    "/api/payments/reconciliation/pending",
    authenticateToken,
    async (req: AuthRequest, res) => {
      if (!isAdmin(req.user?.role)) {
        return res.status(403).json({ message: "Admin access required" });
      }

      try {
        const thresholdMinutes =
          parseInt(req.query.thresholdMinutes as string) || 60;
        const thresholdDate = new Date(
          Date.now() - thresholdMinutes * 60 * 1000,
        );

        // Query for pending payments older than threshold
        const { data: pendingPayments, error } = await storage.supabase
          .from("payments")
          .select(
            `
          id,
          transaction_id,
          amount,
          status,
          created_at,
          member_id,
          metadata
        `,
          )
          .eq("status", "pending")
          .lt("created_at", thresholdDate.toISOString())
          .order("created_at", { ascending: false })
          .limit(100);

        if (error) {
          throw error;
        }

        // Enrich with member details
        const enrichedPayments = await Promise.all(
          (pendingPayments || []).map(async (payment) => {
            let member = null;
            if (payment.member_id) {
              try {
                member = await storage.getMember(payment.member_id);
              } catch (err) {
                console.warn(
                  "[Payments Reconciliation] Could not fetch member",
                  { memberId: payment.member_id },
                );
              }
            }

            return {
              ...payment,
              ageMinutes: Math.floor(
                (Date.now() - new Date(payment.created_at).getTime()) / 60000,
              ),
              member: member
                ? {
                    id: member.id,
                    firstName: member.firstName,
                    lastName: member.lastName,
                    email: member.email,
                    status: member.status,
                  }
                : null,
            };
          }),
        );

        res.json({
          success: true,
          thresholdMinutes,
          count: enrichedPayments.length,
          payments: enrichedPayments,
        });
      } catch (error: any) {
        console.error("[Payments] Error fetching pending payments:", error);
        res.status(500).json({
          success: false,
          error: "Failed to fetch pending payments",
        });
      }
    },
  );

  /**
   * POST /api/payments/reconciliation/batch-update
   * Admin endpoint to batch update stuck payments
   * Accepts array of payment IDs or transaction IDs with their new statuses
   * Requires admin authentication
   */
  router.post(
    "/api/payments/reconciliation/batch-update",
    authenticateToken,
    async (req: AuthRequest, res) => {
      if (!isAdmin(req.user?.role)) {
        return res.status(403).json({ message: "Admin access required" });
      }

      try {
        const { updates, reason } = req.body;

        if (!Array.isArray(updates) || updates.length === 0) {
          return res.status(400).json({
            success: false,
            error: "updates array is required",
          });
        }

        const results = {
          succeeded: [] as any[],
          failed: [] as any[],
        };

        for (const update of updates) {
          try {
            const { paymentId, transactionId, newStatus } = update;

            if (!paymentId && !transactionId) {
              results.failed.push({
                update,
                error: "Either paymentId or transactionId is required",
              });
              continue;
            }

            if (
              !newStatus ||
              !["succeeded", "failed", "pending"].includes(newStatus)
            ) {
              results.failed.push({
                update,
                error: "Valid newStatus required",
              });
              continue;
            }

            let payment;
            if (paymentId) {
              payment = await storage.getPayment(paymentId);
            } else if (transactionId) {
              payment = await storage.getPaymentByTransactionId(transactionId);
            }

            if (!payment) {
              results.failed.push({
                update,
                error: "Payment not found",
              });
              continue;
            }

            const oldStatus = payment.status;

            await storage.updatePayment(payment.id, {
              status: newStatus,
              metadata: {
                ...(payment.metadata || {}),
                batchStatusUpdate: {
                  updatedBy: req.user?.email || "admin",
                  updatedAt: new Date().toISOString(),
                  oldStatus,
                  newStatus,
                  reason: reason || "Batch reconciliation update",
                  paymentId: payment.id,
                  transactionId: payment.transaction_id,
                },
              },
            });

            // If status changed to succeeded, activate member
            if (
              newStatus === "succeeded" &&
              payment.member_id &&
              oldStatus !== "succeeded"
            ) {
              try {
                await storage.updateMember(Number(payment.member_id), {
                  status: "active",
                  isActive: true,
                  firstPaymentDate:
                    payment.created_at || new Date().toISOString(),
                });
              } catch (memberError) {
                console.error(
                  "[Payments] Failed to activate member in batch update",
                  memberError,
                );
              }
            }

            results.succeeded.push({
              paymentId: payment.id,
              transactionId: payment.transaction_id,
              oldStatus,
              newStatus,
            });
          } catch (updateError: any) {
            results.failed.push({
              update,
              error: updateError.message,
            });
          }
        }

        console.log("[Payments] Batch reconciliation update completed", {
          total: updates.length,
          succeeded: results.succeeded.length,
          failed: results.failed.length,
          updatedBy: req.user?.email || "admin",
        });

        res.json({
          success: true,
          results,
        });
      } catch (error: any) {
        console.error("[Payments] Error in batch update:", error);
        res.status(500).json({
          success: false,
          error: "Failed to perform batch update",
        });
      }
    },
  );

  /**
   * GET /api/admin/member/:memberId/sensitive
   * Admin-only endpoint to view sensitive member data (SSN, bank info, etc.)
   * Returns decrypted data with audit logging
   * Requires admin/super_admin authentication
   */
  router.get(
    "/api/admin/member/:memberId/sensitive",
    authenticateToken,
    async (req: AuthRequest, res) => {
      if (!isAdmin(req.user?.role)) {
        return res.status(403).json({ message: "Admin access required" });
      }

      try {
        const { memberId } = req.params;
        const { reason } = req.query;
        const revealSSN = isTruthyFlag(req.query?.revealSsn);
        const revealBank = isTruthyFlag(req.query?.revealBank);
        const revealPayment = isTruthyFlag(req.query?.revealPayment);

        if (!memberId) {
          return res.status(400).json({
            success: false,
            error: "Member ID is required",
          });
        }

        const member = await storage.getMember(Number(memberId));

        if (!member) {
          return res.status(404).json({
            success: false,
            error: "Member not found",
          });
        }

        // Decrypt sensitive data
        let decryptedSSN = null;
        let maskedSSN = null;
        let ssnStatus: "decrypted" | "masked_only" | "not_available" =
          "not_available";
        let ssnReason: string | null = null;
        if (member.ssn) {
          const { decryptSSN, formatSSN } = await import("./utils/encryption");

          const storedRaw = String(member.ssn);
          const decryptedCandidate = decryptSSN(storedRaw);
          const decryptedDigits = String(decryptedCandidate || "").replace(
            /\D/g,
            "",
          );
          const storedDigits = storedRaw.replace(/\D/g, "");

          if (decryptedDigits.length === 9) {
            decryptedSSN = formatSSN(decryptedDigits);
            maskedSSN = displaySSN(decryptedDigits, {
              reveal: false,
              role: "",
            });
            ssnStatus = "decrypted";
          } else if (storedDigits.length === 9) {
            // Legacy plaintext support
            decryptedSSN = formatSSN(storedDigits);
            maskedSSN = displaySSN(storedDigits, { reveal: false, role: "" });
            ssnStatus = "decrypted";
          } else {
            // Irrecoverable values (e.g. already-masked-only or malformed)
            maskedSSN = displaySSN(storedRaw, { reveal: false, role: "" });
            ssnStatus = "masked_only";
            ssnReason = storedRaw.includes(":")
              ? "Encrypted SSN could not be decrypted with configured keys"
              : "Only masked/partial SSN is available for this record";
          }
        }

        const rawRoutingNumber = resolveReadableBankValue(
          member.bankRoutingNumber,
        );
        const rawAccountNumber = resolveReadableBankValue(
          member.bankAccountNumber,
        );
        const accountLastFour =
          member.bankAccountLastFour ||
          (rawAccountNumber
            ? rawAccountNumber.replace(/\D/g, "").slice(-4)
            : null);

        const [tokenResult, paymentResult] = await Promise.all([
          storage.supabase
            .from("payment_tokens")
            .select(
              "id, payment_method_type, bric_token, original_network_trans_id, bank_routing_number, is_active, is_primary, created_at",
            )
            .eq("member_id", member.id)
            .order("is_active", { ascending: false })
            .order("is_primary", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(1),
          storage.supabase
            .from("payments")
            .select("id, epx_auth_guid, transaction_id, status, created_at")
            .eq("member_id", member.id)
            .not("epx_auth_guid", "is", null)
            .order("created_at", { ascending: false })
            .limit(1),
        ]);
        if (tokenResult.error) throw tokenResult.error;
        if (paymentResult.error) throw paymentResult.error;
        const tokenRows = tokenResult.data;
        const paymentRows = paymentResult.data;
        const paymentToken = tokenRows?.[0] || null;
        const paymentReceipt = paymentRows?.[0] || null;
        const rawTokenRoutingNumber = resolveReadableBankValue(
          paymentToken?.bank_routing_number,
        );

        // Log access for audit trail
        const accessLog = {
          adminEmail: req.user?.email || "unknown",
          adminId: req.user?.id || "unknown",
          memberId: member.id,
          memberEmail: member.email,
          customerNumber: member.customerNumber,
          accessedAt: new Date().toISOString(),
          reason: reason || "No reason provided",
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
        };

        console.log("[Admin Sensitive Data Access]", accessLog);

        // Store audit log in database (if admin_logs table exists)
        try {
          const fieldsAccessed = [
            "ssn_masked",
            "bank_masked",
            ...(revealSSN ? ["ssn_raw"] : []),
            ...(revealBank ? ["bank_raw"] : []),
            ...(revealPayment ? ["payment_references_raw"] : []),
          ];

          await storage.supabase.from("admin_logs").insert({
            log_type: "sensitive_data_access",
            admin_id: req.user?.id,
            admin_email: req.user?.email,
            member_id: memberId,
            action: "view_sensitive_member_data",
            reason: reason || null,
            metadata: {
              fields_accessed: fieldsAccessed,
              reveal_ssn: revealSSN,
              reveal_bank: revealBank,
              reveal_payment: revealPayment,
              customer_number: member.customerNumber,
              member_email: member.email,
            },
            ip_address: req.ip,
            user_agent: req.get("user-agent"),
            created_at: new Date().toISOString(),
          });
        } catch (logError) {
          // If admin_logs table doesn't exist, just console log
          console.warn(
            "[Admin] Could not save audit log to database",
            logError,
          );
        }

        res.json({
          success: true,
          member: {
            id: member.id,
            customerNumber: member.customerNumber,
            memberPublicId: member.memberPublicId,
            firstName: member.firstName,
            lastName: member.lastName,
            email: member.email,
            phone: member.phone,
            dateOfBirth: member.dateOfBirth,
          },
          sensitiveData: {
            ssn: {
              decrypted: revealSSN ? decryptedSSN : null,
              masked: maskedSSN,
              status: ssnStatus,
              reason: ssnReason,
              warning: "This data is logged and monitored",
            },
            bankInfo: {
              routingNumber: revealBank ? rawRoutingNumber : null,
              routingNumberMasked: maskLastFour(rawRoutingNumber),
              tokenRoutingNumber: revealBank ? rawTokenRoutingNumber : null,
              tokenRoutingNumberMasked: maskLastFour(rawTokenRoutingNumber),
              accountNumber: revealBank ? rawAccountNumber : null,
              accountLastFour,
              accountType: member.bankAccountType || null,
              accountHolderName: member.bankAccountHolderName || null,
            },
            paymentReferences: {
              paymentMethodType: paymentToken?.payment_method_type || null,
              bric: revealPayment ? paymentToken?.bric_token || null : null,
              bricMasked: maskProcessorReference(paymentToken?.bric_token),
              originalAuthGuid: revealPayment
                ? paymentToken?.original_network_trans_id || null
                : null,
              originalAuthGuidMasked: maskProcessorReference(
                paymentToken?.original_network_trans_id,
              ),
              paymentAuthGuid: revealPayment
                ? paymentReceipt?.epx_auth_guid || null
                : null,
              paymentAuthGuidMasked: maskProcessorReference(
                paymentReceipt?.epx_auth_guid,
              ),
            },
          },
          auditLog: {
            accessedBy: req.user?.email,
            accessedAt: new Date().toISOString(),
            reason: reason || "No reason provided",
          },
        });
      } catch (error: any) {
        console.error("[Admin] Error accessing sensitive member data:", error);
        res.status(500).json({
          success: false,
          error: "Failed to retrieve sensitive data",
        });
      }
    },
  );

  /**
   * POST /api/admin/members/backfill-ssn-encryption
   * Re-encrypts any legacy plaintext SSNs for existing members.
   * Supports dryRun mode to inspect impact before updates.
   */
  router.post(
    "/api/admin/members/backfill-ssn-encryption",
    authenticateToken,
    async (req: AuthRequest, res) => {
      if (!isAdmin(req.user?.role)) {
        return res.status(403).json({ message: "Admin access required" });
      }

      try {
        const dryRun = Boolean(req.body?.dryRun);
        const batchSize = Math.min(
          Math.max(Number(req.body?.batchSize || 200), 1),
          1000,
        );
        const { encryptSSN, isValidSSN } = await import("./utils/encryption");

        let offset = 0;
        let total = 0;
        let encrypted = 0;
        let alreadyEncrypted = 0;
        let invalid = 0;
        let errors = 0;
        const invalidMemberIds: number[] = [];

        while (true) {
          const { data, error } = await supabase
            .from("members")
            .select("id, customer_number, ssn")
            .not("ssn", "is", null)
            .neq("ssn", "")
            .order("id", { ascending: true })
            .range(offset, offset + batchSize - 1);

          if (error) {
            throw error;
          }

          if (!data || data.length === 0) {
            break;
          }

          for (const row of data) {
            total += 1;
            const raw = String(row.ssn || "");

            try {
              if (raw.includes(":")) {
                alreadyEncrypted += 1;
                continue;
              }

              if (!isValidSSN(raw)) {
                invalid += 1;
                invalidMemberIds.push(row.id);
                continue;
              }

              if (!dryRun) {
                const nextValue = encryptSSN(raw);
                const { error: updateError } = await supabase
                  .from("members")
                  .update({
                    ssn: nextValue,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", row.id);

                if (updateError) {
                  throw updateError;
                }
              }

              encrypted += 1;
            } catch (innerError) {
              errors += 1;
              console.error("[SSN Backfill] Failed for member", {
                memberId: row.id,
                customerNumber: row.customer_number,
                error: innerError,
              });
            }
          }

          if (data.length < batchSize) {
            break;
          }
          offset += batchSize;
        }

        // Audit log for operational traceability
        try {
          await storage.supabase.from("admin_logs").insert({
            log_type: "sensitive_data_backfill",
            admin_id: req.user?.id,
            admin_email: req.user?.email,
            action: "backfill_member_ssn_encryption",
            metadata: {
              dryRun,
              batchSize,
              total,
              encrypted,
              alreadyEncrypted,
              invalid,
              errors,
              invalidMemberIds: invalidMemberIds.slice(0, 100),
            },
            ip_address: req.ip,
            user_agent: req.get("user-agent"),
            created_at: new Date().toISOString(),
          });
        } catch (logError) {
          console.warn(
            "[Admin] Could not save SSN backfill audit log to database",
            logError,
          );
        }

        return res.json({
          success: true,
          dryRun,
          summary: {
            total,
            encrypted,
            alreadyEncrypted,
            invalid,
            errors,
          },
          invalidMemberIds: invalidMemberIds.slice(0, 100),
        });
      } catch (error: any) {
        console.error("[Admin] Error running SSN backfill:", error);
        return res.status(500).json({
          success: false,
          error: "Failed to run SSN backfill",
          details: error?.message || "Unknown error",
        });
      }
    },
  );

  // Log the new routes
  console.log("[Route] POST /api/registration");
  console.log("[Route] POST /api/agent/enrollment");
  console.log("[Route] POST /api/family-enrollment");
  console.log("[Route] GET /api/agent/:agentId");
  console.log("[Route] GET /api/agent/enrollments");
  console.log("[Route] GET /api/agent/stats");
  console.log("[Route] GET /api/agent/commission-stats");
  console.log("[Route] GET /api/agent/commissions");
  console.log("[Route] GET /api/user");
  console.log("[Route] POST /api/send-confirmation-email");
  console.log("[Route] GET /api/payments/by-transaction/:transactionId");
  console.log("[Route] POST /api/payments/force-status-update");
  console.log("[Route] GET /api/payments/reconciliation/pending");
  console.log("[Route] POST /api/payments/reconciliation/batch-update");
  console.log("[Route] GET /api/admin/member/:memberId/sensitive");
  console.log("[Route] POST /api/admin/members/backfill-ssn-encryption");

  // Return the app with routes registered
  return app;
}
