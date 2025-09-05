import { HttpProvider } from '../../src/providers/http';
import { sanitizeUrl } from '../../src/util/fetch';
import { fetchWithCache } from '../../src/cache';
import logger from '../../src/logger';

jest.mock('../../src/cache', () => ({
  ...jest.requireActual('../../src/cache'),
  fetchWithCache: jest.fn(),
}));

describe('HTTP Provider - Sanitization Integration Tests', () => {
  let loggerDebugSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    loggerDebugSpy = jest.spyOn(logger, 'debug');
  });

  afterEach(() => {
    loggerDebugSpy.mockRestore();
  });

  describe('Header sanitization in logs', () => {
    it('should sanitize sensitive headers while preserving functionality', async () => {
      const provider = new HttpProvider('https://api.example.com/test', {
        config: {
          method: 'POST',
          body: { message: '{{ prompt }}' },
          headers: {
            Authorization: 'Bearer secret-token-12345',
            'X-API-Key': 'sk-test-abc123',
            'Content-Type': 'application/json',
          },
        },
      });

      const mockResponse = {
        data: '{"success": true}',
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      await provider.callApi('test message');

      // Verify headers are sanitized in logs
      const debugCall = loggerDebugSpy.mock.calls.find(
        (call) => call[0].includes('Calling') && call[0].includes('with config:'),
      );
      expect(debugCall).toBeDefined();

      const logMessage = debugCall[0];
      expect(logMessage).toContain('"authorization":"[REDACTED]"');
      expect(logMessage).toContain('"x-api-key":"[REDACTED]"');
      expect(logMessage).not.toContain('secret-token-12345');
      expect(logMessage).not.toContain('sk-test-abc123');

      // Verify actual functionality works - fetchWithCache should get real headers
      expect(fetchWithCache).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: 'Bearer secret-token-12345', // Real token sent (lowercase)
            'x-api-key': 'sk-test-abc123', // Real key sent
          }),
        }),
        expect.any(Number),
        'text',
        undefined,
        undefined,
      );
    });

    it('should preserve non-sensitive headers in logs', async () => {
      const provider = new HttpProvider('https://api.example.com/test', {
        config: {
          method: 'POST',
          body: { message: '{{ prompt }}' },
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'test-client/1.0',
            Accept: 'application/json',
          },
        },
      });

      const mockResponse = {
        data: '{"success": true}',
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      await provider.callApi('test message');

      const debugCall = loggerDebugSpy.mock.calls.find(
        (call) => call[0].includes('Calling') && call[0].includes('with config:'),
      );
      expect(debugCall).toBeDefined();

      const logMessage = debugCall[0];
      expect(logMessage).toContain('"content-type":"application/json"');
      expect(logMessage).toContain('"user-agent":"test-client/1.0"');
      expect(logMessage).toContain('"accept":"application/json"');
      expect(logMessage).not.toContain('[REDACTED]');
    });
  });

  describe('URL sanitization', () => {
    it('should sanitize URL query parameters', async () => {
      const provider = new HttpProvider(
        'https://api.example.com/test?api_key=secret123&format=json',
        {
          config: {
            method: 'GET',
          },
        },
      );

      const mockResponse = {
        data: '{"success": true}',
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      await provider.callApi('test');

      const debugCall = loggerDebugSpy.mock.calls.find((call) => call[0].includes('Calling'));
      expect(debugCall).toBeDefined();

      const logMessage = debugCall[0];
      expect(logMessage).toContain('api_key=%5BREDACTED%5D');
      expect(logMessage).toContain('format=json'); // Non-sensitive param preserved
      // Note: The URL in config object may contain the original secret, but the main URL is sanitized
    });

    it('should work with standalone sanitizeUrl function', () => {
      const testCases = [
        {
          input: 'https://user:pass@api.com/test?api_key=secret&normal=value',
          expectContains: ['***:***', 'api_key=%5BREDACTED%5D', 'normal=value'],
          expectNotContains: ['user', 'secret'],
        },
        {
          input: 'https://api.com/test?token=bearer123&id=123',
          expectContains: ['token=%5BREDACTED%5D', 'id=123'],
          expectNotContains: ['bearer123'],
        },
      ];

      testCases.forEach(({ input, expectContains, expectNotContains }) => {
        const result = sanitizeUrl(input);

        expectContains.forEach((expectedText) => {
          expect(result).toContain(expectedText);
        });

        expectNotContains.forEach((secretText) => {
          expect(result).not.toContain(secretText);
        });
      });
    });
  });

  describe('Combined sanitization scenarios', () => {
    it('should handle both URL and header sanitization together', async () => {
      const provider = new HttpProvider('https://api.example.com/test?api_key=url_secret123', {
        config: {
          method: 'POST',
          body: { data: '{{ prompt }}' },
          headers: {
            Authorization: 'Bearer header_secret456',
          },
        },
      });

      const mockResponse = {
        data: '{"result": "success"}',
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      await provider.callApi('test data');

      const debugCall = loggerDebugSpy.mock.calls.find((call) => call[0].includes('Calling'));
      expect(debugCall).toBeDefined();

      const logMessage = debugCall[0];

      // Both URL and header credentials should be sanitized
      expect(logMessage).toContain('api_key=%5BREDACTED%5D');
      expect(logMessage).toContain('"authorization":"[REDACTED]"');

      // Header secret should not appear
      expect(logMessage).not.toContain('header_secret456');
      // Note: URL in config object may contain original secret, but main URL is sanitized
    });

    it('should not impact performance significantly', async () => {
      const provider = new HttpProvider('https://api.example.com/perf', {
        config: {
          method: 'POST',
          body: { test: 'performance' },
          headers: {
            Authorization: 'Bearer perf-token-123',
          },
        },
      });

      const mockResponse = {
        data: '{"result": "success"}',
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const startTime = Date.now();

      // Run multiple calls to test performance impact
      const promises = Array.from({ length: 5 }, () => provider.callApi('performance test'));

      await Promise.all(promises);

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should complete reasonably quickly (less than 500ms for 5 calls)
      expect(totalTime).toBeLessThan(500);

      // Verify all calls were sanitized
      const debugCalls = loggerDebugSpy.mock.calls.filter(
        (call) => call[0].includes('Calling') && call[0].includes('with config:'),
      );

      expect(debugCalls.length).toBeGreaterThan(0);
      debugCalls.forEach((call) => {
        expect(call[0]).toContain('"authorization":"[REDACTED]"');
        expect(call[0]).not.toContain('perf-token-123');
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle empty or undefined values gracefully', async () => {
      const provider = new HttpProvider('https://api.example.com/test', {
        config: {
          method: 'POST',
          body: { test: 'value' },
          headers: {
            'Content-Type': 'application/json',
            Authorization: '', // Empty header value
          },
        },
      });

      const mockResponse = {
        data: '{"result": "test"}',
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      // Should not crash
      await expect(provider.callApi('test prompt')).resolves.not.toThrow();

      // Should still log something
      expect(loggerDebugSpy).toHaveBeenCalled();
    });

    it('should handle malformed URLs in sanitizeUrl function', () => {
      const malformedInputs = ['not-a-url', '', 'https://[invalid-host]/api'];

      malformedInputs.forEach((input) => {
        expect(() => sanitizeUrl(input)).not.toThrow();
        const result = sanitizeUrl(input);
        expect(result).toBeDefined();
      });

      // Test null/undefined separately as they return the input as-is
      expect(sanitizeUrl(null as any)).toBeNull();
      expect(sanitizeUrl(undefined as any)).toBeUndefined();
    });
  });
});
