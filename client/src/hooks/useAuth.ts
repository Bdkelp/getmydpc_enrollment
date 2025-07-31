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
      console.log('Auth state changed:', event, session ? 'Has session' : 'No session');
      setSession(session);
      setIsInitialized(true);
      // Invalidate user query when auth state changes
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Query user data from our backend when authenticated
  const { data: user, isLoading: userLoading, error } = useQuery({
    queryKey: ['/api/auth/user'],
    queryFn: async () => {
      if (!session?.access_token) {
        console.log('No access token available');
        return null;
      }
      
      console.log('Fetching user with token:', session.access_token.substring(0, 20) + '...');
      
      const response = await fetch('/api/auth/user', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      
      console.log('User fetch response status:', response.status);
      
      if (!response.ok) {
        if (response.status === 401) {
          console.log('Unauthorized - invalid token');
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
      console.log('User data received:', userData);
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

  // Debug logging
  console.log('useAuth state:', { 
    isInitialized, 
    hasSession: !!session, 
    hasToken: !!session?.access_token,
    userLoading, 
    isLoading,
    user: user?.email 
  });

  return {
    user,
    session,
    isAuthenticated: !!session && !!user,
    isLoading,
    error
  };
}
