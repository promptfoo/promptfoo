import * as path from 'path';

export function getDirectory() {
  return '/test/dir';
}

// Create a mock function that works with both Jest and Vitest
// In Jest tests, jest.fn() is available globally
// In Vitest tests, vi.fn() should be used but this mock may not be loaded
const createMockFn = () => {
  // Vitest compatibility: check for vi first
  if (typeof vi !== 'undefined') {
    return vi.fn((filePath: string, functionName?: string) => {
      const mod = require(path.resolve(filePath));
      if (functionName) {
        return Promise.resolve(mod[functionName]);
      }
      return Promise.resolve(mod);
    });
  }
  // Jest fallback
  if (typeof jest !== 'undefined') {
    return jest.fn((filePath: string, functionName?: string) => {
      const mod = require(path.resolve(filePath));
      if (functionName) {
        return Promise.resolve(mod[functionName]);
      }
      return Promise.resolve(mod);
    });
  }
  // Fallback: return a regular function
  return (filePath: string, functionName?: string) => {
    const mod = require(path.resolve(filePath));
    if (functionName) {
      return Promise.resolve(mod[functionName]);
    }
    return Promise.resolve(mod);
  };
};

// Export as mock function so tests can mock it, with default implementation
// The function is async (returns Promise) to match the real importModule signature
export const importModule = createMockFn();
