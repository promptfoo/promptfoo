import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getVideoMimeType,
  resolveVideoBytes,
  VIDEO_INLINE_LIMIT_BYTES,
} from '../../src/util/video';

// Mock dependencies
vi.mock('../../src/blobs', () => ({
  getBlobByHash: vi.fn(),
}));

vi.mock('../../src/storage', () => ({
  retrieveMedia: vi.fn(),
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
      expect(getVideoMimeType('avi')).toBe('video/avi');
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
      vi.resetAllMocks();
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
          mimeType: 'video/webm',
          sizeBytes: 100,
        },
      });

      expect(result.buffer).toEqual(mockBlobData);
      expect(result.mimeType).toBe('video/webm');
      expect(getBlobByHash).toHaveBeenCalledWith('abc123', expect.any(Number));
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
          mimeType: '',
          sizeBytes: 100,
        },
      });

      expect(result.mimeType).toBe('video/mp4');
    });

    it('should use blobRef mimeType when blob metadata does not include one', async () => {
      const mockBlobData = Buffer.from('video data');
      const { getBlobByHash } = await import('../../src/blobs');
      vi.mocked(getBlobByHash).mockResolvedValue({
        data: mockBlobData,
        metadata: {},
      } as any);

      const result = await resolveVideoBytes({
        blobRef: {
          hash: 'abc123',
          mimeType: 'video/webm',
          sizeBytes: 100,
        },
      });

      expect(result.mimeType).toBe('video/webm');
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
      expect(retrieveMedia).toHaveBeenCalledWith('video/test123.webm', expect.any(Number));
    });

    it('should use the mapped MIME type for stored QuickTime videos', async () => {
      const { retrieveMedia } = await import('../../src/storage');
      vi.mocked(retrieveMedia).mockResolvedValue(Buffer.from('quicktime video'));

      const result = await resolveVideoBytes({
        storageRef: { key: 'video/test123.mov' },
      });

      expect(result.mimeType).toBe('video/quicktime');
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
      expect(getBlobByHash).toHaveBeenCalledWith('xyz789', expect.any(Number));
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
      expect(retrieveMedia).toHaveBeenCalledWith('video/abc.mp4', expect.any(Number));
    });

    it('should throw error when no valid source is found', async () => {
      await expect(resolveVideoBytes({})).rejects.toThrow(
        'Video grading requires a managed blob or media storage reference',
      );
    });

    it('should reject external video URLs instead of fetching provider-controlled locations', async () => {
      await expect(resolveVideoBytes({ url: 'https://example.com/video.mp4' })).rejects.toThrow(
        'Video grading requires a managed blob or media storage reference',
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
          mimeType: 'video/mp4',
          sizeBytes: 100,
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
      vi.mocked(retrieveMedia).mockResolvedValue(mockBuffer);

      const result = await resolveVideoBytes({
        storageRef: { key: 'video/test.mp4' },
        url: 'https://should-not-be-used.com/video.mp4',
      });

      expect(result.buffer).toEqual(mockBuffer);
      expect(retrieveMedia).toHaveBeenCalled();
    });
  });
});
