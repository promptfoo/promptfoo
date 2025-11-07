import '@testing-library/jest-dom';
// Ensure Prism is initialized before any language components are loaded
import 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-http';
import { vi } from 'vitest';

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
        json: async () => ({ hasCustomConfig: false }),
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
          hasCustomConfig: false,
          providers: [],
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
