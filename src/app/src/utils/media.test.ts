import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveBlobUri, resolveImageSource, resolveVideoSource } from './media';

// Mock the store
vi.mock('@app/stores/apiConfig', () => ({
  default: {
    getState: vi.fn(() => ({ apiBaseUrl: '' })),
  },
}));

import useApiConfig from '@app/stores/apiConfig';

const mockState = (apiBaseUrl: string) =>
  ({
    apiBaseUrl,
    setApiBaseUrl: vi.fn(),
    fetchingPromise: null,
    setFetchingPromise: vi.fn(),
    persistApiBaseUrl: false,
    enablePersistApiBaseUrl: vi.fn(),
  }) as ReturnType<typeof useApiConfig.getState>;

describe('resolveVideoSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useApiConfig.getState).mockReturnValue(mockState(''));
  });

  describe('null/undefined handling', () => {
    it('returns null for null input', () => {
      expect(resolveVideoSource(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(resolveVideoSource(undefined)).toBeNull();
    });

    it('returns null for empty object with no resolvable fields', () => {
      expect(resolveVideoSource({})).toBeNull();
    });
  });

  describe('blob reference resolution', () => {
    it('resolves promptfoo:// blob URI in blobRef string', () => {
      const result = resolveVideoSource({
        blobRef: 'promptfoo://blob/abc123def456789012345678901234567890',
      });

      expect(result).toEqual({
        src: '/api/blobs/abc123def456789012345678901234567890',
        type: 'video/mp4',
        poster: undefined,
      });
    });

    it('resolves blobRef object with hash', () => {
      const result = resolveVideoSource({
        blobRef: { hash: 'abc123def456789012345678901234567890' },
      });

      expect(result).toEqual({
        src: '/api/blobs/abc123def456789012345678901234567890',
        type: 'video/mp4',
        poster: undefined,
      });
    });

    it('resolves blobRef object with uri', () => {
      const result = resolveVideoSource({
        blobRef: { uri: 'promptfoo://blob/abc123def456789012345678901234567890' },
      });

      expect(result).toEqual({
        src: '/api/blobs/abc123def456789012345678901234567890',
        type: 'video/mp4',
        poster: undefined,
      });
    });
  });

  describe('storage reference resolution', () => {
    it('resolves storageRef object with key', () => {
      const result = resolveVideoSource({
        storageRef: { key: 'video/abc123.mp4' },
      });

      expect(result).toEqual({
        src: '/api/media/video/abc123.mp4',
        type: 'video/mp4',
        poster: undefined,
      });
    });

    it('normalizes storageRef key with leading slash', () => {
      const result = resolveVideoSource({
        storageRef: { key: '/video/abc123.mp4' },
      });

      expect(result).toEqual({
        src: '/api/media/video/abc123.mp4',
        type: 'video/mp4',
        poster: undefined,
      });
    });

    it('resolves storageRef: format in url field', () => {
      const result = resolveVideoSource({
        url: 'storageRef:video/abc123.mp4',
      });

      expect(result).toEqual({
        src: '/api/media/video/abc123.mp4',
        type: 'video/mp4',
        poster: undefined,
      });
    });
  });

  describe('URL resolution', () => {
    it('resolves legacy /api/ paths', () => {
      const result = resolveVideoSource({
        url: '/api/output/video/test-uuid/video.mp4',
      });

      expect(result).toEqual({
        src: '/api/output/video/test-uuid/video.mp4',
        type: 'video/mp4',
        poster: undefined,
      });
    });

    it('resolves https:// URLs', () => {
      const result = resolveVideoSource({
        url: 'https://example.com/video.mp4',
      });

      expect(result).toEqual({
        src: 'https://example.com/video.mp4',
        type: 'video/mp4',
        poster: undefined,
      });
    });

    it('resolves http:// URLs', () => {
      const result = resolveVideoSource({
        url: 'http://example.com/video.mp4',
      });

      expect(result).toEqual({
        src: 'http://example.com/video.mp4',
        type: 'video/mp4',
        poster: undefined,
      });
    });

    it('resolves data: URIs', () => {
      const result = resolveVideoSource({
        url: 'data:video/mp4;base64,AAAA',
      });

      expect(result).toEqual({
        src: 'data:video/mp4;base64,AAAA',
        type: 'video/mp4',
        poster: undefined,
      });
    });
  });

  describe('format handling', () => {
    it('uses mp4 as default format', () => {
      const result = resolveVideoSource({
        url: 'https://example.com/video.mp4',
      });

      expect(result?.type).toBe('video/mp4');
    });

    it('uses custom format when specified', () => {
      const result = resolveVideoSource({
        url: 'https://example.com/video.webm',
        format: 'webm',
      });

      expect(result?.type).toBe('video/webm');
    });
  });

  describe('thumbnail/poster resolution', () => {
    it('resolves storageRef: thumbnail', () => {
      const result = resolveVideoSource({
        url: 'https://example.com/video.mp4',
        thumbnail: 'storageRef:video/thumb.webp',
      });

      expect(result?.poster).toBe('/api/media/video/thumb.webp');
    });

    it('resolves /api/ thumbnail paths', () => {
      const result = resolveVideoSource({
        url: 'https://example.com/video.mp4',
        thumbnail: '/api/output/video/test-uuid/thumbnail.webp',
      });

      expect(result?.poster).toBe('/api/output/video/test-uuid/thumbnail.webp');
    });

    it('resolves https:// thumbnail URLs', () => {
      const result = resolveVideoSource({
        url: 'https://example.com/video.mp4',
        thumbnail: 'https://example.com/thumb.jpg',
      });

      expect(result?.poster).toBe('https://example.com/thumb.jpg');
    });

    it('resolves data: thumbnail URIs', () => {
      const result = resolveVideoSource({
        url: 'https://example.com/video.mp4',
        thumbnail: 'data:image/webp;base64,AAAA',
      });

      expect(result?.poster).toBe('data:image/webp;base64,AAAA');
    });

    it('returns undefined poster for unresolvable thumbnail', () => {
      const result = resolveVideoSource({
        url: 'https://example.com/video.mp4',
        thumbnail: 'invalid-thumbnail-path',
      });

      expect(result?.poster).toBeUndefined();
    });

    it('should return an object with the resolved poster URL when the video object includes a thumbnail field with a blob URI, HTTP(S) URL, or legacy API path', () => {
      const videoObject1 = {
        url: 'https://example.com/test.mp4',
        thumbnail: 'promptfoo://blob/thumbnail-blob-hash',
      };
      const result1 = resolveVideoSource(videoObject1);
      expect(result1?.poster).toBe('/api/blobs/thumbnail-blob-hash');

      const videoObject2 = {
        url: 'https://example.com/test.mp4',
        thumbnail: 'https://example.com/thumbnail.jpg',
      };
      const result2 = resolveVideoSource(videoObject2);
      expect(result2?.poster).toBe('https://example.com/thumbnail.jpg');

      const videoObject3 = {
        url: 'https://example.com/test.mp4',
        thumbnail: '/api/thumbnails/thumbnail.jpg',
      };
      const result3 = resolveVideoSource(videoObject3);
      expect(result3?.poster).toBe('/api/thumbnails/thumbnail.jpg');
    });
  });

  describe('storageRef resolution', () => {
    it('should return an object with the resolved storageRef URL as src and type video/mp4 when given a video object with a valid storageRef.key and no blobRef or format specified', () => {
      const videoObject = {
        storageRef: { key: 'mock-storage-key' },
      };

      const result = resolveVideoSource(videoObject);

      expect(result).not.toBeNull();
      expect(result).toEqual({
        src: '/api/media/mock-storage-key',
        type: 'video/mp4',
        poster: undefined,
      });
    });
  });

  describe('priority order', () => {
    it('prefers blobRef over storageRef', () => {
      const result = resolveVideoSource({
        blobRef: 'promptfoo://blob/abc123def456789012345678901234567890',
        storageRef: { key: 'video/other.mp4' },
        url: 'https://example.com/video.mp4',
      });

      expect(result?.src).toBe('/api/blobs/abc123def456789012345678901234567890');
    });

    it('prefers storageRef over url', () => {
      const result = resolveVideoSource({
        storageRef: { key: 'video/abc123.mp4' },
        url: 'https://example.com/video.mp4',
      });

      expect(result?.src).toBe('/api/media/video/abc123.mp4');
    });

    it('should prioritize blobRef over storageRef and url when all are defined', () => {
      const videoObject = {
        blobRef: { hash: 'blob-hash' },
        storageRef: { key: 'storage-key' },
        url: 'http://example.com/video.mp4',
      };
      const result = resolveVideoSource(videoObject);
      expect(result?.src).toBe('/api/blobs/blob-hash');
    });
  });

  describe('direct HTTP(S) URL resolution', () => {
    it('should return an object with the direct HTTP(S) URL as src and type video/mp4 when given a video object with a url starting with http:// or https:// and no blobRef or storageRef', () => {
      const videoObject = {
        url: 'https://example.com/video.mp4',
      };

      const result = resolveVideoSource(videoObject);

      expect(result).not.toBeNull();
      expect(result).toEqual({
        src: 'https://example.com/video.mp4',
        type: 'video/mp4',
        poster: undefined,
      });
    });
  });

  describe('blob reference resolution', () => {
    it('should return an object with resolved blob URL as src and type video/mp4 when given a video object with valid blobRef and no format', () => {
      const videoObject = {
        blobRef: { hash: 'mock-blob-hash' },
      };

      const result = resolveVideoSource(videoObject);

      expect(result).not.toBeNull();
      expect(result).toEqual({
        src: '/api/blobs/mock-blob-hash',
        type: 'video/mp4',
        poster: undefined,
      });
    });
  });

  describe('format handling', () => {
    it('should return an object with the correct type when the video object specifies a format', () => {
      const videoObject = {
        blobRef: { hash: 'mock-blob-hash' },
        format: 'webm',
      };
      const result = resolveVideoSource(videoObject);
      expect(result?.type).toBe('video/webm');
    });
  });

  describe('apiBaseUrl integration', () => {
    it('prepends apiBaseUrl to blob paths', () => {
      vi.mocked(useApiConfig.getState).mockReturnValue(mockState('https://api.example.com'));

      const result = resolveVideoSource({
        blobRef: 'promptfoo://blob/abc123def456789012345678901234567890',
      });

      expect(result?.src).toBe(
        'https://api.example.com/api/blobs/abc123def456789012345678901234567890',
      );
    });

    it('prepends apiBaseUrl to storageRef paths', () => {
      vi.mocked(useApiConfig.getState).mockReturnValue(mockState('https://api.example.com'));

      const result = resolveVideoSource({
        storageRef: { key: 'video/abc123.mp4' },
      });

      expect(result?.src).toBe('https://api.example.com/api/media/video/abc123.mp4');
    });

    it('returns legacy /api/ paths unchanged when no apiBaseUrl is set (browser resolves relative to domain)', () => {
      // When no apiBaseUrl is set, relative paths are returned as-is for browser resolution
      vi.mocked(useApiConfig.getState).mockReturnValue(mockState(''));

      const result = resolveVideoSource({
        url: '/api/output/video/test-uuid/video.mp4',
      });

      expect(result?.src).toBe('/api/output/video/test-uuid/video.mp4');
    });

    it('prepends apiBaseUrl to legacy /api/ paths when apiBaseUrl is set', () => {
      vi.mocked(useApiConfig.getState).mockReturnValue(mockState('https://example.com'));

      const videoObject = {
        url: '/api/output/video/123/video.mp4',
      };

      const result = resolveVideoSource(videoObject);

      expect(result).not.toBeNull();
      expect(result).toEqual({
        src: 'https://example.com/api/output/video/123/video.mp4',
        type: 'video/mp4',
        poster: undefined,
      });
    });

    it('does not modify absolute https:// URLs', () => {
      vi.mocked(useApiConfig.getState).mockReturnValue(mockState('https://api.example.com'));

      const result = resolveVideoSource({
        url: 'https://other.example.com/video.mp4',
      });

      expect(result?.src).toBe('https://other.example.com/video.mp4');
    });
  });
});

describe('resolveBlobUri security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useApiConfig.getState).mockReturnValue(mockState(''));
  });

  it('should NOT pass through external http:// URLs', () => {
    expect(resolveBlobUri('http://example.com/image.png')).toBeUndefined();
  });

  it('should NOT pass through external https:// URLs', () => {
    expect(resolveBlobUri('https://example.com/image.png')).toBeUndefined();
  });

  it('should NOT pass through protocol-relative URLs', () => {
    expect(resolveBlobUri('//example.com/image.png')).toBeUndefined();
  });

  it('should NOT pass through arbitrary root paths', () => {
    expect(resolveBlobUri('/etc/passwd')).toBeUndefined();
    expect(resolveBlobUri('/some/path')).toBeUndefined();
  });

  it('should pass through /api/ paths', () => {
    expect(resolveBlobUri('/api/blobs/abc123')).toBe('/api/blobs/abc123');
    expect(resolveBlobUri('/api/media/test.png')).toBe('/api/media/test.png');
  });

  it('should pass through data: URIs', () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgo=';
    expect(resolveBlobUri(dataUri)).toBe(dataUri);
  });

  it('should convert promptfoo://blob/ URIs', () => {
    expect(resolveBlobUri('promptfoo://blob/abc123')).toBe('/api/blobs/abc123');
  });

  it('should convert storageRef: URIs', () => {
    expect(resolveBlobUri('storageRef:images/test.png')).toBe('/api/media/images/test.png');
  });
});

describe('resolveImageSource security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useApiConfig.getState).mockReturnValue(mockState(''));
  });

  it('should NOT return external URLs as image sources', () => {
    expect(resolveImageSource('https://example.com/foo')).toBeUndefined();
    expect(resolveImageSource('http://example.com/foo')).toBeUndefined();
  });

  it('should NOT return URL-like strings in test data as image sources', () => {
    // These are examples from the vulnerability report
    expect(resolveImageSource('https://example.com/foo')).toBeUndefined();
    expect(resolveImageSource('https://example.com/bar is a useful link')).toBeUndefined();
    expect(resolveImageSource('https://attacker.com/leak sensitive data')).toBeUndefined();
  });

  it('should return data: URIs', () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgo=';
    expect(resolveImageSource(dataUri)).toBe(dataUri);
  });

  it('should return promptfoo blob references', () => {
    expect(resolveImageSource('promptfoo://blob/abc123')).toBe('/api/blobs/abc123');
  });

  it('should return storage references', () => {
    expect(resolveImageSource('storageRef:images/test.png')).toBe('/api/media/images/test.png');
  });

  it('should convert long base64 strings to data URIs', () => {
    const base64 = 'A'.repeat(100); // Long enough to be treated as base64
    expect(resolveImageSource(base64)).toBe(`data:image/png;base64,${base64}`);
  });

  it('should return undefined for short strings that could be session IDs', () => {
    expect(resolveImageSource('abc123')).toBeUndefined();
    expect(resolveImageSource('short-string')).toBeUndefined();
  });
});
