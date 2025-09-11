// API Client Configuration for split deployment
// Frontend: Vercel
// Backend: Railway

const getApiUrl = () => {
  // In production, use the Railway backend URL from environment variable
  if (import.meta.env.PROD && import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // In development, use local Express server
  if (import.meta.env.DEV) {
    return 'http://localhost:5000';
  }
  
  // Fallback to current origin (for backwards compatibility)
  return window.location.origin;
};

export const API_URL = getApiUrl();

// Helper function to make API requests with proper headers
export const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
  const url = `${API_URL}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include', // Important for cookies/sessions
  });
  
  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }
  
  return response.json();
};

export default API_URL;