import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';

import { importModule, getWrapperDir, clearWrapperDirCache } from '../src/esm';
import type { WrapperType } from '../src/esm';
import logger from '../src/logger';

// Use __dirname directly since tests run in CommonJS mode
const testDir = __dirname;

vi.mock('../src/logger', () => ({
  __esModule: true,
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

describe('ESM utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearWrapperDirCache();
  });

  describe('getWrapperDir', () => {
    const testCases: { type: WrapperType; devDir: string; subdir: string }[] = [
      { type: 'python', devDir: 'python', subdir: 'python' },
      { type: 'ruby', devDir: 'ruby', subdir: 'ruby' },
      { type: 'golang', devDir: 'providers', subdir: 'golang' },
    ];

    describe('development paths', () => {
      it.each(testCases)('returns correct path for $type when in development directory', ({
        type,
        devDir,
        subdir,
      }) => {
        const devPath = path.join('/project', 'src', devDir);
        const result = getWrapperDir(type, devPath);

        if (type === 'golang') {
          // Golang files are in src/providers/, but wrapper is in src/golang/
          expect(result).toBe(path.join('/project', 'src', subdir));
        } else {
          // Python/Ruby files are in src/python/ or src/ruby/, wrapper is in same dir
          expect(result).toBe(devPath);
        }
      });
    });

    describe('production paths', () => {
      it.each(testCases)('returns correct path for $type when in production directory', ({
        type,
        subdir,
      }) => {
        const prodPath = path.join('/project', 'dist', 'src');
        const result = getWrapperDir(type, prodPath);

        // In production, all wrappers are in subdirectories of dist/src/
        expect(result).toBe(path.join('/project', 'dist', 'src', subdir));
      });
    });

    it('caches results for subsequent calls', () => {
      const testPath = path.join('/project', 'dist', 'src');

      const result1 = getWrapperDir('python', testPath);
      const result2 = getWrapperDir('python', path.join('/different', 'path')); // Different path, should use cache

      expect(result1).toBe(result2); // Both should return cached value
      expect(result1).toBe(path.join('/project', 'dist', 'src', 'python'));
    });

    it('caches separately for each wrapper type', () => {
      const testPath = path.join('/project', 'dist', 'src');

      const pythonResult = getWrapperDir('python', testPath);
      const rubyResult = getWrapperDir('ruby', testPath);
      const golangResult = getWrapperDir('golang', testPath);

      expect(pythonResult).toBe(path.join('/project', 'dist', 'src', 'python'));
      expect(rubyResult).toBe(path.join('/project', 'dist', 'src', 'ruby'));
      expect(golangResult).toBe(path.join('/project', 'dist', 'src', 'golang'));
    });
  });

  describe('importModule', () => {
    it('imports JavaScript modules', async () => {
      const modulePath = path.resolve(testDir, '__fixtures__/testModule.js');

      const result = await importModule(modulePath);
      // importModule extracts the nested default from CommonJS modules
      expect(result).toEqual({
        testFunction: expect.any(Function),
      });
      expect(result.testFunction()).toBe('js default test result');
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Successfully imported module'),
      );
    });

    it('imports TypeScript modules', async () => {
      const modulePath = path.resolve(testDir, '__fixtures__/testModule.ts');

      const result = await importModule(modulePath);
      expect(result).toEqual({
        testFunction: expect.any(Function),
        defaultProp: 'ts default property',
      });
      expect(result.testFunction()).toBe('ts default test result');
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('TypeScript/ESM module detected'),
      );
    });

    it('imports CommonJS modules', async () => {
      const modulePath = path.resolve(testDir, '__fixtures__/testModule.cjs');

      const result = await importModule(modulePath);
      // importModule extracts the nested default from CommonJS modules
      expect(result).toEqual({
        testFunction: expect.any(Function),
      });
      expect(result.testFunction()).toBe('cjs default test result');
    });

    it('imports ESM modules', async () => {
      const modulePath = path.resolve(testDir, '__fixtures__/testModule.mjs');

      const result = await importModule(modulePath);
      expect(result).toEqual({
        testFunction: expect.any(Function),
        defaultProp: 'esm default property',
      });
      expect(result.testFunction()).toBe('esm default test result');
    });

    it('imports simple modules without nested defaults', async () => {
      const modulePath = path.resolve(testDir, '__fixtures__/testModuleSimple.js');

      const result = await importModule(modulePath);
      expect(result).toEqual(expect.any(Function));
      expect(result()).toBe('simple function result');
    });

    it('returns named function when functionName is specified', async () => {
      const modulePath = path.resolve(testDir, '__fixtures__/testModule.js');

      const result = await importModule(modulePath, 'testFunction');
      expect(result).toEqual(expect.any(Function));
      expect(result()).toBe('js default test result');
      expect(logger.debug).toHaveBeenCalledWith('Returning named export: testFunction');
    });

    it('returns named function from TypeScript module', async () => {
      const modulePath = path.resolve(testDir, '__fixtures__/testModule.ts');

      const result = await importModule(modulePath, 'testFunction');
      expect(result).toEqual(expect.any(Function));
      expect(result()).toBe('ts default test result');
    });

    it('handles absolute paths', async () => {
      const absolutePath = path.resolve(__dirname, '__fixtures__/testModule.js');

      const result = await importModule(absolutePath);
      expect(result).toEqual({
        testFunction: expect.any(Function),
      });
      expect(result.testFunction()).toBe('js default test result');
    });

    it('throws error for non-existent module', async () => {
      const nonExistentPath = path.resolve(__dirname, '__fixtures__/nonExistent.js');

      await expect(importModule(nonExistentPath)).rejects.toThrow();
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('ESM import failed'));
    });

    it('logs debug information during import process', async () => {
      const modulePath = path.resolve(testDir, '__fixtures__/testModule.js');

      await importModule(modulePath);

      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Attempting to import module'),
      );
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Attempting ESM import from'),
      );
    });

    it('imports CommonJS modules via ESM', async () => {
      const modulePath = path.resolve(testDir, '__fixtures__/testModule.cjs');

      const result = await importModule(modulePath);
      expect(result).toEqual({
        testFunction: expect.any(Function),
      });

      // In Vitest's ESM environment, .cjs files are imported successfully via ESM
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Successfully imported module'),
      );
    });

    it('extracts named export from ESM module', async () => {
      const modulePath = path.resolve(testDir, '__fixtures__/testModule.mjs');

      const result = await importModule(modulePath, 'testFunction');
      expect(result).toEqual(expect.any(Function));
      expect(result()).toBe('esm default test result');
    });
  });
});
