import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";

async function authedFetch(url: string, options: RequestInit = {}) {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  });
  if (!response.ok)
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}

export function useAdminUsersMutations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      authedFetch(`/api/admin/users/${userId}/role`, {
        method: "PUT",
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "User role updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update user role.",
        variant: "destructive",
      });
    },
  });

  const updateAgentNumberMutation = useMutation({
    mutationFn: ({
      userId,
      agentNumber,
    }: {
      userId: string;
      agentNumber: string;
    }) =>
      apiRequest(`/api/admin/users/${userId}/agent-number`, {
        method: "PUT",
        body: JSON.stringify({ agentNumber }),
      }),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Agent number updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update agent number.",
        variant: "destructive",
      });
    },
  });

  const suspendUserMutation = useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason?: string }) =>
      authedFetch(`/api/admin/users/${userId}/suspend`, {
        method: "PUT",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      toast({ title: "Success", description: "User suspended successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to suspend user.",
        variant: "destructive",
      });
    },
  });

  const suspendMemberMutation = useMutation({
    mutationFn: ({
      customerId,
      reason,
    }: {
      customerId: string;
      reason?: string;
    }) =>
      authedFetch(`/api/admin/members/${customerId}/suspend`, {
        method: "PUT",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Member suspended successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/members"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to suspend member.",
        variant: "destructive",
      });
    },
  });

  const reactivateUserMutation = useMutation({
    mutationFn: ({
      userId,
      reactivateSubscriptions,
    }: {
      userId: string;
      reactivateSubscriptions: boolean;
    }) =>
      authedFetch(`/api/admin/users/${userId}/reactivate`, {
        method: "PUT",
        body: JSON.stringify({ reactivateSubscriptions }),
      }),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "User reactivated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-users"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reactivate user.",
        variant: "destructive",
      });
    },
  });

  const reactivateMemberMutation = useMutation({
    mutationFn: ({ customerId }: { customerId: string }) =>
      authedFetch(`/api/admin/members/${customerId}/reactivate`, {
        method: "PUT",
      }),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Member reactivated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/members"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reactivate member.",
        variant: "destructive",
      });
    },
  });

  const approveUserMutation = useMutation({
    mutationFn: (userId: string) =>
      apiRequest(`/api/admin/approve-user/${userId}`, { method: "POST" }),
    onSuccess: () => {
      toast({
        title: "User Approved",
        description: "The user has been approved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-users"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to approve user. Please try again.",
        variant: "destructive",
      });
    },
  });

  const removeUserMutation = useMutation({
    mutationFn: (userId: string) =>
      authedFetch(`/api/admin/users/${userId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "User removed from active access.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-users"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/agency-assignments"],
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove user.",
        variant: "destructive",
      });
    },
  });

  return {
    updateRoleMutation,
    updateAgentNumberMutation,
    suspendUserMutation,
    suspendMemberMutation,
    reactivateUserMutation,
    reactivateMemberMutation,
    approveUserMutation,
    removeUserMutation,
  };
}
