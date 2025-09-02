import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import { expect, afterEach, vi } from 'vitest';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test case
afterEach(() => {
  cleanup();
});

// Ensure Prism is initialized before any language components are loaded
import 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-http';

// We can mock the environment variables. For example:
// process.env.PROMPTFOO_VERSION = '1.0.0';

// Mock window.matchMedia if not available
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock all CSS imports before any modules are loaded
vi.mock('*.css', () => ({}));
vi.mock('*.scss', () => ({}));

// Mock specific MUI data grid CSS imports
const cssPaths = [
  '@mui/x-data-grid/esm/index.css',
  '@mui/x-data-grid/index.css',
  '@mui/x-data-grid/style.css',
  '@mui/x-data-grid/dist/index.css',
  '@mui/x-data-grid/dist/style.css',
];

cssPaths.forEach((path) => {
  vi.doMock(path, () => ({}));
});

// Mock CSS.supports for MUI components
Object.defineProperty(window, 'CSS', {
  value: {
    supports: () => true,
  },
});
