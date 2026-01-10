import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateUrlForSSRF, SSRFValidationError } from '../../src/util/fetch/urlValidation';

describe('validateUrlForSSRF', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('valid URLs', () => {
    it('should allow valid public HTTPS URLs', () => {
      expect(() => validateUrlForSSRF('https://example.com')).not.toThrow();
      expect(() => validateUrlForSSRF('https://api.openai.com/v1/chat')).not.toThrow();
      expect(() => validateUrlForSSRF('https://google.com')).not.toThrow();
    });

    it('should allow valid public HTTP URLs', () => {
      expect(() => validateUrlForSSRF('http://example.com')).not.toThrow();
      expect(() => validateUrlForSSRF('http://api.example.com:8080')).not.toThrow();
    });

    it('should allow URL objects', () => {
      const url = new URL('https://example.com');
      expect(() => validateUrlForSSRF(url)).not.toThrow();
    });

    it('should allow Request objects', () => {
      const request = new Request('https://example.com');
      expect(() => validateUrlForSSRF(request)).not.toThrow();
    });

    it('should allow whitelisted endpoints', () => {
      // These endpoints are whitelisted in the validation logic
      expect(() =>
        validateUrlForSSRF('https://api.promptfoo.app/v1/endpoint'),
      ).not.toThrow();
    });
  });

  describe('dangerous protocols', () => {
    it('should block file:// protocol', () => {
      expect(() => validateUrlForSSRF('file:///etc/passwd')).toThrow(SSRFValidationError);
      expect(() => validateUrlForSSRF('file:///etc/passwd')).toThrow(/dangerous protocol/i);
    });

    it('should block ftp:// protocol', () => {
      expect(() => validateUrlForSSRF('ftp://example.com')).toThrow(SSRFValidationError);
      expect(() => validateUrlForSSRF('ftp://example.com')).toThrow(/dangerous protocol/i);
    });

    it('should block gopher:// protocol', () => {
      expect(() => validateUrlForSSRF('gopher://example.com')).toThrow(SSRFValidationError);
      expect(() => validateUrlForSSRF('gopher://example.com')).toThrow(/dangerous protocol/i);
    });

    it('should block data:// protocol', () => {
      expect(() => validateUrlForSSRF('data:text/plain,hello')).toThrow(SSRFValidationError);
      expect(() => validateUrlForSSRF('data:text/plain,hello')).toThrow(/dangerous protocol/i);
    });
  });

  describe('localhost detection', () => {
    it('should block localhost hostname', () => {
      expect(() => validateUrlForSSRF('http://localhost:8080')).toThrow(SSRFValidationError);
      expect(() => validateUrlForSSRF('http://localhost:8080')).toThrow(/localhost/i);
    });

    it('should block 127.0.0.1', () => {
      expect(() => validateUrlForSSRF('http://127.0.0.1:8080')).toThrow(SSRFValidationError);
      expect(() => validateUrlForSSRF('http://127.0.0.1:8080')).toThrow(/localhost/i);
    });

    it('should block 127.x.x.x range', () => {
      expect(() => validateUrlForSSRF('http://127.0.0.2')).toThrow(SSRFValidationError);
      expect(() => validateUrlForSSRF('http://127.1.1.1')).toThrow(SSRFValidationError);
    });

    it('should block ::1 (IPv6 loopback)', () => {
      expect(() => validateUrlForSSRF('http://[::1]:8080')).toThrow(SSRFValidationError);
    });

    it('should block .localhost subdomain', () => {
      expect(() => validateUrlForSSRF('http://test.localhost')).toThrow(SSRFValidationError);
    });

    it('should allow localhost when PROMPTFOO_ALLOW_LOCALHOST_REQUESTS is set', () => {
      process.env.PROMPTFOO_ALLOW_LOCALHOST_REQUESTS = 'true';
      expect(() => validateUrlForSSRF('http://localhost:8080')).not.toThrow();
      expect(() => validateUrlForSSRF('http://127.0.0.1:8080')).not.toThrow();
    });
  });

  describe('private IP ranges', () => {
    it('should block 10.0.0.0/8 range', () => {
      expect(() => validateUrlForSSRF('http://10.0.0.1')).toThrow(SSRFValidationError);
      expect(() => validateUrlForSSRF('http://10.1.1.1')).toThrow(SSRFValidationError);
      expect(() => validateUrlForSSRF('http://10.255.255.255')).toThrow(SSRFValidationError);
    });

    it('should block 172.16.0.0/12 range', () => {
      expect(() => validateUrlForSSRF('http://172.16.0.1')).toThrow(SSRFValidationError);
      expect(() => validateUrlForSSRF('http://172.20.0.1')).toThrow(SSRFValidationError);
      expect(() => validateUrlForSSRF('http://172.31.255.255')).toThrow(SSRFValidationError);
    });

    it('should block 192.168.0.0/16 range', () => {
      expect(() => validateUrlForSSRF('http://192.168.1.1')).toThrow(SSRFValidationError);
      expect(() => validateUrlForSSRF('http://192.168.0.1')).toThrow(SSRFValidationError);
      expect(() => validateUrlForSSRF('http://192.168.255.255')).toThrow(SSRFValidationError);
    });

    it('should block 169.254.0.0/16 link-local range', () => {
      expect(() => validateUrlForSSRF('http://169.254.1.1')).toThrow(SSRFValidationError);
      expect(() => validateUrlForSSRF('http://169.254.169.254')).toThrow(SSRFValidationError);
    });

    it('should block 0.0.0.0/8 range', () => {
      expect(() => validateUrlForSSRF('http://0.0.0.0')).toThrow(SSRFValidationError);
      expect(() => validateUrlForSSRF('http://0.1.2.3')).toThrow(SSRFValidationError);
    });

    it('should allow public IPs in 172.x.x.x that are not in private range', () => {
      // 172.15.x.x and 172.32.x.x are public (only 172.16-31 are private)
      expect(() => validateUrlForSSRF('http://172.15.0.1')).not.toThrow();
      expect(() => validateUrlForSSRF('http://172.32.0.1')).not.toThrow();
    });
  });

  describe('IPv6 private ranges', () => {
    it('should block fc00::/7 unique local addresses', () => {
      expect(() => validateUrlForSSRF('http://[fc00::1]')).toThrow(SSRFValidationError);
      expect(() => validateUrlForSSRF('http://[fd00::1]')).toThrow(SSRFValidationError);
    });

    it('should block fe80::/10 link-local addresses', () => {
      expect(() => validateUrlForSSRF('http://[fe80::1]')).toThrow(SSRFValidationError);
    });

    it('should block ::1 loopback', () => {
      expect(() => validateUrlForSSRF('http://[::1]')).toThrow(SSRFValidationError);
      expect(() => validateUrlForSSRF('http://[0:0:0:0:0:0:0:1]')).toThrow(SSRFValidationError);
    });
  });

  describe('edge cases', () => {
    it('should handle invalid URLs', () => {
      expect(() => validateUrlForSSRF('not-a-url')).toThrow(SSRFValidationError);
      expect(() => validateUrlForSSRF('not-a-url')).toThrow(/Invalid URL format/i);
    });

    it('should handle empty strings', () => {
      expect(() => validateUrlForSSRF('')).toThrow(SSRFValidationError);
    });

    it('should block single-octet IP notation', () => {
      // Some systems interpret "127" as "127.0.0.1"
      expect(() => validateUrlForSSRF('http://127/')).toThrow(SSRFValidationError);
    });

    it('should handle URLs with ports', () => {
      expect(() => validateUrlForSSRF('http://192.168.1.1:8080')).toThrow(SSRFValidationError);
      expect(() => validateUrlForSSRF('https://example.com:8080')).not.toThrow();
    });

    it('should handle URLs with paths', () => {
      expect(() => validateUrlForSSRF('http://10.0.0.1/api/v1')).toThrow(SSRFValidationError);
      expect(() => validateUrlForSSRF('https://example.com/api/v1')).not.toThrow();
    });

    it('should handle URLs with query strings', () => {
      expect(() => validateUrlForSSRF('http://192.168.1.1?foo=bar')).toThrow(
        SSRFValidationError,
      );
      expect(() => validateUrlForSSRF('https://example.com?foo=bar')).not.toThrow();
    });
  });

  describe('bypass protection', () => {
    it('should skip all validation when PROMPTFOO_DISABLE_SSRF_PROTECTION is set', () => {
      process.env.PROMPTFOO_DISABLE_SSRF_PROTECTION = 'true';

      // All these should now pass
      expect(() => validateUrlForSSRF('file:///etc/passwd')).not.toThrow();
      expect(() => validateUrlForSSRF('http://localhost')).not.toThrow();
      expect(() => validateUrlForSSRF('http://10.0.0.1')).not.toThrow();
      expect(() => validateUrlForSSRF('http://192.168.1.1')).not.toThrow();
    });
  });

  describe('real-world scenarios', () => {
    it('should allow typical LLM API endpoints', () => {
      expect(() => validateUrlForSSRF('https://api.openai.com/v1/chat/completions')).not.toThrow();
      expect(() => validateUrlForSSRF('https://api.anthropic.com/v1/messages')).not.toThrow();
      expect(() =>
        validateUrlForSSRF('https://generativelanguage.googleapis.com/v1/models'),
      ).not.toThrow();
    });

    it('should block common cloud metadata endpoints', () => {
      // AWS metadata endpoint
      expect(() => validateUrlForSSRF('http://169.254.169.254/latest/meta-data/')).toThrow(
        SSRFValidationError,
      );

      // GCP metadata endpoint
      expect(() => validateUrlForSSRF('http://169.254.169.254/computeMetadata/v1/')).toThrow(
        SSRFValidationError,
      );
    });

    it('should block internal Kubernetes service endpoints', () => {
      expect(() => validateUrlForSSRF('http://10.0.0.1:443')).toThrow(SSRFValidationError);
    });
  });
});
