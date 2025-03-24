// polyfills.ts
// This is a lightweight polyfill entry point to ensure Node.js globals are available
// The actual implementation will be handled by vite-plugin-node-polyfills

// Ensure global is defined if not already
if (typeof window !== 'undefined' && typeof window.global === 'undefined') {
  window.global = window;
}

// Let the plugin handle the rest of the polyfills
// This is mostly a marker file to ensure polyfills are loaded early in the application

export const polyfillsLoaded = true; 