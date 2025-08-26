import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Global error handlers
window.addEventListener('error', (event) => {
  console.error('[Global Error Handler] Runtime error:', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error?.stack,
    timestamp: new Date().toISOString()
  });
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Global Error Handler] Unhandled promise rejection:', {
    reason: event.reason,
    stack: event.reason?.stack,
    timestamp: new Date().toISOString()
  });
});

// TypeScript strict mode warnings
if (process.env.NODE_ENV === 'development') {
  const originalConsoleError = console.error;
  console.error = (...args) => {
    // Log TypeScript errors with more context
    if (args[0] && typeof args[0] === 'string' && args[0].includes('TypeError')) {
      console.group('🔍 TypeScript/Runtime Error Details');
      originalConsoleError(...args);
      console.trace('Stack trace:');
      console.groupEnd();
    } else {
      originalConsoleError(...args);
    }
  };
}

createRoot(document.getElementById("root")!).render(<App />);
