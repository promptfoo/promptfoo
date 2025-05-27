import { cleanup } from '@testing-library/react';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as matchers from '@testing-library/jest-dom/matchers';
import { expect, beforeAll, afterEach } from 'vitest';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test case
afterEach(() => {
  cleanup();
});

// Ensure React is available globally for tests
beforeAll(() => {
  // Ensure DOM is properly set up for React 19
  if (typeof document === 'undefined') {
    throw new Error(
      'DOM environment not properly initialized. Make sure vitest is configured with environment: "jsdom"',
    );
  }

  // Make sure React is available in the global scope for testing
  if (typeof globalThis.React === 'undefined') {
    globalThis.React = React;
    globalThis.ReactDOM = ReactDOM;
  }

  // Ensure document and window are available globally
  if (typeof globalThis.document === 'undefined') {
    globalThis.document = document;
  }
  if (typeof globalThis.window === 'undefined') {
    globalThis.window = window;
  }

  // Suppress React Router future flag warnings in tests
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('React Router Future Flag Warning') ||
        args[0].includes('React Router will begin wrapping state updates'))
    ) {
      return;
    }
    originalWarn.call(console, ...args);
  };

  // Suppress React 19 act() warnings and HTML nesting warnings in tests
  const originalError = console.error;
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('act(...)') ||
        args[0].includes(
          'When testing, code that causes React state updates should be wrapped into act',
        ) ||
        args[0].includes('The current testing environment is not configured to support act') ||
        args[0].includes('In HTML,') ||
        args[0].includes('cannot be a descendant of') ||
        args[0].includes('cannot be a child of') ||
        args[0].includes('This will cause a hydration error') ||
        args[0].includes('A props object containing a "key" prop is being spread into JSX') ||
        args[0].includes('cannot contain a nested') ||
        args[0].includes('See this log for the ancestor stack trace'))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

// We can mock the environment variables. For example:
// process.env.PROMPTFOO_VERSION = '1.0.0';
