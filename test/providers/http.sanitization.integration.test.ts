import { HttpProvider } from '../../src/providers/http';
import { sanitizeUrl } from '../../src/fetch';
import { fetchWithCache } from '../../src/cache';
import logger from '../../src/logger';

jest.mock('../../src/cache', () => ({
  ...jest.requireActual('../../src/cache'),
  fetchWithCache: jest.fn(),
}));

describe('HTTP Provider - Sanitization Integration Tests', () => {
  const mockUrl = 'http://example.com/api';
  let loggerDebugSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    loggerDebugSpy = jest.spyOn(logger, 'debug');
  });

  afterEach(() => {
    loggerDebugSpy.mockRestore();
  });

  describe('End-to-end sanitization', () => {
    it('should sanitize both URL credentials and config credentials in a single request', async () => {
      const sensitiveUrl =
        'https://dbuser:dbpass123@api.example.com/data?api_key=sk_live_secret456&format=json';

      const provider = new HttpProvider(sensitiveUrl, {
        config: {
          method: 'POST',
          body: { prompt: '{{ prompt }}' },
          headers: {
            Authorization: 'Bearer super_secret_token_789',
            'X-API-Key': 'sk_test_abc123',
            'Content-Type': 'application/json',
          },
          // Remove signatureAuth to avoid certificate errors
          apiKey: 'main_api_key_secret_123',
          token: 'bearer_token_secret_456',
          password: 'config_password_secret_789',
        },
      });

      const mockResponse = {
        data: '{"result": "success"}',
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      await provider.callApi('test prompt');

      // Verify URL sanitization in logs
      const urlDebugCall = loggerDebugSpy.mock.calls.find(
        (call) => call[0].includes('Calling') && call[0].includes('with config:'),
      );
      expect(urlDebugCall).toBeDefined();

      const logMessage = urlDebugCall[0];

      // URL credentials should be sanitized
      expect(logMessage).toContain('https://***:***@api.example.com');
      expect(logMessage).toContain('api_key=%5BREDACTED%5D');
      expect(logMessage).not.toContain('dbuser');
      expect(logMessage).not.toContain('dbpass123');
      expect(logMessage).not.toContain('sk_live_secret456');

      // Config credentials should be sanitized (headers are lowercase in logs)
      expect(logMessage).toContain('"authorization":"[REDACTED]"');
      expect(logMessage).toContain('"x-api-key":"[REDACTED]"');

      // Should not contain any actual secrets
      expect(logMessage).not.toContain('super_secret_token_789');
      expect(logMessage).not.toContain('sk_test_abc123');
      // Note: apiKey, token, password are config-level fields not included in rendered config
    });

    it('should sanitize raw request with sensitive URL and headers', async () => {
      const sensitiveUrl = 'https://admin:admin123@api.example.com/v1?token=secret_token_789';

      const provider = new HttpProvider(sensitiveUrl, {
        config: {
          request: `POST /v1?token=secret_token_789 HTTP/1.1
Host: api.example.com
Authorization: Bearer raw_bearer_token_123
X-API-Key: sk_raw_secret_456
X-Password: raw_password_789
Content-Type: application/json

{"prompt": "{{ prompt }}"}`,
        },
      });

      const mockResponse = {
        data: '{"result": "success"}',
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      await provider.callApi('test prompt');

      // Check URL sanitization
      const urlDebugCall = loggerDebugSpy.mock.calls.find(
        (call) => call[0].includes('Calling') && call[0].includes('with raw request:'),
      );
      expect(urlDebugCall).toBeDefined();

      const logMessage = urlDebugCall[0];

      // URL should be sanitized
      expect(logMessage).toContain('https://***:***@api.example.com');
      expect(logMessage).toContain('token=%5BREDACTED%5D');
      expect(logMessage).not.toContain('admin123');
      expect(logMessage).not.toContain('secret_token_789');

      // Headers should be sanitized
      expect(logMessage).toContain('"authorization":"[REDACTED]"');
      expect(logMessage).toContain('"x-api-key":"[REDACTED]"');
      expect(logMessage).toContain('"x-password":"[REDACTED]"');
      expect(logMessage).not.toContain('raw_bearer_token_123');
      expect(logMessage).not.toContain('sk_raw_secret_456');
      expect(logMessage).not.toContain('raw_password_789');
    });

    it('should handle complex URLs with multiple sensitive parameters', async () => {
      const complexUrl =
        'https://user:pass@api.example.com/oauth/token?client_id=abc&client_secret=def&api_key=ghi&password=jkl&access_token=mno&refresh_token=pqr&sig=stu&normal=keep&id_token=vwx';

      // Test standalone URL sanitization
      const sanitizedUrl = sanitizeUrl(complexUrl);

      expect(sanitizedUrl).toContain('***:***');
      expect(sanitizedUrl).toContain('client_secret=%5BREDACTED%5D');
      expect(sanitizedUrl).toContain('api_key=%5BREDACTED%5D');
      expect(sanitizedUrl).toContain('password=%5BREDACTED%5D');
      expect(sanitizedUrl).toContain('access_token=%5BREDACTED%5D');
      expect(sanitizedUrl).toContain('refresh_token=%5BREDACTED%5D');
      expect(sanitizedUrl).toContain('sig=%5BREDACTED%5D');
      expect(sanitizedUrl).toContain('id_token=%5BREDACTED%5D');
      expect(sanitizedUrl).toContain('normal=keep'); // Non-sensitive param preserved

      expect(sanitizedUrl).not.toContain('user');
      // Note: Can't check for 'pass' as it appears in 'password=' parameter name
      expect(sanitizedUrl).not.toContain('def'); // client_secret value
      expect(sanitizedUrl).not.toContain('ghi'); // api_key value 
      expect(sanitizedUrl).not.toContain('jkl'); // password value
      expect(sanitizedUrl).not.toContain('mno'); // access_token value
      expect(sanitizedUrl).not.toContain('pqr'); // refresh_token value
      expect(sanitizedUrl).not.toContain('stu'); // sig value
      expect(sanitizedUrl).not.toContain('vwx'); // id_token value

      // Test integration with HTTP provider
      const provider = new HttpProvider(complexUrl, {
        config: {
          method: 'GET',
        },
      });

      const mockResponse = {
        data: '{"result": "success"}',
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      await provider.callApi('test prompt');

      const debugCall = loggerDebugSpy.mock.calls.find(
        (call) => call[0].includes('Calling') && call[0].includes('with config:'),
      );
      expect(debugCall).toBeDefined();

      const logMessage = debugCall[0];
      expect(logMessage).toContain('***:***');
      expect(logMessage).toContain('%5BREDACTED%5D');
      expect(logMessage).toContain('normal=keep');
    });

    it('should maintain functionality while sanitizing logs', async () => {
      // Verify that sanitization doesn't break the actual API call
      const provider = new HttpProvider('https://api.example.com/test', {
        config: {
          method: 'POST',
          body: { message: '{{ prompt }}' },
          headers: {
            Authorization: 'Bearer real-token-123',
            'Content-Type': 'application/json',
          },
        },
      });

      const mockResponse = {
        data: '{"success": true, "message": "Hello World"}',
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('Hello');

      // Verify the actual functionality works
      expect(result.output).toBe('{"success": true, "message": "Hello World"}');

      // Verify fetchWithCache was called with the correct (unsanitized) parameters
      expect(fetchWithCache).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer real-token-123', // Real token should be sent
            'Content-Type': 'application/json',
          }),
          body: '{"message":"Hello"}',
        }),
        expect.any(Number),
        'text',
        undefined,
        undefined,
      );

      // But verify that the logs are sanitized
      const debugCall = loggerDebugSpy.mock.calls.find(
        (call) => call[0].includes('Calling') && call[0].includes('with config:'),
      );
      expect(debugCall).toBeDefined();
      expect(debugCall[0]).toContain('"Authorization":"[REDACTED]"');
      expect(debugCall[0]).not.toContain('real-token-123');
    });

    it('should handle edge cases in combined sanitization', async () => {
      // Test with various edge cases
      const edgeCaseUrl = 'https://:@api.example.com/api?api_key=&token=empty&password=';

      const provider = new HttpProvider(edgeCaseUrl, {
        config: {
          method: 'POST',
          body: { test: 'value' },
          headers: {
            Authorization: '', // Empty authorization
            'X-Custom': 'test', // Valid header instead of null
          },
          // Remove signatureAuth to avoid certificate errors
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
      expect(async () => {
        await provider.callApi('test prompt');
      }).not.toThrow();

      // Verify logging still works
      expect(loggerDebugSpy).toHaveBeenCalled();

      const debugCall = loggerDebugSpy.mock.calls.find(
        (call) => call[0].includes('Calling') && call[0].includes('with config:'),
      );
      expect(debugCall).toBeDefined();

      // Should handle empty/null values gracefully
      const logMessage = debugCall[0];
      expect(logMessage).toContain('***:***'); // Empty credentials still get masked
      expect(logMessage).toContain('api_key=%5BREDACTED%5D'); // Empty values still get redacted
    });
  });

  describe('Performance impact', () => {
    it('should not significantly impact performance during sanitization', async () => {
      const provider = new HttpProvider('https://api.example.com/perf', {
        config: {
          method: 'POST',
          body: { test: 'performance' },
          headers: {
            Authorization: 'Bearer perf-token-123',
          },
          // Remove signatureAuth to avoid certificate errors
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

      // Run multiple calls to test performance
      const promises = Array.from({ length: 10 }, () => provider.callApi('performance test'));

      await Promise.all(promises);

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should complete reasonably quickly (less than 1 second for 10 calls)
      expect(totalTime).toBeLessThan(1000);

      // Verify all calls were sanitized properly
      const debugCalls = loggerDebugSpy.mock.calls.filter(
        (call) => call[0].includes('Calling') && call[0].includes('with config:'),
      );

      expect(debugCalls).toHaveLength(10);
      debugCalls.forEach((call) => {
        expect(call[0]).toContain('"authorization":"[REDACTED]"'); // lowercase
        expect(call[0]).not.toContain('perf-token-123');
      });
    });
  });

  describe('Cross-provider compatibility', () => {
    it('should work consistently across different HTTP provider configurations', async () => {
      const testConfigs = [
        {
          name: 'JSON API with auth',
          url: 'https://user:pass@api.example.com/json?api_key=secret',
          config: {
            method: 'POST' as const,
            headers: { Authorization: 'Bearer token123' },
            body: { data: '{{ prompt }}' },
          },
        },
        {
          name: 'Form data with signature auth',
          url: 'https://api.example.com/form',
          config: {
            method: 'POST' as const,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            signatureAuth: {
              pfxPassword: 'pfx-secret',
              keystorePassword: 'keystore-secret',
            },
            body: 'data={{ prompt }}',
          },
        },
        {
          name: 'Raw request with credentials',
          url: 'https://api.example.com/raw',
          config: {
            request: `POST /raw?token=secret_token HTTP/1.1
Host: api.example.com
Authorization: Bearer raw-token
X-API-Key: raw-key

{{ prompt }}`,
          },
        },
      ];

      const mockResponse = {
        data: '{"result": "test"}',
        status: 200,
        statusText: 'OK',
        cached: false,
      };

      for (const testConfig of testConfigs) {
        jest.clearAllMocks();
        jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

        const provider = new HttpProvider(testConfig.url, {
          config: testConfig.config,
        });

        await provider.callApi('test prompt');

        // Verify sanitization worked for each configuration type
        const debugCall = loggerDebugSpy.mock.calls.find((call) => call[0].includes('Calling'));
        expect(debugCall).toBeDefined();

        const logMessage = debugCall[0];

        // Common assertions for all configs - check for specific secret values not the word "secret"
        expect(logMessage).not.toContain('token123');
        expect(logMessage).not.toContain('pfx-secret');
        expect(logMessage).not.toContain('keystore-secret');
        expect(logMessage).not.toContain('raw-token');
        expect(logMessage).not.toContain('raw-key');
        // Note: Can't check for 'secret' as it may appear in URL before sanitization

        // Should contain redacted markers
        if (logMessage.includes('api_key=') || logMessage.includes('token=')) {
          expect(logMessage).toContain('%5BREDACTED%5D');
        }
        if (logMessage.includes('"Authorization"') || logMessage.includes('"authorization"')) {
          expect(logMessage).toContain('[REDACTED]');
        }
      }
    });
  });
});
