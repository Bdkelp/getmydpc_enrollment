import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface AnalyticsData {
  overview: {
    totalMembers: number;
    activeSubscriptions: number;
    monthlyRevenue: number;
    averageRevenue: number;
    churnRate: number;
    growthRate: number;
    newEnrollmentsThisMonth: number;
    cancellationsThisMonth: number;
    sourceBreakdown?: {
      individualMembers: number;
      familyMembers?: number;
      groupMembers: number;
      individualMonthlyRevenue: number;
      familyMonthlyRevenue?: number;
      groupMonthlyRevenue: number;
      newIndividualEnrollmentsThisMonth: number;
      newGroupEnrollmentsThisMonth: number;
      cancelledIndividualsThisMonth: number;
      cancelledGroupMembersThisMonth: number;
    };
  };
  planBreakdown: Array<{
    planName: string;
    planId: number;
    memberCount: number;
    monthlyRevenue: number;
    percentage: number;
  }>;
  recentEnrollments: Array<{
    id: string;
    memberId: string;
    memberPublicId: string;
    customerNumber: string;
    firstName: string;
    lastName: string;
    email: string;
    planName: string;
    amount: number;
    enrolledDate: string;
    status: string;
  }>;
  monthlyTrends: Array<{
    month: string;
    enrollments: number;
    cancellations: number;
    netGrowth: number;
    revenue: number;
  }>;
  agentPerformance: Array<{
    agentId: string;
    agentName: string;
    agentNumber: string;
    totalEnrollments: number;
    individualEnrollments?: number;
    familyEnrollments?: number;
    groupEnrollments?: number;
    totalCommissions: number;
    paidCommissions: number;
    pendingCommissions: number;
    monthlyEnrollments: number;
    conversionRate: number;
    averageCommission: number;
  }>;
  memberReports: Array<{
    id: string;
    memberId: string;
    memberPublicId: string;
    customerNumber: string;
    firstName: string;
    lastName: string;
    email: string;
    businessCategory?: 'individual' | 'family' | 'group';
    groupName?: string;
    phone: string;
    planName: string;
    status: string;
    enrolledDate: string;
    lastPayment: string;
    totalPaid: number;
    agentName: string;
  }>;
  commissionReports: Array<{
    id: string;
    memberId: string;
    memberPublicId?: string;
    membershipId?: string;
    agentName: string;
    agentNumber: string;
    memberName: string;
    businessCategory?: 'individual' | 'family' | 'group';
    groupName?: string;
    planName: string;
    commissionAmount: number;
    totalPlanCost: number;
    status: string;
    paymentStatus: string;
    createdDate: string;
    paymentDate: string | null;
  }>;
  revenueBreakdown: {
    totalRevenue: number;
    subscriptionRevenue: number;
    oneTimeRevenue: number;
    refunds: number;
    netRevenue: number;
    projectedAnnualRevenue: number;
    averageRevenuePerUser: number;
    individualRevenue?: number;
    familyRevenue?: number;
    groupRevenue?: number;
    revenueByMonth: Array<{
      month: string;
      revenue: number;
      subscriptions: number;
      oneTime: number;
      refunds: number;
    }>;
  };
}

export function useAdminAnalyticsQuery(timeRange: string) {
  const { data: analytics, isLoading, isError, error, isFetching, refetch, dataUpdatedAt } =
    useQuery<AnalyticsData>({
      queryKey: ['/api/admin/analytics', timeRange],
      queryFn: () => apiRequest(`/api/admin/analytics?days=${timeRange}`, { method: "GET" }),
    });

  const safePlanBreakdown = Array.isArray(analytics?.planBreakdown) ? analytics.planBreakdown : [];
  const safeRecentEnrollments = Array.isArray(analytics?.recentEnrollments) ? analytics.recentEnrollments : [];
  const safeMonthlyTrends = Array.isArray(analytics?.monthlyTrends) ? analytics.monthlyTrends : [];
  const safeMemberReports = Array.isArray(analytics?.memberReports) ? analytics.memberReports : [];
  const safeAgentPerformance = Array.isArray(analytics?.agentPerformance) ? analytics.agentPerformance : [];
  const safeCommissionReports = Array.isArray(analytics?.commissionReports) ? analytics.commissionReports : [];
  const safeRevenueByMonth = Array.isArray(analytics?.revenueBreakdown?.revenueByMonth)
    ? analytics.revenueBreakdown.revenueByMonth
    : [];

  return {
    analytics,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
    dataUpdatedAt,
    safePlanBreakdown,
    safeRecentEnrollments,
    safeMonthlyTrends,
    safeMemberReports,
    safeAgentPerformance,
    safeCommissionReports,
    safeRevenueByMonth,
  };
}
