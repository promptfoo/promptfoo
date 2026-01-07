import { describe, expect, it } from 'vitest';
import {
  extractAndStoreBinaryData,
  isBlobStorageEnabled,
  normalizeAudioMimeType,
} from '../../src/blobs/extractor';

import type { ProviderResponse } from '../../src/types/providers';

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
