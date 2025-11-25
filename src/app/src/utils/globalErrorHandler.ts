import posthog from 'posthog-js';
import { createErrorData, type ErrorData } from './errorHandler';

/**
 * Configuration for global error handlers
 */
interface GlobalErrorConfig {
  /** Enable PostHog error reporting (default: true in production) */
  enablePostHog?: boolean;
  /** Enable console logging (default: true) */
  enableConsoleLogging?: boolean;
  /** Custom error reporter callback */
  onError?: (errorData: ErrorData, type: ErrorType) => void;
}

type ErrorType = 'uncaught' | 'unhandledRejection' | 'react';

let isInitialized = false;
let config: GlobalErrorConfig = {};

/**
 * Reports an error to PostHog if available and enabled
 */
function reportToPostHog(errorData: ErrorData, type: ErrorType): void {
  // Check if PostHog is available and initialized
  // PostHog may not be initialized yet or telemetry may be disabled
  try {
    const posthogInstance = posthog;
    if (posthogInstance && typeof posthogInstance.capture === 'function') {
      posthogInstance.capture('frontend_error', {
        error_type: type,
        error_name: errorData.name,
        error_message: errorData.message,
        error_stack: errorData.stack,
        error_context: errorData.context,
        page_url: errorData.url,
        user_agent: errorData.userAgent,
        timestamp: errorData.timestamp,
      });
    }
  } catch {
    // Silently fail if PostHog is not available
  }
}

/**
 * Get the appropriate log prefix for an error type
 */
function getErrorPrefix(type: ErrorType): string {
  switch (type) {
    case 'uncaught':
      return '[Uncaught Error]';
    case 'unhandledRejection':
      return '[Unhandled Rejection]';
    case 'react':
      return '[React Error]';
    default:
      return '[Error]';
  }
}

/**
 * Central error reporter that handles all error types
 */
export function reportError(errorData: ErrorData, type: ErrorType): void {
  // Console logging
  if (config.enableConsoleLogging !== false) {
    const prefix = getErrorPrefix(type);
    console.error(`${prefix}`, {
      message: errorData.message,
      name: errorData.name,
      context: errorData.context,
      stack: errorData.stack,
    });
  }

  // PostHog reporting (disabled in development by default)
  const enablePostHog = config.enablePostHog ?? !import.meta.env.DEV;
  if (enablePostHog) {
    reportToPostHog(errorData, type);
  }

  // Custom error handler
  if (config.onError) {
    try {
      config.onError(errorData, type);
    } catch {
      // Prevent error handler from throwing
    }
  }
}

/**
 * Report a React error (called from ErrorBoundary)
 */
export function reportReactError(
  error: Error,
  componentStack: string | null | undefined,
  componentName?: string,
): void {
  const errorData = createErrorData(error, componentName);
  // Append component stack to the error stack if available
  if (componentStack) {
    errorData.stack = `${errorData.stack || ''}\n\nComponent Stack:${componentStack}`;
  }
  reportError(errorData, 'react');
}

/**
 * Global error handler for uncaught JavaScript errors
 */
function handleGlobalError(
  event: ErrorEvent | string,
  source?: string,
  lineno?: number,
  colno?: number,
  error?: Error,
): boolean {
  // Handle both ErrorEvent and legacy parameters
  let actualError: Error;
  let actualSource: string | undefined;

  if (event instanceof ErrorEvent) {
    actualError = event.error || new Error(event.message);
    actualSource = event.filename;
  } else {
    actualError = error || new Error(String(event));
    actualSource = source;
  }

  const errorData = createErrorData(actualError, actualSource);

  // Add line/column info if available
  if (lineno !== undefined || colno !== undefined) {
    errorData.context = `${errorData.context || ''} at ${lineno}:${colno}`.trim();
  }

  reportError(errorData, 'uncaught');

  // Return false to allow default browser error handling
  return false;
}

/**
 * Global handler for unhandled promise rejections
 */
function handleUnhandledRejection(event: PromiseRejectionEvent): void {
  const error =
    event.reason instanceof Error ? event.reason : new Error(String(event.reason || 'Unknown rejection'));

  const errorData = createErrorData(error, 'Promise rejection');
  reportError(errorData, 'unhandledRejection');
}

/**
 * Initialize global error handlers.
 * Should be called once at application startup (in main.tsx).
 *
 * @example
 * ```tsx
 * // main.tsx
 * import { initializeGlobalErrorHandlers } from '@app/utils/globalErrorHandler';
 *
 * initializeGlobalErrorHandlers();
 *
 * createRoot(document.getElementById('root')!).render(
 *   <StrictMode>
 *     <App />
 *   </StrictMode>
 * );
 * ```
 */
export function initializeGlobalErrorHandlers(customConfig: GlobalErrorConfig = {}): void {
  if (isInitialized) {
    console.warn('[GlobalErrorHandler] Already initialized, skipping');
    return;
  }

  config = customConfig;

  // Only run in browser environment
  if (typeof window === 'undefined') {
    return;
  }

  // Set up global error handler
  window.onerror = handleGlobalError;

  // Set up unhandled promise rejection handler
  window.onunhandledrejection = handleUnhandledRejection;

  isInitialized = true;

  if (import.meta.env.DEV) {
    console.debug('[GlobalErrorHandler] Initialized');
  }
}

/**
 * Clean up global error handlers (useful for testing)
 */
export function cleanupGlobalErrorHandlers(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.onerror = null;
  window.onunhandledrejection = null;
  isInitialized = false;
  config = {};
}

/**
 * Check if global error handlers are initialized
 */
export function isGlobalErrorHandlerInitialized(): boolean {
  return isInitialized;
}
