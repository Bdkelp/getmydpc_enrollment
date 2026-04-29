import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { HelmetProvider } from 'react-helmet-async'
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

const container = document.getElementById("root");
if (!container) throw new Error("Root element not found");

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <HelmetProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </HelmetProvider>
  </React.StrictMode>,
)