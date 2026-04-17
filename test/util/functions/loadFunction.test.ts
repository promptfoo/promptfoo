import { beforeEach, describe, expect, it, vi } from 'vitest';
import { importModule } from '../../../src/esm';
import { runPython } from '../../../src/python/pythonUtils';
import {
  functionCache,
  loadFunction,
  parseFileUrl,
} from '../../../src/util/functions/loadFunction';

vi.mock('../../../src/esm', () => ({
  importModule: vi.fn(),
}));

vi.mock('../../../src/python/pythonUtils', () => ({
  runPython: vi.fn(),
}));

// Use hoisted mock values that work on all platforms
const { TEST_JS_PATH, TEST_PY_PATH, mockResolve } = vi.hoisted(() => {
  const TEST_JS_PATH = '/test/resolved/function.js';
  const TEST_PY_PATH = '/test/resolved/function.py';
  const TEST_TXT_PATH = '/test/resolved/function.txt';
  const mockResolve = vi.fn((...args: string[]) => {
    const lastArg = args[args.length - 1] || '';
    if (lastArg.endsWith('.py')) {
      return TEST_PY_PATH;
    }
    if (lastArg.endsWith('.txt')) {
      return TEST_TXT_PATH;
    }
    return TEST_JS_PATH;
  });
  return { TEST_JS_PATH, TEST_PY_PATH, mockResolve };
});

vi.mock('path', async () => {
  const actual = await vi.importActual<typeof import('path')>('path');
  return {
    ...actual,
    default: {
      ...actual,
      resolve: mockResolve,
    },
    resolve: mockResolve,
  };
});

vi.mock('../../../src/cliState', () => ({
  default: {
    basePath: '/base/path',
  },
}));

describe('loadFunction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear the function cache
    Object.keys(functionCache).forEach((key) => delete functionCache[key]);
  });

  describe('JavaScript functions', () => {
    it('should load a JavaScript function with explicit function name', async () => {
      const mockFn = vi.fn();
      vi.mocked(importModule).mockResolvedValue(mockFn);

      const result = await loadFunction({
        filePath: 'function.js',
        functionName: 'customFunction',
      });

      expect(importModule).toHaveBeenCalledWith(TEST_JS_PATH, 'customFunction');
      expect(result).toBe(mockFn);
    });

    it('should load a JavaScript function with default export', async () => {
      const mockFn = vi.fn();
      vi.mocked(importModule).mockResolvedValue(mockFn);

      const result = await loadFunction({
        filePath: 'function.js',
      });

      expect(importModule).toHaveBeenCalledWith(TEST_JS_PATH, undefined);
      expect(result).toBe(mockFn);
    });

    it('should load a JavaScript function from default.default export', async () => {
      const mockFn = vi.fn();
      vi.mocked(importModule).mockResolvedValue({ default: { default: mockFn } });

      const result = await loadFunction({
        filePath: 'function.js',
      });

      expect(importModule).toHaveBeenCalledWith(TEST_JS_PATH, undefined);
      expect(result).toBe(mockFn);
    });

    it('should throw error if JavaScript file does not export a function', async () => {
      vi.mocked(importModule).mockResolvedValue({ notAFunction: 'string' });

      await expect(
        loadFunction({
          filePath: 'function.js',
          functionName: 'customFunction',
        }),
      ).rejects.toThrow('JavaScript file must export a "customFunction" function');
    });

    it('should use function cache when enabled', async () => {
      const mockFn = vi.fn();
      vi.mocked(importModule).mockResolvedValue(mockFn);

      // First call
      const result1 = await loadFunction({
        filePath: 'function.js',
        useCache: true,
      });

      // Second call - should use cache
      const result2 = await loadFunction({
        filePath: 'function.js',
        useCache: true,
      });

      expect(importModule).toHaveBeenCalledTimes(1);
      expect(result1).toBe(result2);
      expect(result1).toBe(mockFn);
    });

    it('should not use cache when disabled', async () => {
      const mockFn1 = vi.fn();
      const mockFn2 = vi.fn();
      vi.mocked(importModule).mockResolvedValueOnce(mockFn1).mockResolvedValueOnce(mockFn2);

      // First call
      const result1 = await loadFunction({
        filePath: 'function.js',
        useCache: false,
      });

      // Second call
      const result2 = await loadFunction({
        filePath: 'function.js',
        useCache: false,
      });

      expect(importModule).toHaveBeenCalledTimes(2);
      expect(result1).not.toBe(result2);
    });
  });

  describe('Python functions', () => {
    it('should load a Python function with explicit function name', async () => {
      const mockPythonResult = vi.fn();
      vi.mocked(runPython).mockImplementation((...args) => mockPythonResult(...args));

      const result = await loadFunction({
        filePath: 'function.py',
        functionName: 'custom_function',
      });

      expect(typeof result).toBe('function');
      await result('test input');
      expect(runPython).toHaveBeenCalledWith(TEST_PY_PATH, 'custom_function', ['test input']);
    });

    it('should use default function name for Python when none specified', async () => {
      const mockPythonResult = vi.fn();
      vi.mocked(runPython).mockImplementation((...args) => mockPythonResult(...args));

      const result = await loadFunction({
        filePath: 'function.py',
      });

      expect(typeof result).toBe('function');
      await result('test input');
      expect(runPython).toHaveBeenCalledWith(TEST_PY_PATH, 'func', ['test input']);
    });
  });

  describe('Error handling', () => {
    it('should throw error for unsupported file types', async () => {
      await expect(
        loadFunction({
          filePath: 'function.txt',
        }),
      ).rejects.toThrow(
        'File must be a JavaScript (js, cjs, mjs, ts, cts, mts) or Python (.py) file',
      );
    });

    it('should handle import errors', async () => {
      const error = new Error('Import failed');
      vi.mocked(importModule).mockRejectedValue(error);

      await expect(
        loadFunction({
          filePath: 'function.js',
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
