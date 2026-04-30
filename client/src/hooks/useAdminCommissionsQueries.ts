import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface QueryParams {
  isAdminUser: boolean;
  userId?: string | null;
  dateFilter: { startDate: string; endDate: string };
  selectedBatchId: string | null;
  isBatchDetailOpen: boolean;
}

export function useAdminCommissionsQueries({
  isAdminUser,
  userId,
  dateFilter,
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
    payoutDashboard,
    isPayoutDashboardLoading,
    selectedBatchDetail,
    isBatchDetailLoading,
  };
}
