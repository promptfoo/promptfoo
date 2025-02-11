import * as path from 'path';
import logger from '../../src/logger';
import { runPython } from '../../src/python/pythonUtils';
import { transform, TransformInputType } from '../../src/util/transform';

jest.mock('../../src/esm');
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
  });

  describe('transform', () => {
    afterEach(() => {
      jest.clearAllMocks();
      jest.resetModules();
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
      jest.doMock(path.resolve('transform.js'), () => (output: string) => output.toUpperCase(), {
        virtual: true,
      });
      const transformFunctionPath = 'file://transform.js';
      const transformedOutput = await transform(transformFunctionPath, output, context);
      expect(transformedOutput).toBe('HELLO');
    });

    it('transforms vars using a direct function from a file', async () => {
      const vars = { key: 'value' };
      const context = { vars: {}, prompt: {} };
      jest.doMock(
        path.resolve('transform.js'),
        () => (vars: any) => ({ ...vars, key: 'transformed' }),
        {
          virtual: true,
        },
      );
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
      jest.doMock(path.resolve('transform.js'), () => 'banana', { virtual: true });
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
      jest.doMock(
        path.resolve('transform.js'),
        () => ({
          default: (output: string) => output.toUpperCase() + ' DEFAULT',
        }),
        { virtual: true },
      );

      const transformFunctionPath = 'file://transform.js';
      const transformedOutput = await transform(transformFunctionPath, output, context);
      expect(transformedOutput).toBe('HELLO DEFAULT');
    });

    it('transforms output using a named function from a JavaScript file', async () => {
      const output = 'hello';
      const context = { vars: { key: 'value' }, prompt: { id: '123' } };
      jest.doMock(
        path.resolve('transform.js'),
        () => ({
          namedFunction: (output: string) => output.toUpperCase() + ' NAMED',
        }),
        { virtual: true },
      );

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

    it('handles file transform function errors gracefully', async () => {
      const output = 'test';
      const context = { vars: {}, prompt: {} };
      const errorMessage = 'File not found';

      jest.doMock(
        path.resolve('transform.js'),
        () => {
          throw new Error(errorMessage);
        },
        { virtual: true },
      );

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
      // Helper to create mock absolute paths that work cross-platform
      const getMockAbsolutePath = (...parts: string[]) => {
        return process.platform === 'win32' ? path.join('C:', ...parts) : path.join('/', ...parts);
      };

      it('handles absolute paths in transform files', async () => {
        const output = 'hello';
        const context = { vars: { key: 'value' }, prompt: { id: '123' } };
        const absolutePath = getMockAbsolutePath('absolute', 'path', 'transform.js');

        jest.doMock(absolutePath, () => (output: string) => output.toUpperCase(), {
          virtual: true,
        });

        const transformFunctionPath = `file://${absolutePath}`;
        const transformedOutput = await transform(transformFunctionPath, output, context);
        expect(transformedOutput).toBe('HELLO');
      });

      it('handles file URLs in transform files', async () => {
        const output = 'hello';
        const context = { vars: { key: 'value' }, prompt: { id: '123' } };
        const absolutePath = getMockAbsolutePath('absolute', 'path', 'transform.js');
        const fileUrl = `file://${absolutePath}`;

        jest.doMock(absolutePath, () => (output: string) => output.toUpperCase(), {
          virtual: true,
        });

        const transformedOutput = await transform(fileUrl, output, context);
        expect(transformedOutput).toBe('HELLO');
      });

      it('resolves relative paths against cliState.basePath', async () => {
        const output = 'hello';
        const context = { vars: { key: 'value' }, prompt: { id: '123' } };
        const basePath = getMockAbsolutePath('test', 'fixtures'); // Use our mock path helper
        const relativePath = 'transform.js';
        const expectedPath = path.join(basePath, relativePath);

        // Mock cliState before other operations
        jest.mock('../../src/cliState', () => ({
          __esModule: true,
          default: {
            basePath,
          },
        }));

        // Clear module cache to ensure our mock is used
        jest.resetModules();

        // Re-import transform after mocking cliState
        const transform = (await import('../../src/util/transform')).transform;

        // Mock the resolved path, not the relative path
        jest.doMock(expectedPath, () => (output: string) => output.toUpperCase(), {
          virtual: true,
        });

        const transformFunctionPath = `file://${relativePath}`;
        const transformedOutput = await transform(transformFunctionPath, output, context);
        expect(transformedOutput).toBe('HELLO');
      });

      it('handles Python files with absolute paths', async () => {
        const output = 'hello';
        const context = { vars: { key: 'value' }, prompt: { id: '123' } };
        const absolutePath = getMockAbsolutePath('absolute', 'path', 'transform.py');
        const pythonFilePath = `file://${absolutePath}`;

        const transformedOutput = await transform(pythonFilePath, output, context);
        expect(transformedOutput).toBe('HELLO FROM PYTHON');
        expect(runPython).toHaveBeenCalledWith(absolutePath, 'get_transform', [
          output,
          expect.any(Object),
        ]);
      });
    });
  });
});
