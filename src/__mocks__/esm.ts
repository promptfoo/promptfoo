import * as path from 'path';

import { vi } from 'vitest';

export function getDirectory() {
  return '/test/dir';
}

// Export as mock function so tests can mock it, with default implementation
// The function is async (returns Promise) to match the real importModule signature
export const importModule = vi.fn((filePath: string, functionName?: string) => {
  const mod = require(path.resolve(filePath));
  if (functionName) {
    return Promise.resolve(mod[functionName]);
  }
  return Promise.resolve(mod);
});
