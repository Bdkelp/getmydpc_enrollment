import { useEffect, useState } from "react";
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
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

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

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[useAuth] Auth state changed:', event, { hasSession: !!session });

      if (session?.access_token) {
        await fetchUserProfile(session.access_token);
      } else {
        setUser(null);
        setIsAuthenticated(false);
        setIsLoading(false);
      }
    });

    getInitialSession();

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserProfile = async (token: string) => {
    try {
      console.log('[useAuth] Fetching user profile...');

      const response = await fetch(`${API_BASE_URL}/api/auth/user`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (!response.ok) {
        console.error('[useAuth] Failed to fetch user profile:', response.status);
        throw new Error(`Failed to fetch user profile: ${response.status}`);
      }

      const userData = await response.json();
      console.log('[useAuth] User profile fetched:', userData);

      setUser(userData);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('[useAuth] Error fetching user profile:', error);
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    user,
    isLoading,
    isAuthenticated
  };
}