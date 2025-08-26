import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Assume getAuthToken and other necessary functions are defined elsewhere or imported
// For the purpose of this example, let's mock getAuthToken and localStorage
const getAuthToken = async (): Promise<string | null> => {
  // Replace with actual token retrieval logic
  return localStorage.getItem('auth_token');
};

export const apiRequest = async (url: string, options: RequestInit = {}): Promise<any> => {
  const token = await getAuthToken();

  if (!token) {
    throw new Error('No authentication token available');
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Token might be expired, clear it and throw auth error
        localStorage.removeItem('auth_token');
        throw new Error('Authentication expired');
      }

      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      // Ensure we always return an array for list endpoints
      if (url.includes('/leads') || url.includes('/enrollments') || url.includes('/agents')) {
        return Array.isArray(data) ? data : [];
      }
      return data;
    }

    return await response.text();
  } catch (error) {
    console.error(`[apiRequest] Error for ${url}:`, error);
    throw error;
  }
};

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Get the Supabase session to include auth token
    const { getSession } = await import("@/lib/supabase");
    const session = await getSession();

    const headers: Record<string, string> = {};

    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }

    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});