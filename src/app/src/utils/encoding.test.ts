import { isEncodingStrategy, tryDecodeTextBase64, tryDecodeHex } from '@app/utils/encoding';

describe('encoding utils', () => {
  describe('isEncodingStrategy', () => {
    it('identifies text-based encoding strategies', () => {
      expect(isEncodingStrategy('base64')).toBe(true);
      expect(isEncodingStrategy('hex')).toBe(true);
      expect(isEncodingStrategy('rot13')).toBe(true);
      expect(isEncodingStrategy('leetspeak')).toBe(true);
      expect(isEncodingStrategy('homoglyph')).toBe(true);
      expect(isEncodingStrategy('morse')).toBe(true);
      expect(isEncodingStrategy('pigLatin')).toBe(true);
    });

    it('identifies multimodal encoding strategies', () => {
      expect(isEncodingStrategy('audio')).toBe(true);
      expect(isEncodingStrategy('image')).toBe(true);
      expect(isEncodingStrategy('video')).toBe(true);
    });

    it('returns false for non-encoding strategies', () => {
      expect(isEncodingStrategy('jailbreak')).toBe(false);
      expect(isEncodingStrategy('prompt-injection')).toBe(false);
      expect(isEncodingStrategy(undefined)).toBe(false);
      expect(isEncodingStrategy('')).toBe(false);
    });
  });

  describe('tryDecodeTextBase64', () => {
    it('decodes valid text-based base64 strings', () => {
      expect(tryDecodeTextBase64('SGVsbG8sIHdvcmxkIQ==')).toBe('Hello, world!');
      expect(tryDecodeTextBase64('U2ltcGxlIHRlc3Qgc3RyaW5nLg==')).toBe('Simple test string.');
    });

    it('returns null for invalid base64', () => {
      expect(tryDecodeTextBase64('not base64')).toBeNull();
      // Short base64 should be ignored by length heuristic
      expect(tryDecodeTextBase64('Zm8=')).toBeNull();
      // Non-printable payload should be rejected
      expect(tryDecodeTextBase64('AAECAw==')).toBeNull();
    });

    it('avoids decoding large binary content', () => {
      // Large base64 string (simulates audio/binary)
      const largeBase64 = 'A'.repeat(6000);
      expect(tryDecodeTextBase64(largeBase64)).toBeNull();

      // Data URI patterns
      expect(tryDecodeTextBase64('data:audio/wav;base64,SGVsbG8=')).toBeNull();
      expect(tryDecodeTextBase64('data:image/png;base64,SGVsbG8=')).toBeNull();
      expect(tryDecodeTextBase64('data:video/mp4;base64,SGVsbG8=')).toBeNull();
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
