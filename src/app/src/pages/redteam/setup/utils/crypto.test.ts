import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { convertStringKeyToPem, validatePrivateKey } from './crypto';

const mockAtob = vi.fn();
const nativeAtob = globalThis.atob;

describe('crypto utils', () => {
  beforeEach(() => {
    vi.stubGlobal('atob', mockAtob);
    vi.clearAllMocks();
    // Default atob behavior: decode base64
    mockAtob.mockImplementation((str: string) => {
      // Simple base64 validation - just check it doesn't have invalid chars
      if (!/^[A-Za-z0-9+/=]*$/.test(str)) {
        const error = new Error('Invalid character in string');
        throw error;
      }
      return 'decoded';
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('convertStringKeyToPem', () => {
    it('should return PEM key as-is if already in PEM format', async () => {
      const pemKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC=
-----END PRIVATE KEY-----`;

      const result = await convertStringKeyToPem(pemKey);
      expect(result).toBe(pemKey);
      expect(mockAtob).toHaveBeenCalled();
    });

    it('should convert raw base64 to PEM format', async () => {
      const rawBase64 = 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC';

      const result = await convertStringKeyToPem(rawBase64);

      expect(result).toContain('-----BEGIN PRIVATE KEY-----');
      expect(result).toContain('-----END PRIVATE KEY-----');
      expect(result).toContain('MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC');
      expect(mockAtob).toHaveBeenCalled();
    });

    it('should format raw base64 into 64-character lines', async () => {
      const rawBase64 = 'A'.repeat(128); // 128 characters

      const result = await convertStringKeyToPem(rawBase64);

      const lines = result.split('\n');
      expect(lines[0]).toBe('-----BEGIN PRIVATE KEY-----');
      expect(lines[1]).toBe('A'.repeat(64));
      expect(lines[2]).toBe('A'.repeat(64));
      expect(lines[3]).toBe('-----END PRIVATE KEY-----');
    });

    it('should throw error for empty input', async () => {
      await expect(convertStringKeyToPem('')).rejects.toThrow('Private key cannot be empty');
      await expect(convertStringKeyToPem('   ')).rejects.toThrow('Private key cannot be empty');
    });

    it('should throw error for invalid base64 in PEM format', async () => {
      mockAtob.mockImplementation(() => {
        const error = new Error('Invalid character in string');
        throw error;
      });

      const invalidPemKey = `-----BEGIN PRIVATE KEY-----
Invalid@#$Characters
-----END PRIVATE KEY-----`;

      await expect(convertStringKeyToPem(invalidPemKey)).rejects.toThrow(
        'Invalid base64 encoding in private key',
      );
    });

    it('should throw error for invalid base64 in raw format', async () => {
      mockAtob.mockImplementation(() => {
        const error = new Error('Invalid character in string');
        throw error;
      });

      await expect(convertStringKeyToPem('Invalid@#$Characters')).rejects.toThrow(
        'Invalid base64 encoding in private key',
      );
    });

    it('should reject malformed base64 that only native atob catches', async () => {
      mockAtob.mockImplementation((input: string) => nativeAtob(input));

      await expect(convertStringKeyToPem('AAAAA')).rejects.toThrow(/Invalid private key format/);
    });

    it('should handle PEM with different key types (PKCS#1)', async () => {
      const rsaPrivateKey = `-----BEGIN RSA PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC=
-----END RSA PRIVATE KEY-----`;

      const result = await convertStringKeyToPem(rsaPrivateKey);
      expect(result).toBe(rsaPrivateKey);
    });

    it('should handle PEM with different key types (EC)', async () => {
      const ecPrivateKey = `-----BEGIN EC PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC=
-----END EC PRIVATE KEY-----`;

      const result = await convertStringKeyToPem(ecPrivateKey);
      expect(result).toBe(ecPrivateKey);
    });

    it('should strip whitespace from raw base64 before formatting', async () => {
      const rawBase64WithSpaces = 'AAAA BBBB CCCC DDDD';

      const result = await convertStringKeyToPem(rawBase64WithSpaces);

      // Check that the base64 content line doesn't contain spaces
      const lines = result.split('\n');
      const contentLines = lines.slice(1, -1); // Exclude header and footer
      expect(contentLines.join('')).toBe('AAAABBBBCCCCDDDD');
      expect(result).toContain('-----BEGIN PRIVATE KEY-----');
      expect(result).toContain('-----END PRIVATE KEY-----');
    });

    it('should handle raw base64 with newlines', async () => {
      const rawBase64WithNewlines = 'AAAA\nBBBB\nCCCC\nDDDD';

      const result = await convertStringKeyToPem(rawBase64WithNewlines);

      const contentLines = result.split('\n').slice(1, -1);
      expect(contentLines.join('')).toBe('AAAABBBBCCCCDDDD');
    });

    it('should throw descriptive error for other atob errors', async () => {
      mockAtob.mockImplementation(() => {
        throw new Error('Some other error');
      });

      const invalidKey = `-----BEGIN PRIVATE KEY-----
SomeInvalidData
-----END PRIVATE KEY-----`;

      await expect(convertStringKeyToPem(invalidKey)).rejects.toThrow(
        /Invalid private key format.*Some other error/,
      );
    });

    it('should handle non-Error exceptions', async () => {
      mockAtob.mockImplementation(() => {
        throw 'string error';
      });

      const invalidKey = `-----BEGIN PRIVATE KEY-----
SomeInvalidData
-----END PRIVATE KEY-----`;

      await expect(convertStringKeyToPem(invalidKey)).rejects.toThrow(
        /Invalid private key format.*Unknown error/,
      );
    });

    it('should handle very short base64 strings', async () => {
      const shortBase64 = 'ABC';

      const result = await convertStringKeyToPem(shortBase64);

      expect(result).toBe(`-----BEGIN PRIVATE KEY-----
ABC
-----END PRIVATE KEY-----`);
    });

    it('should handle base64 exactly 64 characters', async () => {
      const base64 = 'A'.repeat(64);

      const result = await convertStringKeyToPem(base64);

      const lines = result.split('\n');
      expect(lines).toHaveLength(3);
      expect(lines[1]).toBe('A'.repeat(64));
    });

    it('should handle base64 with padding characters', async () => {
      const base64WithPadding = 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASC==';

      const result = await convertStringKeyToPem(base64WithPadding);

      expect(result).toContain(base64WithPadding);
      expect(result).toContain('-----BEGIN PRIVATE KEY-----');
    });
  });

  describe('validatePrivateKey', () => {
    it('should validate PEM formatted key without error', async () => {
      const pemKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC=
-----END PRIVATE KEY-----`;

      await expect(validatePrivateKey(pemKey)).resolves.toBeUndefined();
    });

    it('should validate raw base64 key without error', async () => {
      const rawBase64 = 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC';

      await expect(validatePrivateKey(rawBase64)).resolves.toBeUndefined();
    });

    it('should throw error for empty input', async () => {
      await expect(validatePrivateKey('')).rejects.toThrow('Private key cannot be empty');
      await expect(validatePrivateKey('   ')).rejects.toThrow('Private key cannot be empty');
    });

    it('should throw error for invalid base64', async () => {
      mockAtob.mockImplementation(() => {
        const error = new Error('Invalid character in string');
        throw error;
      });

      await expect(validatePrivateKey('Invalid@#$Key')).rejects.toThrow(
        'Invalid base64 encoding in private key',
      );
    });

    it('should validate RSA private key format', async () => {
      const rsaKey = `-----BEGIN RSA PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC=
-----END RSA PRIVATE KEY-----`;

      await expect(validatePrivateKey(rsaKey)).resolves.toBeUndefined();
    });

    it('should validate EC private key format', async () => {
      const ecKey = `-----BEGIN EC PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC=
-----END EC PRIVATE KEY-----`;

      await expect(validatePrivateKey(ecKey)).resolves.toBeUndefined();
    });

    it('should validate key with whitespace', async () => {
      const keyWithSpaces = `  -----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC=
-----END PRIVATE KEY-----  `;

      await expect(validatePrivateKey(keyWithSpaces)).resolves.toBeUndefined();
    });

    it('should propagate errors from convertStringKeyToPem', async () => {
      mockAtob.mockImplementation(() => {
        throw new Error('Custom validation error');
      });

      const invalidKey = 'InvalidKey123';

      await expect(validatePrivateKey(invalidKey)).rejects.toThrow(/Invalid private key format/);
    });
  });
});
