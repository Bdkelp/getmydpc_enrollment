import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import { API_BASE_URL } from "@/lib/apiClient";

export interface AuthUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  agentNumber?: string;
  profileImageUrl?: string;
  isActive: boolean;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  lastLoginAt?: string;
}

export type LogoutOptions = {
  redirectTo?: string;
  redirectMode?: "assign" | "replace" | "reload";
  suppressRedirect?: boolean;
};

const DEFAULT_LOGOUT_OPTIONS: Required<Pick<LogoutOptions, "redirectTo" | "redirectMode" | "suppressRedirect">> = {
  redirectTo: "/login",
  redirectMode: "replace",
  suppressRedirect: false,
};

const navigateAfterLogout = (
  target?: string,
  mode: LogoutOptions["redirectMode"] = "assign"
) => {
  if (typeof window === "undefined") {
    return;
  }

  if (mode === "reload") {
    if (target) {
      window.location.assign(target);
    } else {
      window.location.reload();
    }
    return;
  }

  if (!target) {
    return;
  }

  if (mode === "replace") {
    window.location.replace(target);
  } else {
    window.location.assign(target);
  }
};

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const logoutIntentRef = useRef<LogoutOptions | null>(null);

  const finalizeSignOut = useCallback((fallback?: LogoutOptions) => {
    const intent = logoutIntentRef.current;
    logoutIntentRef.current = null;

    setUser(null);
    setIsAuthenticated(false);
    setIsLoading(false);

    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }

    const suppressRedirect = intent?.suppressRedirect ?? fallback?.suppressRedirect ?? false;
    const redirectTo = intent?.redirectTo ?? fallback?.redirectTo;
    const redirectMode = intent?.redirectMode ?? fallback?.redirectMode;

    if (!suppressRedirect && (redirectTo || redirectMode === 'reload')) {
      navigateAfterLogout(redirectTo, redirectMode ?? 'assign');
    }
  }, []);

  useEffect(() => {
    console.log('[useAuth] Initializing authentication...');

    // Get initial session
    const getInitialSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        console.log('[useAuth] Initial session check:', { hasSession: !!session, error });

        if (session?.access_token) {
          await fetchUserProfile(session.access_token);
        } else {
          setIsLoading(false);
        }
      } catch (error) {
        console.error('[useAuth] Error getting initial session:', error);
        setIsLoading(false);
      }
    };

    // Listen for auth changes with better token refresh handling
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[useAuth] Auth state changed:', event, { hasSession: !!session });

      switch (event) {
        case 'SIGNED_IN':
          console.log('[useAuth] User signed in');
          if (session?.access_token) {
            await fetchUserProfile(session.access_token);
          }
          break;

        case 'TOKEN_REFRESHED':
          console.log('[useAuth] Token refreshed successfully');
          if (session?.access_token) {
            await fetchUserProfile(session.access_token);
          }
          break;

        case 'SIGNED_OUT':
          console.log('[useAuth] User signed out');
          finalizeSignOut(DEFAULT_LOGOUT_OPTIONS);
          break;

        case 'PASSWORD_RECOVERY':
          console.log('[useAuth] Password recovery initiated');
          break;

        case 'USER_UPDATED':
          console.log('[useAuth] User updated');
          if (session?.access_token) {
            await fetchUserProfile(session.access_token);
          }
          break;

        default:
          // Handle any other events
          if (session?.access_token) {
            await fetchUserProfile(session.access_token);
          } else {
            setUser(null);
            setIsAuthenticated(false);
            setIsLoading(false);
          }
      }
    });

    getInitialSession();

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserProfile = async (token: string, retryCount = 0) => {
    try {
      console.log('[useAuth] Fetching user profile...', { retryCount });

      const response = await fetch(`${API_BASE_URL}/api/auth/user`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (!response.ok) {
        console.error('[useAuth] Failed to fetch user profile:', response.status, response.statusText);
        
        // Retry once on network errors or 5xx errors
        if (retryCount === 0 && (response.status >= 500 || response.status === 0)) {
          console.log('[useAuth] Retrying user profile fetch...');
          await new Promise(resolve => setTimeout(resolve, 1000));
          return fetchUserProfile(token, retryCount + 1);
        }
        
        throw new Error(`Failed to fetch user profile: ${response.status} ${response.statusText}`);
      }

      const userData = await response.json();
      console.log('[useAuth] User profile fetched:', userData);

      setUser(userData);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('[useAuth] Error fetching user profile:', error);
      
      // Only retry network errors, not auth errors
      if (retryCount === 0 && error.message.includes('Network error')) {
        console.log('[useAuth] Retrying on network error...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        return fetchUserProfile(token, retryCount + 1);
      }
      
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = useCallback(async (options?: LogoutOptions) => {
    const desiredOptions: LogoutOptions = {
      redirectTo: options?.redirectTo ?? DEFAULT_LOGOUT_OPTIONS.redirectTo,
      redirectMode: options?.redirectMode ?? DEFAULT_LOGOUT_OPTIONS.redirectMode,
      suppressRedirect: options?.suppressRedirect ?? DEFAULT_LOGOUT_OPTIONS.suppressRedirect,
    };

    logoutIntentRef.current = desiredOptions;

    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('[useAuth] Error during logout:', error);
      finalizeSignOut(desiredOptions);
    }
  }, [finalizeSignOut]);

  return {
    user,
    isLoading,
    isAuthenticated,
    logout
  };
}