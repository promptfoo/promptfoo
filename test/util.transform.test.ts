import * as path from 'path';
import { transform } from '../src/util/transform';

jest.mock('../src/esm');

jest.mock('../src/python/pythonUtils', () => ({
  runPython: jest.fn().mockImplementation(async (filePath, functionName, args) => {
    const [output] = args;
    return output.toUpperCase() + ' FROM PYTHON';
  }),
}));

jest.mock('fs', () => ({
  unlink: jest.fn(),
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
        'Transform transform.js must export a function or have a default export as a function',
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
  });
});
