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

export const apiRequest = async (url: string, options: RequestInit = {}) => {
  const requestId = Math.random().toString(36).substr(2, 9);
  const startTime = Date.now();
  
  // Import API_URL from apiClient to get the Railway backend URL
  const { API_URL } = await import("@/lib/apiClient");
  
  // Construct full URL if it's a relative path
  // Ensure proper slash between base and path
  const fullUrl = url.startsWith('http') ? url : `${API_URL}${url.startsWith('/') ? url : `/${url}`}`;

  console.log(`[apiRequest:${requestId}] Starting request`, {
    url: fullUrl,
    method: options.method || 'GET',
    timestamp: new Date().toISOString()
  });

  try {
    // Get fresh session for each request
    const {supabase } = await import("@/lib/supabase");

    // Force refresh the session to ensure we have the latest token
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      console.error(`[apiRequest:${requestId}] Session error:`, sessionError);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    // Add auth token if available
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
      console.log(`[apiRequest:${requestId}] Auth token added, user:`, session.user?.email);
    } else {
      console.warn(`[apiRequest:${requestId}] No auth token available for request to:`, fullUrl);
    }

    const response = await fetch(fullUrl, {
      credentials: 'include',
      headers,
      ...options,
    });

    const duration = Date.now() - startTime;
    console.log(`[apiRequest:${requestId}] Response received`, {
      status: response.status,
      statusText: response.statusText,
      duration: `${duration}ms`,
      url: fullUrl
    });

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

      // Handle specific error cases
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
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[apiRequest:${requestId}] Request failed`, {
      error: error instanceof Error ? error.message : String(error),
      duration: `${duration}ms`,
      url: fullUrl,
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
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
    
    // Get the Supabase session to include auth token
    const { supabase } = await import("@/lib/supabase");

    // Force refresh the session to ensure we have the latest token
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      console.error("[getQueryFn] Session error:", sessionError);
    }

    const headers: Record<string, string> = {};

    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
      console.log("[getQueryFn] Auth token added for:", fullUrl);
    } else {
      console.warn("[getQueryFn] No auth token available for:", fullUrl);
    }

    const res = await fetch(fullUrl, {
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