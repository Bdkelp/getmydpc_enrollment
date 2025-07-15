import { useQuery } from "@tanstack/react-query";
import { getSession, onAuthStateChange } from "@/lib/supabase";
import { useEffect, useState } from "react";
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
      setSession(session);
      setIsInitialized(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Query user data from our backend when authenticated
  const { data: user, isLoading: userLoading, error } = useQuery({
    queryKey: ['/api/auth/user'],
    queryFn: async () => {
      if (!session?.access_token) return null;
      
      const response = await fetch('/api/auth/user', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      
      if (!response.ok) {
        if (response.status === 401) return null;
        throw new Error('Failed to fetch user');
      }
      
      return response.json();
    },
    enabled: !!session?.access_token && isInitialized,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const isLoading = !isInitialized || (session && userLoading);

  return {
    user,
    session,
    isAuthenticated: !!session && !!user,
    isLoading,
    error
  };
}
