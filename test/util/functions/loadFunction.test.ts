import * as path from 'path';
import { importModule } from '../../../src/esm';
import { runPython } from '../../../src/python/pythonUtils';
import {
  loadFunction,
  parseFileUrl,
  functionCache,
} from '../../../src/util/functions/loadFunction';

jest.mock('../../../src/esm', () => ({
  importModule: jest.fn(),
  __esModule: true,
}));

jest.mock('../../../src/python/pythonUtils', () => ({
  runPython: jest.fn(),
}));

jest.mock('path', () => ({
  ...jest.requireActual('path'),
  resolve: jest.fn(),
}));

jest.mock('../../../src/cliState', () => ({
  basePath: '/base/path',
}));

describe('loadFunction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear the function cache
    Object.keys(functionCache).forEach((key) => delete functionCache[key]);
  });

  describe('JavaScript functions', () => {
    it('should load a JavaScript function with explicit function name', async () => {
      const mockFn = jest.fn();
      jest.mocked(path.resolve).mockReturnValue('/path/to/function.js');
      jest.mocked(importModule).mockResolvedValue(mockFn);

      const result = await loadFunction({
        filePath: '/path/to/function.js',
        functionName: 'customFunction',
      });

      expect(importModule).toHaveBeenCalledWith('/path/to/function.js', 'customFunction');
      expect(result).toBe(mockFn);
    });

    it('should load a JavaScript function with default export', async () => {
      const mockFn = jest.fn();
      jest.mocked(path.resolve).mockReturnValue('/path/to/function.js');
      jest.mocked(importModule).mockResolvedValue(mockFn);

      const result = await loadFunction({
        filePath: '/path/to/function.js',
      });

      expect(importModule).toHaveBeenCalledWith('/path/to/function.js', undefined);
      expect(result).toBe(mockFn);
    });

    it('should load a JavaScript function from default.default export', async () => {
      const mockFn = jest.fn();
      jest.mocked(path.resolve).mockReturnValue('/path/to/function.js');
      jest.mocked(importModule).mockResolvedValue({ default: { default: mockFn } });

      const result = await loadFunction({
        filePath: '/path/to/function.js',
      });

      expect(importModule).toHaveBeenCalledWith('/path/to/function.js', undefined);
      expect(result).toBe(mockFn);
    });

    it('should throw error if JavaScript file does not export a function', async () => {
      jest.mocked(path.resolve).mockReturnValue('/path/to/function.js');
      jest.mocked(importModule).mockResolvedValue({ notAFunction: 'string' });

      await expect(
        loadFunction({
          filePath: '/path/to/function.js',
          functionName: 'customFunction',
        }),
      ).rejects.toThrow('JavaScript file must export a "customFunction" function');
    });

    it('should use function cache when enabled', async () => {
      const mockFn = jest.fn();
      const cacheKey = '/path/to/function.js';
      jest.mocked(path.resolve).mockReturnValue(cacheKey);
      jest.mocked(importModule).mockResolvedValue(mockFn);

      // First call
      const result1 = await loadFunction({
        filePath: cacheKey,
        useCache: true,
      });

      // Second call - should use cache
      const result2 = await loadFunction({
        filePath: cacheKey,
        useCache: true,
      });

      expect(importModule).toHaveBeenCalledTimes(1);
      expect(result1).toBe(result2);
      expect(result1).toBe(mockFn);
    });

    it('should not use cache when disabled', async () => {
      const mockFn1 = jest.fn();
      const mockFn2 = jest.fn();
      jest.mocked(path.resolve).mockReturnValue('/path/to/function.js');
      jest.mocked(importModule).mockResolvedValueOnce(mockFn1).mockResolvedValueOnce(mockFn2);

      // First call
      const result1 = await loadFunction({
        filePath: '/path/to/function.js',
        useCache: false,
      });

      // Second call
      const result2 = await loadFunction({
        filePath: '/path/to/function.js',
        useCache: false,
      });

      expect(importModule).toHaveBeenCalledTimes(2);
      expect(result1).not.toBe(result2);
    });
  });

  describe('Python functions', () => {
    it('should load a Python function with explicit function name', async () => {
      jest.mocked(path.resolve).mockReturnValue('/path/to/function.py');
      const mockPythonResult = jest.fn();
      jest.mocked(runPython).mockImplementation((...args) => mockPythonResult(...args));

      const result = await loadFunction({
        filePath: '/path/to/function.py',
        functionName: 'custom_function',
      });

      expect(typeof result).toBe('function');
      await result('test input');
      expect(runPython).toHaveBeenCalledWith('/path/to/function.py', 'custom_function', [
        'test input',
      ]);
    });

    it('should use default function name for Python when none specified', async () => {
      jest.mocked(path.resolve).mockReturnValue('/path/to/function.py');
      const mockPythonResult = jest.fn();
      jest.mocked(runPython).mockImplementation((...args) => mockPythonResult(...args));

      const result = await loadFunction({
        filePath: '/path/to/function.py',
      });

      expect(typeof result).toBe('function');
      await result('test input');
      expect(runPython).toHaveBeenCalledWith('/path/to/function.py', 'func', ['test input']);
    });
  });

  describe('Error handling', () => {
    it('should throw error for unsupported file types', async () => {
      jest.mocked(path.resolve).mockReturnValue('/path/to/function.txt');

      await expect(
        loadFunction({
          filePath: '/path/to/function.txt',
        }),
      ).rejects.toThrow(
        'File must be a JavaScript (js, cjs, mjs, ts, cts, mts) or Python (.py) file',
      );
    });

    it('should handle import errors', async () => {
      jest.mocked(path.resolve).mockReturnValue('/path/to/function.js');
      const error = new Error('Import failed');
      jest.mocked(importModule).mockRejectedValue(error);

      await expect(
        loadFunction({
          filePath: '/path/to/function.js',
        }),
      ).rejects.toThrow('Import failed');
    });
  });
});

describe('parseFileUrl', () => {
  it('should parse file URL with function name', () => {
    const result = parseFileUrl('file:///path/to/file.js:functionName');
    expect(result).toEqual({
      filePath: '/path/to/file.js',
      functionName: 'functionName',
    });
  });

  it('should parse file URL without function name', () => {
    const result = parseFileUrl('file:///path/to/file.js');
    expect(result).toEqual({
      filePath: '/path/to/file.js',
    });
  });

  it('should throw error for invalid file URL', () => {
    expect(() => parseFileUrl('/path/to/file.js')).toThrow('URL must start with file://');
  });

  it('should handle Windows-style paths', () => {
    const result = parseFileUrl('file://C:/path/to/file.js:functionName');
    expect(result).toEqual({
      filePath: 'C:/path/to/file.js',
      functionName: 'functionName',
    });
  });

  it('should handle relative paths', () => {
    const result = parseFileUrl('file://./path/to/file.js:functionName');
    expect(result).toEqual({
      filePath: './path/to/file.js',
      functionName: 'functionName',
    });
  });
});
