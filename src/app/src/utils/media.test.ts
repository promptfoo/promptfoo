import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatBytes,
  formatCost,
  formatLatency,
  generateMediaFilename,
  getExtensionFromMimeType,
  hashToNumber,
  resolveVideoSource,
} from './media';

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

describe('formatBytes', () => {
  it('should format zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('should format bytes without conversion', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('should format kilobytes with one decimal', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(2048)).toBe('2 KB');
  });

  it('should format megabytes with one decimal', () => {
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(formatBytes(10 * 1024 * 1024)).toBe('10 MB');
  });

  it('should format gigabytes with one decimal', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
  });

  it('should format terabytes with one decimal', () => {
    expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe('1 TB');
    expect(formatBytes(1.75 * 1024 * 1024 * 1024 * 1024)).toBe('1.8 TB');
  });

  it('should respect custom decimal precision', () => {
    expect(formatBytes(1536, 0)).toBe('2 KB');
    expect(formatBytes(1536, 2)).toBe('1.5 KB');
    expect(formatBytes(1234567, 3)).toBe('1.177 MB');
  });
});

describe('formatLatency', () => {
  it('should format milliseconds under 1 second', () => {
    expect(formatLatency(0)).toBe('0ms');
    expect(formatLatency(500)).toBe('500ms');
    expect(formatLatency(999)).toBe('999ms');
  });

  it('should format seconds with one decimal', () => {
    expect(formatLatency(1000)).toBe('1.0s');
    expect(formatLatency(1500)).toBe('1.5s');
    expect(formatLatency(2345)).toBe('2.3s');
    expect(formatLatency(10000)).toBe('10.0s');
  });

  it('should round correctly', () => {
    expect(formatLatency(1549)).toBe('1.5s');
    expect(formatLatency(1551)).toBe('1.6s');
  });
});

describe('formatCost', () => {
  it('should format very small costs with 4 decimals', () => {
    expect(formatCost(0.0001)).toBe('$0.0001');
    expect(formatCost(0.0099)).toBe('$0.0099');
    expect(formatCost(0.00001)).toBe('$0.0000');
  });

  it('should format regular costs with 2 decimals', () => {
    expect(formatCost(0.01)).toBe('$0.01');
    expect(formatCost(0.5)).toBe('$0.50');
    expect(formatCost(1.0)).toBe('$1.00');
    expect(formatCost(10.99)).toBe('$10.99');
    expect(formatCost(100)).toBe('$100.00');
  });

  it('should round correctly for 2 decimal places', () => {
    // Note: 0.015 may round to $0.01 due to floating point precision
    expect(formatCost(0.015)).toBe('$0.01');
    expect(formatCost(1.999)).toBe('$2.00');
    expect(formatCost(0.016)).toBe('$0.02');
  });

  it('should handle zero cost', () => {
    expect(formatCost(0)).toBe('$0.0000');
  });
});

describe('hashToNumber', () => {
  it('should generate consistent hash for same string', () => {
    const hash1 = hashToNumber('test-string');
    const hash2 = hashToNumber('test-string');
    expect(hash1).toBe(hash2);
  });

  it('should generate different hashes for different strings', () => {
    const hash1 = hashToNumber('string1');
    const hash2 = hashToNumber('string2');
    expect(hash1).not.toBe(hash2);
  });

  it('should always return positive numbers', () => {
    expect(hashToNumber('test')).toBeGreaterThanOrEqual(0);
    expect(hashToNumber('')).toBeGreaterThanOrEqual(0);
    expect(hashToNumber('negative-hash-test')).toBeGreaterThanOrEqual(0);
  });

  it('should handle empty string', () => {
    expect(hashToNumber('')).toBe(0);
  });

  it('should handle special characters', () => {
    const hash = hashToNumber('!@#$%^&*()');
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(typeof hash).toBe('number');
  });

  it('should handle unicode characters', () => {
    const hash = hashToNumber('🎨🎬🎵');
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(typeof hash).toBe('number');
  });
});

describe('getExtensionFromMimeType', () => {
  it('should extract basic image extensions', () => {
    expect(getExtensionFromMimeType('image/png')).toBe('png');
    expect(getExtensionFromMimeType('image/gif')).toBe('gif');
    expect(getExtensionFromMimeType('image/webp')).toBe('webp');
  });

  it('should map jpeg to jpg', () => {
    expect(getExtensionFromMimeType('image/jpeg')).toBe('jpg');
  });

  it('should map svg+xml to svg', () => {
    expect(getExtensionFromMimeType('image/svg+xml')).toBe('svg');
  });

  it('should map x-wav to wav', () => {
    expect(getExtensionFromMimeType('audio/x-wav')).toBe('wav');
  });

  it('should map mpeg to mp3', () => {
    expect(getExtensionFromMimeType('audio/mpeg')).toBe('mp3');
  });

  it('should map quicktime to mov', () => {
    expect(getExtensionFromMimeType('video/quicktime')).toBe('mov');
  });

  it('should map x-matroska to mkv', () => {
    expect(getExtensionFromMimeType('video/x-matroska')).toBe('mkv');
  });

  it('should handle video extensions', () => {
    expect(getExtensionFromMimeType('video/mp4')).toBe('mp4');
    expect(getExtensionFromMimeType('video/webm')).toBe('webm');
  });

  it('should handle audio extensions', () => {
    expect(getExtensionFromMimeType('audio/ogg')).toBe('ogg');
    expect(getExtensionFromMimeType('audio/aac')).toBe('aac');
  });

  it('should handle complex MIME types with + by taking first part', () => {
    expect(getExtensionFromMimeType('application/vnd.api+json')).toBe('vnd.api');
  });

  it('should return bin for missing subtype', () => {
    expect(getExtensionFromMimeType('application')).toBe('bin');
    expect(getExtensionFromMimeType('image/')).toBe('bin');
  });

  it('should return bin for empty MIME type', () => {
    expect(getExtensionFromMimeType('')).toBe('bin');
  });
});

describe('generateMediaFilename', () => {
  it('should generate filename with first 12 chars of hash', () => {
    const filename = generateMediaFilename('abcdef123456789012345678', 'image/png');
    expect(filename).toBe('abcdef123456.png');
  });

  it('should use correct extension from MIME type', () => {
    expect(generateMediaFilename('hash123', 'image/jpeg')).toBe('hash123.jpg');
    expect(generateMediaFilename('hash456', 'video/mp4')).toBe('hash456.mp4');
    expect(generateMediaFilename('hash789', 'audio/mpeg')).toBe('hash789.mp3');
  });

  it('should handle short hashes', () => {
    const filename = generateMediaFilename('abc', 'image/png');
    expect(filename).toBe('abc.png');
  });

  it('should handle exact 12 character hash', () => {
    const filename = generateMediaFilename('123456789012', 'video/webm');
    expect(filename).toBe('123456789012.webm');
  });

  it('should apply special MIME type mappings', () => {
    expect(generateMediaFilename('hash', 'image/svg+xml')).toBe('hash.svg');
    expect(generateMediaFilename('hash', 'video/quicktime')).toBe('hash.mov');
  });

  it('should use bin extension for unknown MIME types', () => {
    expect(generateMediaFilename('hash', 'application/unknown')).toBe('hash.unknown');
    expect(generateMediaFilename('hash', '')).toBe('hash.bin');
  });
});

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
