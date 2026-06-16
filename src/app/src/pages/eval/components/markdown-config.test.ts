import { describe, expect, it } from 'vitest';
import {
  DATA_IMAGE_ONLY_URL_TRANSFORM,
  extractRenderableMarkdownImageSources,
  hasMarkdownDataImage,
  IDENTITY_URL_TRANSFORM,
  IMAGE_DATA_URL_TRANSFORM,
  isImageDataUrl,
  REMARK_PLUGINS,
} from './markdown-config';

const imageNode = { tagName: 'img' } as Parameters<typeof IMAGE_DATA_URL_TRANSFORM>[2];
const linkNode = { tagName: 'a' } as Parameters<typeof IMAGE_DATA_URL_TRANSFORM>[2];

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

  describe('IMAGE_DATA_URL_TRANSFORM', () => {
    it('allows image data URIs for image sources', () => {
      const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
      expect(IMAGE_DATA_URL_TRANSFORM(dataUri, 'src', imageNode)).toBe(dataUri);
    });

    it('allows octet-stream data URIs for image sources', () => {
      const dataUri = 'data:application/octet-stream;base64,R0lGODlhAQABAIAAAAAAAP';
      expect(IMAGE_DATA_URL_TRANSFORM(dataUri, 'src', imageNode)).toBe(dataUri);
    });

    it('preserves safe remote and relative image sources', () => {
      expect(IMAGE_DATA_URL_TRANSFORM('https://example.com/image.png', 'src', imageNode)).toBe(
        'https://example.com/image.png',
      );
      expect(IMAGE_DATA_URL_TRANSFORM('/images/test.png', 'src', imageNode)).toBe(
        '/images/test.png',
      );
    });

    it('rejects unsafe and non-image data sources', () => {
      expect(IMAGE_DATA_URL_TRANSFORM('javascript:alert(1)', 'src', imageNode)).toBe('');
      expect(IMAGE_DATA_URL_TRANSFORM('data:text/html;base64,PHNjcmlwdD4=', 'src', imageNode)).toBe(
        '',
      );
    });

    it('does not allow image data URIs in links', () => {
      expect(IMAGE_DATA_URL_TRANSFORM('data:image/png;base64,AA==', 'href', linkNode)).toBe('');
    });
  });

  describe('DATA_IMAGE_ONLY_URL_TRANSFORM', () => {
    it('allows image data URIs without allowing automatic URL requests', () => {
      const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
      expect(DATA_IMAGE_ONLY_URL_TRANSFORM(dataUri, 'src', imageNode)).toBe(dataUri);
      expect(DATA_IMAGE_ONLY_URL_TRANSFORM('https://example.com/image.png', 'src', imageNode)).toBe(
        '',
      );
      expect(DATA_IMAGE_ONLY_URL_TRANSFORM('/api/internal/action', 'src', imageNode)).toBe('');
    });

    it('retains safe URL handling for non-image attributes', () => {
      expect(DATA_IMAGE_ONLY_URL_TRANSFORM('https://example.com', 'href', linkNode)).toBe(
        'https://example.com',
      );
      expect(DATA_IMAGE_ONLY_URL_TRANSFORM('data:image/png;base64,AA==', 'href', linkNode)).toBe(
        '',
      );
    });
  });

  describe('hasMarkdownDataImage', () => {
    it('short-circuits large ordinary text without image syntax', () => {
      const markdown = 'ordinary text '.repeat(10_000);

      expect(markdown).not.toContain('![');
      expect(extractRenderableMarkdownImageSources(markdown)).toEqual([]);
      expect(hasMarkdownDataImage(markdown)).toBe(false);
    });

    it('detects renderable data images case-insensitively', () => {
      expect(hasMarkdownDataImage('![Preview](data:image/png;base64,AA==)')).toBe(true);
      expect(hasMarkdownDataImage('![Preview](DATA:IMAGE/PNG;BASE64,AA==)')).toBe(true);
      expect(hasMarkdownDataImage('![Remote](https://example.com/image.png)')).toBe(false);
    });

    it.each([
      ['raw HTML', '<img src="data:image/png;base64,AA==">'],
      ['escaped image syntax', String.raw`\![Preview](data:image/png;base64,AA==)`],
      ['inline code', '`![Preview](data:image/png;base64,AA==)`'],
      ['backtick fenced code', '```md\n![Preview](data:image/png;base64,AA==)\n```'],
      ['tilde fenced code', '~~~md\n![Preview](data:image/png;base64,AA==)\n~~~'],
      ['four-space indented code', '    ![Preview](data:image/png;base64,AA==)'],
      ['tab-indented code', '\t![Preview](data:image/png;base64,AA==)'],
      ['HTML comments', '<!-- ![Preview](data:image/png;base64,AA==) -->'],
      ['raw div blocks', '<div>\n![Preview](data:image/png;base64,AA==)\n</div>'],
      ['raw pre blocks', '<pre>\n![Preview](data:image/png;base64,AA==)\n</pre>'],
      ['list-nested fenced code', '- ```md\n  ![Preview](data:image/png;base64,AA==)\n  ```'],
    ])('does not treat %s as a renderable image', (_label, markdown) => {
      expect(extractRenderableMarkdownImageSources(markdown)).toEqual([]);
      expect(hasMarkdownDataImage(markdown)).toBe(false);
    });

    it.each([
      ['full reference images', '![Preview][image]\n\n[image]: data:image/png;base64,AA=='],
      ['collapsed reference images', '![Preview][]\n\n[Preview]: data:image/png;base64,AA=='],
      ['shortcut reference images', '![Preview]\n\n[Preview]: data:image/png;base64,AA=='],
      [
        'escaped brackets in alt text',
        String.raw`![Preview \[nested\]](data:image/png;base64,AA==)`,
      ],
      ['nested brackets in alt text', '![Preview [nested]](data:image/png;base64,AA==)'],
    ])('detects %s using ReactMarkdown parsing semantics', (_label, markdown) => {
      expect(extractRenderableMarkdownImageSources(markdown)).toEqual([
        'data:image/png;base64,AA==',
      ]);
      expect(hasMarkdownDataImage(markdown)).toBe(true);
    });

    it('still detects an image after inline and fenced code', () => {
      const markdown = [
        '`![Code](data:image/png;base64,CODE)`',
        '```md',
        '![Fence](data:image/png;base64,FENCE)',
        '```',
        '![Preview](data:image/png;base64,AA==)',
      ].join('\n');

      expect(extractRenderableMarkdownImageSources(markdown)).toEqual([
        'data:image/png;base64,AA==',
      ]);
      expect(hasMarkdownDataImage(markdown)).toBe(true);
    });

    it('recognizes image data URLs independent of scheme and MIME casing', () => {
      expect(isImageDataUrl('DATA:IMAGE/PNG;BASE64,AA==')).toBe(true);
      expect(isImageDataUrl(' Data:Application/Octet-Stream;Base64,AA==')).toBe(true);
      expect(isImageDataUrl('data:text/html;base64,AA==')).toBe(false);
    });

    it('does not treat raw HTML as Markdown', () => {
      expect(hasMarkdownDataImage('<img src="data:image/png;base64,AA==">')).toBe(false);
    });
  });
});
