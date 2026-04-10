import useApiConfig from '@app/stores/apiConfig';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getBlobUrl,
  getMediaUrl,
  isBlobRef,
  isStorageRef,
  parseBlobRef,
  parseStorageRef,
  resolveAudioUrl,
  resolveAudioUrlSync,
  resolveImageUrl,
  resolveImageUrlSync,
  resolveMediaUrl,
  resolveMediaValue,
  resolveVideoUrlSync,
} from './mediaStorage';

// Mock the apiConfig store
vi.mock('@app/stores/apiConfig', () => ({
  default: {
    getState: vi.fn(),
  },
}));

describe('mediaStorage', () => {
  beforeEach(() => {
    // Reset mock before each test
    vi.mocked(useApiConfig.getState).mockReturnValue({
      apiBaseUrl: 'http://localhost:15500',
    } as ReturnType<typeof useApiConfig.getState>);
  });

  describe('isStorageRef', () => {
    it('should return true for valid storage references', () => {
      expect(isStorageRef('storageRef:audio/test.mp3')).toBe(true);
      expect(isStorageRef('storageRef:image/test.png')).toBe(true);
      expect(isStorageRef('storageRef:video/test.mp4')).toBe(true);
      expect(isStorageRef('storageRef:any/path/here')).toBe(true);
    });

    it('should return false for non-storage references', () => {
      expect(isStorageRef('audio/test.mp3')).toBe(false);
      expect(isStorageRef('data:audio/mp3;base64,abc')).toBe(false);
      expect(isStorageRef('http://example.com/audio.mp3')).toBe(false);
      expect(isStorageRef('')).toBe(false);
    });

    it('should return false for non-string values', () => {
      expect(isStorageRef(null)).toBe(false);
      expect(isStorageRef(undefined)).toBe(false);
      expect(isStorageRef(123)).toBe(false);
      expect(isStorageRef({})).toBe(false);
      expect(isStorageRef([])).toBe(false);
    });
  });

  describe('isBlobRef', () => {
    it('should return true for valid blob references', () => {
      expect(isBlobRef('promptfoo://blob/abc123')).toBe(true);
      expect(isBlobRef('promptfoo://blob/xyz456def789')).toBe(true);
    });

    it('should return false for non-blob references', () => {
      expect(isBlobRef('storageRef:audio/test.mp3')).toBe(false);
      expect(isBlobRef('blob/abc123')).toBe(false);
      expect(isBlobRef('promptfoo://other/path')).toBe(false);
      expect(isBlobRef('')).toBe(false);
    });

    it('should return false for non-string values', () => {
      expect(isBlobRef(null)).toBe(false);
      expect(isBlobRef(undefined)).toBe(false);
      expect(isBlobRef(123)).toBe(false);
      expect(isBlobRef({})).toBe(false);
    });
  });

  describe('parseStorageRef', () => {
    it('should parse valid storage references', () => {
      expect(parseStorageRef('storageRef:audio/test.mp3')).toBe('audio/test.mp3');
      expect(parseStorageRef('storageRef:image/test.png')).toBe('image/test.png');
      expect(parseStorageRef('storageRef:video/test.mp4')).toBe('video/test.mp4');
      expect(parseStorageRef('storageRef:complex/path/with/slashes.jpg')).toBe(
        'complex/path/with/slashes.jpg',
      );
    });

    it('should return null for invalid storage references', () => {
      expect(parseStorageRef('audio/test.mp3')).toBe(null);
      expect(parseStorageRef('data:audio/mp3;base64,abc')).toBe(null);
      expect(parseStorageRef('')).toBe(null);
      expect(parseStorageRef('promptfoo://blob/abc123')).toBe(null);
    });
  });

  describe('parseBlobRef', () => {
    it('should parse valid blob references', () => {
      expect(parseBlobRef('promptfoo://blob/abc123')).toBe('abc123');
      expect(parseBlobRef('promptfoo://blob/xyz456def789')).toBe('xyz456def789');
    });

    it('should return null for invalid blob references', () => {
      expect(parseBlobRef('blob/abc123')).toBe(null);
      expect(parseBlobRef('storageRef:audio/test.mp3')).toBe(null);
      expect(parseBlobRef('')).toBe(null);
      expect(parseBlobRef('promptfoo://other/path')).toBe(null);
    });
  });

  describe('getMediaUrl', () => {
    it('should generate correct media URLs for valid storage refs', () => {
      expect(getMediaUrl('storageRef:audio/test.mp3')).toBe(
        'http://localhost:15500/api/media/audio/test.mp3',
      );
      expect(getMediaUrl('storageRef:image/test.png')).toBe(
        'http://localhost:15500/api/media/image/test.png',
      );
      expect(getMediaUrl('storageRef:video/test.mp4')).toBe(
        'http://localhost:15500/api/media/video/test.mp4',
      );
    });

    it('should return null for invalid storage refs', () => {
      expect(getMediaUrl('audio/test.mp3')).toBe(null);
      expect(getMediaUrl('data:audio/mp3;base64,abc')).toBe(null);
      expect(getMediaUrl('')).toBe(null);
    });

    it('should use apiBaseUrl from config', () => {
      vi.mocked(useApiConfig.getState).mockReturnValue({
        apiBaseUrl: 'https://production.example.com',
      } as ReturnType<typeof useApiConfig.getState>);

      expect(getMediaUrl('storageRef:audio/test.mp3')).toBe(
        'https://production.example.com/api/media/audio/test.mp3',
      );
    });
  });

  describe('getBlobUrl', () => {
    it('should generate correct blob URLs for valid blob refs', () => {
      expect(getBlobUrl('promptfoo://blob/abc123')).toBe('http://localhost:15500/api/blobs/abc123');
      expect(getBlobUrl('promptfoo://blob/xyz456')).toBe('http://localhost:15500/api/blobs/xyz456');
    });

    it('should return null for invalid blob refs', () => {
      expect(getBlobUrl('blob/abc123')).toBe(null);
      expect(getBlobUrl('storageRef:audio/test.mp3')).toBe(null);
      expect(getBlobUrl('')).toBe(null);
    });

    it('should use apiBaseUrl from config', () => {
      vi.mocked(useApiConfig.getState).mockReturnValue({
        apiBaseUrl: 'https://production.example.com',
      } as ReturnType<typeof useApiConfig.getState>);

      expect(getBlobUrl('promptfoo://blob/abc123')).toBe(
        'https://production.example.com/api/blobs/abc123',
      );
    });
  });

  describe('resolveMediaUrl', () => {
    it('should return null for undefined or empty values', () => {
      expect(resolveMediaUrl(undefined, 'audio/mp3')).toBe(null);
      expect(resolveMediaUrl('', 'audio/mp3')).toBe(null);
    });

    it('should resolve blob references', () => {
      expect(resolveMediaUrl('promptfoo://blob/abc123', 'audio/mp3')).toBe(
        'http://localhost:15500/api/blobs/abc123',
      );
    });

    it('should resolve storage references', () => {
      expect(resolveMediaUrl('storageRef:audio/test.mp3', 'audio/mp3')).toBe(
        'http://localhost:15500/api/media/audio/test.mp3',
      );
    });

    it('should return existing data URLs as-is', () => {
      const dataUrl = 'data:audio/mp3;base64,SGVsbG8gV29ybGQ=';
      expect(resolveMediaUrl(dataUrl, 'audio/mp3')).toBe(dataUrl);
    });

    it('should return existing http URLs as-is', () => {
      const httpUrl = 'http://example.com/audio.mp3';
      expect(resolveMediaUrl(httpUrl, 'audio/mp3')).toBe(httpUrl);
    });

    it('should return existing https URLs as-is', () => {
      const httpsUrl = 'https://example.com/audio.mp3';
      expect(resolveMediaUrl(httpsUrl, 'audio/mp3')).toBe(httpsUrl);
    });

    it('should convert base64 data to data URLs', () => {
      const base64Data = 'SGVsbG8gV29ybGQ=';
      expect(resolveMediaUrl(base64Data, 'audio/mp3')).toBe(
        'data:audio/mp3;base64,SGVsbG8gV29ybGQ=',
      );
    });

    it('should use correct MIME type for base64 conversion', () => {
      const base64Data = 'abc123';
      expect(resolveMediaUrl(base64Data, 'image/png')).toBe('data:image/png;base64,abc123');
      expect(resolveMediaUrl(base64Data, 'video/mp4')).toBe('data:video/mp4;base64,abc123');
    });
  });

  describe('resolveAudioUrlSync', () => {
    it('should resolve audio with default mp3 format', () => {
      expect(resolveAudioUrlSync('storageRef:audio/test.mp3')).toBe(
        'http://localhost:15500/api/media/audio/test.mp3',
      );
    });

    it('should resolve audio with custom format', () => {
      const base64Data = 'abc123';
      expect(resolveAudioUrlSync(base64Data, 'wav')).toBe('data:audio/wav;base64,abc123');
    });

    it('should return null for undefined', () => {
      expect(resolveAudioUrlSync(undefined)).toBe(null);
    });

    it('should handle various audio URL types', () => {
      expect(resolveAudioUrlSync('http://example.com/audio.mp3')).toBe(
        'http://example.com/audio.mp3',
      );
      expect(resolveAudioUrlSync('data:audio/mp3;base64,xyz')).toBe('data:audio/mp3;base64,xyz');
    });
  });

  describe('resolveImageUrlSync', () => {
    it('should resolve image with default png format', () => {
      expect(resolveImageUrlSync('storageRef:image/test.png')).toBe(
        'http://localhost:15500/api/media/image/test.png',
      );
    });

    it('should resolve image with custom format', () => {
      const base64Data = 'abc123';
      expect(resolveImageUrlSync(base64Data, 'jpeg')).toBe('data:image/jpeg;base64,abc123');
    });

    it('should return null for undefined', () => {
      expect(resolveImageUrlSync(undefined)).toBe(null);
    });

    it('should handle various image URL types', () => {
      expect(resolveImageUrlSync('https://example.com/image.png')).toBe(
        'https://example.com/image.png',
      );
      expect(resolveImageUrlSync('data:image/png;base64,xyz')).toBe('data:image/png;base64,xyz');
    });
  });

  describe('resolveVideoUrlSync', () => {
    it('should resolve video with default mp4 format', () => {
      expect(resolveVideoUrlSync('storageRef:video/test.mp4')).toBe(
        'http://localhost:15500/api/media/video/test.mp4',
      );
    });

    it('should resolve video with custom format', () => {
      const base64Data = 'abc123';
      expect(resolveVideoUrlSync(base64Data, 'webm')).toBe('data:video/webm;base64,abc123');
    });

    it('should return null for undefined', () => {
      expect(resolveVideoUrlSync(undefined)).toBe(null);
    });

    it('should handle various video URL types', () => {
      expect(resolveVideoUrlSync('https://example.com/video.mp4')).toBe(
        'https://example.com/video.mp4',
      );
      expect(resolveVideoUrlSync('data:video/mp4;base64,xyz')).toBe('data:video/mp4;base64,xyz');
    });
  });

  describe('async backward compatibility functions', () => {
    describe('resolveMediaValue', () => {
      it('should resolve media value asynchronously', async () => {
        const result = await resolveMediaValue('storageRef:audio/test.mp3', 'audio/mp3');
        expect(result).toBe('http://localhost:15500/api/media/audio/test.mp3');
      });

      it('should return null for undefined', async () => {
        const result = await resolveMediaValue(undefined, 'audio/mp3');
        expect(result).toBe(null);
      });
    });

    describe('resolveAudioUrl', () => {
      it('should resolve audio URL asynchronously with default format', async () => {
        const result = await resolveAudioUrl('storageRef:audio/test.mp3');
        expect(result).toBe('http://localhost:15500/api/media/audio/test.mp3');
      });

      it('should resolve audio URL asynchronously with custom format', async () => {
        const result = await resolveAudioUrl('abc123', 'wav');
        expect(result).toBe('data:audio/wav;base64,abc123');
      });

      it('should return null for undefined', async () => {
        const result = await resolveAudioUrl(undefined);
        expect(result).toBe(null);
      });
    });

    describe('resolveImageUrl', () => {
      it('should resolve image URL asynchronously with default format', async () => {
        const result = await resolveImageUrl('storageRef:image/test.png');
        expect(result).toBe('http://localhost:15500/api/media/image/test.png');
      });

      it('should resolve image URL asynchronously with custom format', async () => {
        const result = await resolveImageUrl('abc123', 'jpeg');
        expect(result).toBe('data:image/jpeg;base64,abc123');
      });

      it('should return null for undefined', async () => {
        const result = await resolveImageUrl(undefined);
        expect(result).toBe(null);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle storage refs with complex paths', () => {
      const complexPath = 'storageRef:nested/very/deep/path/to/file.mp3';
      expect(parseStorageRef(complexPath)).toBe('nested/very/deep/path/to/file.mp3');
      expect(getMediaUrl(complexPath)).toBe(
        'http://localhost:15500/api/media/nested/very/deep/path/to/file.mp3',
      );
    });

    it('should handle blob refs with various hash formats', () => {
      expect(parseBlobRef('promptfoo://blob/abc123def456')).toBe('abc123def456');
      expect(parseBlobRef('promptfoo://blob/hash-with-dashes')).toBe('hash-with-dashes');
      expect(parseBlobRef('promptfoo://blob/UPPERCASE123')).toBe('UPPERCASE123');
    });

    it('should prioritize blob refs over storage refs in resolveMediaUrl', () => {
      const blobRef = 'promptfoo://blob/abc123';
      expect(resolveMediaUrl(blobRef, 'audio/mp3')).toBe('http://localhost:15500/api/blobs/abc123');
    });

    it('should prioritize storage refs over data URLs in resolveMediaUrl', () => {
      const storageRef = 'storageRef:audio/test.mp3';
      expect(resolveMediaUrl(storageRef, 'audio/mp3')).toBe(
        'http://localhost:15500/api/media/audio/test.mp3',
      );
    });

    it('should handle empty apiBaseUrl gracefully', () => {
      vi.mocked(useApiConfig.getState).mockReturnValue({
        apiBaseUrl: '',
      } as ReturnType<typeof useApiConfig.getState>);

      expect(getMediaUrl('storageRef:audio/test.mp3')).toBe('/api/media/audio/test.mp3');
    });
  });
});
