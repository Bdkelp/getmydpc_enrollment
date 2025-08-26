
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Safe property access helpers
export function safeAccess<T>(obj: any, path: string[]): T | undefined {
  try {
    return path.reduce((current, key) => current?.[key], obj);
  } catch {
    return undefined;
  }
}

export function withDefault<T>(value: T | undefined | null, defaultValue: T): T {
  return value ?? defaultValue;
}

// Safe event handler wrapper
export function safeHandler<T extends (...args: any[]) => any>(
  handler: T | undefined | null
): T | (() => void) {
  return handler || (() => {}) as any;
}

export function safeGet<T>(obj: any, path: string, defaultValue?: T): T | undefined {
  try {
    const keys = path.split('.');
    let current = obj;
    
    for (const key of keys) {
      if (current == null || typeof current !== 'object') {
        return defaultValue;
      }
      current = current[key];
    }
    
    return current !== undefined ? current : defaultValue;
  } catch {
    return defaultValue;
  }
}

export function isDefinedAndNotNull<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export function ensureArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (isDefinedAndNotNull(value)) {
    return [value];
  }
  return [];
}

export function debugLog(component: string, message: string, data?: any) {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[${component}] ${message}`, data || '');
  }
}

export function debugError(component: string, error: Error | string, context?: any) {
  console.error(`[${component}] ERROR:`, {
    error: typeof error === 'string' ? error : error.message,
    stack: typeof error === 'object' ? error.stack : undefined,
    context,
    timestamp: new Date().toISOString()
  });
}

// Prevent React DOM nesting warnings
export function preventNestedLinks(event: React.MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
}

// Safe element click handler
export function safeClick(handler?: () => void) {
  return (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (handler) {
      handler();
    }
  };
}
