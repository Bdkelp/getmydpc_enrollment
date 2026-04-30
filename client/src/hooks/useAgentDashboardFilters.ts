import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";

export interface AgentDashboardEnrollment {
  id: string;
  payment_status?: string | null;
  subscriptionStatus?: string | null;
  nextBillingDate?: string | null;
  subscriptionEndDate?: string | null;
  pendingReason?: string;
  lifecycleSummary?: {
    subscriptionStatus?: string | null;
    pendingAction?: string | null;
    nextBillingDate?: string | null;
    accessThroughDate?: string | null;
    paidThroughDate?: string | null;
    paymentRiskStatus?: string;
    commissionStatus?: string | null;
  };
  businessCategory?: "individual" | "family" | "group" | string;
  source?: "individual" | "group" | string;
  groupName?: string | null;
}

const getLifecycleSummary = (enrollment: AgentDashboardEnrollment) => {
  return enrollment.lifecycleSummary || {
    subscriptionStatus: enrollment.subscriptionStatus || null,
    pendingAction: enrollment.pendingReason || null,
    nextBillingDate: enrollment.nextBillingDate || null,
    accessThroughDate: enrollment.subscriptionEndDate || null,
    paymentRiskStatus: String(enrollment.payment_status || "").toLowerCase() || "unknown",
  };
};

export function useAgentDashboardFilters(
  enrollments: AgentDashboardEnrollment[] | undefined,
  locationPath: string,
) {
  const searchParams = useMemo(() => {
    const query = locationPath.includes("?")
      ? locationPath.slice(locationPath.indexOf("?"))
      : window.location.search;
    return new URLSearchParams(query);
  }, [locationPath]);

  const focusMemberId = searchParams.get("memberId");

  const [dateFilter, setDateFilter] = useState({
    startDate: format(new Date(new Date().setDate(1)), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
  });
  const [businessFilter, setBusinessFilter] = useState<"all" | "individual" | "group">("all");
  const [pendingActionFilter, setPendingActionFilter] = useState<string>("all");
  const [paymentRiskFilter, setPaymentRiskFilter] = useState<string>("all");
  const [accessWindowFilter, setAccessWindowFilter] = useState<string>("all");
  const [hasExpandedFocusRange, setHasExpandedFocusRange] = useState(false);

  const filteredEnrollments = useMemo(() => {
    const all = Array.isArray(enrollments) ? enrollments : [];

    const segmentFiltered = all.filter((enrollment) => {
      if (businessFilter !== "all") {
        const category = String(enrollment.businessCategory || enrollment.source || "").toLowerCase();
        const isGroup = category === "group" || Boolean(enrollment.groupName);
        if (!(businessFilter === "group" ? isGroup : !isGroup)) {
          return false;
        }
      }

      const lifecycle = getLifecycleSummary(enrollment);
      const normalizedPendingAction = String(lifecycle.pendingAction || "").trim().toLowerCase();
      const normalizedRisk = String(lifecycle.paymentRiskStatus || "").trim().toLowerCase() || "unknown";
      const accessThroughDate = lifecycle.accessThroughDate ? new Date(lifecycle.accessThroughDate) : null;
      const accessEnded = accessThroughDate ? accessThroughDate.getTime() < Date.now() : false;

      const matchesPendingAction =
        pendingActionFilter === "all" ||
        (pendingActionFilter === "none" && !normalizedPendingAction) ||
        normalizedPendingAction === pendingActionFilter;

      const matchesPaymentRisk =
        paymentRiskFilter === "all" || normalizedRisk === paymentRiskFilter;

      const matchesAccessWindow =
        accessWindowFilter === "all" ||
        (accessWindowFilter === "has_access_through" && Boolean(lifecycle.accessThroughDate)) ||
        (accessWindowFilter === "missing_access_through" && !lifecycle.accessThroughDate) ||
        (accessWindowFilter === "access_ended" && accessEnded) ||
        (accessWindowFilter === "access_active_or_future" && Boolean(lifecycle.accessThroughDate) && !accessEnded);

      return matchesPendingAction && matchesPaymentRisk && matchesAccessWindow;
    });

    if (!focusMemberId) return segmentFiltered;
    return segmentFiltered.filter((enrollment) => String(enrollment.id) === focusMemberId);
  }, [
    enrollments,
    focusMemberId,
    businessFilter,
    pendingActionFilter,
    paymentRiskFilter,
    accessWindowFilter,
  ]);

  useEffect(() => {
    if (hasExpandedFocusRange || !focusMemberId) {
      return;
    }

    setDateFilter({
      startDate: format(new Date(new Date().getFullYear() - 1, 0, 1), "yyyy-MM-dd"),
      endDate: format(new Date(), "yyyy-MM-dd"),
    });
    setHasExpandedFocusRange(true);
  }, [focusMemberId, hasExpandedFocusRange]);

  return {
    dateFilter,
    setDateFilter,
    businessFilter,
    setBusinessFilter,
    pendingActionFilter,
    setPendingActionFilter,
    paymentRiskFilter,
    setPaymentRiskFilter,
    accessWindowFilter,
    setAccessWindowFilter,
    filteredEnrollments,
    focusMemberId,
  };
}
