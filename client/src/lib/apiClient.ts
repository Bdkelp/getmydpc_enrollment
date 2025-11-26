// API Client - Uses env var or same-origin for flexibility

const API_BASE_URL = import.meta.env.VITE_API_URL || window.location.origin;

console.log('[API Client] Using API URL:', API_BASE_URL);

export { API_BASE_URL };

const join = (base: string, path: string) =>
  `${base}${path.startsWith("/") ? path : `/${path}`}`;

const apiClient = {
  async get(endpoint: string) {
    // Get auth token for authenticated requests
    const headers: Record<string, string> = { 
      Accept: "application/json" 
    };

    try {
      const { supabase } = await import("@/lib/supabase");
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
    } catch (error) {
      console.warn('[API Client] Could not get auth token:', error);
    }

    const res = await fetch(join(API_BASE_URL, endpoint), {
      credentials: "include",
      headers,
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  },

  async post(endpoint: string, data?: any, retryCount = 0): Promise<any> {
    console.log(`[API] POST ${join(API_BASE_URL, endpoint)}`, { data, retryCount });

    try {
      // Get auth token for authenticated requests
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };

      try {
        const { supabase } = await import("@/lib/supabase");
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.access_token) {
          headers["Authorization"] = `Bearer ${session.access_token}`;
        }
      } catch (error) {
        console.warn('[API Client] Could not get auth token:', error);
      }

      const res = await fetch(join(API_BASE_URL, endpoint), {
        method: "POST",
        credentials: "include",
        headers,
        body: data ? JSON.stringify(data) : undefined,
      });

      console.log(`[API] POST Response: ${res.status} ${res.statusText}`);

      if (!res.ok) {
        // Special handling for 403 with password change requirement
        if (res.status === 403) {
          try {
            const responseData = await res.json();
            // If it's a password change requirement, return it (don't throw)
            if (responseData.requiresPasswordChange) {
              return responseData;
            }
            // Otherwise, throw the error
            throw new Error(responseData.message || `${res.status}: ${res.statusText}`);
          } catch (jsonError) {
            // If can't parse JSON, fall through to regular error handling
            console.error(`[API] Could not parse 403 response:`, jsonError);
          }
        }

        // Retry on CORS or server errors (but NOT on auth failures 401)
        if (retryCount === 0 && (res.status === 0 || res.status >= 500)) {
          console.log(`[API] Retrying POST ${endpoint} after ${res.status} error...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          return this.post(endpoint, data, retryCount + 1);
        }

        // try to surface server error text
        let txt = "";
        try {
          const responseText = await res.text();
          txt = responseText;
          console.error(`[API] Error response:`, txt);

          // Try to parse as JSON for better error messages
          try {
            const errorObj = JSON.parse(responseText);
            if (errorObj.message) {
              throw new Error(errorObj.message);
            }
          } catch {
            // Not JSON, use original text
          }
        } catch (textError) {
          console.error(`[API] Could not read error response:`, textError);
        }
        throw new Error(`${res.status}: ${txt || res.statusText}`);
      }
      return res.json();
    } catch (networkError: any) {
      console.error(`[API] Network error for POST ${endpoint}:`, networkError);

      // Retry on network errors
      if (retryCount === 0 && (networkError?.message?.includes('fetch') || networkError?.message?.includes('Network'))) {
        console.log(`[API] Retrying POST ${endpoint} after network error...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return this.post(endpoint, data, retryCount + 1);
      }

      throw new Error(`Network error: ${networkError?.message || 'Unknown network error'}`);
    }
  },

  async put(endpoint: string, data?: any) {
    // Get auth token for authenticated requests
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    try {
      const { supabase } = await import("@/lib/supabase");
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
    } catch (error) {
      console.warn('[API Client] Could not get auth token:', error);
    }

    const res = await fetch(join(API_BASE_URL, endpoint), {
      method: "PUT",
      credentials: "include",
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  },

  async delete(endpoint: string) {
    // Get auth token for authenticated requests
    const headers: Record<string, string> = { 
      Accept: "application/json" 
    };

    try {
      const { supabase } = await import("@/lib/supabase");
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
    } catch (error) {
      console.warn('[API Client] Could not get auth token:', error);
    }

    const res = await fetch(join(API_BASE_URL, endpoint), {
      method: "DELETE",
      credentials: "include",
      headers,
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  },
};

export default apiClient;

// Maintain backward compatibility
export const API_URL = API_BASE_URL;
export { apiClient };
