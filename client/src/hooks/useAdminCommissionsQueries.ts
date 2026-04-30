import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface QueryParams {
  isAdminUser: boolean;
  userId?: string | null;
  dateFilter: { startDate: string; endDate: string };
  statementAgentId: string;
  statementStatus: "all" | "paid" | "scheduled" | "unpaid";
  isStatementOpen: boolean;
  selectedBatchId: string | null;
  isBatchDetailOpen: boolean;
}

export function useAdminCommissionsQueries({
  isAdminUser,
  userId,
  dateFilter,
  statementAgentId,
  statementStatus,
  isStatementOpen,
  selectedBatchId,
  isBatchDetailOpen,
}: QueryParams) {
  const enabled = !!userId && isAdminUser;

  const { data: commissions, isLoading } = useQuery({
    queryKey: ["/api/admin/commissions", dateFilter.startDate, dateFilter.endDate],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: dateFilter.startDate,
        endDate: dateFilter.endDate,
      });
      return await apiRequest(`/api/admin/commissions?${params}`, { method: "GET" });
    },
    enabled,
  });

  const { data: lifecycleAlerts } = useQuery({
    queryKey: ["/api/admin/lifecycle-alerts"],
    queryFn: async () => {
      return await apiRequest("/api/admin/lifecycle-alerts?days=7", { method: "GET" });
    },
    enabled,
    refetchInterval: 60_000,
  });

  const { data: statementData, isFetching: isStatementLoading } = useQuery({
    queryKey: [
      "/api/admin/commissions/statement",
      dateFilter.startDate,
      dateFilter.endDate,
      statementAgentId,
      statementStatus,
      isStatementOpen,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: dateFilter.startDate,
        endDate: dateFilter.endDate,
        status: statementStatus,
      });
      if (statementAgentId !== "all") {
        params.set("agentId", statementAgentId);
      }
      return await apiRequest(`/api/admin/commissions/statement?${params.toString()}`, { method: "GET" });
    },
    enabled: enabled && isStatementOpen,
  });

  const { data: payoutDashboard, isFetching: isPayoutDashboardLoading } = useQuery({
    queryKey: ["/api/admin/commissions/payout-dashboard"],
    queryFn: async () => {
      return await apiRequest("/api/admin/commissions/payout-dashboard", { method: "GET" });
    },
    enabled,
    refetchInterval: 60000,
  });

  const { data: selectedBatchDetail, isFetching: isBatchDetailLoading } = useQuery({
    queryKey: ["/api/admin/commissions/payout-batches", selectedBatchId],
    queryFn: async () => {
      return await apiRequest(`/api/admin/commissions/payout-batches/${selectedBatchId}`, { method: "GET" });
    },
    enabled: enabled && !!selectedBatchId && isBatchDetailOpen,
  });

  return {
    commissions,
    isLoading,
    lifecycleAlerts,
    statementData,
    isStatementLoading,
    payoutDashboard,
    isPayoutDashboardLoading,
    selectedBatchDetail,
    isBatchDetailLoading,
  };
}
