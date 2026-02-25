import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock envars so we can control PROMPTFOO_INLINE_MEDIA per-test
vi.mock('../../src/envars', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/envars')>();
  return {
    ...actual,
    getEnvBool: vi.fn().mockImplementation(actual.getEnvBool),
  };
});

import {
  detectImageMimeType,
  extractAndStoreBinaryData,
  isBlobStorageEnabled,
  normalizeAudioMimeType,
} from '../../src/blobs/extractor';
import { getEnvBool } from '../../src/envars';

import type { ProviderResponse } from '../../src/types/providers';

// Mock the remoteUpload module
vi.mock('../../src/blobs/remoteUpload', () => ({
  shouldAttemptRemoteBlobUpload: vi.fn(),
  uploadBlobRemote: vi.fn(),
}));

// Mock the blob index module
vi.mock('../../src/blobs/index', () => ({
  storeBlob: vi.fn().mockResolvedValue({
    ref: {
      uri: 'promptfoo://blob/abc123',
      hash: 'abc123',
    },
  }),
  recordBlobReference: vi.fn().mockResolvedValue(undefined),
}));

describe('normalizeAudioMimeType', () => {
  describe('undefined and empty inputs', () => {
    it('should return audio/wav for undefined format', () => {
      expect(normalizeAudioMimeType(undefined)).toBe('audio/wav');
    });

    it('should return audio/wav for empty string', () => {
      expect(normalizeAudioMimeType('')).toBe('audio/wav');
    });

    it('should return audio/wav for whitespace-only string', () => {
      expect(normalizeAudioMimeType('   ')).toBe('audio/wav');
    });
  });

  describe('already valid MIME types', () => {
    it('should pass through valid audio MIME types unchanged', () => {
      expect(normalizeAudioMimeType('audio/wav')).toBe('audio/wav');
      expect(normalizeAudioMimeType('audio/mpeg')).toBe('audio/mpeg');
      expect(normalizeAudioMimeType('audio/ogg')).toBe('audio/ogg');
      expect(normalizeAudioMimeType('audio/flac')).toBe('audio/flac');
      expect(normalizeAudioMimeType('audio/aac')).toBe('audio/aac');
      expect(normalizeAudioMimeType('audio/mp4')).toBe('audio/mp4');
      expect(normalizeAudioMimeType('audio/webm')).toBe('audio/webm');
    });

    it('should pass through vendor MIME types without periods', () => {
      expect(normalizeAudioMimeType('audio/x-custom')).toBe('audio/x-custom');
      expect(normalizeAudioMimeType('audio/x-wav')).toBe('audio/x-wav');
    });

    it('should reject MIME types with periods to prevent injection attacks', () => {
      // Periods could enable attacks like "audio/wav.html" being interpreted as HTML
      expect(normalizeAudioMimeType('audio/vnd.company.format')).toBe('audio/wav');
      expect(normalizeAudioMimeType('audio/wav.html')).toBe('audio/wav');
    });
  });

  describe('short format normalization', () => {
    it('should normalize common short formats to MIME types', () => {
      expect(normalizeAudioMimeType('wav')).toBe('audio/wav');
      expect(normalizeAudioMimeType('mp3')).toBe('audio/mpeg');
      expect(normalizeAudioMimeType('ogg')).toBe('audio/ogg');
      expect(normalizeAudioMimeType('flac')).toBe('audio/flac');
      expect(normalizeAudioMimeType('aac')).toBe('audio/aac');
      expect(normalizeAudioMimeType('m4a')).toBe('audio/mp4');
      expect(normalizeAudioMimeType('webm')).toBe('audio/webm');
    });

    it('should be case-insensitive for known formats', () => {
      expect(normalizeAudioMimeType('WAV')).toBe('audio/wav');
      expect(normalizeAudioMimeType('Mp3')).toBe('audio/mpeg');
      expect(normalizeAudioMimeType('OGG')).toBe('audio/ogg');
      expect(normalizeAudioMimeType('FLAC')).toBe('audio/flac');
    });

    it('should handle whitespace around format', () => {
      expect(normalizeAudioMimeType('  wav  ')).toBe('audio/wav');
      expect(normalizeAudioMimeType('\tmp3\n')).toBe('audio/mpeg');
    });
  });

  describe('unknown formats', () => {
    it('should prefix unknown alphanumeric formats with audio/', () => {
      expect(normalizeAudioMimeType('opus')).toBe('audio/opus');
      expect(normalizeAudioMimeType('pcm')).toBe('audio/pcm');
      expect(normalizeAudioMimeType('raw')).toBe('audio/raw');
    });

    it('should allow dash and underscore in unknown formats', () => {
      expect(normalizeAudioMimeType('x-custom')).toBe('audio/x-custom');
      expect(normalizeAudioMimeType('codec_v2')).toBe('audio/codec_v2');
      expect(normalizeAudioMimeType('x-wav-hd')).toBe('audio/x-wav-hd');
    });

    it('should reject unknown formats with periods to prevent MIME injection', () => {
      // Periods could enable attacks like "wav.html" -> "audio/wav.html"
      expect(normalizeAudioMimeType('vnd.company.format')).toBe('audio/wav');
      expect(normalizeAudioMimeType('format-1.0')).toBe('audio/wav');
      expect(normalizeAudioMimeType('wav.html')).toBe('audio/wav');
    });
  });

  describe('security: invalid formats', () => {
    it('should reject formats with path traversal attempts', () => {
      expect(normalizeAudioMimeType('../../etc/passwd')).toBe('audio/wav');
      expect(normalizeAudioMimeType('../../../etc/shadow')).toBe('audio/wav');
      expect(normalizeAudioMimeType('path/to/file')).toBe('audio/wav');
    });

    it('should reject formats with newline injection', () => {
      expect(normalizeAudioMimeType('audio\nwav')).toBe('audio/wav');
      expect(normalizeAudioMimeType('wav\r\nContent-Type: text/html')).toBe('audio/wav');
    });

    it('should reject formats with header injection characters', () => {
      expect(normalizeAudioMimeType('audio;wav')).toBe('audio/wav');
      expect(normalizeAudioMimeType('audio:wav')).toBe('audio/wav');
      expect(normalizeAudioMimeType('audio wav')).toBe('audio/wav');
    });

    it('should reject formats with backslashes', () => {
      expect(normalizeAudioMimeType('audio\\wav')).toBe('audio/wav');
      expect(normalizeAudioMimeType('..\\..\\etc\\passwd')).toBe('audio/wav');
    });

    it('should reject formats with multiple path components', () => {
      expect(normalizeAudioMimeType('audio/wav/extra')).toBe('audio/wav');
    });
  });
});

describe('Audio MIME type normalization (integration)', () => {
  // Skip tests if blob storage is disabled
  const maybeIt = isBlobStorageEnabled() ? it : it.skip;

  describe('extractAndStoreBinaryData with audio', () => {
    maybeIt('should process response with top-level audio', async () => {
      const response: ProviderResponse = {
        output: 'test',
        audio: {
          data: 'SGVsbG8gV29ybGQ=',
          format: 'wav',
        },
      };

      const result = await extractAndStoreBinaryData(response);
      expect(result).toBeDefined();
      expect(result?.audio).toBeDefined();
    });

    maybeIt('should process response with turns audio', async () => {
      const response: ProviderResponse = {
        output: 'test',
        turns: [
          {
            audio: {
              data: 'SGVsbG8gV29ybGQ=',
              format: 'mp3',
            },
          },
        ],
      } as any;

      const result = await extractAndStoreBinaryData(response);
      expect(result).toBeDefined();
      expect((result as any)?.turns).toBeDefined();
    });

    maybeIt('should handle response without audio', async () => {
      const response: ProviderResponse = {
        output: 'test',
      };

      const result = await extractAndStoreBinaryData(response);
      expect(result).toEqual(response);
    });

    maybeIt('should handle null response', async () => {
      const result = await extractAndStoreBinaryData(null);
      expect(result).toBeNull();
    });

    maybeIt('should handle undefined response', async () => {
      const result = await extractAndStoreBinaryData(undefined);
      expect(result).toBeUndefined();
    });
  });
});

describe('Cloud blob upload', () => {
  let mockShouldAttemptRemoteBlobUpload: ReturnType<typeof vi.fn>;
  let mockUploadBlobRemote: ReturnType<typeof vi.fn>;
  let mockStoreBlob: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetAllMocks();

    // Get the mocked functions
    const remoteUploadModule = await import('../../src/blobs/remoteUpload');
    mockShouldAttemptRemoteBlobUpload = vi.mocked(remoteUploadModule.shouldAttemptRemoteBlobUpload);
    mockUploadBlobRemote = vi.mocked(remoteUploadModule.uploadBlobRemote);

    const blobIndexModule = await import('../../src/blobs/index');
    mockStoreBlob = vi.mocked(blobIndexModule.storeBlob);

    // Default mock implementations
    mockStoreBlob.mockResolvedValue({
      ref: {
        uri: 'promptfoo://blob/abc123def456',
        hash: 'abc123def456',
      },
    });
    mockUploadBlobRemote.mockResolvedValue({
      ref: {
        uri: 'promptfoo://blob/abc123def456',
        hash: 'abc123def456',
      },
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should attempt cloud upload when authenticated', async () => {
    mockShouldAttemptRemoteBlobUpload.mockReturnValue(true);

    // Create a large enough data URL to trigger externalization (>1KB)
    const largeBase64 = Buffer.alloc(2000).toString('base64');
    const response: ProviderResponse = {
      output: `data:image/png;base64,${largeBase64}`,
    };

    await extractAndStoreBinaryData(response);

    // Should store locally
    expect(mockStoreBlob).toHaveBeenCalledTimes(1);

    // Should also attempt cloud upload
    expect(mockUploadBlobRemote).toHaveBeenCalledTimes(1);
    expect(mockUploadBlobRemote).toHaveBeenCalledWith(
      expect.any(Buffer),
      'image/png',
      expect.objectContaining({
        location: 'response.output',
        kind: 'image',
      }),
    );
  });

  it('should not attempt cloud upload when not authenticated', async () => {
    mockShouldAttemptRemoteBlobUpload.mockReturnValue(false);

    // Create a large enough data URL to trigger externalization
    const largeBase64 = Buffer.alloc(2000).toString('base64');
    const response: ProviderResponse = {
      output: `data:image/png;base64,${largeBase64}`,
    };

    await extractAndStoreBinaryData(response);

    // Should store locally
    expect(mockStoreBlob).toHaveBeenCalledTimes(1);

    // Should NOT attempt cloud upload
    expect(mockUploadBlobRemote).not.toHaveBeenCalled();
  });

  it('should succeed with local storage even if cloud upload fails', async () => {
    mockShouldAttemptRemoteBlobUpload.mockReturnValue(true);
    mockUploadBlobRemote.mockRejectedValue(new Error('Network error'));

    // Create a large enough data URL to trigger externalization
    const largeBase64 = Buffer.alloc(2000).toString('base64');
    const response: ProviderResponse = {
      output: `data:image/png;base64,${largeBase64}`,
    };

    const result = await extractAndStoreBinaryData(response);

    // Should still succeed with local storage
    expect(mockStoreBlob).toHaveBeenCalledTimes(1);
    expect(result?.output).toBe('promptfoo://blob/abc123def456');
  });

  it('should pass context to cloud upload', async () => {
    mockShouldAttemptRemoteBlobUpload.mockReturnValue(true);

    const largeBase64 = Buffer.alloc(2000).toString('base64');
    const response: ProviderResponse = {
      output: `data:image/png;base64,${largeBase64}`,
    };

    const context = {
      evalId: 'eval-123',
      testIdx: 1,
      promptIdx: 2,
    };

    await extractAndStoreBinaryData(response, context);

    expect(mockUploadBlobRemote).toHaveBeenCalledWith(
      expect.any(Buffer),
      'image/png',
      expect.objectContaining({
        evalId: 'eval-123',
        testIdx: 1,
        promptIdx: 2,
        location: 'response.output',
        kind: 'image',
      }),
    );
  });

  it('should externalize image data URIs to blobRefs', async () => {
    mockShouldAttemptRemoteBlobUpload.mockReturnValue(false);

    const largeBase64 = Buffer.alloc(2000).toString('base64');
    const response: ProviderResponse = {
      output: 'text output',
      images: [{ data: `data:image/png;base64,${largeBase64}`, mimeType: 'image/png' }],
    };

    const result = await extractAndStoreBinaryData(response);
    expect(result?.images?.[0].data).toBeUndefined();
    expect(result?.images?.[0].blobRef).toBeDefined();
    expect(result?.images?.[0].blobRef?.uri).toContain('promptfoo://blob/');
  });

  it('should pass through images without data URIs unchanged', async () => {
    mockShouldAttemptRemoteBlobUpload.mockReturnValue(false);

    const response: ProviderResponse = {
      output: 'text output',
      images: [
        {
          blobRef: {
            uri: 'promptfoo://blob/existing',
            hash: 'existing',
            mimeType: 'image/png',
            sizeBytes: 100,
            provider: 'local',
          },
        },
      ],
    };

    const result = await extractAndStoreBinaryData(response);
    expect(result).toEqual(response);
  });

  it('should handle mixed images: externalize data URIs but keep existing blobRefs', async () => {
    mockShouldAttemptRemoteBlobUpload.mockReturnValue(false);

    const largeBase64 = Buffer.alloc(2000).toString('base64');
    const response: ProviderResponse = {
      output: 'text output',
      images: [
        { data: `data:image/png;base64,${largeBase64}`, mimeType: 'image/png' },
        {
          blobRef: {
            uri: 'promptfoo://blob/existing',
            hash: 'existing',
            mimeType: 'image/jpeg',
            sizeBytes: 100,
            provider: 'local',
          },
        },
      ],
    };

    const result = await extractAndStoreBinaryData(response);
    // First image externalized
    expect(result?.images?.[0].data).toBeUndefined();
    expect(result?.images?.[0].blobRef).toBeDefined();
    // Second image kept as-is
    expect(result?.images?.[1].blobRef?.hash).toBe('existing');
  });

  it('should attempt cloud upload for audio data', async () => {
    mockShouldAttemptRemoteBlobUpload.mockReturnValue(true);

    // Create a large enough audio data
    const largeBase64 = Buffer.alloc(2000).toString('base64');
    const response: ProviderResponse = {
      output: 'test',
      audio: {
        data: largeBase64,
        format: 'wav',
      },
    };

    await extractAndStoreBinaryData(response);

    expect(mockUploadBlobRemote).toHaveBeenCalledWith(
      expect.any(Buffer),
      'audio/wav',
      expect.objectContaining({
        location: 'response.audio.data',
        kind: 'audio',
      }),
    );
  });
});

describe('detectImageMimeType', () => {
  it('should detect JPEG from magic bytes', () => {
    expect(detectImageMimeType('/9j/4AAQSkZJRg==')).toBe('image/jpeg');
  });

  it('should detect PNG from magic bytes', () => {
    expect(detectImageMimeType('iVBORw0KGgoAAAANSUhEUg==')).toBe('image/png');
  });

  it('should detect WebP from magic bytes', () => {
    expect(detectImageMimeType('UklGRlYAAABXRUJQ')).toBe('image/webp');
  });

  it('should detect GIF from magic bytes', () => {
    expect(detectImageMimeType('R0lGODlhAQABAA==')).toBe('image/gif');
  });

  it('should fall back to PNG for unknown data', () => {
    expect(detectImageMimeType('AAAA')).toBe('image/png');
    expect(detectImageMimeType('')).toBe('image/png');
  });
});

describe('Inline b64_json conversion (PROMPTFOO_INLINE_MEDIA=true)', () => {
  beforeEach(async () => {
    vi.resetAllMocks();

    // Simulate PROMPTFOO_INLINE_MEDIA=true so isBlobStorageEnabled() returns false
    vi.mocked(getEnvBool).mockImplementation((key: string, defaultValue: unknown) => {
      if (key === 'PROMPTFOO_INLINE_MEDIA') {
        return true;
      }
      return defaultValue;
    });

    const remoteUploadModule = await import('../../src/blobs/remoteUpload');
    vi.mocked(remoteUploadModule.shouldAttemptRemoteBlobUpload).mockReturnValue(false);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should convert single b64_json PNG to data URI', async () => {
    // PNG magic bytes: iVBORw0KGgo...
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk';
    const response: ProviderResponse = {
      output: JSON.stringify({ data: [{ b64_json: pngBase64 }] }),
      isBase64: true,
      format: 'json',
    };

    const result = await extractAndStoreBinaryData(response);
    expect(result?.output).toBe(`data:image/png;base64,${pngBase64}`);
  });

  it('should convert single b64_json JPEG to data URI with correct MIME', async () => {
    // JPEG magic bytes: /9j/...
    const jpegBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAA';
    const response: ProviderResponse = {
      output: JSON.stringify({ data: [{ b64_json: jpegBase64 }] }),
      isBase64: true,
      format: 'json',
    };

    const result = await extractAndStoreBinaryData(response);
    expect(result?.output).toBe(`data:image/jpeg;base64,${jpegBase64}`);
  });

  it('should convert single b64_json WebP to data URI with correct MIME', async () => {
    // WebP magic bytes: UklGR...
    const webpBase64 = 'UklGRlYAAABXRUJQVlA4IEoAAADQAQCdASoBAAEAAQ';
    const response: ProviderResponse = {
      output: JSON.stringify({ data: [{ b64_json: webpBase64 }] }),
      isBase64: true,
      format: 'json',
    };

    const result = await extractAndStoreBinaryData(response);
    expect(result?.output).toBe(`data:image/webp;base64,${webpBase64}`);
  });

  it('should serialize multiple b64_json items as JSON array of data URIs', async () => {
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUg';
    const jpegBase64 = '/9j/4AAQSkZJRgABAQ';
    const response: ProviderResponse = {
      output: JSON.stringify({
        data: [{ b64_json: pngBase64 }, { b64_json: jpegBase64 }],
      }),
      isBase64: true,
      format: 'json',
    };

    const result = await extractAndStoreBinaryData(response);
    const parsed = JSON.parse(result?.output as string);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toBe(`data:image/png;base64,${pngBase64}`);
    expect(parsed[1]).toBe(`data:image/jpeg;base64,${jpegBase64}`);
  });

  it('should not modify response when output is not b64_json JSON', async () => {
    const response: ProviderResponse = {
      output: 'just a plain text response',
    };

    const result = await extractAndStoreBinaryData(response);
    expect(result?.output).toBe('just a plain text response');
  });

  it('should not modify response when JSON has no data array', async () => {
    const response: ProviderResponse = {
      output: JSON.stringify({ error: 'something went wrong' }),
      isBase64: true,
      format: 'json',
    };

    const result = await extractAndStoreBinaryData(response);
    expect(result?.output).toBe(response.output);
  });

  it('should handle JSON parse failure gracefully', async () => {
    const response: ProviderResponse = {
      output: '{not valid json b64_json',
      isBase64: true,
      format: 'json',
    };

    const result = await extractAndStoreBinaryData(response);
    expect(result?.output).toBe(response.output);
  });

  it('should skip items without b64_json field', async () => {
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUg';
    const response: ProviderResponse = {
      output: JSON.stringify({
        data: [{ url: 'https://example.com/image.png' }, { b64_json: pngBase64 }],
      }),
      isBase64: true,
      format: 'json',
    };

    const result = await extractAndStoreBinaryData(response);
    expect(result?.output).toBe(`data:image/png;base64,${pngBase64}`);
  });
});
