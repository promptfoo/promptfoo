import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearWrapperDirCache,
  getWrapperDir,
  importModule,
  isCjsInEsmError,
  resolvePackageEntryPoint,
} from '../src/esm';
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
    afterEach(() => {
      clearWrapperDirCache();
    });

    it('returns python wrapper directory', () => {
      const result = getWrapperDir('python');
      expect(result).toContain('python');
      expect(result).toMatch(/python$/);
    });

    it('returns ruby wrapper directory', () => {
      const result = getWrapperDir('ruby');
      expect(result).toContain('ruby');
      expect(result).toMatch(/ruby$/);
    });

    it('returns golang wrapper directory', () => {
      const result = getWrapperDir('golang');
      expect(result).toContain('golang');
      expect(result).toMatch(/golang$/);
    });

    it('caches wrapper directory paths', () => {
      const first = getWrapperDir('python');
      const second = getWrapperDir('python');
      expect(first).toBe(second);
    });

    it('clears cache when clearWrapperDirCache is called', () => {
      const first = getWrapperDir('python');
      clearWrapperDirCache();
      // After clearing, the next call should still return the same path
      // (the path computation is deterministic)
      const second = getWrapperDir('python');
      expect(first).toBe(second);
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

    it('throws ENOENT error for non-existent module (normalized from ERR_MODULE_NOT_FOUND)', async () => {
      const nonExistentPath = path.resolve(__dirname, '__fixtures__/nonExistent.js');

      // importModule normalizes ERR_MODULE_NOT_FOUND to ENOENT for missing files
      const error = await importModule(nonExistentPath).catch((e) => e);
      expect(error).toBeInstanceOf(Error);
      expect((error as NodeJS.ErrnoException).code).toBe('ENOENT');
      expect((error as NodeJS.ErrnoException).path).toBe(nonExistentPath);
      // Should NOT log error for missing files - this is expected during config discovery
      expect(logger.error).not.toHaveBeenCalled();
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

    describe('CJS fallback for .js files', () => {
      it('loads CommonJS .js files via CJS fallback when ESM fails', async () => {
        const modulePath = path.resolve(testDir, '__fixtures__/testModuleCjsFallback.js');

        const result = await importModule(modulePath);
        expect(result).toEqual({
          testValue: 'cjs-fallback-test',
          testFunction: expect.any(Function),
        });
        expect(result.testFunction()).toBe('cjs fallback result');
      });

      it('returns named export via CJS fallback', async () => {
        const modulePath = path.resolve(testDir, '__fixtures__/testModuleCjsFallback.js');

        const result = await importModule(modulePath, 'testFunction');
        expect(result).toEqual(expect.any(Function));
        expect(result()).toBe('cjs fallback result');
      });

      it('returns named value via CJS fallback', async () => {
        const modulePath = path.resolve(testDir, '__fixtures__/testModuleCjsFallback.js');

        const result = await importModule(modulePath, 'testValue');
        expect(result).toBe('cjs-fallback-test');
      });
    });
  });

  describe('isCjsInEsmError', () => {
    it('detects "require is not defined" error', () => {
      expect(isCjsInEsmError('ReferenceError: require is not defined')).toBe(true);
    });

    it('detects "module is not defined" error', () => {
      expect(isCjsInEsmError('ReferenceError: module is not defined in ES module scope')).toBe(
        true,
      );
    });

    it('detects "exports is not defined" error', () => {
      expect(isCjsInEsmError('ReferenceError: exports is not defined')).toBe(true);
    });

    it('detects "__dirname is not defined" error', () => {
      expect(isCjsInEsmError('ReferenceError: __dirname is not defined in ES module scope')).toBe(
        true,
      );
    });

    it('detects "__filename is not defined" error', () => {
      expect(isCjsInEsmError('ReferenceError: __filename is not defined')).toBe(true);
    });

    it('detects ERR_REQUIRE_ESM error', () => {
      expect(isCjsInEsmError('Error [ERR_REQUIRE_ESM]: require() of ES Module not supported')).toBe(
        true,
      );
    });

    it('returns false for unrelated errors', () => {
      expect(isCjsInEsmError('SyntaxError: Unexpected token')).toBe(false);
      expect(isCjsInEsmError('TypeError: Cannot read property')).toBe(false);
      expect(isCjsInEsmError('Module not found')).toBe(false);
    });
  });

  describe('resolvePackageEntryPoint', () => {
    const mockPackagesDir = path.resolve(testDir, '__fixtures__/mock-packages');

    it('resolves ESM-only package with exports field', () => {
      const result = resolvePackageEntryPoint('@test/esm-only-pkg', mockPackagesDir);

      expect(result).toBe(
        path.join(mockPackagesDir, 'node_modules/@test/esm-only-pkg/dist/index.js'),
      );
    });

    it('resolves package with main field', () => {
      const result = resolvePackageEntryPoint('@test/module-field-pkg', mockPackagesDir);

      expect(result).toBe(
        path.join(mockPackagesDir, 'node_modules/@test/module-field-pkg/esm/index.js'),
      );
    });

    it('resolves CommonJS package with main field', () => {
      const result = resolvePackageEntryPoint('@test/cjs-pkg', mockPackagesDir);

      // CommonJS packages are resolved via require.resolve, which returns the main field
      expect(result).toBe(path.join(mockPackagesDir, 'node_modules/@test/cjs-pkg/lib/index.js'));
    });

    it('returns null for non-existent package', () => {
      const result = resolvePackageEntryPoint('@test/non-existent-pkg', mockPackagesDir);

      expect(result).toBeNull();
    });

    it('returns null when base directory does not exist', () => {
      const result = resolvePackageEntryPoint('@test/esm-only-pkg', '/non/existent/dir');

      expect(result).toBeNull();
    });

    it('handles scoped packages correctly', () => {
      // Test that scoped package names (@org/pkg) are split correctly
      const result = resolvePackageEntryPoint('@test/esm-only-pkg', mockPackagesDir);

      expect(result).not.toBeNull();
      expect(result).toContain('@test');
      expect(result).toContain('esm-only-pkg');
    });

    it('resolves package with direct string exports field', () => {
      // Tests: "exports": "./index.js"
      const result = resolvePackageEntryPoint('@test/string-exports-pkg', mockPackagesDir);

      expect(result).toBe(
        path.join(mockPackagesDir, 'node_modules/@test/string-exports-pkg/index.js'),
      );
    });

    it('resolves package with shorthand object exports field', () => {
      // Tests: "exports": { ".": "./index.js" }
      const result = resolvePackageEntryPoint('@test/shorthand-exports-pkg', mockPackagesDir);

      expect(result).toBe(
        path.join(mockPackagesDir, 'node_modules/@test/shorthand-exports-pkg/index.js'),
      );
    });

    it('resolves package with default conditional exports field', () => {
      // Tests: "exports": { ".": { "default": "./index.js" } }
      const result = resolvePackageEntryPoint('@test/default-exports-pkg', mockPackagesDir);

      expect(result).toBe(
        path.join(mockPackagesDir, 'node_modules/@test/default-exports-pkg/index.js'),
      );
    });
  });
});
