import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import ReactMarkdown from 'react-markdown';
import { describe, expect, it, vi } from 'vitest';
import {
  DATA_IMAGE_ONLY_URL_TRANSFORM,
  extractRenderableMarkdownImageSources,
  extractRenderableMarkdownImages,
  hasMarkdownDataImage,
  IDENTITY_URL_TRANSFORM,
  IMAGE_DATA_URL_TRANSFORM,
  isImageDataUrl,
  PRESERVE_IMAGE_URL_TRANSFORM,
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

  describe('PRESERVE_IMAGE_URL_TRANSFORM', () => {
    it('preserves image sources for the custom safety renderer', () => {
      expect(PRESERVE_IMAGE_URL_TRANSFORM('https://example.com/image.png', 'src', imageNode)).toBe(
        'https://example.com/image.png',
      );
      expect(PRESERVE_IMAGE_URL_TRANSFORM('javascript:alert(1)', 'src', imageNode)).toBe(
        'javascript:alert(1)',
      );
    });

    it('still sanitizes non-image URLs', () => {
      expect(PRESERVE_IMAGE_URL_TRANSFORM('https://example.com', 'href', linkNode)).toBe(
        'https://example.com',
      );
      expect(PRESERVE_IMAGE_URL_TRANSFORM('javascript:alert(1)', 'href', linkNode)).toBe('');
    });
  });

  describe('isImageDataUrl', () => {
    it.each([
      'data:application/octet-stream;base64,AA==',
      'data:application/octet-stream,raw-image-data',
      ' Data:Application/Octet-Stream;Base64,AA==',
      'DATA:APPLICATION/OCTET-STREAM,raw-image-data',
      'data:application/octet-stream;charset=utf-8;base64,AA==',
      'data:image/png;base64,AA==',
      'DATA:IMAGE/SVG+XML,svg-data',
    ])('allows supported image MIME types with valid boundaries: %s', (source) => {
      expect(isImageDataUrl(source)).toBe(true);
      expect(IMAGE_DATA_URL_TRANSFORM(source, 'src', imageNode)).toBe(source);
      expect(DATA_IMAGE_ONLY_URL_TRANSFORM(source, 'src', imageNode)).toBe(source);
      expect(IMAGE_DATA_URL_TRANSFORM(source, 'href', linkNode)).toBe('');
    });

    it.each([
      'data:application/octet-streaming;base64,AA==',
      'DATA:APPLICATION/OCTET-STREAM+XML,AA==',
      'data:application/octet-stream/extra;base64,AA==',
      'data:application/octet-stream',
      'data:application/octet-stream%3Bbase64,AA==',
      'data:application/octet-stream ;base64,AA==',
      'data:text/html;base64,AA==',
      'data:application/pdf;base64,AA==',
      'javascript:alert%281%29',
    ])('rejects unsupported image sources and MIME lookalikes: %s', (source) => {
      expect(isImageDataUrl(source)).toBe(false);
      expect(IMAGE_DATA_URL_TRANSFORM(source, 'src', imageNode)).toBe('');
      expect(DATA_IMAGE_ONLY_URL_TRANSFORM(source, 'src', imageNode)).toBe('');
      expect(hasMarkdownDataImage(`![Preview](<${source}>)`)).toBe(false);
    });
  });

  describe('extractRenderableMarkdownImages', () => {
    const remoteSource = 'https://example.com/image.png';
    it.each([
      [
        'unused footnote',
        'Normal output\n\n[^unused]: ![Preview][pic]\n\n[pic]: https://example.com/image.png',
        [],
      ],
      [
        'empty first definition',
        '![Preview][pic]\n\n[pic]: <>\n[pic]: https://example.com/image.png',
        [],
      ],
      [
        'valid reference',
        '![Preview][pic]\n\n[pic]: https://example.com/image.png',
        [remoteSource],
      ],
      [
        'duplicate reference definitions',
        '![Preview][pic]\n\n[pic]: https://example.com/image.png\n[pic]: https://example.com/ignored.png',
        [remoteSource],
      ],
      [
        'referenced footnote',
        'Normal output[^used]\n\n[^used]: ![Preview][pic]\n\n[pic]: https://example.com/image.png',
        [remoteSource],
      ],
      [
        'duplicate footnote definitions',
        'Normal output[^used]\n\n[^used]: First definition\n\n[^used]: ![Preview][pic]\n\n[pic]: https://example.com/image.png',
        [],
      ],
      [
        'transitive footnotes',
        'Normal output[^first]\n\n[^first]: See[^second]\n\n[^second]: ![Preview][pic]\n\n[pic]: https://example.com/image.png',
        [remoteSource],
      ],
      [
        'unreachable transitive footnotes',
        'Normal output\n\n[^first]: See[^second]\n\n[^second]: ![Preview][pic]\n\n[pic]: https://example.com/image.png',
        [],
      ],
      [
        'repeated footnotes',
        'Normal output[^used] and again[^used]\n\n[^used]: ![Preview][pic]\n\n[pic]: https://example.com/image.png',
        [remoteSource],
      ],
      [
        'self-referencing footnote',
        'Normal output[^used]\n\n[^used]: ![Preview][pic] See[^used]\n\n[pic]: https://example.com/image.png',
        [remoteSource],
      ],
      [
        'cyclic footnotes',
        'Normal output[^first]\n\n[^first]: See[^second]\n\n[^second]: ![Preview][pic] See[^first]\n\n[pic]: https://example.com/image.png',
        [remoteSource],
      ],
      [
        'case-insensitive reference identifiers',
        '![Preview][PIC]\n\n[pic]: https://example.com/image.png',
        [remoteSource],
      ],
      [
        'case-insensitive footnote identifiers',
        'Normal output[^USED]\n\n[^used]: ![Preview][pic]\n\n[pic]: https://example.com/image.png',
        [remoteSource],
      ],
      [
        'definition inside unused footnote',
        '![Preview][pic]\n\n[^unused]: Hidden text\n\n    [pic]: https://example.com/image.png',
        [remoteSource],
      ],
      [
        'reference in ignored duplicate footnote',
        'Normal output[^first]\n\n[^first]: First definition\n\n[^first]: See[^second]\n\n[^second]: ![Preview][pic]\n\n[pic]: https://example.com/image.png',
        [],
      ],
      [
        'unused footnote with inline data image',
        'Normal output\n\n[^unused]: ![Preview](data:image/png;base64,AA==)',
        [],
      ],
      [
        'referenced footnote with inline data image',
        'Normal output[^used]\n\n[^used]: ![Preview](data:image/png;base64,AA==)',
        ['data:image/png;base64,AA=='],
      ],
    ] satisfies [string, string, string[]][])(
      'matches ReactMarkdown image selection for %s',
      (_label, markdown, expected) => {
        const renderedSources: string[] = [];
        renderToStaticMarkup(
          createElement(ReactMarkdown, {
            children: markdown,
            remarkPlugins: REMARK_PLUGINS,
            urlTransform: PRESERVE_IMAGE_URL_TRANSFORM,
            components: {
              img: ({ src }) => {
                if (src) {
                  renderedSources.push(src);
                }
                return null;
              },
            },
          }),
        );

        expect(renderedSources).toEqual(expected);
        expect(extractRenderableMarkdownImageSources(markdown)).toEqual(expected);
      },
    );

    it('preserves source-range order when footnotes render in a different order', () => {
      const markdown =
        '[^second] then [^first]\n\n[^first]: ![First](data:image/png;base64,AA==)\n\n[^second]: ![Second](data:image/png;base64,BB==)\n\n![Last](data:image/png;base64,CC==)';
      const images = extractRenderableMarkdownImages(markdown);
      expect(images.map((image) => image.alt)).toEqual(['First', 'Second', 'Last']);
      expect(images.map((image) => markdown.slice(image.start, image.end))).toEqual([
        '![First](data:image/png;base64,AA==)',
        '![Second](data:image/png;base64,BB==)',
        '![Last](data:image/png;base64,CC==)',
      ]);
    });

    it('preserves inline and reference image titles', () => {
      const markdown = [
        '![Inline](data:image/png;base64,AA== "inline title")',
        '![Reference][image]',
        '',
        "[image]: data:image/png;base64,BB== 'reference title'",
      ].join('\n');

      expect(extractRenderableMarkdownImages(markdown)).toEqual([
        expect.objectContaining({ alt: 'Inline', title: 'inline title', syntax: 'inline' }),
        expect.objectContaining({
          alt: 'Reference',
          title: 'reference title',
          syntax: 'reference',
        }),
      ]);
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

    it.each([
      ['DATA:IMAGE/PNG;BASE64,', true],
      [' Data:Application/Octet-Stream;Base64,', true],
      ['data:text/html;base64,', false],
    ])('does not normalize a large data payload when checking %s', (header, expected) => {
      const url = `${header}${'AaBb'.repeat(512 * 1024)}`;
      const lowercaseSpy = vi.spyOn(String.prototype, 'toLowerCase');
      let normalizedLengths: number[];

      try {
        expect(isImageDataUrl(url)).toBe(expected);
        normalizedLengths = lowercaseSpy.mock.contexts.map((value) => String(value).length);
      } finally {
        lowercaseSpy.mockRestore();
      }

      // Scheme checks may normalize a short header, but must not copy the image payload.
      expect(normalizedLengths.every((length) => length < 100)).toBe(true);
    });

    it('does not treat raw HTML as Markdown', () => {
      expect(hasMarkdownDataImage('<img src="data:image/png;base64,AA==">')).toBe(false);
    });
  });
});
