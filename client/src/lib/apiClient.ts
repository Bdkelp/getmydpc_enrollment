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

  if (import.meta.env.PROD && raw) return raw;

  // Dev/preview fallback: same-origin (Replit/local)
  return window.location.origin;
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

  async post(endpoint: string, data?: any) {
    console.log(`[API] POST ${join(API_BASE_URL, endpoint)}`, { data });
    
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
      // try to surface server error text
      let txt = "";
      try {
        txt = await res.text();
        console.error(`[API] Error response:`, txt);
      } catch {}
      throw new Error(`${res.status} : ${txt || res.statusText}`);
    }
    return res.json();
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
