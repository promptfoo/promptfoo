import { describe, expect, it } from 'vitest';
import { getVideoMimeType, isWithinInlineLimit, videoToBase64 } from '../../src/util/video';

describe('video utilities', () => {
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

    it('should return true for videos at the limit', () => {
      const limitBuffer = Buffer.alloc(19 * 1024 * 1024); // 19MB (under 20MB)
      expect(isWithinInlineLimit(limitBuffer)).toBe(true);
    });

    it('should return false for large videos', () => {
      const largeBuffer = Buffer.alloc(21 * 1024 * 1024); // 21MB
      expect(isWithinInlineLimit(largeBuffer)).toBe(false);
    });

    it('should return false for exactly 20MB', () => {
      const exactBuffer = Buffer.alloc(20 * 1024 * 1024); // exactly 20MB
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
});
