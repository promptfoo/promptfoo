import { isJavascriptFile } from '../../src/util/file';

describe('util', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isJavascriptFile', () => {
    it('should return true for JavaScript files', () => {
      expect(isJavascriptFile('file.js')).toBe(true);
      expect(isJavascriptFile('file.cjs')).toBe(true);
      expect(isJavascriptFile('file.mjs')).toBe(true);
    });

    it('should return true for TypeScript files', () => {
      expect(isJavascriptFile('file.ts')).toBe(true);
      expect(isJavascriptFile('file.cts')).toBe(true);
      expect(isJavascriptFile('file.mts')).toBe(true);
    });

    it('should return false for non-JavaScript/TypeScript files', () => {
      expect(isJavascriptFile('file.txt')).toBe(false);
      expect(isJavascriptFile('file.py')).toBe(false);
      expect(isJavascriptFile('file.jsx')).toBe(false);
      expect(isJavascriptFile('file.tsx')).toBe(false);
    });

    it('should handle paths with directories', () => {
      expect(isJavascriptFile('/path/to/file.js')).toBe(true);
      expect(isJavascriptFile('C:\\path\\to\\file.ts')).toBe(true);
      expect(isJavascriptFile('/path/to/file.txt')).toBe(false);
    });
  });
});
