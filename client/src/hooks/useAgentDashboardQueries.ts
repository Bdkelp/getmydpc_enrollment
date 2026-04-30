import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface QueryParams {
  isAdminUser: boolean;
  viewingAgentId?: string | null;
  currentUserId?: string | null;
  dateFilter: { startDate: string; endDate: string };
}

export function useAgentDashboardQueries({
  isAdminUser,
  viewingAgentId,
  currentUserId,
  dateFilter,
}: QueryParams) {
  const { data: allAgents } = useQuery({
    queryKey: ["/api/agents"],
    queryFn: () => apiRequest("/api/agents"),
    enabled: isAdminUser,
    staleTime: 1000 * 60,
  });

  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: ["/api/agent/stats", viewingAgentId],
    queryFn: () => {
      const query = viewingAgentId && viewingAgentId !== currentUserId ? `?agentId=${viewingAgentId}` : "";
      return apiRequest(`/api/agent/stats${query}`);
    },
    enabled: !!viewingAgentId,
  });

  const {
    data: enrollments,
    isLoading: enrollmentsLoading,
    error: enrollmentsError,
  } = useQuery({
    queryKey: ["/api/agent/enrollments", viewingAgentId, dateFilter],
    queryFn: async () => {
      const query = new URLSearchParams({
        ...(viewingAgentId && viewingAgentId !== currentUserId ? { agentId: viewingAgentId } : {}),
        ...dateFilter,
      }).toString();
      const response = await apiRequest(`/api/agent/enrollments?${query}`);
      if (Array.isArray(response)) {
        return response;
      }
      if (Array.isArray((response as any)?.enrollments)) {
        return (response as any).enrollments;
      }
      return [];
    },
    enabled: !!viewingAgentId,
  });

  const { data: availablePlans = [] } = useQuery({
    queryKey: ["/api/plans"],
    queryFn: async () => {
      const plans = await apiRequest("/api/plans");
      return Array.isArray(plans) ? plans : [];
    },
  });

  const { data: lifecycleAlerts } = useQuery({
    queryKey: ["/api/agent/lifecycle-alerts", viewingAgentId],
    queryFn: async () => {
      const query = viewingAgentId && viewingAgentId !== currentUserId ? `?agentId=${viewingAgentId}&days=7` : "?days=7";
      return apiRequest(`/api/agent/lifecycle-alerts${query}`);
    },
    enabled: !!viewingAgentId,
    refetchInterval: 60_000,
  });

  return {
    allAgents,
    stats,
    statsLoading,
    statsError,
    enrollments,
    enrollmentsLoading,
    enrollmentsError,
    availablePlans,
    lifecycleAlerts,
  };
}
