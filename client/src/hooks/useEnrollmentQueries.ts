import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useCallback } from "react";

interface Agent {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  agentNumber?: string;
}

interface Enrollment {
  id: string;
  createdAt: string;
  firstName: string;
  lastName: string;
  email: string;
  planName: string;
  memberType: string;
  totalMonthlyPrice: number;
  status: string;
  enrolledBy: string;
  enrolledByAgentId: string;
  memberPublicId?: string | null;
  customerNumber?: string | null;
  payment_id?: number | null;
  payment_status?: string | null;
  payment_amount?: number | string | null;
  transaction_id?: string | null;
  payment_date?: string | null;
  epx_auth_guid?: string | null;
  subscriptionId?: number | null;
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

interface MembershipSummary {
  total: number;
  active: number;
  test: number;
  archived: number;
  generatedAt?: string;
}

interface DuplicateMembershipMember {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
  customerNumber?: string;
  memberPublicId?: string;
  status?: string;
  isActive?: boolean;
  isTestMember?: boolean;
  archivedAt?: string;
  archiveReason?: string;
  planId?: number;
  totalMonthlyPrice?: number | string;
  createdAt?: string;
}

interface DuplicateMembershipGroup {
  matchFields: {
    firstName: string;
    lastName: string;
    dateOfBirth: string | null;
  };
  count: number;
  members: DuplicateMembershipMember[];
}

interface EnrollmentDateFilter {
  startDate: string;
  endDate: string;
}

export function useEnrollmentQueries(
  user: any,
  isAdminUser: boolean,
  dateFilter: EnrollmentDateFilter,
  selectedAgentId: string,
  showMembershipOversight: boolean,
) {
  const queryClient = useQueryClient();

  const invalidateMembershipInsights = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/memberships/overview"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/memberships/duplicates"] });
    queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) && query.queryKey[0] === "/api/admin/enrollments",
    });
  }, [queryClient]);

  const { data: agents, isLoading: agentsLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
    enabled: !!user && isAdminUser,
  });

  const { data: enrollments, isLoading: enrollmentsLoading, error: enrollmentsError } = useQuery<
    Enrollment[]
  >({
    queryKey: ["/api/admin/enrollments-with-payments", dateFilter, selectedAgentId],
    queryFn: async () => {
      try {
        const params = new URLSearchParams({
          limit: "500",
          ...(selectedAgentId !== "all" && { agentId: selectedAgentId }),
        });

        const response = await apiRequest(`/api/admin/enrollments-with-payments?${params}`, {
          method: "GET",
        });

        const enrollmentData = response?.enrollments || response;
        return Array.isArray(enrollmentData) ? enrollmentData : [];
      } catch (error) {
        console.error("[AdminEnrollments] Error fetching enrollments:", error);
        throw error;
      }
    },
    enabled: !!user && isAdminUser,
    retry: (failureCount, error: any) => {
      if (error?.message?.includes("401") || error?.message?.includes("403")) {
        return false;
      }
      return failureCount < 2;
    },
  });

  const { data: membershipSummary, isLoading: membershipSummaryLoading } = useQuery<
    MembershipSummary
  >({
    queryKey: ["/api/admin/memberships/overview"],
    enabled: !!user && isAdminUser && showMembershipOversight,
    staleTime: 60_000,
  });

  const { data: duplicateMemberships, isLoading: duplicatesLoading } = useQuery<{
    groups: DuplicateMembershipGroup[];
  }>({
    queryKey: ["/api/admin/memberships/duplicates"],
    enabled: !!user && isAdminUser && showMembershipOversight,
    staleTime: 15_000,
  });

  const membershipStats: MembershipSummary = membershipSummary ?? {
    total: 0,
    active: 0,
    test: 0,
    archived: 0,
  };

  const duplicateGroups: DuplicateMembershipGroup[] = Array.isArray(
    duplicateMemberships?.groups,
  )
    ? duplicateMemberships!.groups
    : [];

  return {
    agents: agents || [],
    agentsLoading,
    enrollments: enrollments || [],
    enrollmentsLoading,
    enrollmentsError,
    membershipStats,
    membershipSummaryLoading,
    duplicateGroups,
    duplicatesLoading,
    invalidateMembershipInsights,
  };
}
