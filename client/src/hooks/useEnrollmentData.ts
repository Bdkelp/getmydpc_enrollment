import { useMemo } from "react";

interface Enrollment {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  planName: string;
  memberType: string;
  totalMonthlyPrice: number;
  status: string;
  enrolledBy: string;
  enrolledByAgentId: string;
  payment_status?: string | null;
  payment_date?: string | null;
  subscriptionStatus?: string | null;
  nextBillingDate?: string | null;
  subscriptionEndDate?: string | null;
  subscriptionPendingReason?: string | null;
  subscriptionPendingDetails?: any;
  lifecycleSummary?: {
    subscriptionStatus?: string | null;
    pendingAction?: string | null;
    nextBillingDate?: string | null;
    accessThroughDate?: string | null;
    paidThroughDate?: string | null;
    paymentRiskStatus?: string;
    commissionStatus?: string | null;
  };
}

function hasSuccessfulPayment(paymentStatus?: string | null): boolean {
  return (
    paymentStatus !== null &&
    paymentStatus !== undefined &&
    (paymentStatus.toLowerCase() === "succeeded" || paymentStatus.toLowerCase() === "success")
  );
}

function estimateCommissionFromEnrollment(enrollment: Enrollment): number {
  const memberType = String(enrollment.memberType || "").toLowerCase();
  const planName = String(enrollment.planName || "").toLowerCase();

  const tierKey = planName.includes("elite")
    ? "elite"
    : planName.includes("plus")
      ? "plus"
      : "base";

  const coverageKey = memberType.includes("spouse")
    ? "spouse"
    : memberType.includes("child") ||
        memberType.includes("children") ||
        memberType.includes("dependent")
      ? "child"
      : memberType.includes("family")
        ? "family"
        : "member";

  const commissionMatrix: Record<string, Record<string, number>> = {
    base: { member: 9, spouse: 15, child: 17, family: 17 },
    plus: { member: 20, spouse: 40, child: 40, family: 40 },
    elite: { member: 20, spouse: 40, child: 40, family: 40 },
  };

  return commissionMatrix[tierKey]?.[coverageKey] ?? 0;
}

export function useEnrollmentData(
  enrollments: Enrollment[],
  searchTerm: string,
  statusFilter: string,
  pendingActionFilter: string,
  paymentRiskFilter: string,
  accessWindowFilter: string,
  focusMemberId: string,
  focusAlertType: string,
) {
  const filteredEnrollments = useMemo(() => {
    const enrollmentsArray = Array.isArray(enrollments) ? enrollments : [];
    const now = new Date();

    return enrollmentsArray.filter((enrollment) => {
      const fullName = `${enrollment.firstName} ${enrollment.lastName}`.toLowerCase();
      const email = (enrollment.email || "").toLowerCase();

      const matchesSearch =
        searchTerm === "" ||
        fullName.includes(searchTerm.toLowerCase()) ||
        email.includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === "all" || enrollment.status === statusFilter;

      const pendingAction = enrollment.lifecycleSummary?.pendingAction;
      const matchesPendingAction =
        pendingActionFilter === "all" ||
        (pendingActionFilter === "has_pending" && Boolean(pendingAction)) ||
        (pendingActionFilter === "none" && !pendingAction);

      const paymentRiskStatus = enrollment.lifecycleSummary?.paymentRiskStatus;
      const matchesPaymentRisk =
        paymentRiskFilter === "all" ||
        (paymentRiskFilter === "at_risk" && paymentRiskStatus === "at_risk") ||
        (paymentRiskFilter === "not_at_risk" && paymentRiskStatus !== "at_risk");

      const lifecycle = enrollment.lifecycleSummary || {};
      const accessThroughDate = lifecycle.accessThroughDate
        ? new Date(lifecycle.accessThroughDate)
        : null;
      const accessEnded = accessThroughDate ? accessThroughDate.getTime() < now.getTime() : false;

      const matchesAccessWindow =
        accessWindowFilter === "all" ||
        (accessWindowFilter === "access_ended" && accessEnded) ||
        (accessWindowFilter === "access_active_or_future" &&
          Boolean(lifecycle.accessThroughDate) &&
          !accessEnded);

      const matchesFocusedMember =
        !focusMemberId ||
        String(enrollment.id || "") === focusMemberId ||
        String(enrollment.email || "") === focusMemberId;

      const normalizedPaymentStatus = String(enrollment.payment_status || "").toLowerCase();
      const matchesAlertHint =
        !focusAlertType ||
        (focusAlertType === "failed" &&
          (normalizedPaymentStatus === "failed" || normalizedPaymentStatus === "declined")) ||
        (focusAlertType === "stale_pending" &&
          (normalizedPaymentStatus === "pending" ||
            enrollment.status === "pending" ||
            enrollment.status === "pending_activation")) ||
        (focusAlertType === "overdue" && !hasSuccessfulPayment(enrollment.payment_status)) ||
        (focusAlertType === "due_soon");

      return (
        matchesSearch &&
        matchesStatus &&
        matchesPendingAction &&
        matchesPaymentRisk &&
        matchesAccessWindow &&
        matchesFocusedMember &&
        matchesAlertHint
      );
    });
  }, [
    enrollments,
    searchTerm,
    statusFilter,
    pendingActionFilter,
    paymentRiskFilter,
    accessWindowFilter,
    focusMemberId,
    focusAlertType,
  ]);

  const totalRevenue = useMemo(() => {
    const enrollmentsArray = Array.isArray(filteredEnrollments) ? filteredEnrollments : [];
    return enrollmentsArray.reduce((sum, enrollment) => {
      return (
        sum +
        (enrollment?.status === "active" ? Number(enrollment.totalMonthlyPrice || 0) : 0)
      );
    }, 0);
  }, [filteredEnrollments]);

  const activePeopleCount = useMemo(() => {
    const enrollmentsArray = Array.isArray(filteredEnrollments) ? filteredEnrollments : [];
    return enrollmentsArray.filter((enrollment) => enrollment?.status === "active").length;
  }, [filteredEnrollments]);

  const averageActiveRevenue = useMemo(() => {
    if (activePeopleCount <= 0) {
      return 0;
    }
    return totalRevenue / activePeopleCount;
  }, [activePeopleCount, totalRevenue]);

  const projectedMonthlyCommission = useMemo(() => {
    const enrollmentsArray = Array.isArray(filteredEnrollments) ? filteredEnrollments : [];

    return enrollmentsArray.reduce((sum, enrollment) => {
      if (enrollment?.status !== "active") {
        return sum;
      }
      return sum + estimateCommissionFromEnrollment(enrollment);
    }, 0);
  }, [filteredEnrollments]);

  return {
    filteredEnrollments,
    totalRevenue,
    activePeopleCount,
    averageActiveRevenue,
    projectedMonthlyCommission,
  };
}
