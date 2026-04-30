import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";

interface DateFilter {
  startDate: string;
  endDate: string;
}

interface MembershipPayload {
  memberId: string;
  action: "change" | "cancel" | "reactivate";
  planId?: number;
  memberType?: string;
  reason?: string;
}

interface ResolvePendingArgs {
  selectedEnrollment: {
    id: string;
    subscriptionId?: number;
  } | null;
  consentType: string;
  consentNotes: string;
  userId?: string;
}

interface UseAgentDashboardMutationsParams {
  dateFilter: DateFilter;
  viewingAgentId?: string | null;
  toast: (args: { title: string; description: string; variant?: "default" | "destructive" }) => void;
  onMembershipSuccess: () => void;
  onResolvePendingSuccess: () => void;
}

export function useAgentDashboardMutations({
  dateFilter,
  viewingAgentId,
  toast,
  onMembershipSuccess,
  onResolvePendingSuccess,
}: UseAgentDashboardMutationsParams) {
  const downloadMutation = useMutation({
    mutationFn: async () => {
      const { API_URL } = await import("@/lib/apiClient");
      const { supabase } = await import("@/lib/supabase");
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(`${API_URL}/api/agent/export-enrollments`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/csv",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(dateFilter),
      });

      if (!response.ok) {
        throw new Error("Failed to export enrollments");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `enrollments-${dateFilter.startDate}-to-${dateFilter.endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/login";
        }, 500);
        return;
      }
      toast({
        title: "Export Failed",
        description: "Unable to download enrollments spreadsheet.",
        variant: "destructive",
      });
    },
  });

  const membershipMutation = useMutation({
    mutationFn: async (payload: MembershipPayload) => {
      const { memberId, ...body } = payload;
      return apiRequest(`/api/members/${memberId}/membership`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast({
        title: "Membership updated",
        description: "The membership change has been applied.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/enrollments", viewingAgentId, dateFilter] });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/stats", viewingAgentId] });
      onMembershipSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Membership update failed",
        description: error?.message || "Unable to update membership.",
        variant: "destructive",
      });
    },
  });

  const handleResolvePending = async ({
    selectedEnrollment,
    consentType,
    consentNotes,
    userId,
  }: ResolvePendingArgs) => {
    if (!selectedEnrollment || !consentType || !consentNotes) {
      toast({
        title: "Missing Information",
        description: "Please provide consent type and notes before proceeding.",
        variant: "destructive",
      });
      return;
    }

    try {
      await apiRequest(`/api/enrollment/${selectedEnrollment.id}/resolve`, {
        method: "PUT",
        body: JSON.stringify({
          subscriptionId: selectedEnrollment.subscriptionId,
          consentType,
          consentNotes,
          modifiedBy: userId,
        }),
      });

      toast({
        title: "Enrollment Updated",
        description: "The enrollment has been resolved with member consent.",
      });

      onResolvePendingSuccess();
      queryClient.invalidateQueries({ queryKey: ["/api/agent/enrollments"] });
    } catch (_error) {
      toast({
        title: "Update Failed",
        description: "Failed to update enrollment. Please try again.",
        variant: "destructive",
      });
    }
  };

  return {
    downloadMutation,
    membershipMutation,
    handleResolvePending,
  };
}
