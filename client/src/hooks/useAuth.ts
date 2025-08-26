import { useQuery } from "@tanstack/react-query";
import { getSession, onAuthStateChange, signOut } from "@/lib/supabase";
import { useEffect, useState } from "react";
import { queryClient } from "@/lib/queryClient";
import type { User } from "@shared/schema";
import { apiRequest } from "@/lib/api";

interface AuthUser extends Omit<User, "role"> {
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
        console.log("[useAuth] Initializing authentication...");

        const session = await getSession();
        console.log("[useAuth] Session check:", {
          hasSession: !!session,
          hasUser: !!session?.user,
          hasToken: !!session?.access_token,
        });

        if (session?.user && session?.access_token) {
          console.log("[useAuth] Valid session found");
          setSession(session);
        } else {
          console.log("[useAuth] No valid session found");
          setSession(null);
        }
      } catch (error) {
        console.error("[useAuth] Auth initialization error:", error);
        // Clear any invalid session safely
        try {
          await signOut();
        } catch (signOutError) {
          console.warn("[useAuth] Sign out failed:", signOutError);
        }
        setSession(null);
      } finally {
        setIsInitialized(true);
      }
    };

    initializeAuth();

    // Listen for auth changes with error handling
    let subscription: any = null;
    try {
      const authListener = onAuthStateChange((event, session) => {
        console.log("[useAuth] Auth state changed:", event, !!session);

        // Safely handle the session update
        if (session && session.user && session.access_token) {
          setSession(session);
        } else {
          setSession(null);
        }

        if (!isInitialized) {
          setIsInitialized(true);
        }

        // Invalidate queries when auth state changes
        if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
          try {
            queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
          } catch (queryError) {
            console.warn("[useAuth] Query invalidation failed:", queryError);
          }
        }
      });

      subscription = authListener?.data?.subscription;
    } catch (authError) {
      console.error("[useAuth] Auth listener setup failed:", authError);
      setIsInitialized(true);
    }

    return () => {
      try {
        if (subscription?.unsubscribe) {
          subscription.unsubscribe();
          console.log("[useAuth] Unsubscribed from auth state changes.");
        }
      } catch (unsubscribeError) {
        console.warn("[useAuth] Unsubscribe failed:", unsubscribeError);
      }
    };
  }, []);

  // Query user data from backend when authenticated
  const {
    data: user,
    isLoading: userLoading,
    error,
  } = useQuery({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      if (!session?.access_token) {
        console.log(
          "[useAuth] No access token available, skipping user fetch.",
        );
        return null;
      }

      const tokenPreview =
        session.access_token.length > 50
          ? session.access_token.substring(0, 50) + "..."
          : session.access_token;
      console.log("[useAuth] Fetching user with token:", tokenPreview);

      try {
        const response = await fetch("/api/auth/user", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        });

        console.log("[useAuth] User fetch response status:", response.status);

        if (!response.ok) {
          if (response.status === 401) {
            console.log("[useAuth] Unauthorized - clearing session");
            // Clear the session safely
            try {
              // Clear any stored tokens
              if (typeof localStorage !== "undefined") {
                localStorage.removeItem("supabase.auth.token");
              }
              setSession(null);
              await signOut();
            } catch (clearError) {
              console.warn("[useAuth] Session cleanup failed:", clearError);
            }
            return null;
          }

          if (response.status === 403) {
            try {
              const data = await response.json();
              if (data?.requiresApproval) {
                if (typeof window !== "undefined") {
                  window.location.href = "/pending-approval";
                }
                return null;
              }
            } catch (parseError) {
              console.warn(
                "[useAuth] Failed to parse 403 response:",
                parseError,
              );
            }
          }

          console.error(`[useAuth] Failed to fetch user: ${response.status}`);
          throw new Error(`Failed to fetch user (Status: ${response.status})`);
        }

        const userData = await response.json();
        if (userData?.email && userData?.role) {
          console.log(
            "[useAuth] User data received:",
            userData.email,
            userData.role,
          );
        }
        return userData;
      } catch (fetchError) {
        console.error("[useAuth] User fetch error:", fetchError);
        throw fetchError;
      }
    },
    enabled: !!session?.access_token && isInitialized,
    retry: (failureCount, error: any) => {
      // Don't retry on auth errors
      if (
        error?.message?.includes("401") ||
        error?.message?.includes("Unauthorized")
      ) {
        console.warn(
          "[useAuth] Not retrying failed fetch due to unauthorized error.",
        );
        return false;
      }
      console.log(
        `[useAuth] Retrying fetch attempt ${failureCount} for error:`,
        error?.message,
      );
      return failureCount < 2;
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
  });

  return {
    user: user || null,
    session: session || null,
    isAuthenticated: !!(session?.user && session?.access_token && user),
    isLoading:
      !isInitialized ||
      (isInitialized && !!session?.access_token && userLoading),
    error: error || null,
  };
}
