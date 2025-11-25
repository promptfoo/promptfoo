import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupGlobalErrorHandlers,
  initializeGlobalErrorHandlers,
  isGlobalErrorHandlerInitialized,
  reportError,
  reportReactError,
} from './globalErrorHandler';
import type { ErrorData } from './errorHandler';

// Mock posthog
vi.mock('posthog-js', () => ({
  default: {
    capture: vi.fn(),
  },
}));

describe('globalErrorHandler', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;
  let originalOnerror: typeof window.onerror;
  let originalOnunhandledrejection: typeof window.onunhandledrejection;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    // Save original handlers
    originalOnerror = window.onerror;
    originalOnunhandledrejection = window.onunhandledrejection;

    // Clean up before each test
    cleanupGlobalErrorHandlers();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleDebugSpy.mockRestore();

    // Restore original handlers
    window.onerror = originalOnerror;
    window.onunhandledrejection = originalOnunhandledrejection;

    cleanupGlobalErrorHandlers();
  });

  describe('initializeGlobalErrorHandlers', () => {
    it('should set up window.onerror handler', () => {
      expect(window.onerror).toBeNull();

      initializeGlobalErrorHandlers();

      expect(window.onerror).toBeDefined();
      expect(typeof window.onerror).toBe('function');
    });

    it('should set up window.onunhandledrejection handler', () => {
      expect(window.onunhandledrejection).toBeNull();

      initializeGlobalErrorHandlers();

      expect(window.onunhandledrejection).toBeDefined();
      expect(typeof window.onunhandledrejection).toBe('function');
    });

    it('should only initialize once', () => {
      initializeGlobalErrorHandlers();
      initializeGlobalErrorHandlers();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[GlobalErrorHandler] Already initialized, skipping',
      );
    });

    it('should update isInitialized status', () => {
      expect(isGlobalErrorHandlerInitialized()).toBe(false);

      initializeGlobalErrorHandlers();

      expect(isGlobalErrorHandlerInitialized()).toBe(true);
    });
  });

  describe('cleanupGlobalErrorHandlers', () => {
    it('should remove window.onerror handler', () => {
      initializeGlobalErrorHandlers();
      expect(window.onerror).toBeDefined();

      cleanupGlobalErrorHandlers();

      expect(window.onerror).toBeNull();
    });

    it('should remove window.onunhandledrejection handler', () => {
      initializeGlobalErrorHandlers();
      expect(window.onunhandledrejection).toBeDefined();

      cleanupGlobalErrorHandlers();

      expect(window.onunhandledrejection).toBeNull();
    });

    it('should reset isInitialized status', () => {
      initializeGlobalErrorHandlers();
      expect(isGlobalErrorHandlerInitialized()).toBe(true);

      cleanupGlobalErrorHandlers();

      expect(isGlobalErrorHandlerInitialized()).toBe(false);
    });
  });

  describe('reportError', () => {
    it('should log uncaught errors to console', () => {
      const errorData: ErrorData = {
        message: 'Test error',
        name: 'Error',
        stack: 'Error: Test error\n    at test.js:1:1',
        context: 'TestContext',
        timestamp: Date.now(),
        url: 'http://localhost:3000',
        userAgent: 'test-agent',
      };

      reportError(errorData, 'uncaught');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Uncaught Error]',
        expect.objectContaining({
          message: 'Test error',
          name: 'Error',
        }),
      );
    });

    it('should log unhandled rejections to console', () => {
      const errorData: ErrorData = {
        message: 'Promise rejection',
        name: 'Error',
        timestamp: Date.now(),
        url: 'http://localhost:3000',
        userAgent: 'test-agent',
      };

      reportError(errorData, 'unhandledRejection');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Unhandled Rejection]',
        expect.objectContaining({
          message: 'Promise rejection',
        }),
      );
    });

    it('should call custom onError handler if provided', () => {
      const onError = vi.fn();

      initializeGlobalErrorHandlers({ onError });

      const errorData: ErrorData = {
        message: 'Test error',
        name: 'Error',
        timestamp: Date.now(),
        url: 'http://localhost:3000',
        userAgent: 'test-agent',
      };

      reportError(errorData, 'uncaught');

      expect(onError).toHaveBeenCalledWith(errorData, 'uncaught');
    });
  });

  describe('reportReactError', () => {
    it('should report React errors with component stack', () => {
      const error = new Error('React error');
      const componentStack = '\n    at MyComponent (Component.tsx:10:5)';

      reportReactError(error, componentStack, 'MyComponent');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[React Error]',
        expect.objectContaining({
          message: 'React error',
          context: 'MyComponent',
        }),
      );
    });

    it('should handle null component stack', () => {
      const error = new Error('React error');

      reportReactError(error, null);

      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('global error handler integration', () => {
    it('should catch uncaught errors', () => {
      initializeGlobalErrorHandlers();

      // Simulate uncaught error
      const error = new Error('Uncaught test error');
      window.onerror?.call(window, 'Uncaught test error', 'test.js', 10, 5, error);

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should catch unhandled promise rejections', () => {
      initializeGlobalErrorHandlers();

      // Create a mock PromiseRejectionEvent (not available in jsdom)
      const mockEvent = {
        reason: new Error('Unhandled rejection'),
        promise: Promise.resolve(), // Use resolved to avoid unhandled rejection
      } as PromiseRejectionEvent;

      window.onunhandledrejection?.(mockEvent);

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should handle non-Error rejection reasons', () => {
      initializeGlobalErrorHandlers();

      // Create a mock PromiseRejectionEvent with string reason
      const mockEvent = {
        reason: 'string rejection reason',
        promise: Promise.resolve(),
      } as PromiseRejectionEvent;

      window.onunhandledrejection?.(mockEvent);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Unhandled Rejection]',
        expect.objectContaining({
          message: 'string rejection reason',
        }),
      );
    });
  });
});
