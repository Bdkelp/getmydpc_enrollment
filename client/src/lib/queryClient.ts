import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

type SupabaseAuthContext = {
  token: string | null;
  supabase: any;
};

const loadSupabaseAuthContext = async (forceRefresh = false): Promise<SupabaseAuthContext> => {
  const { supabase } = await import("@/lib/supabase");

  if (forceRefresh) {
    try {
      const { data } = await supabase.auth.refreshSession();
      return { token: data?.session?.access_token ?? null, supabase };
    } catch (error) {
      console.warn("[apiRequest] Failed to refresh Supabase session", error);
      return { token: null, supabase };
    }
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return { token: session.access_token, supabase };
    }
  } catch (error) {
    console.warn("[apiRequest] Failed to read Supabase session", error);
  }

  try {
    const { data } = await supabase.auth.refreshSession();
    return { token: data?.session?.access_token ?? null, supabase };
  } catch (error) {
    console.warn("[apiRequest] Refresh after empty session failed", error);
    return { token: null, supabase };
  }
};

// Assume getAuthToken and other necessary functions are defined elsewhere or imported
// For the purpose of this example, let's mock getAuthToken and localStorage
const getAuthToken = async (): Promise<string | null> => {
  // Replace with actual token retrieval logic
  return localStorage.getItem('auth_token');
};

export const apiRequest = async (url: string, options: RequestInit = {}) => {
  const requestId = Math.random().toString(36).substr(2, 9);
  const startTime = Date.now();
  
  // Import API_URL from apiClient to get the DigitalOcean backend URL
  const { API_URL } = await import("@/lib/apiClient");
  
  // Construct full URL if it's a relative path
  // Ensure proper slash between base and path
  const fullUrl = url.startsWith('http') ? url : `${API_URL}${url.startsWith('/') ? url : `/${url}`}`;

  console.log(`[apiRequest:${requestId}] Starting request`, {
    url: fullUrl,
    method: options.method || 'GET',
    timestamp: new Date().toISOString()
  });
  const performRequest = async (authRetry = false, networkRetry = false): Promise<any> => {
    try {
      const { token } = await loadSupabaseAuthContext(authRetry);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers as Record<string, string> || {}),
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      } else if (!authRetry) {
        console.log(`[apiRequest:${requestId}] No auth token available (public endpoint or session missing)`);
      }

      const response = await fetch(fullUrl, {
        ...options,
        credentials: options.credentials || 'include',
        headers,
      });

      const duration = Date.now() - startTime;
      console.log(`[apiRequest:${requestId}] Response received`, {
        status: response.status,
        statusText: response.statusText,
        duration: `${duration}ms`,
        url: fullUrl
      });

      if (response.status === 401 && !authRetry) {
        console.warn(`[apiRequest:${requestId}] 401 response – refreshing Supabase session and retrying`);
        return performRequest(true, networkRetry);
      }

      if (!response.ok) {
        let errorText = '';
        try {
          errorText = await response.text();
        } catch (textError) {
          console.warn(`[apiRequest:${requestId}] Could not read error response body`);
          errorText = 'Unknown error';
        }

        console.error(`[apiRequest:${requestId}] Request failed`, {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
          duration: `${duration}ms`,
          url: fullUrl
        });

        if (response.status === 401) {
          throw new Error('Authentication required');
        }
        if (response.status === 403) {
          throw new Error('Access forbidden');
        }

        throw new Error(`HTTP ${response.status}: ${response.statusText || errorText}`);
      }

      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        console.warn(`[apiRequest:${requestId}] Response is not valid JSON`);
        data = {};
      }

      console.log(`[apiRequest:${requestId}] Request completed successfully`, {
        duration: `${duration}ms`,
        dataLength: JSON.stringify(data).length,
        url: fullUrl
      });

      return data;
    } catch (error: any) {
      console.error(`[apiRequest:${requestId}] Request error`, error);

      if (!networkRetry && (error?.message?.includes('fetch') || error?.message?.includes('Network'))) {
        console.log(`[apiRequest:${requestId}] Retrying after network error...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return performRequest(authRetry, true);
      }

      const duration = Date.now() - startTime;
      console.error(`[apiRequest:${requestId}] Request failed`, {
        error: error instanceof Error ? error.message : String(error),
        duration: `${duration}ms`,
        url: fullUrl,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error instanceof Error ? error : new Error(String(error));
    }
  };

  return performRequest();
};

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Import API_URL to get the correct backend URL
    const { API_URL } = await import("@/lib/apiClient");
    
    // Build the full URL using API_URL for relative paths
    const url = queryKey[0] as string;
    const fullUrl = url.startsWith('http') ? url : `${API_URL}${url.startsWith('/') ? url : `/${url}`}`;

    const fetchWithAuth = async (authRetry = false): Promise<Response> => {
      const { token } = await loadSupabaseAuthContext(authRetry);
      const headers: Record<string, string> = {};

      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(fullUrl, {
        credentials: "include",
        headers,
      });

      if (res.status === 401 && !authRetry) {
        console.warn(`[getQueryFn] 401 for ${fullUrl} – attempting session refresh`);
        return fetchWithAuth(true);
      }

      return res;
    };

    const res = await fetchWithAuth();

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