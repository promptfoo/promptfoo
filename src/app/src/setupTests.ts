import '@testing-library/jest-dom/vitest';
// Ensure Prism is initialized before any language components are loaded
import 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-http';

import { webcrypto } from 'node:crypto';

import * as matchers from '@testing-library/jest-dom/matchers';
import { afterEach, expect, vi } from 'vitest';

/**
 * Polyfill crypto.subtle for jsdom environment.
 * jsdom doesn't support SubtleCrypto, but Node.js provides it via webcrypto.
 * This is needed for browser modules that use crypto.subtle.digest().
 */
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    writable: true,
    configurable: true,
  });
}

// Extend vitest's expect with jest-dom matchers
expect.extend(matchers);

import { cleanup } from '@testing-library/react';

// Polyfill for JSDOM missing APIs that Radix UI components need
if (typeof Element !== 'undefined') {
  // hasPointerCapture is used by Radix UI Select and other components
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = function () {
      return false;
    };
  }

  // setPointerCapture and releasePointerCapture
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = function () {
      // noop
    };
  }

  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = function () {
      // noop
    };
  }

  // scrollIntoView is used by some Radix UI components
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function () {
      // noop
    };
  }
}

// ResizeObserver mock
if (typeof global.ResizeObserver === 'undefined') {
  global.ResizeObserver = class ResizeObserver {
    observe() {
      // noop
    }
    unobserve() {
      // noop
    }
    disconnect() {
      // noop
    }
  };
}

// We can mock the environment variables. For example:
// process.env.PROMPTFOO_VERSION = '1.0.0';

// Global fetch mock for all tests
// This provides a default mock that tests can override if needed
vi.stubGlobal(
  'fetch',
  vi.fn((url: string | URL) => {
    // Default responses for common API endpoints
    const urlString = typeof url === 'string' ? url : url.toString();

    if (urlString.includes('/api/providers/config-status') || urlString.includes('config-status')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          data: { hasCustomConfig: false },
        }),
      } as Response);
    }

    if (urlString.includes('/api/user/cloud-config') || urlString.includes('cloud-config')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      } as Response);
    }

    if (urlString.includes('/providers') || urlString.includes('/api/providers')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            hasCustomConfig: false,
            providers: [],
          },
        }),
      } as Response);
    }

    // Default fallback for any other fetch calls
    return Promise.resolve({
      ok: true,
      json: async () => ({}),
      text: async () => '',
      status: 200,
      statusText: 'OK',
    } as Response);
  }),
);

/**
 * Global console.error suppression for known test noise patterns.
 * This filters out expected errors that flood the test output but preserves
 * actual unexpected errors that indicate real problems.
 *
 * Note: Warning suppressions are handled in vite.config.ts at the test runner level.
 */
const originalConsoleError = console.error;

const SUPPRESSED_ERROR_PATTERNS = [
  // Expected parsing/configuration errors from test scenarios
  /Failed to parse prompt as JSON/, // 49 occurrences
  /Invalid JSON configuration:/, // 1 occurrence
  /Error parsing file:/, // 2 occurrences

  // Expected API/network errors from intentional test failures
  /Error fetching cloud config:/, // 39 occurrences
  /Failed to check share domain:/, // 6 occurrences
  /Failed to generate share URL:/, // 1 occurrence
  /Error during target purpose discovery:/, // 2 occurrences
  /Error fetching user email:/, // 3 occurrences
  /Error during logout:/, // 1 occurrence
  /Logout failed/, // 1 occurrence

  // Expected operation errors from intentional test failures
  /Failed to submit test suite/, // 1 occurrence
  /Failed to copy text:/, // 1 occurrence
  /Failed to delete eval:/, // 2 occurrences
  /Failed to fetch datasets:/, // From DatasetsPage test
  /Error loading eval:/, // From Eval component test

  // Expected context provider errors from tests (testing components outside providers)
  /must be used within a.*Provider/, // 8 occurrences (ToastProvider, ShiftKeyProvider, etc.)
  /Uncaught.*must be used within/, // Wrapped version of above

  // Error boundary messages
  /Consider adding an error boundary to your tree/, // React suggestion message
];

console.error = (...args: unknown[]) => {
  const errorMessage = args.join(' ');

  // Check if this error matches any suppressed patterns
  const shouldSuppress = SUPPRESSED_ERROR_PATTERNS.some((pattern) => pattern.test(errorMessage));

  // Only log if not suppressed
  if (!shouldSuppress) {
    originalConsoleError(...args);
  }
};

/**
 * Global cleanup after each test to prevent memory leaks and hanging processes.
 *
 * This ensures:
 * 1. All pending timers (setTimeout, setInterval) are cleared
 * 2. React components are properly unmounted
 * 3. Any fake timer state is reset
 *
 * This prevents tests from hanging due to lingering timers keeping Node's event loop alive.
 */
afterEach(() => {
  // Clean up React Testing Library - unmount all rendered components
  cleanup();

  // Only run pending timers and clear timers if fake timers are active
  // This prevents errors when tests switch between real and fake timers
  try {
    // Check if fake timers are being used by trying to get pending timers
    // vi.isFakeTimers() doesn't exist, so we use a try-catch approach
    vi.runOnlyPendingTimers();
    vi.clearAllTimers();
  } catch {
    // If timers are not mocked (real timers), these calls will throw
    // This is expected - just skip timer cleanup in this case
  }

  // Reset to real timers if any test used fake timers but didn't restore
  // This is safe to call regardless of timer state
  vi.useRealTimers();

  // Clear all mocks to prevent state leakage between tests
  vi.clearAllMocks();
});
