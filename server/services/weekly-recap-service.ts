import { storage } from "../storage";
import { supabase } from "../lib/supabaseClient";
import { sendWeeklyRecap } from "../utils/notifications";

interface WeeklyRecapData {
  weekOf: string;
  totalEnrollments: number;
  totalRevenue: number;
  businessSnapshot: {
    activeIndividualMemberships: number;
    activeFamilyMemberships: number;
    activeGroupMemberships: number;
    totalActiveMemberships: number;
    combinedMonthlyRevenue: number;
    cancellationsThisWeek: number;
    failedPaymentsThisWeek: number;
    newUserLoginsThisWeek: number;
    usersNeverLoggedIn: number;
    newMembershipsThisWeek: number;
    recurringMembershipsThisWeek: number;
  };
  newMembers: Array<{
    name: string;
    plan: string;
    amount: number;
    enrollmentDate: string;
    agentName?: string;
  }>;
  agentPerformance: Array<{
    agentName: string;
    enrollments: number;
    totalCommissions: number;
  }>;
  planBreakdown: Array<{
    planName: string;
    enrollments: number;
    revenue: number;
  }>;
}

export class WeeklyRecapService {
  private static toIsoDate(date: Date): string {
    return date.toISOString().split("T")[0];
  }

  private static isWithinRange(
    value: string | Date | null | undefined,
    start: Date,
    end: Date,
  ): boolean {
    if (!value) return false;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return false;
    return parsed >= start && parsed <= end;
  }

  private static resolveEnrollmentRevenue(enrollment: any): number {
    const candidateValues = [
      enrollment?.subscriptionAmount,
      enrollment?.totalMonthlyPrice,
      enrollment?.planPrice,
    ];

    for (const value of candidateValues) {
      const parsed = Number.parseFloat(String(value ?? ""));
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return 0;
  }

  private static async buildBusinessSnapshot(options: {
    weekStart: Date;
    weekEnd: Date;
    totalEnrollments: number;
  }): Promise<WeeklyRecapData["businessSnapshot"]> {
    const { weekStart, weekEnd, totalEnrollments } = options;
    const weekStartIso = this.toIsoDate(weekStart);
    const weekEndIso = this.toIsoDate(weekEnd);

    const [
      membersRes,
      groupsRes,
      failedPaymentsRes,
      recurringLogRes,
      loginRes,
      neverLoggedInRes,
      recurringPaymentsRes,
    ] = await Promise.all([
      supabase
        .from("members")
        .select(
          "id, coverage_type, total_monthly_price, status, cancellation_date, created_at",
        ),
      supabase
        .from("group_members")
        .select("id, status, total_amount, updated_at, groups(status)"),
      supabase
        .from("payments")
        .select("id", { count: "exact", head: true })
        .gte("created_at", weekStartIso)
        .lte("created_at", `${weekEndIso}T23:59:59.999Z`)
        .in("status", ["failed", "declined", "error"]),
      supabase
        .from("recurring_billing_log")
        .select("id", { count: "exact", head: true })
        .gte("created_at", weekStartIso)
        .lte("created_at", `${weekEndIso}T23:59:59.999Z`)
        .eq("status", "failed"),
      supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .gte("last_login_at", weekStartIso)
        .lte("last_login_at", `${weekEndIso}T23:59:59.999Z`),
      supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .is("last_login_at", null)
        .eq("is_active", true),
      supabase
        .from("payments")
        .select("id, created_at, member_id, status, members(created_at)")
        .gte("created_at", weekStartIso)
        .lte("created_at", `${weekEndIso}T23:59:59.999Z`)
        .in("status", ["succeeded", "success", "completed"]),
    ]);

    if (membersRes.error) {
      throw new Error(
        `Failed loading members snapshot data: ${membersRes.error.message}`,
      );
    }
    if (groupsRes.error) {
      throw new Error(
        `Failed loading group snapshot data: ${groupsRes.error.message}`,
      );
    }
    if (loginRes.error) {
      throw new Error(
        `Failed loading user login snapshot data: ${loginRes.error.message}`,
      );
    }
    if (neverLoggedInRes.error) {
      throw new Error(
        `Failed loading never-login user snapshot data: ${neverLoggedInRes.error.message}`,
      );
    }
    if (recurringPaymentsRes.error) {
      throw new Error(
        `Failed loading recurring payment snapshot data: ${recurringPaymentsRes.error.message}`,
      );
    }

    const members = membersRes.data || [];
    const groupMembers = groupsRes.data || [];

    const activeMemberStatuses = new Set(["active", "pending_activation"]);
    const activeMembers = members.filter((member: any) =>
      activeMemberStatuses.has(String(member.status || "").toLowerCase()),
    );

    const activeIndividualMemberships = activeMembers.filter((member: any) => {
      const coverage = String(member.coverage_type || "").toLowerCase();
      return (
        !coverage.includes("family") &&
        !coverage.includes("spouse") &&
        !coverage.includes("child")
      );
    }).length;

    const activeFamilyMemberships = activeMembers.filter((member: any) => {
      const coverage = String(member.coverage_type || "").toLowerCase();
      return (
        coverage.includes("family") ||
        coverage.includes("spouse") ||
        coverage.includes("child")
      );
    }).length;

    const activeGroupMembershipRows = groupMembers.filter((member: any) => {
      const groupInfo = Array.isArray(member.groups)
        ? member.groups[0]
        : member.groups;
      const groupStatus = String(groupInfo?.status || "").toLowerCase();
      const memberStatus = String(member.status || "").toLowerCase();
      return (
        (groupStatus === "active" || groupStatus === "registered") &&
        memberStatus !== "terminated"
      );
    });

    const activeGroupMemberships = activeGroupMembershipRows.length;

    const memberRevenue = activeMembers.reduce((sum: number, member: any) => {
      const amount = Number.parseFloat(
        String(member.total_monthly_price ?? "0"),
      );
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);

    const groupRevenue = activeGroupMembershipRows.reduce(
      (sum: number, member: any) => {
        const amount = Number.parseFloat(String(member.total_amount ?? "0"));
        return sum + (Number.isFinite(amount) ? amount : 0);
      },
      0,
    );

    const memberCancellationsThisWeek = members.filter((member: any) => {
      const status = String(member.status || "").toLowerCase();
      if (status !== "cancelled") return false;
      return this.isWithinRange(member.cancellation_date, weekStart, weekEnd);
    }).length;

    const groupCancellationsThisWeek = groupMembers.filter((member: any) => {
      const status = String(member.status || "").toLowerCase();
      if (status !== "terminated") return false;
      return this.isWithinRange(member.updated_at, weekStart, weekEnd);
    }).length;

    const recurringPayments = recurringPaymentsRes.data || [];
    const recurringMembershipsThisWeek = recurringPayments.filter(
      (payment: any) => {
        const memberNode = Array.isArray(payment.members)
          ? payment.members[0]
          : payment.members;
        if (!memberNode?.created_at) {
          return true;
        }
        return !this.isWithinRange(memberNode.created_at, weekStart, weekEnd);
      },
    ).length;

    return {
      activeIndividualMemberships,
      activeFamilyMemberships,
      activeGroupMemberships,
      totalActiveMemberships:
        activeIndividualMemberships +
        activeFamilyMemberships +
        activeGroupMemberships,
      combinedMonthlyRevenue: memberRevenue + groupRevenue,
      cancellationsThisWeek:
        memberCancellationsThisWeek + groupCancellationsThisWeek,
      failedPaymentsThisWeek:
        Number(failedPaymentsRes.count || 0) +
        Number(recurringLogRes.error ? 0 : recurringLogRes.count || 0),
      newUserLoginsThisWeek: Number(loginRes.count || 0),
      usersNeverLoggedIn: Number(neverLoggedInRes.count || 0),
      newMembershipsThisWeek: totalEnrollments,
      recurringMembershipsThisWeek,
    };
  }

  /**
   * Generate and send weekly recap for the previous week
   */
  static async generateAndSendWeeklyRecap(): Promise<void> {
    try {
      console.log("[Weekly Recap] Generating weekly recap...");

      const now = new Date();
      const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const weekStart = new Date(lastWeek);
      weekStart.setDate(lastWeek.getDate() - lastWeek.getDay()); // Start of week (Sunday)
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6); // End of week (Saturday)

      const weekOf = weekStart.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });

      // Get enrollments for the week
      const enrollments = await storage.getAllEnrollments(
        weekStart.toISOString().split("T")[0],
        weekEnd.toISOString().split("T")[0],
      );

      if (!Array.isArray(enrollments)) {
        console.log("[Weekly Recap] No enrollments data available");
        return;
      }

      // Calculate totals
      const totalEnrollments = enrollments.length;
      const totalRevenue = enrollments.reduce((sum, enrollment) => {
        return sum + this.resolveEnrollmentRevenue(enrollment);
      }, 0);

      // Format new members data
      const newMembers = enrollments.map((enrollment) => ({
        name: `${enrollment.firstName} ${enrollment.lastName}`,
        plan: enrollment.planName || "Unknown Plan",
        amount: this.resolveEnrollmentRevenue(enrollment),
        enrollmentDate: new Date(enrollment.createdAt).toLocaleDateString(),
        agentName: enrollment.agentName || undefined,
      }));

      // Calculate agent performance
      const agentMap = new Map();
      enrollments.forEach((enrollment) => {
        const agentName = enrollment.agentName || "Direct";
        if (!agentMap.has(agentName)) {
          agentMap.set(agentName, {
            agentName,
            enrollments: 0,
            totalCommissions: 0,
          });
        }
        const agent = agentMap.get(agentName);
        agent.enrollments++;
        agent.totalCommissions += parseFloat(enrollment.commissionAmount) || 0;
      });

      const agentPerformance = Array.from(agentMap.values())
        .filter((agent) => agent.agentName !== "Direct")
        .sort((a, b) => b.enrollments - a.enrollments);

      // Calculate plan breakdown
      const planMap = new Map();
      enrollments.forEach((enrollment) => {
        const planName = enrollment.planName || "Unknown Plan";
        if (!planMap.has(planName)) {
          planMap.set(planName, {
            planName,
            enrollments: 0,
            revenue: 0,
          });
        }
        const plan = planMap.get(planName);
        plan.enrollments++;
        plan.revenue += this.resolveEnrollmentRevenue(enrollment);
      });

      const planBreakdown = Array.from(planMap.values()).sort(
        (a, b) => b.enrollments - a.enrollments,
      );

      const businessSnapshot = await this.buildBusinessSnapshot({
        weekStart,
        weekEnd,
        totalEnrollments,
      });

      const recapData: WeeklyRecapData = {
        weekOf,
        totalEnrollments,
        totalRevenue,
        businessSnapshot,
        newMembers,
        agentPerformance,
        planBreakdown,
      };

      // Send the recap
      await sendWeeklyRecap(recapData);
      console.log("[Weekly Recap] Weekly recap sent successfully");
    } catch (error) {
      console.error("[Weekly Recap] Error generating weekly recap:", error);
    }
  }

  /**
   * Schedule weekly recap to run every Monday
   */
  static scheduleWeeklyRecap(): void {
    // Optional one-time override for the first run (ISO timestamp).
    // Example: WEEKLY_RECAP_FIRST_RUN_AT=2026-06-15T17:30:00-05:00
    const overrideValue = process.env.WEEKLY_RECAP_FIRST_RUN_AT?.trim();

    let firstRunAt: Date | null = null;
    if (overrideValue) {
      const parsedOverride = new Date(overrideValue);
      if (!Number.isNaN(parsedOverride.getTime())) {
        if (parsedOverride.getTime() > Date.now()) {
          firstRunAt = parsedOverride;
        } else {
          console.warn(
            "[Weekly Recap] WEEKLY_RECAP_FIRST_RUN_AT is in the past. Falling back to Monday schedule.",
          );
        }
      } else {
        console.warn(
          "[Weekly Recap] Invalid WEEKLY_RECAP_FIRST_RUN_AT value. Falling back to Monday schedule.",
        );
      }
    }

    // Calculate first run time (override or next Monday at 9 AM)
    const now = new Date();
    const nextMondayAtNine = new Date();
    nextMondayAtNine.setDate(now.getDate() + ((1 + 7 - now.getDay()) % 7));
    nextMondayAtNine.setHours(9, 0, 0, 0);

    const scheduledFirstRun = firstRunAt || nextMondayAtNine;

    const msUntilFirstRun = Math.max(
      0,
      scheduledFirstRun.getTime() - now.getTime(),
    );

    // Schedule first recap
    setTimeout(() => {
      this.generateAndSendWeeklyRecap();

      // Then schedule to repeat every week
      setInterval(
        () => {
          this.generateAndSendWeeklyRecap();
        },
        7 * 24 * 60 * 60 * 1000,
      ); // Every week
    }, msUntilFirstRun);

    console.log(
      "[Weekly Recap] Scheduled weekly recap for every Monday at 9 AM",
    );
    if (firstRunAt) {
      console.log(
        "[Weekly Recap] One-time override first run set to:",
        firstRunAt.toLocaleString(),
      );
    }
    console.log(
      "[Weekly Recap] Next recap will be sent on:",
      scheduledFirstRun.toLocaleString(),
    );
  }
}
