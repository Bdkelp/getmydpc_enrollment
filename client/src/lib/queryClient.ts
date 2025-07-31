import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  url: string,
  options: {
    method: string;
    body?: string;
    headers?: HeadersInit;
  }
): Promise<any> {
  // Get the Supabase session to include auth token
  const { getSession } = await import("@/lib/supabase");
  const session = await getSession();
  
  console.log('[apiRequest] Session:', { hasSession: !!session, hasToken: !!session?.access_token });
  
  const headers: HeadersInit = {
    ...options.headers,
  };
  
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }
  
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  
  console.log('[apiRequest] Making request:', { url, method: options.method, hasAuth: !!headers["Authorization"] });
  
  const res = await fetch(url, {
    method: options.method,
    headers,
    body: options.body,
    credentials: "include",
  });

  const responseData = await res.text();
  
  if (!res.ok) {
    let errorMessage;
    try {
      const errorJson = JSON.parse(responseData);
      errorMessage = errorJson.message || res.statusText;
    } catch {
      errorMessage = responseData || res.statusText;
    }
    
    console.error('[apiRequest] Error response:', { status: res.status, message: errorMessage });
    const error = new Error(errorMessage);
    (error as any).status = res.status;
    (error as any).response = { data: { message: errorMessage } };
    throw error;
  }
  
  try {
    return JSON.parse(responseData);
  } catch {
    return responseData;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Get the Supabase session to include auth token
    const { getSession } = await import("@/lib/supabase");
    const session = await getSession();
    
    const headers: HeadersInit = {};
    
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
