import useApiConfig from '@app/stores/apiConfig';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isBlobRef, isStorageRef, resolveAudioUrl } from './mediaStorage';

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
      expect(isStorageRef('promptfoo://blob/abc123')).toBe(false);
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

  describe('resolveAudioUrl reference inputs', () => {
    it.each([
      ['storageRef:audio/test.mp3', 'http://localhost:15500/api/media/audio/test.mp3'],
      ['storageRef:image/test.png', 'http://localhost:15500/api/media/image/test.png'],
      ['storageRef:video/test.mp4', 'http://localhost:15500/api/media/video/test.mp4'],
      [
        'storageRef:complex/path/with/slashes.jpg',
        'http://localhost:15500/api/media/complex/path/with/slashes.jpg',
      ],
      ['promptfoo://blob/abc123', 'http://localhost:15500/api/blobs/abc123'],
      ['promptfoo://blob/xyz456def789', 'http://localhost:15500/api/blobs/xyz456def789'],
      ['promptfoo://blob/xyz456', 'http://localhost:15500/api/blobs/xyz456'],
      ['storageRef:', null],
      ['promptfoo://blob/', null],
    ] as const)('resolves reference %s with its complete URL', async (value, expected) => {
      expect(await resolveAudioUrl(value)).toBe(expected);
    });

    it.each([
      ['storageRef:audio/test.mp3', 'https://production.example.com/api/media/audio/test.mp3'],
      ['promptfoo://blob/abc123', 'https://production.example.com/api/blobs/abc123'],
    ] as const)('uses the configured API base for %s', async (value, expected) => {
      vi.mocked(useApiConfig.getState).mockReturnValue({
        apiBaseUrl: 'https://production.example.com',
      } as ReturnType<typeof useApiConfig.getState>);
      expect(await resolveAudioUrl(value)).toBe(expected);
    });

    it('should resolve blob references', async () => {
      expect(await resolveAudioUrl('promptfoo://blob/abc123')).toBe(
        'http://localhost:15500/api/blobs/abc123',
      );
    });

    it('should resolve storage references', async () => {
      expect(await resolveAudioUrl('storageRef:audio/test.mp3')).toBe(
        'http://localhost:15500/api/media/audio/test.mp3',
      );
    });
  });

  describe('resolveAudioUrl', () => {
    it('should resolve audio URL asynchronously', async () => {
      const result = await resolveAudioUrl('storageRef:audio/test.mp3');
      expect(result).toBe('http://localhost:15500/api/media/audio/test.mp3');
    });
  });

  describe('edge cases', () => {
    it('should handle storage refs with complex paths', async () => {
      const complexPath = 'storageRef:nested/very/deep/path/to/file.mp3';
      expect(await resolveAudioUrl(complexPath)).toBe(
        'http://localhost:15500/api/media/nested/very/deep/path/to/file.mp3',
      );
    });

    it('should handle blob refs with various hash formats', async () => {
      expect(await resolveAudioUrl('promptfoo://blob/abc123def456')).toBe(
        'http://localhost:15500/api/blobs/abc123def456',
      );
      expect(await resolveAudioUrl('promptfoo://blob/hash-with-dashes')).toBe(
        'http://localhost:15500/api/blobs/hash-with-dashes',
      );
      expect(await resolveAudioUrl('promptfoo://blob/UPPERCASE123')).toBe(
        'http://localhost:15500/api/blobs/UPPERCASE123',
      );
    });

    it('should prioritize blob refs over storage refs in resolveAudioUrl', async () => {
      const blobRef = 'promptfoo://blob/abc123';
      expect(await resolveAudioUrl(blobRef)).toBe('http://localhost:15500/api/blobs/abc123');
    });

    it('should prioritize storage refs over data URLs in resolveAudioUrl', async () => {
      const storageRef = 'storageRef:audio/test.mp3';
      expect(await resolveAudioUrl(storageRef)).toBe(
        'http://localhost:15500/api/media/audio/test.mp3',
      );
    });

    it('should handle empty apiBaseUrl gracefully', async () => {
      vi.mocked(useApiConfig.getState).mockReturnValue({
        apiBaseUrl: '',
      } as ReturnType<typeof useApiConfig.getState>);

      expect(await resolveAudioUrl('storageRef:audio/test.mp3')).toBe('/api/media/audio/test.mp3');
    });
  });
});
