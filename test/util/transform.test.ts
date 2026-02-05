import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importModule } from '../../src/esm';
import logger from '../../src/logger';
import { runPython } from '../../src/python/pythonUtils';
import { TransformInputType, transform } from '../../src/util/transform';

vi.mock('../../src/esm', () => ({
  importModule: vi.fn(),
  getDirectory: vi.fn().mockReturnValue('/test/dir'),
}));

vi.mock('../../src/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../src/python/pythonUtils', () => ({
  runPython: vi.fn().mockImplementation(async (_filePath, _functionName, args) => {
    const [output] = args;
    return output.toUpperCase() + ' FROM PYTHON';
  }),
}));

vi.mock('fs', () => ({
  unlink: vi.fn(),
}));

vi.mock('glob', () => ({
  globSync: vi.fn(),
}));

vi.mock('../../src/database', () => ({
  getDb: vi.fn(),
}));

const mockedImportModule = vi.mocked(importModule);

describe('util', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('transform', () => {
    afterEach(() => {
      vi.clearAllMocks();
      vi.resetModules();
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
      mockedImportModule.mockResolvedValueOnce((output: string) => output.toUpperCase());

      const transformFunctionPath = 'file://transform.js';
      const transformedOutput = await transform(transformFunctionPath, output, context);
      expect(transformedOutput).toBe('HELLO');
    });

    it('transforms vars using a direct function from a file', async () => {
      const vars = { key: 'value' };
      const context = { vars: {}, prompt: {} };
      mockedImportModule.mockResolvedValueOnce((vars: any) => ({
        ...vars,
        key: 'transformed',
      }));
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
      mockedImportModule.mockResolvedValueOnce('banana');
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
      mockedImportModule.mockResolvedValueOnce(
        (output: string) => output.toUpperCase() + ' DEFAULT',
      );

      const transformFunctionPath = 'file://transform.js';
      const transformedOutput = await transform(transformFunctionPath, output, context);
      expect(transformedOutput).toBe('HELLO DEFAULT');
    });

    it('transforms output using a named function from a JavaScript file', async () => {
      const output = 'hello';
      const context = { vars: { key: 'value' }, prompt: { id: '123' } };
      // When a function name is specified, importModule returns that specific function
      mockedImportModule.mockResolvedValueOnce((output: string) => output.toUpperCase() + ' NAMED');

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

      mockedImportModule.mockRejectedValueOnce(new Error(errorMessage));

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

    describe('ESM compatibility', () => {
      it('provides process.mainModule.require for backwards compatibility with CommonJS patterns', async () => {
        const output = 'test';
        const context = { vars: {}, prompt: {} };
        // This is the exact pattern users were using before ESM migration
        // const require = process.mainModule.require;
        const transformFunction = `
          const require = process.mainModule.require;
          const path = require('node:path');
          return path.basename('/foo/bar/baz.txt');
        `;
        const result = await transform(transformFunction, output, context);
        expect(result).toBe('baz.txt');
      });

      it('allows direct use of process.mainModule.require without assignment', async () => {
        const output = 'hello';
        const context = { vars: {}, prompt: {} };
        const transformFunction = `
          const fs = process.mainModule.require('node:fs');
          const os = process.mainModule.require('node:os');
          return typeof fs.existsSync === 'function' && typeof os.homedir === 'function' ? output.toUpperCase() : output;
        `;
        const result = await transform(transformFunction, output, context);
        expect(result).toBe('HELLO');
      });

      it('preserves other process properties like process.env', async () => {
        const output = 'test';
        const context = { vars: {}, prompt: {} };
        const transformFunction = `
          // process.env should still work
          return typeof process.env === 'object' ? 'env-works' : 'env-broken';
        `;
        const result = await transform(transformFunction, output, context);
        expect(result).toBe('env-works');
      });
    });

    describe('file path handling', () => {
      it('handles absolute paths in transform files', async () => {
        const output = 'hello';
        const context = { vars: { key: 'value' }, prompt: { id: '123' } };

        mockedImportModule.mockResolvedValueOnce((output: string) => output.toUpperCase());

        const transformFunctionPath = 'file://transform.js';
        const transformedOutput = await transform(transformFunctionPath, output, context);
        expect(transformedOutput).toBe('HELLO');
      });

      it('handles file URLs in transform files', async () => {
        const output = 'hello';
        const context = { vars: { key: 'value' }, prompt: { id: '123' } };

        mockedImportModule.mockResolvedValueOnce((output: string) => output.toUpperCase());

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

        mockedImportModule.mockResolvedValueOnce((output: string) => output.toUpperCase());

        const transformFunctionPath = 'file://deeply/nested/path/with spaces/transform.js';
        const transformedOutput = await transform(transformFunctionPath, output, context);
        expect(transformedOutput).toBe('HELLO');
      });

      it('handles paths with special characters', async () => {
        const output = 'hello';
        const context = { vars: { key: 'value' }, prompt: { id: '123' } };

        mockedImportModule.mockResolvedValueOnce((output: string) => output.toUpperCase());

        const transformFunctionPath = 'file://path/with-hyphens/and_underscores/transform.js';
        const transformedOutput = await transform(transformFunctionPath, output, context);
        expect(transformedOutput).toBe('HELLO');
      });
    });
  });
});
