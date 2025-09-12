import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

export interface AuthUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  profileImageUrl?: string;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Get initial session
    const getSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.error("Session error:", error);
          setError(error.message);
          setUser(null);
        } else if (session?.user) {
          const authUser: AuthUser = {
            id: session.user.id,
            email: session.user.email!,
            firstName: session.user.user_metadata?.first_name || session.user.user_metadata?.firstName,
            lastName: session.user.user_metadata?.last_name || session.user.user_metadata?.lastName,
            role: session.user.user_metadata?.role || 'member',
            profileImageUrl: session.user.user_metadata?.avatar_url
          };
          setUser(authUser);
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error("Auth initialization error:", err);
        setError(err instanceof Error ? err.message : 'Authentication error');
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    getSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log("Auth state changed:", event, session?.user?.email);

        if (session?.user) {
          const authUser: AuthUser = {
            id: session.user.id,
            email: session.user.email!,
            firstName: session.user.user_metadata?.first_name || session.user.user_metadata?.firstName,
            lastName: session.user.user_metadata?.last_name || session.user.user_metadata?.lastName,
            role: session.user.user_metadata?.role || 'member',
            profileImageUrl: session.user.user_metadata?.avatar_url
          };
          setUser(authUser);
          setError(null);
        } else {
          setUser(null);
        }

        if (event === 'SIGNED_OUT') {
          setUser(null);
          setError(null);
        }

        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    setError(null);

    try {
      // First try Supabase auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Supabase auth error:', error);
        setError(error.message);
        return { success: false, error: error.message };
      }

      // If Supabase succeeds, also try backend verification
      if (data.session?.access_token) {
        try {
          const { default: apiClient } = await import('@/lib/apiClient');
          
          // Test the backend connection
          const response = await fetch(apiClient.API_BASE_URL + '/api/auth/me', {
            headers: {
              'Authorization': `Bearer ${data.session.access_token}`,
              'Accept': 'application/json'
            },
            credentials: 'include'
          });
          
          if (!response.ok) {
            console.warn('Backend auth verification failed:', response.status);
          } else {
            console.log('Backend auth verification successful');
          }
        } catch (backendError) {
          console.warn('Could not verify with backend:', backendError);
          // Don't fail the login if backend is temporarily unavailable
        }
      }

      return { success: true, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, userData: any) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: userData.firstName,
            last_name: userData.lastName,
            role: userData.role || 'member',
            ...userData
          }
        }
      });

      if (error) {
        setError(error.message);
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign up failed';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        setError(error.message);
      } else {
        setUser(null);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign out failed');
    } finally {
      setLoading(false);
    }
  };

  return {
    user,
    loading,
    error,
    signIn,
    signUp,
    signOut,
    isAuthenticated: !!user
  };
}