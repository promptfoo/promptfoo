import * as path from 'path';

export function getDirectory() {
  return '/test/dir';
}

// Mock to handle test scenarios for the transform tests
export async function importModule(filePath: string, functionName?: string) {
  // Special handling for jest.doMock dynamic modules in transform.test.ts
  if (filePath.includes('transform.js')) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(path.resolve(filePath));
    } catch (error) {
      // This is normal in tests when the file doesn't exist but is mocked
      // Return a mock object that the test is expecting
      if (filePath.includes(':namedFunction')) {
        return {
          namedFunction: (output: string) => output.toUpperCase() + ' NAMED',
        };
      } else if (functionName === 'namedFunction') {
        return {
          namedFunction: (output: string) => output.toUpperCase() + ' NAMED',
        };
      } else {
        // Default mock
        return (output: string) => output.toUpperCase();
      }
    }
  }

  try {
    // For other file imports
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(path.resolve(filePath));
  } catch (error) {
    // Return a default mock
    return {};
  }
}

export function createCompatRequire() {
  return require;
}
