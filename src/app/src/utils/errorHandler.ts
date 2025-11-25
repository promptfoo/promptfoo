import type { AlertColor } from '@mui/material';

/**
 * Standardized error data structure for consistent error reporting
 */
export interface ErrorData {
  message: string;
  name: string;
  stack?: string;
  context?: string;
  timestamp: number;
  url: string;
  userAgent: string;
}

/**
 * Options for error handling behavior
 */
export interface ErrorHandlerOptions {
  /** Function to show toast notification */
  showToast?: (message: string, severity: AlertColor, duration?: number) => void;
  /** Context string for logging (e.g., component or function name) */
  context?: string;
  /** If true, don't show toast notification */
  silent?: boolean;
  /** Duration for toast in milliseconds */
  toastDuration?: number;
}

/**
 * Extracts a user-friendly error message from various error types
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'An unexpected error occurred';
}

/**
 * Creates a standardized error data object for logging/reporting
 */
export function createErrorData(error: unknown, context?: string): ErrorData {
  const message = getErrorMessage(error);
  const name = error instanceof Error ? error.name : 'UnknownError';
  const stack = error instanceof Error ? error.stack : undefined;

  return {
    message,
    name,
    stack,
    context,
    timestamp: Date.now(),
    url: typeof window !== 'undefined' ? window.location.href : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  };
}

/**
 * Central error handler that logs errors and optionally shows toast notifications.
 *
 * @example
 * ```tsx
 * // In a component with toast
 * const { showToast } = useToast();
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   handleError(error, { showToast, context: 'MyComponent.riskyOperation' });
 * }
 *
 * // Silent logging only
 * handleError(error, { context: 'backgroundTask', silent: true });
 * ```
 */
export function handleError(error: unknown, options: ErrorHandlerOptions = {}): void {
  const { showToast, context, silent = false, toastDuration } = options;

  const errorData = createErrorData(error, context);
  const contextPrefix = context ? `[${context}]` : '';

  // Always log to console with full details
  console.error(`${contextPrefix} Error:`, {
    message: errorData.message,
    name: errorData.name,
    stack: errorData.stack,
    url: errorData.url,
  });

  // Show toast notification if provided and not silent
  if (showToast && !silent) {
    showToast(errorData.message, 'error', toastDuration);
  }
}

/**
 * Wraps an async function with standardized error handling.
 * Returns null on error (or the provided fallback value).
 *
 * @example
 * ```tsx
 * const { showToast } = useToast();
 *
 * const data = await tryCatch(
 *   () => fetchData(),
 *   { showToast, context: 'fetchData' }
 * );
 *
 * if (data) {
 *   // Success
 * }
 * ```
 */
export async function tryCatch<T>(
  fn: () => Promise<T>,
  options: ErrorHandlerOptions & { fallback?: T } = {},
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    handleError(error, options);
    return options.fallback ?? null;
  }
}

/**
 * Wraps a sync function with standardized error handling.
 * Returns null on error (or the provided fallback value).
 *
 * @example
 * ```tsx
 * const result = tryCatchSync(
 *   () => JSON.parse(userInput),
 *   { context: 'parseUserInput', silent: true }
 * );
 * ```
 */
export function tryCatchSync<T>(
  fn: () => T,
  options: ErrorHandlerOptions & { fallback?: T } = {},
): T | null {
  try {
    return fn();
  } catch (error) {
    handleError(error, options);
    return options.fallback ?? null;
  }
}

/**
 * Type guard to check if a value is an Error object
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Creates an Error from any thrown value
 */
export function ensureError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  if (typeof value === 'string') {
    return new Error(value);
  }
  return new Error(getErrorMessage(value));
}
