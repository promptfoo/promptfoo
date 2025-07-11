import type { ToolContent, ToolResponse, ToolResult } from './types';

/**
 * Creates a standardized tool response with proper typing
 */
export function createToolResponse<T = unknown>(
  tool: string,
  success: boolean,
  data?: T,
  error?: string,
): ToolResult<T> {
  const response: ToolResponse<T> = {
    tool,
    success,
    timestamp: new Date().toISOString(),
  };

  if (success && data !== undefined) {
    response.data = data;
  }

  if (!success && error) {
    response.error = error;
  }

  const content: ToolContent = {
    type: 'text',
    text: JSON.stringify(response, null, 2),
  };

  return {
    content: [content],
    isError: !success,
  };
}

/**
 * Creates a promise that rejects after the specified timeout
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMessage)), timeoutMs)),
  ]);
}

/**
 * Safely stringify objects, handling circular references and BigInt
 */
export function safeStringify(
  value: unknown,
  space?: string | number,
  replacer?: (key: string, value: unknown) => unknown,
): string {
  return JSON.stringify(
    value,
    (key, val) => {
      // Handle BigInt
      if (typeof val === 'bigint') {
        return val.toString();
      }
      // Handle functions
      if (typeof val === 'function') {
        return '[Function]';
      }
      // Handle undefined
      if (val === undefined) {
        return '[Undefined]';
      }
      // Apply custom replacer if provided
      return replacer ? replacer(key, val) : val;
    },
    space,
  );
}

/**
 * Type-safe object key checking
 */
export function hasKey<K extends string>(
  obj: Record<string, unknown>,
  key: K,
): obj is Record<K, unknown> {
  return key in obj;
}

/**
 * Type-safe property access with default value
 */
export function getProperty<T>(obj: Record<string, unknown>, key: string, defaultValue: T): T {
  const value = obj[key];
  return value === undefined ? defaultValue : (value as T);
}

/**
 * Validate that a value is not null or undefined
 */
export function assertNotNull<T>(value: T | null | undefined, message?: string): T {
  if (value === null || value === undefined) {
    throw new Error(message || 'Value cannot be null or undefined');
  }
  return value;
}

/**
 * Type-safe array filtering that removes null/undefined values
 */
export function filterNonNull<T>(array: (T | null | undefined)[]): T[] {
  return array.filter((item): item is T => Boolean(item));
}

/**
 * Debounce function for rate limiting
 */
export function debounce<T extends unknown[]>(
  func: (...args: T) => void,
  wait: number,
): (...args: T) => void {
  let timeout: NodeJS.Timeout;
  return (...args: T) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Create a retry function with exponential backoff
 */
export async function retry<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
  } = {},
): Promise<T> {
  const { maxAttempts = 3, baseDelay = 1000, maxDelay = 10000, backoffFactor = 2 } = options;

  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts) {
        throw lastError;
      }

      const delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt - 1), maxDelay);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

/**
 * Format duration in milliseconds to human readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

/**
 * Truncate text to specified length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 3) + '...';
}
