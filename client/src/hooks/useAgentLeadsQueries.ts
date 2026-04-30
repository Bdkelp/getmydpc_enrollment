import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface Lead {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
  status: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeadActivity {
  id: number;
  leadId: number;
  agentId: string;
  activityType: string;
  notes: string;
  createdAt: string;
}

export function useAgentLeadsQueries(statusFilter: string) {
  const { data: leads, isLoading } = useQuery<Lead[]>({
    queryKey: ["/api/agent/leads", statusFilter],
    queryFn: async () => {
      const url = statusFilter === 'all'
        ? '/api/agent/leads'
        : `/api/agent/leads?status=${statusFilter}`;
      const response = await apiRequest(url);
      return Array.isArray(response) ? response : [];
    },
  });

  return { leads, isLoading };
}
