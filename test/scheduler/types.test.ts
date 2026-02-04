import { describe, expect, it } from 'vitest';
import {
  getProviderResponseHeaders,
  isProviderResponseRateLimited,
  isTransientConnectionError,
} from '../../src/scheduler/types';

import type { ProviderResponse } from '../../src/types/providers';

describe('isProviderResponseRateLimited', () => {
  describe('HTTP status detection', () => {
    it('should detect 429 status in metadata.http.status', () => {
      const result: ProviderResponse = {
        output: 'error',
        metadata: { http: { status: 429, statusText: 'Too Many Requests', headers: {} } },
      };
      expect(isProviderResponseRateLimited(result, undefined)).toBe(true);
    });

    it('should not flag other status codes', () => {
      const result: ProviderResponse = {
        output: 'success',
        metadata: { http: { status: 200, statusText: 'OK', headers: {} } },
      };
      expect(isProviderResponseRateLimited(result, undefined)).toBe(false);
    });
  });

  describe('Error field detection', () => {
    it('should detect 429 in result.error string', () => {
      const result: ProviderResponse = {
        output: '',
        error: 'HTTP 429: Too Many Requests',
      };
      expect(isProviderResponseRateLimited(result, undefined)).toBe(true);
    });

    it('should detect "rate limit" in result.error (case insensitive)', () => {
      const result: ProviderResponse = {
        output: '',
        error: 'Rate Limit Exceeded',
      };
      expect(isProviderResponseRateLimited(result, undefined)).toBe(true);
    });

    it('should handle undefined result.error gracefully', () => {
      const result: ProviderResponse = {
        output: 'success',
      };
      expect(isProviderResponseRateLimited(result, undefined)).toBe(false);
    });
  });

  describe('Thrown error detection', () => {
    it('should detect 429 in error.message', () => {
      const error = new Error('Request failed with status 429');
      expect(isProviderResponseRateLimited(undefined, error)).toBe(true);
    });

    it('should detect "rate limit" in error.message (case insensitive)', () => {
      const error = new Error('API rate limit exceeded');
      expect(isProviderResponseRateLimited(undefined, error)).toBe(true);
    });

    it('should detect "too many requests" in error.message', () => {
      const error = new Error('Too many requests, please slow down');
      expect(isProviderResponseRateLimited(undefined, error)).toBe(true);
    });

    it('should handle error with undefined message gracefully', () => {
      const error = new Error('placeholder');
      (error as { message: string | undefined }).message = undefined;
      expect(isProviderResponseRateLimited(undefined, error)).toBe(false);
    });

    it('should handle undefined error gracefully', () => {
      expect(isProviderResponseRateLimited(undefined, undefined)).toBe(false);
    });
  });

  describe('Combined detection', () => {
    it('should detect rate limit in result even with error present', () => {
      const result: ProviderResponse = {
        output: '',
        error: '429 rate limited',
      };
      const error = new Error('Some other error');
      expect(isProviderResponseRateLimited(result, error)).toBe(true);
    });

    it('should detect rate limit in error even with result present', () => {
      const result: ProviderResponse = {
        output: 'success',
      };
      const error = new Error('Rate limit exceeded');
      expect(isProviderResponseRateLimited(result, error)).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should not false-positive on similar strings', () => {
      const result: ProviderResponse = {
        output: 'The rate of change is 42.9%',
        error: 'Rating limit exceeded expectations',
      };
      // "Rating limit" is not "rate limit" - should not match
      // But actually... "rating limit" contains "rate" and "limit" separately
      // Let me check the actual logic - it uses .includes('rate limit')
      expect(isProviderResponseRateLimited(result, undefined)).toBe(false);
    });

    it('should handle empty result object', () => {
      const result: ProviderResponse = {};
      expect(isProviderResponseRateLimited(result, undefined)).toBe(false);
    });

    it('should handle result with nested undefined metadata', () => {
      const result: ProviderResponse = {
        output: 'success',
        metadata: {},
      };
      expect(isProviderResponseRateLimited(result, undefined)).toBe(false);
    });
  });
});

describe('getProviderResponseHeaders', () => {
  it('should extract headers from metadata.http.headers', () => {
    const result: ProviderResponse = {
      output: 'success',
      metadata: {
        http: {
          status: 200,
          statusText: 'OK',
          headers: {
            'x-ratelimit-remaining': '10',
            'x-ratelimit-limit': '100',
          },
        },
      },
    };
    const headers = getProviderResponseHeaders(result);
    expect(headers).toEqual({
      'x-ratelimit-remaining': '10',
      'x-ratelimit-limit': '100',
    });
  });

  it('should extract headers from metadata.headers as fallback', () => {
    const result: ProviderResponse = {
      output: 'success',
      metadata: {
        headers: {
          'retry-after': '60',
        },
      },
    };
    const headers = getProviderResponseHeaders(result);
    expect(headers).toEqual({
      'retry-after': '60',
    });
  });

  it('should prefer metadata.http.headers over metadata.headers', () => {
    const result: ProviderResponse = {
      output: 'success',
      metadata: {
        http: {
          status: 200,
          statusText: 'OK',
          headers: { 'x-from-http': 'true' },
        },
        headers: { 'x-from-meta': 'true' },
      },
    };
    const headers = getProviderResponseHeaders(result);
    expect(headers).toEqual({ 'x-from-http': 'true' });
  });

  it('should return undefined for result without headers', () => {
    const result: ProviderResponse = {
      output: 'success',
    };
    expect(getProviderResponseHeaders(result)).toBeUndefined();
  });

  it('should return undefined for undefined result', () => {
    expect(getProviderResponseHeaders(undefined)).toBeUndefined();
  });

  it('should return undefined for result with empty metadata', () => {
    const result: ProviderResponse = {
      output: 'success',
      metadata: {},
    };
    expect(getProviderResponseHeaders(result)).toBeUndefined();
  });
});

describe('isTransientConnectionError', () => {
  it('should detect bad record mac errors', () => {
    expect(isTransientConnectionError(new Error('bad record mac'))).toBe(true);
  });

  it('should detect EPROTO errors', () => {
    expect(isTransientConnectionError(new Error('write EPROTO 00000000:error:0A000126'))).toBe(
      true,
    );
  });

  it('should detect ECONNRESET errors', () => {
    expect(isTransientConnectionError(new Error('ECONNRESET'))).toBe(true);
  });

  it('should detect socket hang up errors', () => {
    expect(isTransientConnectionError(new Error('socket hang up'))).toBe(true);
  });

  it('should return false for undefined error', () => {
    expect(isTransientConnectionError(undefined)).toBe(false);
  });

  it('should return false for non-connection errors', () => {
    expect(isTransientConnectionError(new Error('Invalid API key'))).toBe(false);
  });

  it('should return false for rate limit errors', () => {
    expect(isTransientConnectionError(new Error('429 Too Many Requests'))).toBe(false);
  });

  it('should not match EPROTO with permanent certificate/config errors', () => {
    // wrong version number (HTTPS→HTTP mismatch)
    expect(
      isTransientConnectionError(
        new Error('write EPROTO 00000000:error:0A000102:SSL routines::wrong version number'),
      ),
    ).toBe(false);
    // self-signed certificate
    expect(
      isTransientConnectionError(
        new Error('write EPROTO: self signed certificate in certificate chain'),
      ),
    ).toBe(false);
    // unable to verify
    expect(
      isTransientConnectionError(new Error('write EPROTO: unable to verify the first certificate')),
    ).toBe(false);
    // unknown CA
    expect(isTransientConnectionError(new Error('write EPROTO: unknown ca'))).toBe(false);
    // expired certificate
    expect(isTransientConnectionError(new Error('write EPROTO: certificate has expired'))).toBe(
      false,
    );
    // cert keyword
    expect(isTransientConnectionError(new Error('write EPROTO: cert_untrusted'))).toBe(false);
  });

  it('should still match plain EPROTO without permanent phrases', () => {
    expect(isTransientConnectionError(new Error('write EPROTO 00000000:error:0A000126'))).toBe(
      true,
    );
  });

  it('should not match permanent SSL/TLS errors', () => {
    expect(isTransientConnectionError(new Error('self signed certificate'))).toBe(false);
    expect(isTransientConnectionError(new Error('unable to verify the first certificate'))).toBe(
      false,
    );
    expect(isTransientConnectionError(new Error('certificate has expired'))).toBe(false);
    expect(isTransientConnectionError(new Error('UNABLE_TO_GET_ISSUER_CERT'))).toBe(false);
    expect(isTransientConnectionError(new Error('ssl routines:ssl3_read_bytes'))).toBe(false);
    expect(isTransientConnectionError(new Error('tls alert unknown ca'))).toBe(false);
    expect(isTransientConnectionError(new Error('wrong version number'))).toBe(false);
  });
});
