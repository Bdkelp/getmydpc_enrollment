import { useQuery } from "@tanstack/react-query";
import { getSession, onAuthStateChange } from "@/lib/supabase";
import { useEffect, useState } from "react";
import { queryClient } from "@/lib/queryClient";
import type { User } from "@shared/schema";

interface AuthUser extends Omit<User, 'role'> {
  role: string | null;
  subscription?: any;
  plan?: any;
}

export function useAuth() {
  const [session, setSession] = useState<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize session on mount
  useEffect(() => {
    getSession().then((session) => {
      setSession(session);
      setIsInitialized(true);
    });

    // Listen for auth changes
    const { data: { subscription } } = onAuthStateChange((event, session) => {
      // Auth state changed
      setSession(session);
      setIsInitialized(true);
      // Invalidate all queries when auth state changes to ensure fresh data
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
        // Clear all cached data to prevent stale information
        queryClient.clear();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Query user data from our backend when authenticated
  const { data: user, isLoading: userLoading, error } = useQuery({
    queryKey: ['/api/auth/user'],
    queryFn: async () => {
      if (!session?.access_token) {
        // No access token available
        return null;
      }
      
      // Fetching user with token
      
      const response = await fetch('/api/auth/user', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      
      // User fetch response
      
      if (!response.ok) {
        if (response.status === 401) {
          // Unauthorized - invalid token
          return null;
        }
        if (response.status === 403) {
          const data = await response.json();
          if (data.requiresApproval) {
            window.location.href = '/pending-approval';
            return null;
          }
        }
        throw new Error('Failed to fetch user');
      }
      
      const userData = await response.json();
      // User data received
      return userData;
    },
    enabled: !!session?.access_token && isInitialized,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
  });

  // Only show loading during initial load
  // Don't show loading if we're just waiting for user data after initialization
  const isLoading = !isInitialized;

  // Auth state ready

  return {
    user,
    session,
    isAuthenticated: !!session && !!user,
    isLoading,
    error
  };
}
