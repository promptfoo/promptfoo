import * as path from 'path';
import logger from '../../src/logger';
import { runPython } from '../../src/python/pythonUtils';
import { transform, TransformInputType } from '../../src/util/transform';

// Declare global variables used in tests
declare global {
  namespace NodeJS {
    interface Global {
      __VARS_TEST__: boolean;
      __NAMED_FUNCTION_TEST__: boolean;
      __THROW_ERROR__: boolean;
      __RETURN_BANANA__: boolean;
      __RETURN_DEFAULT__: boolean;
    }
  }
}

// This will allow us to mock the parseFilePathAndFunctionName function
jest.mock('../../src/util/transform', () => {
  const originalModule = jest.requireActual('../../src/util/transform');
  return {
    ...originalModule,
    // We're exporting the actual functions, but they'll be using our mocked ESM module
  };
});

// Mock the ESM module
jest.mock('../../src/esm', () => {
  const mockImport = async (filePath: string) => {
    // Special case for the vars test
    if (filePath.includes('transform.js') && global.__VARS_TEST__) {
      return (vars: any) => {
        if (typeof vars === 'object' && vars.key) {
          return { ...vars, key: 'transformed' };
        }
        return vars;
      };
    }
    
    // Special case for named function test
    if (global.__NAMED_FUNCTION_TEST__) {
      return {
        namedFunction: (output: string) => output.toUpperCase() + ' NAMED',
      };
    }
    
    // Handle the specific test cases we have
    if (filePath.includes('transform.js')) {
      // For specific test cases with named function
      if (filePath.includes(':namedFunction') || filePath.endsWith('/transform.js:namedFunction')) {
        return {
          namedFunction: (output: string) => output.toUpperCase() + ' NAMED',
        };
      }

      // For specific tests that expect an error
      if (global.__THROW_ERROR__) {
        throw new Error('File not found');
      }

      // Test for banana (not a function)
      if (global.__RETURN_BANANA__) {
        return 'banana';
      }

      // Test for default exports
      if (global.__RETURN_DEFAULT__) {
        return {
          default: (output: string) => output.toUpperCase() + ' DEFAULT',
        };
      }

      // Default case for most tests
      return (output: string) => output.toUpperCase();
    }
    return {};
  };

  return {
    importModule: jest.fn().mockImplementation(mockImport),
    getDirectory: jest.fn().mockReturnValue('/test/dir'),
    createCompatRequire: jest.fn().mockReturnValue(require),
  };
});

jest.mock('../../src/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../src/python/pythonUtils', () => ({
  runPython: jest.fn().mockImplementation(async (filePath, functionName, args) => {
    const [output] = args;
    return output.toUpperCase() + ' FROM PYTHON';
  }),
}));

jest.mock('fs', () => ({
  unlink: jest.fn(),
}));

jest.mock('glob', () => ({
  globSync: jest.fn(),
}));

jest.mock('../../src/database', () => ({
  getDb: jest.fn(),
}));

describe('util', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.__THROW_ERROR__ = false;
    global.__RETURN_BANANA__ = false;
    global.__RETURN_DEFAULT__ = false;
    global.__VARS_TEST__ = false;
    global.__NAMED_FUNCTION_TEST__ = false;
  });

  describe('transform', () => {
    afterEach(() => {
      jest.clearAllMocks();
      jest.resetModules();
      global.__THROW_ERROR__ = false;
      global.__RETURN_BANANA__ = false;
      global.__RETURN_DEFAULT__ = false;
      global.__VARS_TEST__ = false;
      global.__NAMED_FUNCTION_TEST__ = false;
    });

    it('transforms output using a direct function', async () => {
      const output = 'original output';
      const context = { vars: { key: 'value' }, prompt: { id: '123' } };
      const transformFunction = 'output.toUpperCase()';
      const transformedOutput = await transform(transformFunction, output, context);
      expect(transformedOutput).toBe('ORIGINAL OUTPUT');
    });

    it('transforms vars using a direct function', async () => {
      const vars = { key: 'value' };
      const context = { vars: {}, prompt: { id: '123' } };
      const transformFunction = 'JSON.stringify(vars)';
      const transformedOutput = await transform(
        transformFunction,
        vars,
        context,
        true,
        TransformInputType.VARS,
      );
      expect(transformedOutput).toBe('{"key":"value"}');
    });

    it('transforms output using an imported function from a file', async () => {
      const output = 'hello';
      const context = { vars: { key: 'value' }, prompt: { id: '123' } };
      const transformFunctionPath = 'file://transform.js';
      const transformedOutput = await transform(transformFunctionPath, output, context);
      expect(transformedOutput).toBe('HELLO');
    });

    it('transforms vars using a direct function from a file', async () => {
      const vars = { key: 'value' };
      const context = { vars: {}, prompt: {} };
      global.__VARS_TEST__ = true;
      const transformFunctionPath = 'file://transform.js';
      const transformedOutput = await transform(
        transformFunctionPath,
        vars,
        context,
        true,
        TransformInputType.VARS,
      );
      expect(transformedOutput).toEqual({ key: 'transformed' });
    });

    it('throws error if transform function does not return a value', async () => {
      const output = 'test';
      const context = { vars: {}, prompt: {} };
      const transformFunction = ''; // Empty function, returns undefined
      await expect(transform(transformFunction, output, context)).rejects.toThrow(
        'Transform function did not return a value',
      );
    });

    it('throws error if file does not export a function', async () => {
      const output = 'test';
      const context = { vars: {}, prompt: {} };
      global.__RETURN_BANANA__ = true;
      const transformFunctionPath = 'file://transform.js';
      await expect(transform(transformFunctionPath, output, context)).rejects.toThrow(
        'Transform transform.js must export a function, have a default export as a function, or export the specified function "undefined"',
      );
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error loading transform function from file:'),
      );
    });

    it('transforms output using a Python file', async () => {
      const output = 'hello';
      const context = { vars: { key: 'value' }, prompt: { id: '123' } };
      const pythonFilePath = 'file://transform.py';

      const transformedOutput = await transform(pythonFilePath, output, context);
      expect(transformedOutput).toBe('HELLO FROM PYTHON');
    });

    it('throws error for unsupported file format', async () => {
      const output = 'test';
      const context = { vars: {}, prompt: {} };
      const unsupportedFilePath = 'file://transform.txt';

      await expect(transform(unsupportedFilePath, output, context)).rejects.toThrow(
        'Unsupported transform file format: file://transform.txt',
      );
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error loading transform function from file:'),
      );
    });

    it('transforms output using a multi-line function', async () => {
      const output = 'hello';
      const context = { vars: { key: 'value' }, prompt: { id: '123' } };
      const multiLineFunction = `
        const uppercased = output.toUpperCase();
        return uppercased + ' WORLD';
      `;

      const transformedOutput = await transform(multiLineFunction, output, context);
      expect(transformedOutput).toBe('HELLO WORLD');
    });

    it('transforms output using a default export function from a file', async () => {
      const output = 'hello';
      const context = { vars: { key: 'value' }, prompt: { id: '123' } };
      global.__RETURN_DEFAULT__ = true;
      const transformFunctionPath = 'file://transform.js';
      const transformedOutput = await transform(transformFunctionPath, output, context);
      expect(transformedOutput).toBe('HELLO DEFAULT');
    });

    it('transforms output using a named function from a JavaScript file', async () => {
      const output = 'hello';
      const context = { vars: { key: 'value' }, prompt: { id: '123' } };
      // Set a special flag to force the mock to return an object with the namedFunction
      global.__NAMED_FUNCTION_TEST__ = true;
      const transformFunctionPath = 'file://transform.js:namedFunction';
      const transformedOutput = await transform(transformFunctionPath, output, context);
      expect(transformedOutput).toBe('HELLO NAMED');
    });

    it('transforms output using a named function from a Python file', async () => {
      const output = 'hello';
      const context = { vars: { key: 'value' }, prompt: { id: '123' } };
      const pythonFilePath = 'file://transform.py:custom_transform';

      const transformedOutput = await transform(pythonFilePath, output, context);
      expect(transformedOutput).toBe('HELLO FROM PYTHON');
      expect(runPython).toHaveBeenCalledWith(
        expect.stringContaining('transform.py'),
        'custom_transform',
        [output, expect.any(Object)],
      );
    });

    it('falls back to get_transform for Python files when no function name is provided', async () => {
      const output = 'hello';
      const context = { vars: { key: 'value' }, prompt: { id: '123' } };
      const pythonFilePath = 'file://transform.py';

      const transformedOutput = await transform(pythonFilePath, output, context);
      expect(transformedOutput).toBe('HELLO FROM PYTHON');
      expect(runPython).toHaveBeenCalledWith(
        expect.stringContaining('transform.py'),
        'get_transform',
        [output, expect.any(Object)],
      );
    });

    it('does not throw error when validateReturn is false and function returns undefined', async () => {
      const output = 'test';
      const context = { vars: {}, prompt: {} };
      const transformFunction = ''; // Empty function, returns undefined
      const result = await transform(transformFunction, output, context, false);
      expect(result).toBeUndefined();
    });

    it('throws error when validateReturn is true and function returns undefined', async () => {
      const output = 'test';
      const context = { vars: {}, prompt: {} };
      const transformFunction = ''; // Empty function, returns undefined
      await expect(transform(transformFunction, output, context, true)).rejects.toThrow(
        'Transform function did not return a value',
      );
    });

    it('does not throw error when validateReturn is false and function returns null', async () => {
      const output = 'test';
      const context = { vars: {}, prompt: {} };
      const transformFunction = 'null'; // Will be wrapped with "return" automatically
      const result = await transform(transformFunction, output, context, false);
      expect(result).toBeNull();
    });

    it('throws error when validateReturn is true and function returns null', async () => {
      const output = 'test';
      const context = { vars: {}, prompt: {} };
      const transformFunction = 'null'; // Will be wrapped with "return" automatically
      await expect(transform(transformFunction, output, context, true)).rejects.toThrow(
        'Transform function did not return a value',
      );
    });

    it('handles file transform function errors gracefully', async () => {
      const output = 'test';
      const context = { vars: {}, prompt: {} };
      const errorMessage = 'File not found';
      global.__THROW_ERROR__ = true;

      const transformFunctionPath = 'file://transform.js';
      await expect(transform(transformFunctionPath, output, context)).rejects.toThrow(errorMessage);
      expect(logger.error).toHaveBeenCalledWith(
        `Error loading transform function from file: ${errorMessage}`,
      );
    });

    it('handles inline transform function errors gracefully', async () => {
      const output = 'test';
      const context = { vars: {}, prompt: {} };
      const invalidFunction = 'invalid javascript code {';

      await expect(transform(invalidFunction, output, context)).rejects.toThrow(
        'Unexpected identifier',
      );
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error creating inline transform function:'),
      );
    });

    describe('file path handling', () => {
      it('handles absolute paths in transform files', async () => {
        const output = 'hello';
        const context = { vars: { key: 'value' }, prompt: { id: '123' } };
        const transformFunctionPath = 'file://transform.js';
        const transformedOutput = await transform(transformFunctionPath, output, context);
        expect(transformedOutput).toBe('HELLO');
      });

      it('handles file URLs in transform files', async () => {
        const output = 'hello';
        const context = { vars: { key: 'value' }, prompt: { id: '123' } };
        const transformFunctionPath = 'file://transform.js';
        const transformedOutput = await transform(transformFunctionPath, output, context);
        expect(transformedOutput).toBe('HELLO');
      });

      it('handles Python files with absolute paths', async () => {
        const output = 'hello';
        const context = { vars: { key: 'value' }, prompt: { id: '123' } };
        const pythonFilePath = 'file://transform.py';

        const transformedOutput = await transform(pythonFilePath, output, context);
        expect(transformedOutput).toBe('HELLO FROM PYTHON');
        expect(runPython).toHaveBeenCalledWith(
          expect.stringContaining('transform.py'),
          'get_transform',
          [output, expect.any(Object)],
        );
      });

      it('handles complex nested paths', async () => {
        const output = 'hello';
        const context = { vars: { key: 'value' }, prompt: { id: '123' } };
        const transformFunctionPath = 'file://deeply/nested/path/with spaces/transform.js';
        const transformedOutput = await transform(transformFunctionPath, output, context);
        expect(transformedOutput).toBe('HELLO');
      });

      it('handles paths with special characters', async () => {
        const output = 'hello';
        const context = { vars: { key: 'value' }, prompt: { id: '123' } };
        const transformFunctionPath = 'file://path/with-hyphens/and_underscores/transform.js';
        const transformedOutput = await transform(transformFunctionPath, output, context);
        expect(transformedOutput).toBe('HELLO');
      });
    });
  });
});
