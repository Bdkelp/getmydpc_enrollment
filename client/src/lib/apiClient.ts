// API Client for split deployment (Frontend: Vercel, Backend: Railway)

function getApiUrl(): string {
  // Prefer explicit base if provided (works in prod and dev)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL as string; // e.g. https://your-app.up.railway.app
  }
  // Fallback to same-origin (useful on Replit/local)
  return window.location.origin;
}

export const API_URL = getApiUrl();

function normalize(path: string): string {
  // Ensure exactly one slash between base and path
  if (!path.startsWith("/")) path = `/${path}`;
  return `${API_URL}${path}`;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Bubble up rich error for debugging
    throw new Error(
      `${res.status} ${res.statusText}: ${text || "Request failed"}`,
    );
  }
  // Some endpoints may return 204/empty
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const apiClient = {
  async get<T = any>(endpoint: string): Promise<T> {
    const res = await fetch(normalize(endpoint), {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    return handle<T>(res);
  },

  async post<T = any>(endpoint: string, data?: any): Promise<T> {
    const res = await fetch(normalize(endpoint), {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: data != null ? JSON.stringify(data) : undefined,
    });
    return handle<T>(res);
  },

  async put<T = any>(endpoint: string, data?: any): Promise<T> {
    const res = await fetch(normalize(endpoint), {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: data != null ? JSON.stringify(data) : undefined,
    });
    return handle<T>(res);
  },

  async delete<T = any>(endpoint: string): Promise<T> {
    const res = await fetch(normalize(endpoint), {
      method: "DELETE",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    return handle<T>(res);
  },
};

export default apiClient;
