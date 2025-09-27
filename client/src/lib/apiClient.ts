// API Client for unified deployment

const buildBaseUrl = () => {
  // Always use same-origin for unified deployment
  const origin = window.location.origin;
  console.log('[API Client] Using unified deployment API URL:', origin);
  return origin;
};

// Fallback URLs for emergency situations
const FALLBACK_URLS = [
  'https://enrollment.getmydpc.com',
  'https://getmydpcenrollment-production.up.railway.app'
];

let currentFallbackIndex = -1;

const getFallbackUrl = () => {
  currentFallbackIndex = (currentFallbackIndex + 1) % FALLBACK_URLS.length;
  return FALLBACK_URLS[currentFallbackIndex];
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
    const baseUrl = retryCount > 1 ? getFallbackUrl() : API_BASE_URL;
    console.log(`[API] POST ${join(baseUrl, endpoint)}`, { data, retryCount, baseUrl });
    
    try {
      const res = await fetch(join(baseUrl, endpoint), {
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
        // Retry on CORS or server errors
        if (retryCount === 0 && (res.status === 0 || res.status >= 500 || res.status === 401)) {
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
