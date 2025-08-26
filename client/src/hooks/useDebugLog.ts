
import { useEffect, useRef } from 'react';

interface DebugOptions {
  enabled?: boolean;
  prefix?: string;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export function useDebugLog(componentName: string, options: DebugOptions = {}) {
  const { enabled = process.env.NODE_ENV === 'development', prefix = '[DEBUG]', logLevel = 'info' } = options;
  const renderCount = useRef(0);
  const mountTime = useRef(Date.now());

  useEffect(() => {
    renderCount.current += 1;
    
    if (enabled) {
      console.log(`${prefix} [${componentName}] Render #${renderCount.current} at ${new Date().toISOString()}`);
    }
  });

  const log = (message: string, data?: any) => {
    if (!enabled) return;
    
    const timestamp = new Date().toISOString();
    const runtime = Date.now() - mountTime.current;
    
    console[logLevel](`${prefix} [${componentName}] ${message}`, {
      timestamp,
      runtime: `${runtime}ms`,
      data
    });
  };

  const logError = (error: Error | string, context?: any) => {
    const timestamp = new Date().toISOString();
    const runtime = Date.now() - mountTime.current;
    
    console.error(`${prefix} [${componentName}] ERROR:`, {
      error: typeof error === 'string' ? error : error.message,
      stack: typeof error === 'object' ? error.stack : undefined,
      context,
      timestamp,
      runtime: `${runtime}ms`
    });
  };

  const logWarning = (message: string, data?: any) => {
    if (!enabled) return;
    
    const timestamp = new Date().toISOString();
    console.warn(`${prefix} [${componentName}] WARNING: ${message}`, {
      timestamp,
      data
    });
  };

  return { log, logError, logWarning, renderCount: renderCount.current };
}
