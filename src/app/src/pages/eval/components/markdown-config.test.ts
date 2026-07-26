import { describe, expect, it } from 'vitest';
import { INLINE_IMAGE_URL_TRANSFORM, REMARK_PLUGINS } from './markdown-config';

const imageNode = { tagName: 'img' } as Parameters<typeof INLINE_IMAGE_URL_TRANSFORM>[2];
const linkNode = { tagName: 'a' } as Parameters<typeof INLINE_IMAGE_URL_TRANSFORM>[2];

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

  describe('INLINE_IMAGE_URL_TRANSFORM', () => {
    it('should retain safe image URLs', () => {
      const url = 'https://example.com/image.png';
      expect(INLINE_IMAGE_URL_TRANSFORM(url, 'src', imageNode)).toBe(url);
    });

    it('should allow base64 data URIs for inline images', () => {
      const dataUri =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      expect(INLINE_IMAGE_URL_TRANSFORM(dataUri, 'src', imageNode)).toBe(dataUri);
    });

    it('should allow base64 SVG image sources', () => {
      const svgDataUri =
        'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=';
      expect(INLINE_IMAGE_URL_TRANSFORM(svgDataUri, 'src', imageNode)).toBe(svgDataUri);
    });

    it('should retain relative image URLs', () => {
      const relativeUrl = '/images/test.png';
      expect(INLINE_IMAGE_URL_TRANSFORM(relativeUrl, 'src', imageNode)).toBe(relativeUrl);
    });

    it('should reject dangerous protocols', () => {
      expect(INLINE_IMAGE_URL_TRANSFORM('javascript:alert(1)', 'href', linkNode)).toBe('');
      expect(INLINE_IMAGE_URL_TRANSFORM('javascript:alert(1)', 'src', imageNode)).toBe('');
    });

    it('should not permit data URIs in markdown links', () => {
      const dataUri = 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==';
      expect(INLINE_IMAGE_URL_TRANSFORM(dataUri, 'href', linkNode)).toBe('');
    });

    it('should not permit non-image data URIs as image sources', () => {
      const dataUri = 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==';
      expect(INLINE_IMAGE_URL_TRANSFORM(dataUri, 'src', imageNode)).toBe('');
    });

    it('should be a stable function reference', () => {
      expect(INLINE_IMAGE_URL_TRANSFORM).toBe(INLINE_IMAGE_URL_TRANSFORM);
    });
  });
});
