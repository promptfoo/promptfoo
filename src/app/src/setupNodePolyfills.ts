// Mock implementation for the polyfills
// This is used by Vitest during testing

// Mock Buffer
if (!globalThis.Buffer) {
  globalThis.Buffer = {
    from: (data: string, encoding?: string) => {
      return {
        toString: (encoding?: string) => data,
      };
    },
    isBuffer: () => false,
  } as any;
}

// Mock global
if (typeof globalThis.global === 'undefined') {
  globalThis.global = globalThis;
}

// Mock process
if (typeof globalThis.process === 'undefined') {
  globalThis.process = {
    env: {},
    version: '1.0.0',
    nextTick: (fn: Function) => setTimeout(fn, 0),
  } as any;
}

export {};
