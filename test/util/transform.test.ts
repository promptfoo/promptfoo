import * as path from 'path';
import { runPython } from '../../src/python/pythonUtils';
import { transform, TransformInputType } from '../../src/util/transform';

jest.mock('../../src/esm');

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
  });
});
