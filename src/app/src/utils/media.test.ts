import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveVideoSource } from './media';

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

    it('returns legacy /api/ paths unchanged (browser resolves relative to domain)', () => {
      vi.mocked(useApiConfig.getState).mockReturnValue(mockState('https://api.example.com'));

      const result = resolveVideoSource({
        url: '/api/output/video/test-uuid/video.mp4',
      });

      // Legacy /api/ paths starting with / are returned as-is for browser resolution
      expect(result?.src).toBe('/api/output/video/test-uuid/video.mp4');
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
