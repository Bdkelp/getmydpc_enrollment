import { useQuery } from "@tanstack/react-query";
import { getSession, onAuthStateChange, signOut } from "@/lib/supabase";
import { useEffect, useState } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { User } from "@shared/schema";

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
          // Check if session is still valid by verifying token expiry
          const now = Math.floor(Date.now() / 1000);
          if (session.expires_at && session.expires_at > now) {
            console.log("[useAuth] Valid session found");
            setSession(session);
          } else {
            console.log("[useAuth] Session expired, clearing");
            await signOut();
            setSession(null);
          }
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
            queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
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
    queryKey: ["/api/auth/me", session?.access_token],
    queryFn: async () => {
      if (!session?.access_token || !session?.user) {
        console.log("[useAuth] No valid session, skipping user fetch.");
        return null;
      }

      // Add a small delay to prevent race conditions
      await new Promise((resolve) => setTimeout(resolve, 100));

      const tokenPreview =
        session.access_token.length > 50
          ? session.access_token.substring(0, 50) + "..."
          : session.access_token;
      console.log("[useAuth] Fetching user with token:", tokenPreview);

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch("/api/auth/me", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        console.log("[useAuth] User fetch response status:", response.status);

        if (!response.ok) {
          if (response.status === 401) {
            console.log(
              "[useAuth] Unauthorized response - token may be expired",
            );
            // Clear the session safely with a delay to prevent race conditions
            console.log("[useAuth] Clearing expired session");
            setTimeout(async () => {
              try {
                setSession(null);
                await signOut(); // Let Supabase handle storage cleanup
              } catch (clearError) {
                console.warn("[useAuth] Session cleanup failed:", clearError);
              }
            }, 100);
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
      } catch (fetchError: any) {
        if (fetchError?.name === "AbortError") {
          console.warn("[useAuth] User fetch request timed out");
          return null;
        }
        console.error("[useAuth] User fetch error:", fetchError);

        // If it's a network error, don't throw - just return null
        if (fetchError?.message?.includes("Failed to fetch")) {
          console.warn("[useAuth] Network error, returning null user");
          return null;
        }

        throw fetchError;
      }
    },
    enabled: !!session?.access_token && !!session?.user && isInitialized,
    retry: (failureCount, error: any) => {
      // Don't retry on auth errors or network timeouts
      if (
        error?.message?.includes("401") ||
        error?.message?.includes("Unauthorized") ||
        error?.name === "AbortError"
      ) {
        console.warn(
          "[useAuth] Not retrying due to auth error or timeout:",
          error?.message,
        );
        return false;
      }
      console.log(
        `[useAuth] Retrying fetch attempt ${failureCount} for error:`,
        error?.message,
      );
      return failureCount < 1; // Reduce retries
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const isAuthenticated = !!(session?.user && session?.access_token && user);
  const isLoadingAuth = !isInitialized;
  const isLoadingUser = isInitialized && !!session?.access_token && userLoading;

  return {
    user: user || null,
    session: session || null,
    isAuthenticated,
    isLoading: isLoadingAuth || isLoadingUser,
    error: error || null,
  };
}
