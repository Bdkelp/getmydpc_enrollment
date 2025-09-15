
// Environment configuration check
export const checkEnvironment = () => {
  const apiUrl = import.meta.env.VITE_API_URL;
  const isDev = import.meta.env.DEV;
  const isProd = import.meta.env.PROD;
  
  console.log('[Environment Check]', {
    VITE_API_URL: apiUrl,
    isDev,
    isProd,
    origin: window.location.origin
  });
  
  if (isProd && !apiUrl) {
    console.warn('[Environment Check] VITE_API_URL not set in production!');
  }
  
  return {
    apiUrl,
    isDev,
    isProd,
    hasApiUrl: !!apiUrl
  };
};

// Run check on load
if (typeof window !== 'undefined') {
  checkEnvironment();
}
