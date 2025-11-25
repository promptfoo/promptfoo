import * as path from 'path';

export function getDirectory() {
  return '/test/dir';
}

// Export as jest.fn() so tests can mock it, with default implementation
// The function is async (returns Promise) to match the real importModule signature
export const importModule = jest.fn((filePath: string, functionName?: string) => {
  const mod = require(path.resolve(filePath));
  if (functionName) {
    return Promise.resolve(mod[functionName]);
  }
  return Promise.resolve(mod);
});
