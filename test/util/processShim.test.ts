import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  _createBrowserProcessShim,
  _isBrowserEnvironment,
  getProcessShim,
} from '../../src/util/processShim';

describe('processShim', () => {
  describe('_isBrowserEnvironment', () => {
    const originalWindow = globalThis.window;
    const originalSelf = globalThis.self;

    afterEach(() => {
      vi.resetAllMocks();
      // Restore original globals
      if (originalWindow !== undefined) {
        (globalThis as Record<string, unknown>).window = originalWindow;
      } else {
        delete (globalThis as Record<string, unknown>).window;
      }
      if (originalSelf !== undefined) {
        (globalThis as Record<string, unknown>).self = originalSelf;
      } else {
        delete (globalThis as Record<string, unknown>).self;
      }
    });

    it('should return false in Node.js environment', () => {
      // In Node.js, process.versions.node exists
      expect(_isBrowserEnvironment()).toBe(false);
    });

    it('should return false even when window is defined in Node.js (jsdom/happy-dom)', () => {
      // This tests the fix for test environments that define window
      (globalThis as Record<string, unknown>).window = {};

      // Should still return false because process.versions.node exists
      expect(_isBrowserEnvironment()).toBe(false);
    });

    it('should return false even when self.importScripts is defined in Node.js', () => {
      // Test environments might also mock web worker globals
      (globalThis as Record<string, unknown>).self = {
        importScripts: () => {},
      };

      // Should still return false because process.versions.node exists
      expect(_isBrowserEnvironment()).toBe(false);
    });
  });

  describe('_createBrowserProcessShim', () => {
    afterEach(() => {
      vi.resetAllMocks();
    });

    it('should return an object with env property', () => {
      const shim = _createBrowserProcessShim();

      expect(shim.env).toBeDefined();
      expect(typeof shim.env).toBe('object');
    });

    it('should return an object with mainModule property', () => {
      const shim = _createBrowserProcessShim();

      expect(shim.mainModule).toBeDefined();
    });

    it('should throw an error when mainModule.require is called', () => {
      const shim = _createBrowserProcessShim();

      expect(() => {
        shim.mainModule!.require('fs');
      }).toThrow('require() is not available in browser transforms');
    });

    it('should have mainModule with expected structure', () => {
      const shim = _createBrowserProcessShim();
      const mainModule = shim.mainModule!;

      expect(mainModule.exports).toEqual({});
      expect(mainModule.id).toBe('.');
      expect(mainModule.filename).toBe('');
      expect(mainModule.loaded).toBe(true);
      expect(mainModule.children).toEqual([]);
      expect(mainModule.paths).toEqual([]);
    });
  });

  describe('getProcessShim', () => {
    const originalWindow = globalThis.window;

    afterEach(() => {
      vi.resetAllMocks();
      // Restore original globals
      if (originalWindow !== undefined) {
        (globalThis as Record<string, unknown>).window = originalWindow;
      } else {
        delete (globalThis as Record<string, unknown>).window;
      }
    });

    it('should return a process shim in Node.js environment', () => {
      const shim = getProcessShim();

      expect(shim).toBeDefined();
      expect(shim.mainModule).toBeDefined();
    });

    it('should return a working require function in Node.js environment', () => {
      const shim = getProcessShim();

      // In Node.js, mainModule.require should work
      const path = shim.mainModule!.require('path');
      expect(path.join).toBeDefined();
      expect(typeof path.join).toBe('function');
    });

    it('should return Node.js shim even when window is defined (jsdom/happy-dom)', () => {
      // This tests that we correctly detect Node.js in test environments
      (globalThis as Record<string, unknown>).window = {};

      const shim = getProcessShim();

      // Should still work because process.versions.node exists
      expect(shim).toBeDefined();
      const path = shim.mainModule!.require('path');
      expect(path.join).toBeDefined();
    });

    it('should cache the Node.js shim for subsequent calls', () => {
      const shim1 = getProcessShim();
      const shim2 = getProcessShim();

      // Should return the same cached instance
      expect(shim1).toBe(shim2);
    });
  });

  describe('getProcessShim integration with transforms', () => {
    afterEach(() => {
      vi.resetAllMocks();
    });

    it('should allow inline transforms to access process shim', () => {
      const shim = getProcessShim();

      // Create an inline transform function like the actual code does
      const transformFn = new Function(
        'data',
        'context',
        'process',
        'return data.toUpperCase()',
      ) as (data: string, context: object, process: typeof global.process) => string;

      const result = transformFn('hello', {}, shim);

      expect(result).toBe('HELLO');
    });

    it('should allow inline transforms to use process.mainModule.require in Node.js', () => {
      const shim = getProcessShim();

      // Create a transform that uses require
      const transformFn = new Function(
        'data',
        'context',
        'process',
        `
        const path = process.mainModule.require('path');
        return path.basename(data);
        `,
      ) as (data: string, context: object, process: typeof global.process) => string;

      const result = transformFn('/foo/bar/test.txt', {}, shim);

      expect(result).toBe('test.txt');
    });
  });
});
