import { discoverRateLimit, type RateLimitInfo } from '../../../src/redteam/extraction/rateLimit';
import type { ApiProvider, ProviderResponse } from '../../../src/types';

describe('Rate Limit Discovery', () => {
  describe('discoverRateLimit', () => {
    it('should detect rate limits from headers', async () => {
      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: 'test response',
          metadata: {
            http: {
              status: 200,
              statusText: 'OK',
              headers: {
                'x-ratelimit-limit': '100',
                'x-ratelimit-remaining': '99',
                'x-ratelimit-reset': '1609459200'
              }
            }
          }
        } as ProviderResponse)
      };

      const result = await discoverRateLimit(mockProvider);

      expect(result.detected).toBe(true);
      expect(result.detectionMethod).toBe('headers');
      expect(result.confidence).toBe('high');
      expect(result.requestsPerMinute).toBe(100);
      expect(result.requestsPerSecond).toBe(1); // 100/60 rounded down
      expect(result.headers).toEqual({
        limit: '100',
        remaining: '99',
        reset: '1609459200'
      });
    });

    it('should return no detection when no rate limit headers present', async () => {
      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: 'test response',
          metadata: {
            http: {
              status: 200,
              statusText: 'OK',
              headers: {
                'content-type': 'application/json'
              }
            }
          }
        } as ProviderResponse)
      };

      const result = await discoverRateLimit(mockProvider);

      expect(result.detected).toBe(false);
      expect(result.detectionMethod).toBe('headers');
      expect(result.confidence).toBe('high');
    });

    it('should handle API errors gracefully', async () => {
      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest.fn().mockRejectedValue(new Error('API Error'))
      };

      const result = await discoverRateLimit(mockProvider);

      expect(result.detected).toBe(false);
      expect(result.detectionMethod).toBe('headers');
      expect(result.confidence).toBe('low');
    });

    it('should detect case-insensitive headers', async () => {
      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: 'test response',
          metadata: {
            http: {
              status: 200,
              statusText: 'OK',
              headers: {
                'X-Rate-Limit-Limit': '50',
                'X-RATE-LIMIT-REMAINING': '49'
              }
            }
          }
        } as ProviderResponse)
      };

      const result = await discoverRateLimit(mockProvider);

      expect(result.detected).toBe(true);
      expect(result.detectionMethod).toBe('headers');
      expect(result.requestsPerMinute).toBe(50);
    });

    it('should perform active probing when enabled', async () => {
      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest.fn()
          .mockResolvedValueOnce({
            output: 'test response',
            metadata: { http: { status: 200, statusText: 'OK', headers: {} } }
          })
          .mockResolvedValueOnce({
            output: 'test response', 
            metadata: { http: { status: 200, statusText: 'OK', headers: {} } }
          })
          .mockResolvedValueOnce({
            output: 'test response',
            metadata: { http: { status: 200, statusText: 'OK', headers: {} } }
          })
          .mockRejectedValue(new Error('Rate limited'))
      };

      const result = await discoverRateLimit(mockProvider, { activeProbing: true });

      expect(mockProvider.callApi).toHaveBeenCalledTimes(4); // 1 for headers + 3 successful + 1 error
      expect(result.detectionMethod).toBe('probing');
      // Should detect rate limits based on errors
    }, 15000); // Increase timeout for active probing test

    it('should skip active probing when not enabled', async () => {
      const mockProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({
          output: 'test response',
          metadata: { http: { status: 200, statusText: 'OK', headers: {} } }
        })
      };

      const result = await discoverRateLimit(mockProvider, { activeProbing: false });

      expect(mockProvider.callApi).toHaveBeenCalledTimes(1); // Only header check
      expect(result.detected).toBe(false);
      expect(result.detectionMethod).toBe('headers');
    });
  });
});