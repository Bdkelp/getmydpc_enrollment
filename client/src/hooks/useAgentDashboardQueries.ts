import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface QueryParams {
  canLoadAgentDirectory: boolean;
  viewingAgentId?: string | null;
  currentUserId?: string | null;
  dateFilter: { startDate: string; endDate: string };
}

export function useAgentDashboardQueries({
  canLoadAgentDirectory,
  viewingAgentId,
  currentUserId,
  dateFilter,
}: QueryParams) {
  const { data: allAgents } = useQuery({
    queryKey: ["/api/agents"],
    queryFn: () => apiRequest("/api/agents"),
    enabled: canLoadAgentDirectory,
    staleTime: 1000 * 60,
  });

  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = useQuery({
    queryKey: ["/api/agent/stats", viewingAgentId ?? "__aggregate__"],
    queryFn: () => {
      const query =
        viewingAgentId && viewingAgentId !== currentUserId
          ? `?agentId=${viewingAgentId}`
          : "";
      return apiRequest(`/api/agent/stats${query}`);
    },
    enabled: !!currentUserId,
  });

  const {
    data: enrollments,
    isLoading: enrollmentsLoading,
    error: enrollmentsError,
  } = useQuery({
    queryKey: [
      "/api/agent/enrollments",
      viewingAgentId ?? "__aggregate__",
      dateFilter,
    ],
    queryFn: async () => {
      const query = new URLSearchParams({
        ...(viewingAgentId && viewingAgentId !== currentUserId
          ? { agentId: viewingAgentId }
          : {}),
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
    enabled: !!currentUserId,
  });

  const { data: availablePlans = [] } = useQuery({
    queryKey: ["/api/plans"],
    queryFn: async () => {
      const plans = await apiRequest("/api/plans");
      return Array.isArray(plans) ? plans : [];
    },
  });

  const { data: lifecycleAlerts } = useQuery({
    queryKey: [
      "/api/agent/lifecycle-alerts",
      viewingAgentId ?? "__aggregate__",
    ],
    queryFn: async () => {
      const query =
        viewingAgentId && viewingAgentId !== currentUserId
          ? `?agentId=${viewingAgentId}&days=7`
          : "?days=7";
      return apiRequest(`/api/agent/lifecycle-alerts${query}`);
    },
    enabled: !!currentUserId,
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
