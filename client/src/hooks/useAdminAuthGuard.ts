import { useEffect } from "react";
import { isUnauthorizedError } from "@/lib/authUtils";

type ToastFn = (opts: { title: string; description: string; variant?: "default" | "destructive" }) => void;

interface UseAdminAuthGuardOptions {
  isAuthenticated: boolean;
  isAdminUser: boolean;
  authLoading: boolean;
  user: any;
  toast: ToastFn;
  statsError: Error | null;
  usersError: Error | null;
}

export function useAdminAuthGuard({
  isAuthenticated,
  isAdminUser,
  authLoading,
  user,
  toast,
  statsError,
  usersError,
}: UseAdminAuthGuardOptions): void {
  // Test authentication (dev diagnostic)
  useEffect(() => {
    const testAuth = async () => {
      const { getSession } = await import("@/lib/supabase");
      const session = await getSession();
      console.log('[Admin Page] Authentication Test:', {
        hasSession: !!session,
        hasToken: !!session?.access_token,
        tokenPreview: session?.access_token?.substring(0, 30) + '...',
        userEmail: session?.user?.email,
        currentUser: user,
        isAuthenticated
      });
    };
    testAuth();
  }, [user, isAuthenticated]);

  // Redirect if not authenticated or not admin
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/login";
      }, 500);
      return;
    }

    if (!authLoading && user && !isAdminUser) {
      toast({
        title: "Access Denied",
        description: "Admin access required.",
        variant: "destructive",
      });
      return;
    }
  }, [isAuthenticated, authLoading, user, isAdminUser, toast]);

  // Handle stats unauthorized error
  useEffect(() => {
    if (statsError && isUnauthorizedError(statsError as Error)) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/login";
      }, 500);
    }
  }, [statsError, toast]);

  // Handle users unauthorized error
  useEffect(() => {
    if (usersError && isUnauthorizedError(usersError as Error)) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/login";
      }, 500);
    }
  }, [usersError, toast]);
}
