import { useQuery } from "@tanstack/react-query";
import { getSession, onAuthStateChange, signOut } from "@/lib/supabase";
import { useEffect, useState } from "react";
import { queryClient } from "@/lib/queryClient";
import type { User } from "@shared/schema";
import { apiRequest } from "@/lib/api"; // Assuming apiRequest is available

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
    const initializeAuth = async () => {
      try {
        console.log('[useAuth] Initializing authentication...');

        const session = await getSession();
        console.log('[useAuth] Session check:', {
          hasSession: !!session,
          hasUser: !!session?.user,
          hasToken: !!session?.access_token
        });

        if (session?.user && session?.access_token) {
          console.log('[useAuth] Valid session found, fetching user data...');

          try {
            const response = await apiRequest('/api/auth/user', {
              method: 'GET'
            });
            console.log('[useAuth] User data fetched successfully:', response);
            setSession(response.user); // Assuming setSession should store user data as well
            setIsInitialized(true);
          } catch (apiError) {
            console.error('[useAuth] API request failed:', apiError);

            // If API call fails, it might be due to invalid token
            console.log('[useAuth] Clearing invalid session...');
            await signOut();
            setSession(null);
            setIsInitialized(true);
          }
        } else {
          console.log('[useAuth] No valid session found');
          setSession(null);
          setIsInitialized(true);
        }
      } catch (error) {
        console.error('[useAuth] Auth initialization error:', error);
        // Clear any invalid session
        await signOut();
        setSession(null);
        setIsInitialized(true);
      }
    };

    initializeAuth();

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

        // Force clear browser storage
        try {
          localStorage.clear();
          sessionStorage.clear();
          // Clear service worker cache if available
          if ('caches' in window) {
            caches.keys().then(names => {
              names.forEach(name => caches.delete(name));
            });
          }
        } catch (e) {
          console.log('Storage clear attempt:', e);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
      console.log('[useAuth] Unsubscribed from auth state changes.');
    };
  }, []);

  // Query user data from our backend when authenticated
  const { data: user, isLoading: userLoading, error } = useQuery({
    queryKey: ['/api/auth/user'],
    queryFn: async () => {
      if (!session?.access_token) {
        console.log("[useAuth] No access token available, skipping user fetch.");
        return null;
      }

      console.log("[useAuth] Fetching user with token:", session.access_token.substring(0, 50) + '...');

      const response = await fetch('/api/auth/user', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      console.log("[useAuth] User fetch response status:", response.status);

      if (!response.ok) {
        if (response.status === 401) {
          console.log("[useAuth] Unauthorized - clearing session and redirecting to login");
          // Clear the session and redirect to login
          localStorage.removeItem('supabase.auth.token'); // This might not be the correct key
          setSession(null);
          await signOut();
          return null;
        }
        if (response.status === 403) {
          const data = await response.json();
          if (data.requiresApproval) {
            window.location.href = '/pending-approval';
            return null;
          }
        }
        console.error(`[useAuth] Failed to fetch user: ${response.status}`);
        throw new Error(`Failed to fetch user (Status: ${response.status})`);
      }

      const userData = await response.json();
      console.log("[useAuth] User data received:", userData.email, userData.role);
      return userData;
    },
    enabled: !!session?.access_token && isInitialized,
    retry: (failureCount, error: any) => {
      // Don't retry on auth errors
      if (error?.message?.includes('401') || error?.message?.includes('Unauthorized')) {
        console.warn("[useAuth] Not retrying failed fetch due to unauthorized error.");
        return false;
      }
      console.log(`[useAuth] Retrying fetch attempt ${failureCount} for error:`, error?.message);
      return failureCount < 2;
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
  });

  // Auth state ready

  return {
    user, // This should be the data fetched from /api/auth/user
    session, // This should be the session object from supabase
    isAuthenticated: !!session && !!user,
    isLoading: !isInitialized, // Use isInitialized to determine initial loading state
    error
  };
}