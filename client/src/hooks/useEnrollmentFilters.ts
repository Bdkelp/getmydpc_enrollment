import { useState, useMemo } from "react";
import { format } from "date-fns";
import { useLocation } from "wouter";

export function useEnrollmentFilters() {
  const [locationPath] = useLocation();

  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState({
    startDate: format(
      new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      "yyyy-MM-dd",
    ),
    endDate: format(new Date(), "yyyy-MM-dd"),
  });
  const [selectedAgentId, setSelectedAgentId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [pendingActionFilter, setPendingActionFilter] = useState<string>("all");
  const [paymentRiskFilter, setPaymentRiskFilter] = useState<string>("all");
  const [accessWindowFilter, setAccessWindowFilter] = useState<string>("all");
  const [showMembershipOversight, setShowMembershipOversight] = useState(false);

  const searchParams = useMemo(() => {
    const query = locationPath.includes("?")
      ? locationPath.slice(locationPath.indexOf("?"))
      : window.location.search;
    return new URLSearchParams(query);
  }, [locationPath]);

  const focusMemberId = searchParams.get("memberId")?.trim() || "";
  const focusAlertType = searchParams.get("alertType")?.trim() || "";

  const statusOptions = [
    { value: "pending_activation", label: "Pending Activation" },
    { value: "pending", label: "Pending" },
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
    { value: "cancelled", label: "Cancelled" },
    { value: "suspended", label: "Suspended" },
    { value: "archived", label: "Archived" },
  ];

  const statusTransitionOptions = statusOptions.filter((option) => option.value !== "pending");

  const normalizeStatusForApi = (status: string) =>
    status === "pending" ? "pending_activation" : status;

  const activeFilterCount =
    (selectedAgentId !== "all" ? 1 : 0) +
    (statusFilter !== "all" ? 1 : 0) +
    (pendingActionFilter !== "all" ? 1 : 0) +
    (paymentRiskFilter !== "all" ? 1 : 0) +
    (accessWindowFilter !== "all" ? 1 : 0) +
    (focusMemberId ? 1 : 0) +
    (focusAlertType ? 1 : 0);

  return {
    searchTerm,
    setSearchTerm,
    dateFilter,
    setDateFilter,
    selectedAgentId,
    setSelectedAgentId,
    statusFilter,
    setStatusFilter,
    pendingActionFilter,
    setPendingActionFilter,
    paymentRiskFilter,
    setPaymentRiskFilter,
    accessWindowFilter,
    setAccessWindowFilter,
    showMembershipOversight,
    setShowMembershipOversight,
    focusMemberId,
    focusAlertType,
    statusOptions,
    statusTransitionOptions,
    normalizeStatusForApi,
    activeFilterCount,
  };
}
