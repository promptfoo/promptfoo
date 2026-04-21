import '@app/lib/prism';

import { webcrypto } from 'node:crypto';

import * as matchers from '@testing-library/jest-dom/matchers';
import { afterEach, expect, vi } from 'vitest';
import { restoreBrowserMocks } from './tests/browserMocks';
import { restoreTestTimers } from './tests/timers';

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length() {
    return this.store.size;
  }

  clear() {
    this.store.clear();
  }

  getItem(key: string) {
    return this.store.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
}

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

if (typeof globalThis.localStorage?.clear !== 'function') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    writable: true,
    configurable: true,
  });
}

if (typeof globalThis.sessionStorage?.clear !== 'function') {
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: new MemoryStorage(),
    writable: true,
    configurable: true,
  });
}

// Extend expect manually instead of importing '@testing-library/jest-dom/vitest'
// so matchers bind to the workspace vitest instance (avoids version mismatch).
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

// JSDOM does not implement media playback, but app code legitimately calls it.
// Provide explicit test doubles so unsupported browser gaps do not leak noisy
// "Not implemented" messages into otherwise clean test runs.
if (typeof HTMLMediaElement !== 'undefined') {
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    writable: true,
    value: vi.fn(() => Promise.resolve()),
  });

  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
}

// We can mock the environment variables. For example:
// process.env.PROMPTFOO_VERSION = '1.0.0';

// Global fetch mock for all tests
// This provides default responses for app bootstrap endpoints. Tests should mock
// any other network calls explicitly so missing mocks fail fast.
function getFetchRequestDetails(input: RequestInfo | URL, init?: RequestInit) {
  const urlString =
    typeof input === 'string' || input instanceof URL ? input.toString() : input.url;
  const method = (
    init?.method ??
    (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')
  ).toUpperCase();
  const pathname = new URL(urlString, 'http://localhost').pathname.replace(/\/$/, '');

  return { method, pathname, urlString };
}

vi.stubGlobal(
  'fetch',
  vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const { method, pathname, urlString } = getFetchRequestDetails(input, init);

    if (method === 'GET' && pathname.endsWith('/api/providers/config-status')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          data: { hasCustomConfig: false },
        }),
      } as Response);
    }

    if (method === 'GET' && pathname.endsWith('/api/user/cloud-config')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      } as Response);
    }

    if (method === 'GET' && pathname.endsWith('/api/providers')) {
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

    return Promise.reject(
      new Error(
        `Unhandled ${method} fetch request in frontend test setup: ${urlString}. Mock this request in the test.`,
      ),
    );
  }),
);

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

  let timerCleanupError: unknown;
  try {
    restoreTestTimers({ runPending: true });
  } catch (error) {
    timerCleanupError = error;
  }

  // Restore spies before browser property descriptors. If a spy wraps a
  // mockBrowserProperty value, restoring spies first prevents them from
  // re-applying the mocked value after descriptors are restored.
  vi.restoreAllMocks();
  restoreBrowserMocks();

  // Reset browser storage after restoring any per-test storage replacements.
  globalThis.localStorage?.clear();
  globalThis.sessionStorage?.clear();

  // Clear all mocks to prevent call state leakage between tests.
  vi.clearAllMocks();

  if (timerCleanupError !== undefined) {
    throw timerCleanupError;
  }
});
