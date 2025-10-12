// API Client for split deployment (Frontend: Vercel, Backend: Railway)

const buildBaseUrl = () => {
  // Prefer explicit env var in production
  let raw = import.meta.env.VITE_API_URL as string | undefined;

  // ---- sanitize common copy/paste mistakes ----
  if (raw) {
    raw = String(raw)
      .trim()
      // remove "VITE_API_URL =" if someone pasted the whole line
      .replace(/^VITE_API_URL\s*=\s*/i, "")
      // drop trailing slashes
      .replace(/\/+$/, "");
    // add https if missing
    if (raw && !/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  }
  // ---------------------------------------------

  if (import.meta.env.PROD && raw) {
    console.log('[API Client] Using production API URL:', raw);
    return raw;
  }

  // ALWAYS use Railway backend in production or when VITE_API_URL is not set
  if (import.meta.env.PROD || !raw) {
    const railwayUrl = 'https://getmydpcenrollment-production.up.railway.app';
    console.log('[API Client] Using Railway production API URL:', railwayUrl);
    return railwayUrl;
  }

  // Dev fallback: same-origin (Replit/local)
  const origin = window.location.origin;
  console.log('[API Client] Using development API URL:', origin);
  return origin;
};

export const API_BASE_URL = buildBaseUrl();

const join = (base: string, path: string) =>
  `${base}${path.startsWith("/") ? path : `/${path}`}`;

const apiClient = {
  async get(endpoint: string) {
    const res = await fetch(join(API_BASE_URL, endpoint), {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  },

  async post(endpoint: string, data?: any, retryCount = 0) {
    console.log(`[API] POST ${join(API_BASE_URL, endpoint)}`, { data, retryCount });

    try {
      const res = await fetch(join(API_BASE_URL, endpoint), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: data ? JSON.stringify(data) : undefined,
      });

      console.log(`[API] POST Response: ${res.status} ${res.statusText}`);

      if (!res.ok) {
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
    } catch (networkError) {
      console.error(`[API] Network error for POST ${endpoint}:`, networkError);

      // Retry on network errors
      if (retryCount === 0 && (networkError.message.includes('fetch') || networkError.message.includes('Network'))) {
        console.log(`[API] Retrying POST ${endpoint} after network error...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return this.post(endpoint, data, retryCount + 1);
      }

      throw new Error(`Network error: ${networkError.message}`);
    }
  },

  async put(endpoint: string, data?: any) {
    const res = await fetch(join(API_BASE_URL, endpoint), {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  },

  async delete(endpoint: string) {
    const res = await fetch(join(API_BASE_URL, endpoint), {
      method: "DELETE",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  },
};

export default apiClient;

// Maintain backward compatibility
export const API_URL = API_BASE_URL;
export { apiClient };
