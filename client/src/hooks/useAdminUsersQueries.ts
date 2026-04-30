import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";

export function useAdminUsersQueries() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Real-time Supabase subscriptions
  useEffect(() => {
    const usersSubscription = supabase
      .channel('users-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
        toast({ title: "Data Updated", description: "User data has been updated in real-time" });
      })
      .subscribe();

    const subscriptionsSubscription = supabase
      .channel('subscriptions-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions' }, () => {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      })
      .subscribe();

    const paymentsSubscription = supabase
      .channel('payments-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(usersSubscription);
      supabase.removeChannel(subscriptionsSubscription);
      supabase.removeChannel(paymentsSubscription);
    };
  }, [queryClient, toast]);

  const { data: usersData, isLoading, error } = useQuery({
    queryKey: ['/api/admin/users'],
    queryFn: () => apiRequest('/api/admin/users'),
    refetchInterval: 30000,
  });

  const { data: dpcMembersData, isLoading: membersLoading, error: membersError } = useQuery({
    queryKey: ['/api/admin/members'],
    queryFn: () => apiRequest('/api/admin/members'),
    refetchInterval: 30000,
  });

  const { data: pendingUsers = [] } = useQuery({
    queryKey: ['/api/admin/pending-users'],
    queryFn: () => apiRequest('/api/admin/pending-users'),
    refetchInterval: 10000,
  });

  const { data: loginSessions = [] } = useQuery({
    queryKey: ['/api/admin/login-sessions'],
    queryFn: () => apiRequest('/api/admin/login-sessions'),
    refetchInterval: 60000,
  });

  return { usersData, isLoading, error, dpcMembersData, membersLoading, membersError, pendingUsers, loginSessions };
}
