import { describe, expect, it, vi } from 'vitest';
import {
  extractMarkdownImageSources,
  normalizeImageSrcForComparison,
  resolveEvalImageOutputSource,
} from './EvalOutputCell';

// Helper function to handle string image resolution (extracted to reduce complexity)
function resolveImageString(image: string): string | undefined {
  // Handle blob URIs
  if (image.includes('promptfoo://blob/')) {
    const match = image.match(/promptfoo:\/\/blob\/([a-f0-9]{32,64})/i);
    if (match) {
      return `/api/blobs/${match[1]}`;
    }
  }
  // Handle storage refs
  if (image.startsWith('storageRef:')) {
    const path = image.replace(/^storageRef:\/?/, '');
    return `/api/media/${path}`;
  }
  // Handle data URIs
  if (image.startsWith('data:')) {
    return image;
  }
  // Handle HTTP(S) URLs
  if (/^https?:\/\//.test(image)) {
    return image;
  }
  return undefined;
}

// Helper function to handle object image resolution (extracted to reduce complexity)
function resolveImageObject(image: {
  data?: string;
  blobRef?: { uri?: string };
}): string | undefined {
  // Check data property first
  if (image.data) {
    if (image.data.startsWith('data:')) {
      return image.data;
    }
    if (/^https?:\/\//.test(image.data)) {
      return image.data;
    }
    // Handle storageRef in data property
    if (image.data.startsWith('storageRef:')) {
      const path = image.data.replace(/^storageRef:\/?/, '');
      return `/api/media/${path}`;
    }
  }
  // Check blobRef
  if (image.blobRef?.uri) {
    const match = image.blobRef.uri.match(/promptfoo:\/\/blob\/([a-f0-9]{32,64})/i);
    if (match) {
      return `/api/blobs/${match[1]}`;
    }
  }
  return undefined;
}

// Mock the media utilities
vi.mock('@app/utils/media', () => ({
  normalizeMediaText: (text: string) => {
    // Simplified normalization - replace blob URIs and storage refs with API paths
    return text
      .replace(/promptfoo:\/\/blob\/([a-f0-9]{32,64})/gi, '/api/blobs/$1')
      .replace(/storageRef:\/?([^\s)'"`]+)/gi, '/api/media/$1');
  },
  resolveImageSource: (
    image: string | { data?: string; blobRef?: { uri?: string } } | null | undefined,
  ) => {
    if (!image) {
      return undefined;
    }
    if (typeof image === 'string') {
      return resolveImageString(image);
    }
    if (typeof image === 'object') {
      return resolveImageObject(image);
    }
    return undefined;
  },
}));

describe('normalizeImageSrcForComparison', () => {
  it('normalizes and resolves HTTP URLs', () => {
    const result = normalizeImageSrcForComparison('https://example.com/image.png');
    expect(result).toBe('https://example.com/image.png');
  });

  it('normalizes and resolves HTTPS URLs', () => {
    const result = normalizeImageSrcForComparison('https://example.com/image.jpg');
    expect(result).toBe('https://example.com/image.jpg');
  });

  it('normalizes data URIs', () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
    const result = normalizeImageSrcForComparison(dataUri);
    expect(result).toBe(dataUri);
  });

  it('normalizes blob URIs to API paths', () => {
    const blobUri = 'promptfoo://blob/abc123def456abc123def456abc123de';
    const result = normalizeImageSrcForComparison(blobUri);
    expect(result).toBe('/api/blobs/abc123def456abc123def456abc123de');
  });

  it('normalizes storage refs to API paths', () => {
    const storageRef = 'storageRef:images/test.png';
    const result = normalizeImageSrcForComparison(storageRef);
    expect(result).toBe('/api/media/images/test.png');
  });

  it('handles URLs with leading/trailing whitespace', () => {
    const result = normalizeImageSrcForComparison('  https://example.com/image.png  ');
    expect(result).toBe('https://example.com/image.png');
  });

  it('handles storage refs with leading slash', () => {
    const result = normalizeImageSrcForComparison('storageRef:/path/to/image.jpg');
    expect(result).toBe('/api/media/path/to/image.jpg');
  });

  it('returns normalized text when resolveImageSource returns undefined', () => {
    // A string that doesn't match any URL pattern
    const result = normalizeImageSrcForComparison('plain-text-not-a-url');
    // Should return the normalized text (which is the same as input in this case)
    expect(result).toBe('plain-text-not-a-url');
  });

  it('normalizes blob URIs within text containing other content', () => {
    const text = 'Some text promptfoo://blob/fedcba9876543210fedcba9876543210 more text';
    const result = normalizeImageSrcForComparison(text);
    // normalizeMediaText replaces the blob URI
    expect(result).toContain('/api/blobs/fedcba9876543210fedcba9876543210');
  });
});

describe('extractMarkdownImageSources', () => {
  it('extracts single markdown image URL', () => {
    const markdown = '![Alt text](https://example.com/image.png)';
    const sources = extractMarkdownImageSources(markdown);
    expect(sources).toEqual(['https://example.com/image.png']);
  });

  it('extracts multiple markdown image URLs', () => {
    const markdown =
      '![Image 1](https://example.com/img1.png) and ![Image 2](https://example.com/img2.jpg)';
    const sources = extractMarkdownImageSources(markdown);
    expect(sources).toEqual(['https://example.com/img1.png', 'https://example.com/img2.jpg']);
  });

  it('extracts markdown image with title attribute', () => {
    const markdown = '![Alt](https://example.com/image.png "Image Title")';
    const sources = extractMarkdownImageSources(markdown);
    expect(sources).toEqual(['https://example.com/image.png']);
  });

  it('extracts markdown image with angle bracket URL', () => {
    const markdown = '![Alt](<https://example.com/image with spaces.png>)';
    const sources = extractMarkdownImageSources(markdown);
    expect(sources).toEqual(['https://example.com/image with spaces.png']);
  });

  it('extracts HTML img tag sources', () => {
    const html = '<img src="https://example.com/image.png" alt="Test">';
    const sources = extractMarkdownImageSources(html);
    expect(sources).toEqual(['https://example.com/image.png']);
  });

  it('extracts both markdown and HTML image sources', () => {
    const mixed =
      '![Markdown](https://example.com/md.png) <img src="https://example.com/html.jpg">';
    const sources = extractMarkdownImageSources(mixed);
    expect(sources).toEqual(['https://example.com/md.png', 'https://example.com/html.jpg']);
  });

  it('handles empty markdown', () => {
    const sources = extractMarkdownImageSources('');
    expect(sources).toEqual([]);
  });

  it('handles text with no images', () => {
    const text = 'This is just plain text without any images';
    const sources = extractMarkdownImageSources(text);
    expect(sources).toEqual([]);
  });

  it('deduplicates identical image URLs', () => {
    const markdown =
      '![Image 1](https://example.com/same.png) ![Image 2](https://example.com/same.png)';
    const sources = extractMarkdownImageSources(markdown);
    expect(sources).toEqual(['https://example.com/same.png']);
  });

  it('extracts data URI images', () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGg';
    const markdown = `![Alt](${dataUri})`;
    const sources = extractMarkdownImageSources(markdown);
    expect(sources).toEqual([dataUri]);
  });

  it('extracts blob URI images', () => {
    const blobUri = 'promptfoo://blob/abc123def456abc123def456abc123de';
    const markdown = `![Alt](${blobUri})`;
    const sources = extractMarkdownImageSources(markdown);
    // Blob URIs should be normalized to API paths
    expect(sources).toEqual(['/api/blobs/abc123def456abc123def456abc123de']);
  });

  it('extracts storage ref images', () => {
    const storageRef = 'storageRef:images/test.png';
    const markdown = `![Alt](${storageRef})`;
    const sources = extractMarkdownImageSources(markdown);
    expect(sources).toEqual(['/api/media/images/test.png']);
  });

  it('handles markdown images with empty alt text', () => {
    const markdown = '![](https://example.com/image.png)';
    const sources = extractMarkdownImageSources(markdown);
    expect(sources).toEqual(['https://example.com/image.png']);
  });

  it('handles markdown images with standard alt text (no closing brackets)', () => {
    // Note: The regex [^\]]* in the implementation doesn't support closing brackets in alt text
    // This is standard markdown behavior - brackets in alt text need to be escaped
    const markdown = '![Alt with text](https://example.com/image.png)';
    const sources = extractMarkdownImageSources(markdown);
    expect(sources).toEqual(['https://example.com/image.png']);
  });

  it('ignores invalid markdown image syntax', () => {
    const markdown = '![Missing closing paren(https://example.com/image.png';
    const sources = extractMarkdownImageSources(markdown);
    expect(sources).toEqual([]);
  });

  it('handles HTML img tags with single quotes', () => {
    const html = "<img src='https://example.com/image.png' alt='Test'>";
    const sources = extractMarkdownImageSources(html);
    expect(sources).toEqual(['https://example.com/image.png']);
  });

  it('handles HTML img tags with extra attributes', () => {
    const html =
      '<img width="100" height="100" src="https://example.com/image.png" alt="Test" loading="lazy">';
    const sources = extractMarkdownImageSources(html);
    expect(sources).toEqual(['https://example.com/image.png']);
  });

  it('skips markdown images with empty URL', () => {
    const markdown = '![Alt]()';
    const sources = extractMarkdownImageSources(markdown);
    expect(sources).toEqual([]);
  });

  it('skips markdown images with whitespace-only URL', () => {
    const markdown = '![Alt](   )';
    const sources = extractMarkdownImageSources(markdown);
    expect(sources).toEqual([]);
  });

  it('skips HTML img tags with empty src', () => {
    const html = '<img src="" alt="Test">';
    const sources = extractMarkdownImageSources(html);
    expect(sources).toEqual([]);
  });

  it('skips HTML img tags with whitespace-only src', () => {
    const html = '<img src="   " alt="Test">';
    const sources = extractMarkdownImageSources(html);
    expect(sources).toEqual([]);
  });

  it('handles newlines in markdown', () => {
    const markdown = `
      ![Image 1](https://example.com/img1.png)
      Some text here
      ![Image 2](https://example.com/img2.jpg)
    `;
    const sources = extractMarkdownImageSources(markdown);
    expect(sources).toEqual(['https://example.com/img1.png', 'https://example.com/img2.jpg']);
  });

  it('preserves order of first occurrence when deduplicating', () => {
    const markdown = `
      ![First](https://example.com/a.png)
      ![Second](https://example.com/b.png)
      ![Duplicate of first](https://example.com/a.png)
      ![Third](https://example.com/c.png)
    `;
    const sources = extractMarkdownImageSources(markdown);
    // Set iteration order should preserve insertion order
    expect(sources).toEqual([
      'https://example.com/a.png',
      'https://example.com/b.png',
      'https://example.com/c.png',
    ]);
  });

  it('normalizes URLs before deduplication', () => {
    // If two URLs normalize to the same thing, they should be deduplicated
    const blobHash = 'abc123def456abc123def456abc123de';
    const markdown = `
      ![Blob1](promptfoo://blob/${blobHash})
      ![Blob2](promptfoo://blob/${blobHash})
    `;
    const sources = extractMarkdownImageSources(markdown);
    expect(sources).toEqual([`/api/blobs/${blobHash}`]);
  });
});

describe('resolveEvalImageOutputSource', () => {
  it('returns HTTP URL from data string', () => {
    const image = { data: 'https://example.com/image.png', mimeType: 'image/png' };
    const result = resolveEvalImageOutputSource(image);
    expect(result).toBe('https://example.com/image.png');
  });

  it('returns HTTPS URL from data string', () => {
    const image = { data: 'https://example.com/image.jpg', mimeType: 'image/jpeg' };
    const result = resolveEvalImageOutputSource(image);
    expect(result).toBe('https://example.com/image.jpg');
  });

  it('falls back to resolveImageSource for data URIs', () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGg';
    const image = { data: dataUri, mimeType: 'image/png' };
    const result = resolveEvalImageOutputSource(image);
    expect(result).toBe(dataUri);
  });

  it('falls back to resolveImageSource for blob refs', () => {
    const image = {
      data: 'base64data',
      blobRef: { uri: 'promptfoo://blob/abc123def456abc123def456abc123de', hash: 'abc123' },
    } as any;
    const result = resolveEvalImageOutputSource(image);
    expect(result).toBe('/api/blobs/abc123def456abc123def456abc123de');
  });

  it('falls back to resolveImageSource when data is not an HTTP(S) URL', () => {
    const image = { data: 'storageRef:images/test.png', mimeType: 'image/png' };
    const result = resolveEvalImageOutputSource(image);
    expect(result).toBe('/api/media/images/test.png');
  });

  it('returns undefined when data is not a URL and cannot be resolved', () => {
    const image = { data: 'invalid-data', mimeType: 'image/png' };
    const result = resolveEvalImageOutputSource(image);
    expect(result).toBeUndefined();
  });

  it('handles image with only blobRef', () => {
    const image = {
      blobRef: { uri: 'promptfoo://blob/fedcba9876543210fedcba9876543210', hash: 'fedcba98' },
    } as any;
    const result = resolveEvalImageOutputSource(image);
    expect(result).toBe('/api/blobs/fedcba9876543210fedcba9876543210');
  });

  it('handles empty object', () => {
    const image = {};
    const result = resolveEvalImageOutputSource(image);
    expect(result).toBeUndefined();
  });

  it('handles HTTP URL with query parameters', () => {
    const image = {
      data: 'https://example.com/image.png?size=large&format=webp',
      mimeType: 'image/png',
    };
    const result = resolveEvalImageOutputSource(image);
    expect(result).toBe('https://example.com/image.png?size=large&format=webp');
  });

  it('handles HTTP URL with fragment', () => {
    const image = { data: 'https://example.com/image.png#section', mimeType: 'image/png' };
    const result = resolveEvalImageOutputSource(image);
    expect(result).toBe('https://example.com/image.png#section');
  });

  it('handles lowercase http protocol', () => {
    const image = { data: 'http://example.com/image.png', mimeType: 'image/png' };
    const result = resolveEvalImageOutputSource(image);
    expect(result).toBe('http://example.com/image.png');
  });

  it('rejects uppercase HTTP protocol (implementation uses case-sensitive regex)', () => {
    // The implementation uses /^https?:\/\// which only matches lowercase http/https
    const image = { data: 'HTTP://example.com/image.png', mimeType: 'image/png' };
    const result = resolveEvalImageOutputSource(image);
    // Should fall back to resolveImageSource which also won't match uppercase
    expect(result).toBeUndefined();
  });

  it('rejects ftp URLs (not http/https)', () => {
    const image = { data: 'ftp://example.com/image.png', mimeType: 'image/png' };
    const result = resolveEvalImageOutputSource(image);
    expect(result).toBeUndefined();
  });

  it('rejects file URLs', () => {
    const image = { data: 'file:///path/to/image.png', mimeType: 'image/png' };
    const result = resolveEvalImageOutputSource(image);
    expect(result).toBeUndefined();
  });

  it('rejects data string with leading whitespace (regex requires start of string)', () => {
    // The regex /^https?:\/\// requires the string to start with http/https
    // Leading whitespace causes the regex to fail
    const image = { data: '  https://example.com/image.png  ', mimeType: 'image/png' };
    const result = resolveEvalImageOutputSource(image);
    // Should fall back to resolveImageSource which also won't match with leading whitespace
    expect(result).toBeUndefined();
  });
});
