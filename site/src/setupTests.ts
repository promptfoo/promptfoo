import '@testing-library/jest-dom/vitest';

import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect, vi } from 'vitest';

// Extend vitest's expect with jest-dom matchers
expect.extend(matchers);

// Polyfill for JSDOM missing APIs that MUI components need
if (typeof Element !== 'undefined') {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = function () {
      return false;
    };
  }

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

// Mock matchMedia for responsive components
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Global fetch mock - tests can override as needed
vi.stubGlobal(
  'fetch',
  vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: async () => ({}),
      text: async () => '',
      status: 200,
      statusText: 'OK',
    } as Response),
  ),
);

// Suppress expected console errors in tests
const originalConsoleError = console.error;
const SUPPRESSED_ERROR_PATTERNS = [
  /must be used within a.*Provider/,
  /Consider adding an error boundary to your tree/,
];

console.error = (...args: unknown[]) => {
  const errorMessage = args.join(' ');
  const shouldSuppress = SUPPRESSED_ERROR_PATTERNS.some((pattern) => pattern.test(errorMessage));
  if (!shouldSuppress) {
    originalConsoleError(...args);
  }
};

// Global cleanup after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
