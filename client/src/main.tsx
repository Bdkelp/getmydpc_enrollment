import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ErrorBoundary from './components/ErrorBoundary'
import './lib/envCheck'

// Global error handler to filter out browser extension errors
window.addEventListener('error', (event) => {
  const errorMessage = event.message || '';
  const isExtensionError = errorMessage.includes('extension://') ||
                         errorMessage.includes('tabutils') ||
                         errorMessage.includes('contextmenu') ||
                         errorMessage.includes('download.js') ||
                         errorMessage.includes('onUpdated') ||
                         errorMessage.includes('onClicked') ||
                         errorMessage.includes('onCreated') ||
                         event.filename?.includes('extension://');

  if (isExtensionError) {
    console.warn('Browser extension error ignored:', event.message);
    event.preventDefault();
    return false;
  }
});

// Handle unhandled promise rejections from extensions
window.addEventListener('unhandledrejection', (event) => {
  const errorMessage = event.reason?.message || event.reason || '';
  const isExtensionError = typeof errorMessage === 'string' && (
    errorMessage.includes('extension://') ||
    errorMessage.includes('tabutils') ||
    errorMessage.includes('contextmenu') ||
    errorMessage.includes('download.js')
  );

  if (isExtensionError) {
    console.warn('Browser extension promise rejection ignored:', errorMessage);
    event.preventDefault();
    return false;
  }
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>,
)