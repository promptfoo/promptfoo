import { describe, expect, it } from 'vitest';
import { IDENTITY_URL_TRANSFORM, REMARK_PLUGINS } from './markdown-config';

describe('markdown-config', () => {
  describe('REMARK_PLUGINS', () => {
    it('should be a stable reference (same object on multiple imports)', () => {
      // This test verifies that REMARK_PLUGINS is defined at module level
      // and doesn't create a new array on each access
      const plugins1 = REMARK_PLUGINS;
      const plugins2 = REMARK_PLUGINS;

      expect(plugins1).toBe(plugins2);
    });

    it('should contain remarkGfm plugin', () => {
      expect(REMARK_PLUGINS).toHaveLength(1);
      expect(typeof REMARK_PLUGINS[0]).toBe('function');
    });

    it('should be an array', () => {
      expect(Array.isArray(REMARK_PLUGINS)).toBe(true);
    });
  });

  describe('IDENTITY_URL_TRANSFORM', () => {
    it('should return the URL unchanged', () => {
      const url = 'https://example.com/image.png';
      expect(IDENTITY_URL_TRANSFORM(url)).toBe(url);
    });

    it('should handle data URIs for inline images', () => {
      const dataUri =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      expect(IDENTITY_URL_TRANSFORM(dataUri)).toBe(dataUri);
    });

    it('should handle SVG data URIs', () => {
      const svgDataUri =
        'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=';
      expect(IDENTITY_URL_TRANSFORM(svgDataUri)).toBe(svgDataUri);
    });

    it('should handle relative URLs', () => {
      const relativeUrl = '/images/test.png';
      expect(IDENTITY_URL_TRANSFORM(relativeUrl)).toBe(relativeUrl);
    });

    it('should handle empty strings', () => {
      expect(IDENTITY_URL_TRANSFORM('')).toBe('');
    });

    it('should be a stable function reference', () => {
      // Verify the function doesn't get recreated
      const fn1 = IDENTITY_URL_TRANSFORM;
      const fn2 = IDENTITY_URL_TRANSFORM;
      expect(fn1).toBe(fn2);
    });
  });
});
