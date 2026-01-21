import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getVideoMimeType,
  isWithinInlineLimit,
  resolveVideoBytes,
  VIDEO_INLINE_LIMIT_BYTES,
  videoToBase64,
} from '../../src/util/video';

// Mock dependencies
vi.mock('../../src/blobs', () => ({
  getBlobByHash: vi.fn(),
}));

vi.mock('../../src/storage', () => ({
  retrieveMedia: vi.fn(),
}));

vi.mock('../../src/util/fetch/index', () => ({
  fetchWithProxy: vi.fn(),
}));

vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('video utilities', () => {
  describe('VIDEO_INLINE_LIMIT_BYTES', () => {
    it('should be 20MB', () => {
      expect(VIDEO_INLINE_LIMIT_BYTES).toBe(20 * 1024 * 1024);
    });
  });

  describe('videoToBase64', () => {
    it('should convert buffer to base64 string', () => {
      const buffer = Buffer.from('test video content');
      const result = videoToBase64(buffer);
      expect(result).toBe(buffer.toString('base64'));
    });

    it('should handle empty buffer', () => {
      const buffer = Buffer.alloc(0);
      const result = videoToBase64(buffer);
      expect(result).toBe('');
    });
  });

  describe('isWithinInlineLimit', () => {
    it('should return true for small videos', () => {
      const smallBuffer = Buffer.alloc(1024 * 1024); // 1MB
      expect(isWithinInlineLimit(smallBuffer)).toBe(true);
    });

    it('should return true for videos under the limit', () => {
      const limitBuffer = Buffer.alloc(VIDEO_INLINE_LIMIT_BYTES - 1);
      expect(isWithinInlineLimit(limitBuffer)).toBe(true);
    });

    it('should return false for large videos', () => {
      const largeBuffer = Buffer.alloc(VIDEO_INLINE_LIMIT_BYTES + 1024 * 1024); // limit + 1MB
      expect(isWithinInlineLimit(largeBuffer)).toBe(false);
    });

    it('should return false for exactly the limit', () => {
      const exactBuffer = Buffer.alloc(VIDEO_INLINE_LIMIT_BYTES);
      expect(isWithinInlineLimit(exactBuffer)).toBe(false);
    });
  });

  describe('getVideoMimeType', () => {
    it('should return correct MIME type for mp4', () => {
      expect(getVideoMimeType('mp4')).toBe('video/mp4');
    });

    it('should return correct MIME type for webm', () => {
      expect(getVideoMimeType('webm')).toBe('video/webm');
    });

    it('should return correct MIME type for mov', () => {
      expect(getVideoMimeType('mov')).toBe('video/quicktime');
    });

    it('should return correct MIME type for avi', () => {
      expect(getVideoMimeType('avi')).toBe('video/x-msvideo');
    });

    it('should return correct MIME type for mkv', () => {
      expect(getVideoMimeType('mkv')).toBe('video/x-matroska');
    });

    it('should be case insensitive', () => {
      expect(getVideoMimeType('MP4')).toBe('video/mp4');
      expect(getVideoMimeType('WEBM')).toBe('video/webm');
    });

    it('should default to mp4 for unknown formats', () => {
      expect(getVideoMimeType('unknown')).toBe('video/mp4');
    });

    it('should default to mp4 for undefined', () => {
      expect(getVideoMimeType(undefined)).toBe('video/mp4');
    });
  });

  describe('resolveVideoBytes', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should resolve video from blobRef', async () => {
      const mockBlobData = Buffer.from('video data from blob');
      const { getBlobByHash } = await import('../../src/blobs');
      vi.mocked(getBlobByHash).mockResolvedValue({
        data: mockBlobData,
        metadata: { mimeType: 'video/webm' },
      } as any);

      const result = await resolveVideoBytes({
        blobRef: {
          hash: 'abc123',
          uri: 'blob://abc123',
          mimeType: 'video/webm',
          sizeBytes: 100,
          provider: 'test',
        },
      });

      expect(result.buffer).toEqual(mockBlobData);
      expect(result.mimeType).toBe('video/webm');
      expect(getBlobByHash).toHaveBeenCalledWith('abc123');
    });

    it('should default to video/mp4 if blobRef has no mimeType', async () => {
      const mockBlobData = Buffer.from('video data');
      const { getBlobByHash } = await import('../../src/blobs');
      vi.mocked(getBlobByHash).mockResolvedValue({
        data: mockBlobData,
        metadata: {},
      } as any);

      const result = await resolveVideoBytes({
        blobRef: {
          hash: 'abc123',
          uri: 'blob://abc123',
          mimeType: '',
          sizeBytes: 100,
          provider: 'test',
        },
      });

      expect(result.mimeType).toBe('video/mp4');
    });

    it('should resolve video from storageRef', async () => {
      const mockBuffer = Buffer.from('video from storage');
      const { retrieveMedia } = await import('../../src/storage');
      vi.mocked(retrieveMedia).mockResolvedValue(mockBuffer);

      const result = await resolveVideoBytes({
        storageRef: { key: 'video/test123.webm' },
      });

      expect(result.buffer).toEqual(mockBuffer);
      expect(result.mimeType).toBe('video/webm');
      expect(retrieveMedia).toHaveBeenCalledWith('video/test123.webm');
    });

    it('should resolve video from promptfoo://blob/ URL', async () => {
      const mockBlobData = Buffer.from('video from blob uri');
      const { getBlobByHash } = await import('../../src/blobs');
      vi.mocked(getBlobByHash).mockResolvedValue({
        data: mockBlobData,
        metadata: { mimeType: 'video/mp4' },
      } as any);

      const result = await resolveVideoBytes({
        url: 'promptfoo://blob/xyz789',
      });

      expect(result.buffer).toEqual(mockBlobData);
      expect(getBlobByHash).toHaveBeenCalledWith('xyz789');
    });

    it('should resolve video from storageRef: URL', async () => {
      const mockBuffer = Buffer.from('video from storage url');
      const { retrieveMedia } = await import('../../src/storage');
      vi.mocked(retrieveMedia).mockResolvedValue(mockBuffer);

      const result = await resolveVideoBytes({
        url: 'storageRef:video/abc.mp4',
      });

      expect(result.buffer).toEqual(mockBuffer);
      expect(result.mimeType).toBe('video/mp4');
      expect(retrieveMedia).toHaveBeenCalledWith('video/abc.mp4');
    });

    it('should resolve video from HTTP URL', async () => {
      const mockBuffer = Buffer.from('video from http');
      const { fetchWithProxy } = await import('../../src/util/fetch/index');
      vi.mocked(fetchWithProxy).mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockBuffer.buffer),
        headers: {
          get: (name: string) => (name === 'content-type' ? 'video/quicktime' : null),
        },
      } as any);

      const result = await resolveVideoBytes({
        url: 'https://example.com/video.mov',
      });

      expect(result.buffer).toEqual(Buffer.from(mockBuffer.buffer));
      expect(result.mimeType).toBe('video/quicktime');
      expect(fetchWithProxy).toHaveBeenCalledWith('https://example.com/video.mov');
    });

    it('should throw error when no valid source is found', async () => {
      await expect(resolveVideoBytes({})).rejects.toThrow(
        '[VideoRubric] No valid video source found',
      );
    });

    it('should throw error when HTTP fetch fails', async () => {
      const { fetchWithProxy } = await import('../../src/util/fetch/index');
      vi.mocked(fetchWithProxy).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as any);

      await expect(resolveVideoBytes({ url: 'https://example.com/missing.mp4' })).rejects.toThrow(
        '[VideoRubric] Failed to download video from URL: 404 Not Found',
      );
    });

    it('should prioritize blobRef over storageRef', async () => {
      const mockBlobData = Buffer.from('blob data');
      const { getBlobByHash } = await import('../../src/blobs');
      const { retrieveMedia } = await import('../../src/storage');
      vi.mocked(getBlobByHash).mockResolvedValue({
        data: mockBlobData,
        metadata: { mimeType: 'video/mp4' },
      } as any);

      const result = await resolveVideoBytes({
        blobRef: {
          hash: 'abc',
          uri: 'blob://abc',
          mimeType: 'video/mp4',
          sizeBytes: 100,
          provider: 'test',
        },
        storageRef: { key: 'should-not-be-used' },
      });

      expect(result.buffer).toEqual(mockBlobData);
      expect(getBlobByHash).toHaveBeenCalled();
      expect(retrieveMedia).not.toHaveBeenCalled();
    });

    it('should prioritize storageRef over url', async () => {
      const mockBuffer = Buffer.from('storage data');
      const { retrieveMedia } = await import('../../src/storage');
      const { fetchWithProxy } = await import('../../src/util/fetch/index');
      vi.mocked(retrieveMedia).mockResolvedValue(mockBuffer);

      const result = await resolveVideoBytes({
        storageRef: { key: 'video/test.mp4' },
        url: 'https://should-not-be-used.com/video.mp4',
      });

      expect(result.buffer).toEqual(mockBuffer);
      expect(retrieveMedia).toHaveBeenCalled();
      expect(fetchWithProxy).not.toHaveBeenCalled();
    });
  });
});
