import { jest, describe, beforeEach, it, expect, afterEach } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock modules before importing them
jest.unstable_mockModule('../src/logger.js', () => ({
  default: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

jest.unstable_mockModule('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

// Import after mocking
const { importModule } = await import('../src/esm.js');
const logger = (await import('../src/logger.js')).default;
const fs = await import('fs');

describe('ESM utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetModules();
  });

  describe('importModule', () => {
    it('imports JavaScript modules', async () => {
      const modulePath = path.resolve(__dirname, 'fixtures/testModule.js');

      // Mock fs functions
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue('module.exports = { testFunction: () => "test result" }');

      // Mock the dynamic import
      jest.unstable_mockModule(modulePath, () => ({
        default: { testFunction: () => 'test result' },
      }));

      const result = await importModule(modulePath);
      expect(result).toEqual({ testFunction: expect.any(Function) });
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Successfully required module'),
      );
    });

    it('imports TypeScript modules', async () => {
      const modulePath = path.resolve(__dirname, 'fixtures/testModule.ts');
      
      jest.unstable_mockModule(modulePath, () => ({
        default: { testFunction: () => 'test result' },
      }));

      const result = await importModule(modulePath);
      expect(result).toEqual({ testFunction: expect.any(Function) });
    });

    it('imports JSON modules', async () => {
      const modulePath = path.resolve(__dirname, 'fixtures/testData.json');
      
      jest.unstable_mockModule(modulePath, () => ({
        default: { key: 'value' },
      }));

      const result = await importModule(modulePath);
      expect(result).toEqual({ key: 'value' });
    });

    it('handles import errors gracefully', async () => {
      const modulePath = path.resolve(__dirname, 'fixtures/nonExistent.js');
      
      // Mock import to throw error
      const error = new Error('Module not found');
      jest.unstable_mockModule(modulePath, () => {
        throw error;
      });

      await expect(importModule(modulePath)).rejects.toThrow('Module not found');
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('ESM import failed'),
      );
    });

    it('handles ESM modules', async () => {
      const modulePath = path.resolve(__dirname, 'fixtures/esmModule.mjs');
      
      jest.unstable_mockModule(modulePath, () => ({
        testFunction: () => 'esm result',
      }));

      const result = await importModule(modulePath);
      expect(result).toHaveProperty('testFunction');
    });

    it('handles modules with named exports', async () => {
      const modulePath = path.resolve(__dirname, 'fixtures/namedExports.js');
      
      jest.unstable_mockModule(modulePath, () => ({
        namedExport1: 'value1',
        namedExport2: 'value2',
      }));

      const result = await importModule(modulePath);
      expect(result).toEqual({
        namedExport1: 'value1',
        namedExport2: 'value2',
      });
    });
  });
});