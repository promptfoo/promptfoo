import { discoverRateLimit } from '../../../src/redteam/extraction/rateLimit';
import type { ApiProvider, ProviderResponse } from '../../../src/types';

describe('Rate Limit Discovery (Fixed Implementation)', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('discoverRateLimit', () => {
    it('should detect standard rate limits from X-RateLimit headers', async () => {
      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: 'test response',
        }),
      };

      const mockResponse = {
        output: 'test response',
        metadata: {
          http: {
            status: 200,
            statusText: 'OK',
            headers: {
              'x-ratelimit-limit': '100',
              'x-ratelimit-remaining': '99',
              'x-ratelimit-reset': '1709459299',
            },
          },
        },
      };

      const result = await discoverRateLimit(mockProvider, { response: mockResponse });

      expect(result.detected).toBe(true);
      expect(result.detectionMethod).toBe('headers');
      expect(result.confidence).toBe('medium'); // Medium confidence due to unknown time window
      expect(result.requestsPerMinute).toBe(100); // Default assumption for unknown window
      expect(result.requestsPerSecond).toBe(1); // 100/60 rounded down
      expect(result.timeWindow).toBe('unknown'); // No window specified
      expect(result.warnings).toContain(
        'Unable to determine time window for rate limit 100, assuming per-minute',
      );
      expect(result.headers).toHaveProperty('limit', '100');
      expect(result.headers).toHaveProperty('remaining', '99');
    });

    it('should detect GitHub-style rate limits with proper time windows', async () => {
      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: 'test response',
        }),
      };

      const mockResponse = {
        output: 'test response',
        metadata: {
          http: {
            status: 200,
            statusText: 'OK',
            headers: {
              'x-ratelimit-limit': '5000',
              'x-ratelimit-remaining': '4999',
              'x-ratelimit-reset': '3600', // 1 hour
            },
          },
        },
      };

      const result = await discoverRateLimit(mockProvider, { response: mockResponse });

      expect(result.detected).toBe(true);
      expect(result.detectionMethod).toBe('headers');
      expect(result.confidence).toBe('high'); // High confidence with clear time window
      expect(result.requestsPerHour).toBe(5000);
      expect(result.requestsPerMinute).toBe(83); // 5000/60 rounded down
      expect(result.requestsPerSecond).toBe(1); // 5000/3600 rounded down
      expect(result.timeWindow).toBe('1h');
    });

    it('should detect Twitter-style 15-minute windows', async () => {
      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: 'test response',
        }),
      };

      const mockResponse = {
        output: 'test response',
        metadata: {
          http: {
            status: 200,
            statusText: 'OK',
            headers: {
              'x-rate-limit-limit': '300',
              'x-rate-limit-remaining': '299',
              'x-rate-limit-reset': '900', // 15 minutes
            },
          },
        },
      };

      const result = await discoverRateLimit(mockProvider, { response: mockResponse });

      expect(result.detected).toBe(true);
      expect(result.confidence).toBe('high');
      expect(result.requestsPerMinute).toBe(20); // 300/15
      expect(result.requestsPerSecond).toBe(0); // 300/900 rounded down
      expect(result.timeWindow).toBe('15m');
    });

    it('should return no detection when no rate limit headers present', async () => {
      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: 'test response',
        }),
      };

      const mockResponse = {
        output: 'test response',
        metadata: {
          http: {
            status: 200,
            statusText: 'OK',
            headers: {
              'content-type': 'application/json',
              server: 'nginx',
            },
          },
        },
      };

      const result = await discoverRateLimit(mockProvider, { response: mockResponse });

      expect(result.detected).toBe(false);
      expect(result.detectionMethod).toBe('headers');
      expect(result.confidence).toBe('high'); // High confidence that we checked properly
      expect(result.headers).toBeUndefined();
      expect(result.warnings).toBeUndefined();
    });

    it('should handle API errors gracefully by fallback with no response', async () => {
      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest.fn().mockRejectedValue(new Error('Network timeout')),
      };

      const result = await discoverRateLimit(mockProvider); // No response provided

      expect(result.detected).toBe(false);
      expect(result.detectionMethod).toBe('none');
      expect(result.confidence).toBe('high'); // High confidence when no response provided
    });

    it('should handle missing or malformed headers gracefully', async () => {
      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: 'test response',
        }),
      };

      const mockResponse = {
        output: 'test response',
        metadata: {
          http: {
            status: 200,
            statusText: 'OK',
            headers: null, // Malformed headers
          },
        },
      };

      const result = await discoverRateLimit(mockProvider, { response: mockResponse });

      expect(result.detected).toBe(false);
      expect(result.detectionMethod).toBe('none');
      expect(result.confidence).toBe('high');
    });

    it('should detect case-insensitive headers from multiple standards', async () => {
      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: 'test response',
        }),
      };

      const mockResponse = {
        output: 'test response',
        metadata: {
          http: {
            status: 200,
            statusText: 'OK',
            headers: {
              'X-Rate-Limit-Limit': '1000', // Twitter style with different casing
              'X-RATE-LIMIT-REMAINING': '999',
            },
          },
        },
      };

      const result = await discoverRateLimit(mockProvider, { response: mockResponse });

      expect(result.detected).toBe(true);
      expect(result.detectionMethod).toBe('headers');
      expect(result.requestsPerMinute).toBe(1000);
    });

    it('should validate rate limit values and warn about unusual values', async () => {
      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: 'test response',
        }),
      };

      const mockResponse = {
        output: 'test response',
        metadata: {
          http: {
            status: 200,
            statusText: 'OK',
            headers: {
              'x-ratelimit-limit': '100000', // Very high limit
              'x-ratelimit-window': '60',
            },
          },
        },
      };

      const result = await discoverRateLimit(mockProvider, { response: mockResponse });

      expect(result.detected).toBe(true);
      expect(result.requestsPerMinute).toBe(100000);
      expect(result.requestsPerSecond).toBe(1666); // 100000/60
      expect(result.warnings).toContain('Unusually high rate limit detected: 1666 RPS');
      expect(result.warnings).toContain('Unusually high rate limit detected: 100000 RPM');
      expect(result.confidence).toBe('medium'); // Downgraded due to warnings
    });

    it('should handle invalid rate limit values', async () => {
      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: 'test response',
        }),
      };

      const mockResponse = {
        output: 'test response',
        metadata: {
          http: {
            status: 200,
            statusText: 'OK',
            headers: {
              'x-ratelimit-limit': 'invalid-number',
              'x-ratelimit-remaining': '99',
            },
          },
        },
      };

      const result = await discoverRateLimit(mockProvider, { response: mockResponse });

      expect(result.detected).toBe(true);
      expect(result.warnings).toContain('Invalid rate limit value: invalid-number');
      expect(result.requestsPerMinute).toBeUndefined(); // No valid rate parsed
      expect(result.confidence).toBe('medium'); // Downgraded due to parsing issues
    });

    it('should handle non-string header values safely', async () => {
      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: 'test response',
        }),
      };

      const mockResponse = {
        output: 'test response',
        metadata: {
          http: {
            status: 200,
            statusText: 'OK',
            headers: {
              'x-ratelimit-limit': 100 as any, // Number instead of string
              'x-ratelimit-remaining': '99',
              'invalid-header': { object: 'value' } as any, // Object header - should be ignored
            },
          },
        },
      };

      const result = await discoverRateLimit(mockProvider, { response: mockResponse });

      expect(result.detected).toBe(true);
      expect(result.requestsPerMinute).toBe(100); // Should handle number conversion
      expect(result.headers).toHaveProperty('limit', '100'); // Converted to string
    });

    it('should use fallback request when enabled and no response provided', async () => {
      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: 'test response',
          metadata: {
            http: {
              status: 200,
              statusText: 'OK',
              headers: {
                'x-ratelimit-limit': '50',
                'x-ratelimit-remaining': '49',
              },
            },
          },
        }),
      };

      const result = await discoverRateLimit(mockProvider, { fallbackToRequest: true });

      expect(result.detected).toBe(true);
      expect(result.detectionMethod).toBe('headers');
      expect(result.requestsPerMinute).toBe(50);
      expect(mockProvider.callApi).toHaveBeenCalledWith('test');
    });
  });
});