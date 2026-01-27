import { describe, expect, it, vi } from 'vitest';
import { parseRateLimitHeaders, parseRetryAfter } from '../../src/scheduler/headerParser';

describe('parseRateLimitHeaders', () => {
  describe('OpenAI format (x-ratelimit-*)', () => {
    it('should parse OpenAI request rate limit headers', () => {
      const headers = {
        'x-ratelimit-remaining-requests': '100',
        'x-ratelimit-limit-requests': '500',
      };

      const result = parseRateLimitHeaders(headers);

      expect(result.remainingRequests).toBe(100);
      expect(result.limitRequests).toBe(500);
    });

    it('should parse OpenAI token rate limit headers', () => {
      const headers = {
        'x-ratelimit-remaining-tokens': '50000',
        'x-ratelimit-limit-tokens': '90000',
      };

      const result = parseRateLimitHeaders(headers);

      expect(result.remainingTokens).toBe(50000);
      expect(result.limitTokens).toBe(90000);
    });

    it('should parse generic x-ratelimit headers', () => {
      const headers = {
        'x-ratelimit-remaining': '250',
        'x-ratelimit-limit': '1000',
      };

      const result = parseRateLimitHeaders(headers);

      expect(result.remainingRequests).toBe(250);
      expect(result.limitRequests).toBe(1000);
    });

    it('should parse x-ratelimit-reset as Unix timestamp in seconds', () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 60; // 60 seconds from now
      const headers = {
        'x-ratelimit-reset': futureTimestamp.toString(),
      };

      const result = parseRateLimitHeaders(headers);

      expect(result.resetAt).toBe(futureTimestamp * 1000);
    });

    it('should parse x-ratelimit-reset as duration string', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const headers = {
        'x-ratelimit-reset-requests': '30s',
      };

      const result = parseRateLimitHeaders(headers);

      expect(result.resetAt).toBe(now + 30000);

      vi.restoreAllMocks();
    });
  });

  describe('Anthropic format (anthropic-ratelimit-*)', () => {
    it('should parse Anthropic request rate limit headers', () => {
      const headers = {
        'anthropic-ratelimit-requests-remaining': '45',
        'anthropic-ratelimit-requests-limit': '50',
      };

      const result = parseRateLimitHeaders(headers);

      expect(result.remainingRequests).toBe(45);
      expect(result.limitRequests).toBe(50);
    });

    it('should parse Anthropic token rate limit headers', () => {
      const headers = {
        'anthropic-ratelimit-tokens-remaining': '80000',
        'anthropic-ratelimit-tokens-limit': '100000',
      };

      const result = parseRateLimitHeaders(headers);

      expect(result.remainingTokens).toBe(80000);
      expect(result.limitTokens).toBe(100000);
    });

    it('should parse anthropic-ratelimit-requests-reset as duration string', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const headers = {
        'anthropic-ratelimit-requests-reset': '1m30s',
      };

      const result = parseRateLimitHeaders(headers);

      expect(result.resetAt).toBe(now + 90000);

      vi.restoreAllMocks();
    });
  });

  describe('Generic format (ratelimit-*)', () => {
    it('should parse generic ratelimit headers', () => {
      const headers = {
        'ratelimit-remaining': '300',
        'ratelimit-limit': '600',
      };

      const result = parseRateLimitHeaders(headers);

      expect(result.remainingRequests).toBe(300);
      expect(result.limitRequests).toBe(600);
    });

    it('should parse ratelimit-reset as relative seconds', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const headers = {
        'ratelimit-reset': '120', // 2 minutes in the future (small number = relative)
      };

      const result = parseRateLimitHeaders(headers);

      expect(result.resetAt).toBe(now + 120000);

      vi.restoreAllMocks();
    });
  });

  describe('Case insensitivity', () => {
    it('should handle mixed case header names', () => {
      const headers = {
        'X-RateLimit-Remaining-Requests': '100',
        'X-RateLimit-Limit-Requests': '500',
        'Anthropic-RateLimit-Tokens-Remaining': '50000',
      };

      const result = parseRateLimitHeaders(headers);

      expect(result.remainingRequests).toBe(100);
      expect(result.limitRequests).toBe(500);
      expect(result.remainingTokens).toBe(50000);
    });

    it('should handle uppercase Retry-After header', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const headers = {
        'RETRY-AFTER': '60',
      };

      const result = parseRateLimitHeaders(headers);

      expect(result.retryAfterMs).toBe(60000);
      expect(result.resetAt).toBe(now + 60000);

      vi.restoreAllMocks();
    });
  });

  describe('Header priority', () => {
    it('should prioritize specific headers over generic ones', () => {
      const headers = {
        'x-ratelimit-remaining-requests': '100',
        'x-ratelimit-remaining': '200',
      };

      const result = parseRateLimitHeaders(headers);

      // Should use the more specific header
      expect(result.remainingRequests).toBe(100);
    });

    it('should use first valid reset header', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const headers = {
        'x-ratelimit-reset-requests': '30s',
        'x-ratelimit-reset': '60s',
      };

      const result = parseRateLimitHeaders(headers);

      // Should use x-ratelimit-reset-requests (first in priority list)
      expect(result.resetAt).toBe(now + 30000);

      vi.restoreAllMocks();
    });
  });

  describe('Retry-After handling', () => {
    it('should parse retry-after-ms header', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const headers = {
        'retry-after-ms': '5000',
      };

      const result = parseRateLimitHeaders(headers);

      expect(result.retryAfterMs).toBe(5000);
      expect(result.resetAt).toBe(now + 5000);

      vi.restoreAllMocks();
    });

    it('should parse retry-after as integer seconds', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const headers = {
        'retry-after': '30',
      };

      const result = parseRateLimitHeaders(headers);

      expect(result.retryAfterMs).toBe(30000);
      expect(result.resetAt).toBe(now + 30000);

      vi.restoreAllMocks();
    });

    it('should not override resetAt if already set', () => {
      const now = Date.now();
      const futureTime = now + 120000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const headers = {
        'x-ratelimit-reset': '2m',
        'retry-after': '30',
      };

      const result = parseRateLimitHeaders(headers);

      // resetAt should be from x-ratelimit-reset, not retry-after
      expect(result.resetAt).toBe(futureTime);
      expect(result.retryAfterMs).toBe(30000);

      vi.restoreAllMocks();
    });

    it('should prioritize retry-after-ms over retry-after', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const headers = {
        'retry-after-ms': '5000',
        'retry-after': '30',
      };

      const result = parseRateLimitHeaders(headers);

      expect(result.retryAfterMs).toBe(5000);

      vi.restoreAllMocks();
    });
  });

  describe('Duration parsing', () => {
    it('should parse milliseconds duration', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const headers = {
        'x-ratelimit-reset': '500ms',
      };

      const result = parseRateLimitHeaders(headers);

      expect(result.resetAt).toBe(now + 500);

      vi.restoreAllMocks();
    });

    it('should parse seconds duration', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const headers = {
        'x-ratelimit-reset': '45s',
      };

      const result = parseRateLimitHeaders(headers);

      expect(result.resetAt).toBe(now + 45000);

      vi.restoreAllMocks();
    });

    it('should parse minutes and seconds duration', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const headers = {
        'x-ratelimit-reset': '1m30s',
      };

      const result = parseRateLimitHeaders(headers);

      expect(result.resetAt).toBe(now + 90000); // 60s + 30s

      vi.restoreAllMocks();
    });

    it('should parse hours and minutes duration', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const headers = {
        'x-ratelimit-reset': '1h30m',
      };

      const result = parseRateLimitHeaders(headers);

      expect(result.resetAt).toBe(now + 5400000); // 3600s + 1800s

      vi.restoreAllMocks();
    });

    it('should parse complex duration with hours, minutes, and seconds', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const headers = {
        'x-ratelimit-reset': '2h15m30s',
      };

      const result = parseRateLimitHeaders(headers);

      expect(result.resetAt).toBe(now + 8130000); // 7200s + 900s + 30s

      vi.restoreAllMocks();
    });

    it('should parse minutes-only duration', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const headers = {
        'x-ratelimit-reset': '5m',
      };

      const result = parseRateLimitHeaders(headers);

      expect(result.resetAt).toBe(now + 300000);

      vi.restoreAllMocks();
    });

    it('should parse hours-only duration', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const headers = {
        'x-ratelimit-reset': '1h',
      };

      const result = parseRateLimitHeaders(headers);

      expect(result.resetAt).toBe(now + 3600000);

      vi.restoreAllMocks();
    });
  });

  describe('Edge cases', () => {
    it('should return empty object for empty headers', () => {
      const result = parseRateLimitHeaders({});

      expect(result).toEqual({});
    });

    it('should ignore headers with invalid numeric values', () => {
      const headers = {
        'x-ratelimit-remaining-requests': 'invalid',
        'x-ratelimit-limit-tokens': 'not-a-number',
      };

      const result = parseRateLimitHeaders(headers);

      expect(result.remainingRequests).toBeUndefined();
      expect(result.limitTokens).toBeUndefined();
    });

    it('should ignore negative values', () => {
      const headers = {
        'x-ratelimit-remaining-requests': '-5',
        'x-ratelimit-limit-requests': '-100',
      };

      const result = parseRateLimitHeaders(headers);

      expect(result.remainingRequests).toBeUndefined();
      expect(result.limitRequests).toBeUndefined();
    });

    it('should handle zero values correctly', () => {
      const headers = {
        'x-ratelimit-remaining-requests': '0',
        'x-ratelimit-limit-requests': '0',
      };

      const result = parseRateLimitHeaders(headers);

      expect(result.remainingRequests).toBe(0);
      expect(result.limitRequests).toBe(0);
    });

    it('should ignore invalid retry-after-ms values', () => {
      const headers = {
        'retry-after-ms': 'invalid',
      };

      const result = parseRateLimitHeaders(headers);

      expect(result.retryAfterMs).toBeUndefined();
      expect(result.resetAt).toBeUndefined();
    });

    it('should accept zero retry-after-ms as immediate retry', () => {
      const headers = {
        'retry-after-ms': '0',
      };

      const result = parseRateLimitHeaders(headers);

      // 0 means "retry immediately" - this is valid per HTTP spec
      expect(result.retryAfterMs).toBe(0);
    });

    it('should ignore negative retry-after-ms', () => {
      const headers = {
        'retry-after-ms': '-5',
      };

      const result = parseRateLimitHeaders(headers);

      expect(result.retryAfterMs).toBeUndefined();
    });

    it('should handle missing header values', () => {
      const headers = {
        'x-ratelimit-remaining-requests': '',
        'x-ratelimit-limit-requests': '',
      };

      const result = parseRateLimitHeaders(headers);

      expect(result.remainingRequests).toBeUndefined();
      expect(result.limitRequests).toBeUndefined();
    });

    it('should handle whitespace in numeric values', () => {
      const headers = {
        'x-ratelimit-remaining-requests': '  100  ',
        'retry-after': ' 30 ',
      };

      const result = parseRateLimitHeaders(headers);

      expect(result.remainingRequests).toBe(100);
      // parseRetryAfter trims the value before parsing
      expect(result.retryAfterMs).toBe(30000);
    });

    it('should parse Unix timestamp in milliseconds', () => {
      const futureTimestampMs = Date.now() + 60000;
      const headers = {
        'x-ratelimit-reset': futureTimestampMs.toString(),
      };

      const result = parseRateLimitHeaders(headers);

      expect(result.resetAt).toBe(futureTimestampMs);
    });
  });
});

describe('parseRetryAfter', () => {
  describe('Integer seconds', () => {
    it('should parse integer seconds', () => {
      const result = parseRetryAfter('60');

      expect(result).toBe(60000);
    });

    it('should parse zero seconds', () => {
      const result = parseRetryAfter('0');

      expect(result).toBe(0);
    });

    it('should handle whitespace', () => {
      const result = parseRetryAfter('  30  ');

      expect(result).toBe(30000);
    });

    it('should reject non-integer strings', () => {
      const result = parseRetryAfter('30.5');

      expect(result).toBeNull();
    });

    it('should reject strings with trailing text', () => {
      const result = parseRetryAfter('30 seconds');

      expect(result).toBeNull();
    });
  });

  describe('HTTP-date format', () => {
    it('should parse RFC 7231 HTTP-date', () => {
      const now = Date.now();
      const futureDate = new Date(now + 60000);
      const httpDate = futureDate.toUTCString();

      const result = parseRetryAfter(httpDate);

      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(60000);
    });

    it('should parse ISO 8601 date string', () => {
      const now = Date.now();
      const futureDate = new Date(now + 120000);
      const isoDate = futureDate.toISOString();

      const result = parseRetryAfter(isoDate);

      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(120000);
    });

    it('should return 0 for dates in the past', () => {
      const pastDate = new Date(Date.now() - 60000);
      const httpDate = pastDate.toUTCString();

      const result = parseRetryAfter(httpDate);

      expect(result).toBe(0);
    });

    it('should reject dates too far in the future', () => {
      const veryFutureDate = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000); // 400 days
      const httpDate = veryFutureDate.toUTCString();

      const result = parseRetryAfter(httpDate);

      expect(result).toBeNull();
    });

    it('should reject dates too far in the past', () => {
      const veryPastDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000); // 400 days ago
      const httpDate = veryPastDate.toUTCString();

      const result = parseRetryAfter(httpDate);

      expect(result).toBeNull();
    });
  });

  describe('Invalid values', () => {
    it('should return null for invalid string', () => {
      const result = parseRetryAfter('invalid');

      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = parseRetryAfter('');

      expect(result).toBeNull();
    });

    it('should reject negative seconds', () => {
      const result = parseRetryAfter('-30');

      // Negative values are invalid per audit feedback - must be non-negative
      expect(result).toBeNull();
    });

    it('should return null for duration format', () => {
      // parseRetryAfter does not support duration format
      const result = parseRetryAfter('30s');

      expect(result).toBeNull();
    });
  });
});
