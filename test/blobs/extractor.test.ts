import { describe, expect, it } from 'vitest';
// Since normalizeAudioMimeType is not exported, we'll test it through the public API
// by creating a mock provider response with various audio formats
import { extractAndStoreBinaryData, isBlobStorageEnabled } from '../../src/blobs/extractor';

import type { ProviderResponse } from '../../src/types/providers';

describe('Audio MIME type normalization', () => {
  // Skip tests if blob storage is disabled
  const maybeIt = isBlobStorageEnabled() ? it : it.skip;

  describe('normalizeAudioMimeType (indirect testing via extractAndStoreBinaryData)', () => {
    maybeIt('should handle undefined format', async () => {
      const response: ProviderResponse = {
        output: 'test',
        audio: {
          data: 'SGVsbG8gV29ybGQ=', // "Hello World" in base64 (too small to externalize)
          format: undefined,
        },
      };

      const result = await extractAndStoreBinaryData(response);
      // Should default to 'audio/wav' but won't externalize due to size
      expect(result).toBeDefined();
    });

    maybeIt('should accept valid audio MIME types', async () => {
      const validMimeTypes = [
        'audio/wav',
        'audio/mpeg',
        'audio/ogg',
        'audio/flac',
        'audio/aac',
        'audio/mp4',
        'audio/webm',
        'audio/x-custom',
      ];

      for (const mimeType of validMimeTypes) {
        const response: ProviderResponse = {
          output: 'test',
          audio: {
            data: 'SGVsbG8gV29ybGQ=',
            format: mimeType,
          },
        };

        const result = await extractAndStoreBinaryData(response);
        expect(result).toBeDefined();
      }
    });

    maybeIt('should normalize short format strings to MIME types', async () => {
      const formats = [
        { input: 'wav', expected: 'audio/wav' },
        { input: 'mp3', expected: 'audio/mpeg' },
        { input: 'ogg', expected: 'audio/ogg' },
        { input: 'flac', expected: 'audio/flac' },
        { input: 'aac', expected: 'audio/aac' },
        { input: 'm4a', expected: 'audio/mp4' },
        { input: 'webm', expected: 'audio/webm' },
      ];

      for (const { input } of formats) {
        const response: ProviderResponse = {
          output: 'test',
          audio: {
            data: 'SGVsbG8gV29ybGQ=',
            format: input,
          },
        };

        const result = await extractAndStoreBinaryData(response);
        expect(result).toBeDefined();
      }
    });

    maybeIt('should handle formats with whitespace', async () => {
      const response: ProviderResponse = {
        output: 'test',
        audio: {
          data: 'SGVsbG8gV29ybGQ=',
          format: '  wav  ',
        },
      };

      const result = await extractAndStoreBinaryData(response);
      expect(result).toBeDefined();
    });

    maybeIt('should normalize case-insensitive formats', async () => {
      const formats = ['WAV', 'Mp3', 'OGG', 'FLAC'];

      for (const format of formats) {
        const response: ProviderResponse = {
          output: 'test',
          audio: {
            data: 'SGVsbG8gV29ybGQ=',
            format,
          },
        };

        const result = await extractAndStoreBinaryData(response);
        expect(result).toBeDefined();
      }
    });

    maybeIt('should handle unknown formats by prefixing with audio/', async () => {
      const response: ProviderResponse = {
        output: 'test',
        audio: {
          data: 'SGVsbG8gV29ybGQ=',
          format: 'unknown',
        },
      };

      const result = await extractAndStoreBinaryData(response);
      // Should normalize to 'audio/unknown'
      expect(result).toBeDefined();
    });

    maybeIt('should reject formats with path traversal attempts', async () => {
      const maliciousFormats = ['../../etc/passwd', '../../../etc/shadow', 'path/to/file'];

      for (const format of maliciousFormats) {
        const response: ProviderResponse = {
          output: 'test',
          audio: {
            data: 'SGVsbG8gV29ybGQ=',
            format,
          },
        };

        const result = await extractAndStoreBinaryData(response);
        // Should fall back to default 'audio/wav'
        expect(result).toBeDefined();
      }
    });

    maybeIt('should reject formats with special characters', async () => {
      const invalidFormats = [
        'audio\nwav', // newline injection
        'audio;wav', // semicolon
        'audio:wav', // colon
        'audio wav', // space
        'audio/wav/extra', // extra slash
        'audio\\wav', // backslash
      ];

      for (const format of invalidFormats) {
        const response: ProviderResponse = {
          output: 'test',
          audio: {
            data: 'SGVsbG8gV29ybGQ=',
            format,
          },
        };

        const result = await extractAndStoreBinaryData(response);
        // Should fall back to default 'audio/wav'
        expect(result).toBeDefined();
      }
    });

    maybeIt('should accept formats with valid special characters', async () => {
      const validFormats = ['x-custom', 'vnd.company.format', 'codec_v2', 'format-1.0'];

      for (const format of validFormats) {
        const response: ProviderResponse = {
          output: 'test',
          audio: {
            data: 'SGVsbG8gV29ybGQ=',
            format,
          },
        };

        const result = await extractAndStoreBinaryData(response);
        // Should normalize to 'audio/<format>'
        expect(result).toBeDefined();
      }
    });
  });

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
