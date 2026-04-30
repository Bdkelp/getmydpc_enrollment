import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useCallback } from "react";

interface EnrollmentDateFilter {
  startDate: string;
  endDate: string;
}

function buildDateRangeParams(startDate: string, endDate: string) {
  const toUTCISODate = (dateString: string, endOfDay = false) => {
    if (!dateString) return "";
    const [year, month, day] = dateString.split("-").map(Number);
    if ([year, month, day].some((value) => Number.isNaN(value))) {
      return "";
    }
    const date = new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        endOfDay ? 23 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 999 : 0,
      ),
    );
    return date.toISOString();
  };

  const startDateISO = toUTCISODate(startDate) || startDate;
  const endDateISO = toUTCISODate(endDate, true) || endDate;
  return { startDate: startDateISO, endDate: endDateISO };
}

function formatStatusLabel(status: string) {
  switch (status) {
    case "pending_activation":
      return "Pending Activation";
    case "pending":
      return "Pending";
    case "active":
      return "Active";
    case "cancelled":
      return "Cancelled";
    case "inactive":
      return "Inactive";
    case "suspended":
      return "Suspended";
    case "archived":
      return "Archived";
    default:
      return status || "Unknown";
  }
}

export function useEnrollmentMutations(dateFilter: EnrollmentDateFilter, selectedAgentId: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const invalidateMembershipInsights = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/memberships/overview"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/memberships/duplicates"] });
    queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) && query.queryKey[0] === "/api/admin/enrollments",
    });
  }, [queryClient]);

  const exportMutation = useMutation({
    mutationFn: async () => {
      const { startDate, endDate } = buildDateRangeParams(dateFilter.startDate, dateFilter.endDate);
      const params = new URLSearchParams({
        startDate,
        endDate,
        ...(selectedAgentId !== "all" && { agentId: selectedAgentId }),
      });

      const response = await fetch(`/api/admin/export-enrollments?${params}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error("Failed to export enrollments");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `all-enrollments-${dateFilter.startDate}-to-${dateFilter.endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onError: () => {
      toast({
        title: "Export Failed",
        description: "Unable to download enrollments spreadsheet.",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({
        title: "Export Successful",
        description: "Enrollments spreadsheet downloaded successfully.",
      });
    },
  });

  const generateAgentNumberMutation = useMutation({
    mutationFn: async (agentId: string) => {
      const response = await apiRequest(`/api/admin/generate-agent-number/${agentId}`, {
        method: "POST",
      });
      return response;
    },
    onSuccess: (data) => {
      toast({
        title: "Agent Number Generated",
        description: `Agent number ${data.agentNumber} has been assigned.`,
      });
      window.location.reload();
    },
    onError: () => {
      toast({
        title: "Generation Failed",
        description: "Unable to generate agent number. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ memberId, status }: { memberId: string; status: string }) => {
      return apiRequest(`/api/admin/members/${memberId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
        headers: {
          "Content-Type": "application/json",
        },
      });
    },
    onSuccess: (_data, variables) => {
      toast({
        title: "Status updated",
        description: `Member marked as ${formatStatusLabel(variables.status)}.`,
      });
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) && query.queryKey[0] === "/api/admin/enrollments",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Status update failed",
        description:
          error?.message || "Unable to update membership status. Please try again.",
        variant: "destructive",
      });
    },
  });

  const activateNowMutation = useMutation({
    mutationFn: async ({ memberId, note }: { memberId: string; note?: string }) => {
      return apiRequest(`/api/admin/members/${memberId}/activate-now`, {
        method: "POST",
        body: JSON.stringify({ note }),
        headers: {
          "Content-Type": "application/json",
        },
      });
    },
    onSuccess: (_data, variables) => {
      toast({
        title: "Membership activated",
        description: `Activation override applied for member #${variables.memberId}.`,
      });
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) && query.queryKey[0] === "/api/admin/enrollments",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Activation failed",
        description:
          error?.message || "Unable to activate membership immediately. Please try again.",
        variant: "destructive",
      });
    },
  });

  const toggleTestFlagMutation = useMutation({
    mutationFn: async ({
      memberId,
      isTestMember,
      reason,
    }: {
      memberId: number;
      isTestMember: boolean;
      reason?: string;
    }) => {
      return apiRequest(`/api/admin/memberships/${memberId}/test`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isTestMember, reason }),
      });
    },
    onSuccess: (_data, variables) => {
      toast({
        title: variables.isTestMember ? "Marked as test membership" : "Test membership cleared",
        description: `Member #${variables.memberId} updated successfully.`,
      });
      invalidateMembershipInsights();
    },
    onError: (error: any) => {
      toast({
        title: "Unable to update test flag",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const archiveMembershipMutation = useMutation({
    mutationFn: async ({ memberId, reason }: { memberId: number; reason?: string }) => {
      return apiRequest(`/api/admin/memberships/${memberId}/archive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: (_data, variables) => {
      toast({
        title: "Membership archived",
        description: `Member #${variables.memberId} moved to archive.`,
      });
      invalidateMembershipInsights();
    },
    onError: (error: any) => {
      toast({
        title: "Unable to archive membership",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const restoreMembershipMutation = useMutation({
    mutationFn: async ({
      memberId,
      targetStatus,
    }: {
      memberId: number;
      targetStatus?: string;
    }) => {
      return apiRequest(`/api/admin/memberships/${memberId}/restore`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ targetStatus }),
      });
    },
    onSuccess: (_data, variables) => {
      toast({
        title: "Membership restored",
        description: `Member #${variables.memberId} reactivated.`,
      });
      invalidateMembershipInsights();
    },
    onError: (error: any) => {
      toast({
        title: "Unable to restore membership",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const hardDeleteMembershipMutation = useMutation({
    mutationFn: async ({ memberId, reason }: { memberId: number; reason?: string }) => {
      return apiRequest(`/api/admin/memberships/${memberId}/hard`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: (_data, variables) => {
      toast({
        title: "Membership permanently deleted",
        description: `Member #${variables.memberId} was hard deleted.`,
      });
      invalidateMembershipInsights();
    },
    onError: (error: any) => {
      toast({
        title: "Unable to hard delete membership",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  return {
    exportMutation,
    generateAgentNumberMutation,
    updateStatusMutation,
    activateNowMutation,
    toggleTestFlagMutation,
    archiveMembershipMutation,
    restoreMembershipMutation,
    hardDeleteMembershipMutation,
  };
}
