import { tryDecodeBase64, tryDecodeHex } from '@app/utils/encoding';

describe('encoding utils', () => {
  describe('tryDecodeBase64', () => {
    it('decodes valid base64 strings', () => {
      expect(tryDecodeBase64('SGVsbG8sIHdvcmxkIQ==')).toBe('Hello, world!');
      expect(tryDecodeBase64('U2ltcGxlIHRlc3Qgc3RyaW5nLg==')).toBe('Simple test string.');
    });

    it('returns null for invalid base64', () => {
      expect(tryDecodeBase64('not base64')).toBeNull();
      // Short base64 should be ignored by length heuristic
      expect(tryDecodeBase64('Zm8=')).toBeNull();
      // Non-printable payload should be rejected
      expect(tryDecodeBase64('AAECAw==')).toBeNull();
    });
  });

  describe('tryDecodeHex', () => {
    it('decodes space-separated hex bytes', () => {
      expect(tryDecodeHex('68 65 6C 6C 6F')).toBe('hello');
      expect(tryDecodeHex('21 40 23 24')).toBe('!@#$');
      expect(tryDecodeHex('68  65 6c 6C 6F ')).toBe('hello');
    });

    it('returns null for invalid hex strings', () => {
      expect(tryDecodeHex('GG 00')).toBeNull();
      // Continuous hex without spaces is not supported by this helper
      expect(tryDecodeHex('68656C6C6F')).toBeNull();
      // Mixed invalid tokens
      expect(tryDecodeHex('68 6Z 6C')).toBeNull();
    });
  });
});


