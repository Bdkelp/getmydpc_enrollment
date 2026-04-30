import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

interface Commission {
  id: number;
  subscriptionId?: number;
  userId?: string;
  userName?: string;
  memberId?: string | number;
  membershipId?: string;
  planName?: string;
  planType?: string;
  planTier?: string;
  commissionAmount?: number;
  totalPlanCost?: number;
  businessCategory?: 'individual' | 'family' | 'group';
  status?: string;
  paymentStatus?: string;
  paymentDate?: string;
  createdAt?: string;
}

interface CommissionStats {
  mtd: number;
  ytd: number;
  lifetime: number;
  pending: number;
}

interface LifecycleAlertSummary {
  generatedAt: string;
  horizonDays: number;
  billing: {
    dueSoon: number;
    overdue: number;
    failed: number;
    stalePending: number;
    totalAttention: number;
    nextCycleDate: string | null;
  };
  commissions: {
    dueSoon: number;
    overdue: number;
    unscheduled: number;
    pending: number;
    totalAttention: number;
    nextEligibleDate: string | null;
  };
  totals: { totalAttention: number };
  billingItems: Array<{
    kind: 'due_soon' | 'overdue' | 'failed' | 'stale_pending';
    subscriptionId?: number | null;
    memberId: number;
    memberLabel: string;
    referenceDate: string | null;
    details?: string | null;
  }>;
  commissionItems: Array<{
    kind: 'due_soon' | 'overdue' | 'unscheduled';
    commissionId: string;
    memberId: number;
    memberLabel: string;
    referenceDate: string | null;
    amount: number;
  }>;
}

interface AgentLedgerRow {
  id: string;
  memberId?: string | null;
  memberName: string;
  membershipTier?: string | null;
  coverageType?: string | null;
  effectiveDate?: string | null;
  commissionType: 'new' | 'renewal' | 'adjustment' | 'reversal';
  commissionAmount: number;
  displayStatus: 'pending' | 'scheduled' | 'carry_forward' | 'paid' | 'held' | 'reversed';
  payoutBatchId?: string | null;
  payoutBatchName?: string | null;
  scheduledPayDate?: string | null;
  paidAt?: string | null;
  statementNumber?: string | null;
}

interface AgentLedgerResponse {
  rows: AgentLedgerRow[];
  summary: {
    pendingTotal: number;
    scheduledTotal: number;
    carryForwardTotal: number;
    paidTotal: number;
    reversalsAdjustmentsTotal: number;
  };
}

export type { Commission, CommissionStats, LifecycleAlertSummary, AgentLedgerRow, AgentLedgerResponse };

interface UseAgentCommissionsQueriesParams {
  dateFilter: { startDate: string; endDate: string };
  ledgerStatusFilter: string;
  ledgerPayoutPeriodFilter: string;
  ledgerMemberNameFilter: string;
}

export function useAgentCommissionsQueries({
  dateFilter,
  ledgerStatusFilter,
  ledgerPayoutPeriodFilter,
  ledgerMemberNameFilter,
}: UseAgentCommissionsQueriesParams) {
  const { user } = useAuth();

  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery<CommissionStats>({
    queryKey: ["/api/agent/commission-totals"],
    queryFn: () => apiRequest("/api/agent/commission-totals", { method: "GET" }),
    enabled: !!user,
    retry: 1,
  });

  const { data: commissions, isLoading: commissionsLoading, error: commissionsError } = useQuery<Commission[]>({
    queryKey: ["/api/agent/commissions", dateFilter.startDate, dateFilter.endDate],
    queryFn: () => {
      const params = new URLSearchParams({ startDate: dateFilter.startDate, endDate: dateFilter.endDate });
      return apiRequest(`/api/agent/commissions?${params}`, { method: "GET" });
    },
    enabled: !!user && !!dateFilter.startDate && !!dateFilter.endDate,
    retry: 1,
  });

  const { data: lifecycleAlerts } = useQuery<LifecycleAlertSummary>({
    queryKey: ["/api/agent/lifecycle-alerts"],
    queryFn: () => apiRequest('/api/agent/lifecycle-alerts?days=7', { method: 'GET' }),
    enabled: !!user,
    retry: 1,
    refetchInterval: 60_000,
  });

  const { data: agentLedger, isLoading: ledgerLoading, error: ledgerError } = useQuery<AgentLedgerResponse>({
    queryKey: [
      '/api/agent/commission-ledger',
      dateFilter.startDate,
      dateFilter.endDate,
      ledgerStatusFilter,
      ledgerPayoutPeriodFilter,
      ledgerMemberNameFilter,
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        startDate: dateFilter.startDate,
        endDate: dateFilter.endDate,
        status: ledgerStatusFilter,
        payoutPeriod: ledgerPayoutPeriodFilter,
      });
      if (ledgerMemberNameFilter.trim()) {
        params.set('memberName', ledgerMemberNameFilter.trim());
      }
      return apiRequest(`/api/agent/commission-ledger?${params.toString()}`, { method: 'GET' });
    },
    enabled: !!user,
    retry: 1,
  });

  return {
    stats,
    statsLoading,
    statsError,
    commissions,
    commissionsLoading,
    commissionsError,
    lifecycleAlerts,
    agentLedger,
    ledgerLoading,
    ledgerError,
  };
}
