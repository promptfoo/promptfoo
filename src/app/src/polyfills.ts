// polyfills.ts
// This file provides browser-compatible polyfills for Node.js built-ins

// Buffer polyfill
if (typeof window !== 'undefined' && !window.Buffer) {
  // Simple Buffer implementation
  (window as any).Buffer = {
    from: (data: string, encoding?: string) => {
      return {
        toString: (encoding?: string) => data,
      };
    },
    isBuffer: () => false,
  };
}

// Global polyfill
if (typeof window !== 'undefined') {
  (window as any).global = window;
}

// Process polyfill
if (typeof window !== 'undefined' && !(window as any).process) {
  (window as any).process = {
    env: {},
    nextTick: (fn: Function) => setTimeout(fn, 0),
    version: '',
    browser: true,
  };
}

export const polyfillsLoaded = true; 