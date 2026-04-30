import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface UserData {
  users: any[];
  totalCount: number;
}

interface PendingUser {
  id: string;
  email: string;
  created_at: string;
  [key: string]: any;
}

export function useAdminUserManagement(isAuthenticated: boolean, isAdminUser: boolean) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: usersData, isLoading: usersLoading, error: usersError, refetch } = useQuery<UserData>({
    queryKey: ["/api/admin/users"],
    enabled: isAuthenticated && isAdminUser,
  });

  const { data: pendingUsers, isLoading: pendingLoading } = useQuery<PendingUser[]>({
    queryKey: ["/api/admin/pending-users"],
    enabled: isAuthenticated && isAdminUser,
  });

  const { data: allLoginSessions = [], isLoading: sessionsLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/login-sessions"],
    enabled: isAuthenticated && isAdminUser,
  });

  const approveUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest(`/api/admin/approve-user/${userId}`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      toast({
        title: "User Approved",
        description: "The user has been approved and can now access the platform.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to approve user. Please try again.",
        variant: "destructive",
      });
    },
  });

  const rejectUserMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      return apiRequest(`/api/admin/reject-user/${userId}`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      toast({
        title: "User Rejected",
        description: "The user has been rejected.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-users"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reject user. Please try again.",
        variant: "destructive",
      });
    },
  });

  return {
    usersData,
    usersLoading,
    usersError,
    refetch,
    pendingUsers,
    pendingLoading,
    allLoginSessions,
    sessionsLoading,
    approveUserMutation,
    rejectUserMutation,
  };
}
