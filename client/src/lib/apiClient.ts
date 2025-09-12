
// API Client for split deployment (Frontend: Vercel, Backend: Railway)

const buildBaseUrl = () => {
  // Prefer explicit env var in production
  let raw = import.meta.env.VITE_API_URL as string | undefined;

  if (import.meta.env.PROD && raw) {
    // add scheme if missing
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
    // remove trailing slash
    raw = raw.replace(/\/+$/, '');
    return raw;
  }

  // Dev: same-origin (Replit or local)
  return window.location.origin;
};

export const API_BASE_URL = buildBaseUrl();

const join = (base: string, path: string) =>
  `${base}${path.startsWith('/') ? path : `/${path}`}`;

const apiClient = {
  async get(endpoint: string) {
    const res = await fetch(join(API_BASE_URL, endpoint), {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  },

  async post(endpoint: string, data?: any) {
    const res = await fetch(join(API_BASE_URL, endpoint), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: data ? JSON.stringify(data) : undefined,
    });
    if (!res.ok) {
      // try to surface server error text
      let txt = '';
      try { txt = await res.text(); } catch {}
      throw new Error(`${res.status} : ${txt || res.statusText}`);
    }
    return res.json();
  },

  async put(endpoint: string, data?: any) {
    const res = await fetch(join(API_BASE_URL, endpoint), {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: data ? JSON.stringify(data) : undefined,
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  },

  async delete(endpoint: string) {
    const res = await fetch(join(API_BASE_URL, endpoint), {
      method: 'DELETE',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  },
};

export default apiClient;

// Maintain backward compatibility
export const API_URL = API_BASE_URL;
export { apiClient };
