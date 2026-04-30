import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";

interface AdminStats {
  totalUsers: number;
  monthlyRevenue: number;
  individualMonthlyRevenue?: number;
  familyMonthlyRevenue?: number;
  groupMonthlyRevenue?: number;
  newEnrollments: number;
  churnRate: number;
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
  totals: {
    totalAttention: number;
  };
  billingItems: Array<{
    kind: "due_soon" | "overdue" | "failed" | "stale_pending";
    subscriptionId?: number | null;
    memberId: number;
    memberLabel: string;
    referenceDate: string | null;
    details?: string | null;
  }>;
  commissionItems: Array<{
    kind: "due_soon" | "overdue" | "unscheduled";
    commissionId: string;
    memberId: number;
    memberLabel: string;
    referenceDate: string | null;
    amount: number;
  }>;
}

export function useAdminDashboardMetrics(isAuthenticated: boolean, isAdminUser: boolean) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    console.log("[AdminDashboard] Setting up real-time subscriptions...");

    const dashboardSubscription = supabase
      .channel("dashboard-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "users" }, (payload) => {
        console.log("[AdminDashboard] Users change detected:", payload);
        queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/revenue"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/lifecycle-alerts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-users"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions" }, (payload) => {
        console.log("[AdminDashboard] Subscriptions change detected:", payload);
        queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/revenue"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/lifecycle-alerts"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, (payload) => {
        console.log("[AdminDashboard] Payments change detected:", payload);
        queryClient.invalidateQueries({ queryKey: ["/api/admin/revenue"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/lifecycle-alerts"] });
        toast({
          title: "Payment Activity",
          description: "New payment activity detected",
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "commissions" }, (payload) => {
        console.log("[AdminDashboard] Commissions change detected:", payload);
        queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/data-viewer"] });
        toast({
          title: "Commission Update",
          description: "Commission data has been updated",
        });
      })
      .subscribe();

    return () => {
      console.log("[AdminDashboard] Cleaning up real-time subscriptions...");
      dashboardSubscription.unsubscribe();
    };
  }, [queryClient, toast]);

  const { data: adminStats, isLoading: statsLoading, error: statsError } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    enabled: isAuthenticated && isAdminUser,
  });

  const { data: lifecycleAlerts } = useQuery<LifecycleAlertSummary>({
    queryKey: ["/api/admin/lifecycle-alerts"],
    enabled: isAuthenticated && isAdminUser,
    queryFn: async () => apiRequest("/api/admin/lifecycle-alerts?days=7"),
    refetchInterval: 60_000,
  });

  return {
    adminStats,
    statsLoading,
    statsError,
    lifecycleAlerts,
  };
}
