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
  const requestId = Math.random().toString(36).substr(2, 9);
  const startTime = Date.now();
  
  console.log(`[apiRequest:${requestId}] Starting request to ${url}`, {
    method: options.method || 'GET',
    hasBody: !!options.body,
    timestamp: new Date().toISOString()
  });

  try {
    const token = await getAuthToken();

    if (!token) {
      console.error(`[apiRequest:${requestId}] No authentication token available`);
      throw new Error('No authentication token available');
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
      credentials: 'include',
    });

    const duration = Date.now() - startTime;
    console.log(`[apiRequest:${requestId}] Response received`, {
      status: response.status,
      statusText: response.statusText,
      duration: `${duration}ms`,
      url
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Failed to read error response');
      console.error(`[apiRequest:${requestId}] HTTP Error`, {
        status: response.status,
        statusText: response.statusText,
        errorText,
        url
      });

      if (response.status === 401) {
        console.warn(`[apiRequest:${requestId}] Token expired, clearing auth`);
        localStorage.removeItem('auth_token');
        throw new Error('Authentication expired');
      }

      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const contentType = response.headers.get('content-type');
    let data;

    try {
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
        console.log(`[apiRequest:${requestId}] JSON response parsed`, {
          dataType: typeof data,
          isArray: Array.isArray(data),
          length: Array.isArray(data) ? data.length : 'N/A'
        });
      } else {
        data = await response.text();
        console.log(`[apiRequest:${requestId}] Text response received`, {
          length: data.length
        });
      }
    } catch (parseError) {
      console.error(`[apiRequest:${requestId}] Failed to parse response`, parseError);
      throw new Error('Failed to parse server response');
    }

    // Ensure we always return an array for list endpoints
    if (url.includes('/leads') || url.includes('/enrollments') || url.includes('/agents')) {
      if (!Array.isArray(data)) {
        console.warn(`[apiRequest:${requestId}] Expected array but got ${typeof data} for ${url}`, data);
        return [];
      }
    }

    console.log(`[apiRequest:${requestId}] Request completed successfully`, {
      duration: `${Date.now() - startTime}ms`
    });

    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[apiRequest:${requestId}] Request failed`, {
      error: error.message,
      duration: `${duration}ms`,
      url,
      stack: error.stack
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