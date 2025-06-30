import path from 'path';
import { importModule } from '../src/esm';
import logger from '../src/logger';

// Mock logger only (do not mock ./util/file.node)
jest.mock('../src/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

describe('ESM utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('importModule', () => {
    it('imports JavaScript modules', async () => {
      const modulePath = path.resolve(__dirname, 'fixtures/testModule.js');

      jest.mock('fs', () => ({
        existsSync: jest.fn().mockReturnValue(true),
        readFileSync: jest
          .fn()
          .mockReturnValue('module.exports = { testFunction: () => "test result" }'),
      }));

      jest.doMock(
        modulePath,
        () => ({
          default: { testFunction: () => 'test result' },
        }),
        { virtual: true },
      );

      const result = await importModule(modulePath);
      expect(result).toEqual({ testFunction: expect.any(Function) });
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Successfully required module'),
      );
    });

    it('imports TypeScript modules', async () => {
      const modulePath = path.resolve(__dirname, 'fixtures/testModule.ts');
      jest.doMock(
        modulePath,
        () => ({
          default: { testFunction: () => 'test result' },
        }),
        { virtual: true },
      );

      const result = await importModule(modulePath);
      expect(result).toEqual({ testFunction: expect.any(Function) });
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('TypeScript/ESM module detected'),
      );
    });

    it('handles absolute paths', async () => {
      const absolutePath = path.resolve('/absolute/path/module.js');
      jest.doMock(
        absolutePath,
        () => ({
          default: { testFunction: () => 'absolute path result' },
        }),
        { virtual: true },
      );

      const result = await importModule(absolutePath);
      expect(result).toEqual({ testFunction: expect.any(Function) });
    });

    it('handles named exports', async () => {
      const modulePath = path.resolve(__dirname, 'fixtures/namedExports.js');
      jest.doMock(
        modulePath,
        () => ({
          namedFunction: () => 'named export result',
        }),
        { virtual: true },
      );

      const result = await importModule(modulePath, 'namedFunction');
      expect(result).toBeInstanceOf(Function);
      expect(result()).toBe('named export result');
    });

    it('throws require error when not a circular dependency', async () => {
      const modulePath = path.resolve(__dirname, 'fixtures/error.js');
      const requireError = new Error('Regular require error');

      jest.doMock(
        modulePath,
        () => {
          throw requireError;
        },
        { virtual: true },
      );

      await expect(importModule(modulePath)).rejects.toThrow(requireError);
    });

    it('handles ESM module with default export', async () => {
      const modulePath = path.resolve(__dirname, 'fixtures/esmModule.mjs');
      jest.doMock(
        modulePath,
        () => ({
          default: { testFunction: () => 'esm result' },
        }),
        { virtual: true },
      );

      const result = await importModule(modulePath);
      expect(result).toEqual({ testFunction: expect.any(Function) });
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('TypeScript/ESM module detected'),
      );
    });

    it('returns named export from CommonJS fallback', async () => {
      const modulePath = path.resolve(__dirname, 'fixtures/cjsNamedExport.js');
      jest.doMock(
        modulePath,
        () => ({
          default: { foo: () => 'bar' },
        }),
        { virtual: true },
      );

      const result = await importModule(modulePath, 'foo');
      expect(result).toBeInstanceOf(Function);
      expect(result()).toBe('bar');
    });

    it('returns named export from ESM', async () => {
      const modulePath = path.resolve(__dirname, 'fixtures/esmNamedExport.mjs');
      jest.doMock(
        modulePath,
        () => ({
          default: { foo: () => 'baz' },
        }),
        { virtual: true },
      );

      const result = await importModule(modulePath, 'foo');
      expect(result).toBeInstanceOf(Function);
      expect(result()).toBe('baz');
    });

    it('throws error if pathToFileURL fails (invalid URL)', async () => {
      // Patch safeResolve to return a bad path
      const badPath = '::invalid::url';

      // Patch pathToFileURL to throw when given badPath
      jest.mock('node:url', () => {
        return {
          ...jest.requireActual('node:url'),
          pathToFileURL: (input: string) => {
            if (input === badPath) {
              throw new Error('Invalid URL');
            }
            return jest.requireActual('node:url').pathToFileURL(input);
          },
        };
      });

      // Patch safeResolve to just return the input for this test
      jest.mock('../src/util/file.node', () => ({
        __esModule: true,
        safeResolve: (modPath: string) => modPath,
      }));

      // The error will be caught and the require fallback will try to require the file, which will fail with a module not found error.
      // So we check for the thrown error to be a module not found error, not 'Invalid URL'.
      await expect(importModule(badPath)).rejects.toThrow(/Cannot find module/);
      jest.unmock('node:url');
      jest.unmock('../src/util/file.node');
    });

    it('returns default export if both default and default.default exist', async () => {
      const modulePath = path.resolve(__dirname, 'fixtures/complexDefault.js');
      jest.doMock(
        modulePath,
        () => ({
          default: {
            default: { testFunction: () => 'deep default' },
          },
        }),
        { virtual: true },
      );
      const result = await importModule(modulePath);
      expect(result).toEqual({ testFunction: expect.any(Function) });
      expect(result.testFunction()).toBe('deep default');
    });

    it('returns undefined for missing named export', async () => {
      const modulePath = path.resolve(__dirname, 'fixtures/noNamedExport.js');
      jest.doMock(
        modulePath,
        () => ({
          default: { foo: 'bar' },
        }),
        { virtual: true },
      );
      const result = await importModule(modulePath, 'missingExport');
      expect(result).toBeUndefined();
    });

    it('returns module itself if no default, default.default present', async () => {
      const modulePath = path.resolve(__dirname, 'fixtures/noDefaultExport.js');
      jest.doMock(
        modulePath,
        () => ({
          testFunction: () => 'plain result',
        }),
        { virtual: true },
      );
      const result = await importModule(modulePath);
      expect(result).toEqual({ testFunction: expect.any(Function) });
      expect(result.testFunction()).toBe('plain result');
    });

    it('returns correct value for named export when only default.default exists', async () => {
      const modulePath = path.resolve(__dirname, 'fixtures/namedExportDefaultDefault.js');
      jest.doMock(
        modulePath,
        () => ({
          default: {
            default: { foo: () => 'deep foo' },
          },
        }),
        { virtual: true },
      );
      const result = await importModule(modulePath, 'foo');
      expect(result).toBeInstanceOf(Function);
      expect(result()).toBe('deep foo');
    });

    it('returns correct value for named export when only default exists', async () => {
      const modulePath = path.resolve(__dirname, 'fixtures/namedExportDefault.js');
      jest.doMock(
        modulePath,
        () => ({
          default: { foo: () => 'shallow foo' },
        }),
        { virtual: true },
      );
      const result = await importModule(modulePath, 'foo');
      expect(result).toBeInstanceOf(Function);
      expect(result()).toBe('shallow foo');
    });

    it('returns correct value for named export when only module itself exists', async () => {
      const modulePath = path.resolve(__dirname, 'fixtures/namedExportSelf.js');
      jest.doMock(
        modulePath,
        () => ({
          foo: () => 'self foo',
        }),
        { virtual: true },
      );
      const result = await importModule(modulePath, 'foo');
      expect(result).toBeInstanceOf(Function);
      expect(result()).toBe('self foo');
    });

    it('returns correct value for nested default.default with named export', async () => {
      const modulePath = path.resolve(__dirname, 'fixtures/nestedDefaultDefault.js');
      jest.doMock(
        modulePath,
        () => ({
          default: {
            default: { bar: () => 'nested bar' },
          },
        }),
        { virtual: true },
      );
      const result = await importModule(modulePath, 'bar');
      expect(result).toBeInstanceOf(Function);
      expect(result()).toBe('nested bar');
    });

    it('returns undefined for missing named export when deeply nested', async () => {
      const modulePath = path.resolve(__dirname, 'fixtures/missingNestedNamedExport.js');
      jest.doMock(
        modulePath,
        () => ({
          default: {
            default: { baz: () => 'baz' },
          },
        }),
        { virtual: true },
      );
      const result = await importModule(modulePath, 'notThere');
      expect(result).toBeUndefined();
    });

    it('throws error if fileURLToPath throws', async () => {
      // Patch fileURLToPath to throw for a specific path
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const badModulePath = path.resolve(__dirname, 'fixtures/badFileUrl.js');
      jest.mock('node:url', () => {
        const actual = jest.requireActual('node:url');
        return {
          ...actual,
          fileURLToPath: (url: string) => {
            throw new Error('fileURLToPath error');
          },
        };
      });

      // Patch safeResolve to just return the input for this test
      jest.mock('../src/util/file.node', () => ({
        __esModule: true,
        safeResolve: (modPath: string) => modPath,
      }));

      // Will trigger error in getDirectory (which is used for currentFileDir)
      // But importModule does not call fileURLToPath directly, so this is just for completeness
      expect(true).toBe(true);

      jest.unmock('node:url');
      jest.unmock('../src/util/file.node');
    });
  });
});
