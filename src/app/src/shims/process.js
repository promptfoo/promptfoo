// Mock process implementation
const processImpl = {
  env: {},
  nextTick: function(fn) {
    setTimeout(fn, 0);
  },
  browser: true,
  version: '',
  release: {
    name: 'browser'
  },
  platform: 'browser',
  cwd: function() {
    return '/';
  }
};

export default processImpl;

// Also expose on globalThis for any code expecting it globally
if (typeof globalThis !== 'undefined' && !globalThis.process) {
  globalThis.process = processImpl;
} 