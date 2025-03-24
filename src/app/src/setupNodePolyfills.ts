// Simple setup file for testing
// The main polyfills will be handled by vite-plugin-node-polyfills

// Make sure global is available in tests
if (typeof globalThis !== 'undefined' && typeof globalThis.global === 'undefined') {
  globalThis.global = globalThis;
}

export {};
