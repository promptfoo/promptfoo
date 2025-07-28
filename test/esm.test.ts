import path from 'path';

import { importModule } from '../src/esm';
import logger from '../src/logger';

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
      const modulePath = path.resolve(__dirname, '__fixtures__/testModule.js');

      const result = await importModule(modulePath);
      // importModule extracts the nested default from CommonJS modules
      expect(result).toEqual({
        testFunction: expect.any(Function),
      });
      expect(result.testFunction()).toBe('js default test result');
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Successfully required module'),
      );
    });

    it('imports TypeScript modules', async () => {
      const modulePath = path.resolve(__dirname, '__fixtures__/testModule.ts');

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
      const modulePath = path.resolve(__dirname, '__fixtures__/testModule.cjs');

      const result = await importModule(modulePath);
      // importModule extracts the nested default from CommonJS modules
      expect(result).toEqual({
        testFunction: expect.any(Function),
      });
      expect(result.testFunction()).toBe('cjs default test result');
    });

    it('imports ESM modules', async () => {
      const modulePath = path.resolve(__dirname, '__fixtures__/testModule.mjs');

      const result = await importModule(modulePath);
      expect(result).toEqual({
        testFunction: expect.any(Function),
        defaultProp: 'esm default property',
      });
      expect(result.testFunction()).toBe('esm default test result');
    });

    it('imports simple modules without nested defaults', async () => {
      const modulePath = path.resolve(__dirname, '__fixtures__/testModuleSimple.js');

      const result = await importModule(modulePath);
      expect(result).toEqual(expect.any(Function));
      expect(result()).toBe('simple function result');
    });

    it('returns named function when functionName is specified', async () => {
      const modulePath = path.resolve(__dirname, '__fixtures__/testModule.js');

      const result = await importModule(modulePath, 'testFunction');
      expect(result).toEqual(expect.any(Function));
      expect(result()).toBe('js default test result');
      expect(logger.debug).toHaveBeenCalledWith('Returning named export: testFunction');
    });

    it('returns named function from TypeScript module', async () => {
      const modulePath = path.resolve(__dirname, '__fixtures__/testModule.ts');

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
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('ESM import failed'));
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('CommonJS require also failed'),
      );
    });

    it('logs debug information during import process', async () => {
      const modulePath = path.resolve(__dirname, '__fixtures__/testModule.js');

      await importModule(modulePath);

      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Attempting to import module'),
      );
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Attempting ESM import from'),
      );
    });

    it('falls back to CommonJS when ESM import fails', async () => {
      const modulePath = path.resolve(__dirname, '__fixtures__/testModule.cjs');

      const result = await importModule(modulePath);
      expect(result).toEqual({
        testFunction: expect.any(Function),
      });

      // Should try ESM first, then fall back to CommonJS
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('ESM import failed'));
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Successfully required module'),
      );
    });

    it('extracts named export from ESM module', async () => {
      const modulePath = path.resolve(__dirname, '__fixtures__/testModule.mjs');

      const result = await importModule(modulePath, 'testFunction');
      expect(result).toEqual(expect.any(Function));
      expect(result()).toBe('esm default test result');
    });
  });
});
