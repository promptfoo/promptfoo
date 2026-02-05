import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sanitizeRawHttpRequest } from '../../../src/server/routes/providers';
import { createApp } from '../../../src/server/server';

import type { ApiProvider, ProviderOptions } from '../../../src/types/providers';
import type { ProviderTestResult } from '../../../src/validators/testProvider';

// Mock dependencies
vi.mock('../../../src/providers/index');
vi.mock('../../../src/validators/testProvider');
vi.mock('../../../src/server/config/serverConfig');
vi.mock('../../../src/redteam/remoteGeneration');
vi.mock('../../../src/util/fetch');

// Import after mocking
import { loadApiProvider } from '../../../src/providers/index';
import { neverGenerateRemote } from '../../../src/redteam/remoteGeneration';
import { getAvailableProviders } from '../../../src/server/config/serverConfig';
import { fetchWithProxy } from '../../../src/util/fetch/index';
import { testProviderConnectivity } from '../../../src/validators/testProvider';

const mockedLoadApiProvider = vi.mocked(loadApiProvider);
const mockedTestProviderConnectivity = vi.mocked(testProviderConnectivity);
const mockedGetAvailableProviders = vi.mocked(getAvailableProviders);
const mockedNeverGenerateRemote = vi.mocked(neverGenerateRemote);
const mockedFetchWithProxy = vi.mocked(fetchWithProxy);

describe('Providers Routes', () => {
  describe('GET /providers', () => {
    let app: ReturnType<typeof createApp>;

    beforeEach(() => {
      vi.clearAllMocks();
      app = createApp();
    });

    it('should return default providers when no custom config exists', async () => {
      // getAvailableProviders returns empty array when no config
      mockedGetAvailableProviders.mockReturnValue([]);

      const response = await request(app).get('/api/providers');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('providers');
      expect(response.body.data).toHaveProperty('hasCustomConfig');
      expect(response.body.data.hasCustomConfig).toBe(false);
      expect(Array.isArray(response.body.data.providers)).toBe(true);
      // Should return defaults (non-empty)
      expect(response.body.data.providers.length).toBeGreaterThan(0);
      // Check structure
      expect(response.body.data.providers[0]).toHaveProperty('id');
    });

    it('should return custom providers from server config', async () => {
      const customProviders = [
        { id: 'openai:gpt-4o', label: 'GPT-4o' },
        { id: 'anthropic:messages:claude-sonnet-4-5-20250929', label: 'Claude 4.5 Sonnet' },
      ];

      mockedGetAvailableProviders.mockReturnValue(customProviders);

      const response = await request(app).get('/api/providers');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          providers: customProviders,
          hasCustomConfig: true,
        },
      });
    });

    it('should return providers with full config', async () => {
      const customProviders = [
        {
          id: 'http://internal-llm.company.com/v1',
          label: 'Internal LLM',
          config: {
            method: 'POST',
            headers: { Authorization: 'Bearer token' },
          },
        },
      ];

      mockedGetAvailableProviders.mockReturnValue(customProviders);

      const response = await request(app).get('/api/providers');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.hasCustomConfig).toBe(true);
      expect(response.body.data.providers).toEqual(customProviders);
      expect(response.body.data.providers[0].config).toEqual({
        method: 'POST',
        headers: { Authorization: 'Bearer token' },
      });
    });
  });

  describe('GET /providers/config-status', () => {
    let app: ReturnType<typeof createApp>;

    beforeEach(() => {
      vi.clearAllMocks();
      app = createApp();
    });

    it('should return hasCustomConfig: false when no custom config exists', async () => {
      // getAvailableProviders returns empty array when no config
      mockedGetAvailableProviders.mockReturnValue([]);

      const response = await request(app).get('/api/providers/config-status');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { hasCustomConfig: false },
      });
    });

    it('should return hasCustomConfig: true when custom config exists', async () => {
      const customProviders = [
        { id: 'openai:gpt-4o-mini' },
        { id: 'anthropic:messages:claude-haiku-4-5-20251001' },
      ];

      mockedGetAvailableProviders.mockReturnValue(customProviders);

      const response = await request(app).get('/api/providers/config-status');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { hasCustomConfig: true },
      });
    });
  });
  describe('POST /providers/test', () => {
    let app: ReturnType<typeof createApp>;
    let mockProvider: ApiProvider;

    beforeEach(() => {
      vi.clearAllMocks();
      app = createApp();

      // Setup mock provider
      mockProvider = {
        id: vi.fn(() => 'test-provider'),
        callApi: vi.fn(),
        config: {},
      } as any;

      // Default mock implementations
      mockedLoadApiProvider.mockResolvedValue(mockProvider);
    });

    it('should handle valid request with prompt', async () => {
      const testPrompt = 'Test prompt';
      const providerOptions: ProviderOptions = {
        id: 'http://example.com/api',
        config: {
          method: 'POST',
        },
      };

      const mockResult: ProviderTestResult = {
        success: true,
        message: 'Provider test successful',
        providerResponse: { output: 'Test response' },
        transformedRequest: { url: 'http://example.com/api' },
      };

      mockedTestProviderConnectivity.mockResolvedValue(mockResult);

      const response = await request(app).post('/api/providers/test').send({
        prompt: testPrompt,
        providerOptions,
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        testResult: {
          success: true,
          message: 'Provider test successful',
          error: undefined,
          changes_needed: undefined,
          changes_needed_reason: undefined,
          changes_needed_suggestions: undefined,
        },
        providerResponse: { output: 'Test response' },
        transformedRequest: { url: 'http://example.com/api' },
      });

      expect(mockedLoadApiProvider).toHaveBeenCalledWith('http://example.com/api', {
        options: {
          ...providerOptions,
          config: {
            ...providerOptions.config,
            maxRetries: 1,
          },
        },
      });

      expect(mockedTestProviderConnectivity).toHaveBeenCalledWith({
        provider: mockProvider,
        prompt: testPrompt,
        inputs: undefined,
      });
    });

    it('should handle valid request without prompt (optional)', async () => {
      const providerOptions: ProviderOptions = {
        id: 'http://example.com/api',
        config: {},
      };

      const mockResult: ProviderTestResult = {
        success: true,
        message: 'Provider test successful',
      };

      mockedTestProviderConnectivity.mockResolvedValue(mockResult);

      const response = await request(app).post('/api/providers/test').send({
        providerOptions,
      });

      expect(response.status).toBe(200);
      expect(mockedTestProviderConnectivity).toHaveBeenCalledWith({
        provider: mockProvider,
        prompt: undefined,
        inputs: undefined,
      });
    });

    it('should return 400 for missing providerOptions', async () => {
      const response = await request(app).post('/api/providers/test').send({
        prompt: 'Test prompt',
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual(
        expect.objectContaining({
          error: expect.stringContaining('providerOptions'),
        }),
      );
    });

    it('should throw error for missing provider id', async () => {
      const providerOptions: ProviderOptions = {
        config: {},
      };

      const response = await request(app).post('/api/providers/test').send({
        providerOptions,
      });

      // The route should catch the error and return 500
      expect(response.status).toBe(500);
    });

    it('should handle provider loading failure', async () => {
      const providerOptions: ProviderOptions = {
        id: 'invalid-provider',
        config: {},
      };

      mockedLoadApiProvider.mockRejectedValue(new Error('Failed to load provider'));

      const response = await request(app).post('/api/providers/test').send({
        providerOptions,
      });

      // The route should catch the error and return 500
      expect(response.status).toBe(500);
    });

    it('should handle connectivity test failure', async () => {
      const providerOptions: ProviderOptions = {
        id: 'http://example.com/api',
        config: {},
      };

      const mockResult: ProviderTestResult = {
        success: false,
        message: 'Connection failed',
        error: 'Network timeout',
      };

      mockedTestProviderConnectivity.mockResolvedValue(mockResult);

      const response = await request(app).post('/api/providers/test').send({
        providerOptions,
        prompt: 'Test',
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        testResult: {
          success: false,
          message: 'Connection failed',
          error: 'Network timeout',
          changes_needed: undefined,
          changes_needed_reason: undefined,
          changes_needed_suggestions: undefined,
        },
        providerResponse: undefined,
        transformedRequest: undefined,
      });
    });

    it('should handle successful test with analysis and suggestions', async () => {
      const providerOptions: ProviderOptions = {
        id: 'http://example.com/api',
        config: {},
      };

      const mockResult: ProviderTestResult = {
        success: true,
        message: 'Test completed with suggestions',
        providerResponse: { output: 'Response' },
        analysis: {
          changes_needed: true,
          changes_needed_reason: 'Response format is not optimal',
          changes_needed_suggestions: [
            'Add response transform to extract text field',
            'Update headers to include authentication',
          ],
        },
      };

      mockedTestProviderConnectivity.mockResolvedValue(mockResult);

      const response = await request(app).post('/api/providers/test').send({
        providerOptions,
        prompt: 'Test',
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        testResult: {
          success: true,
          message: 'Test completed with suggestions',
          error: undefined,
          changes_needed: true,
          changes_needed_reason: 'Response format is not optimal',
          changes_needed_suggestions: [
            'Add response transform to extract text field',
            'Update headers to include authentication',
          ],
        },
        providerResponse: { output: 'Response' },
        transformedRequest: undefined,
      });
    });

    it('should properly structure response with all fields', async () => {
      const providerOptions: ProviderOptions = {
        id: 'http://example.com/api',
        config: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
      };

      const mockResult: ProviderTestResult = {
        success: true,
        message: 'All systems operational',
        error: undefined,
        providerResponse: {
          output: 'AI response text',
          metadata: { latency: 150 },
        },
        transformedRequest: {
          url: 'http://example.com/api',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { prompt: 'Comprehensive test' },
        },
        analysis: {
          changes_needed: false,
        },
      };

      mockedTestProviderConnectivity.mockResolvedValue(mockResult);

      const response = await request(app).post('/api/providers/test').send({
        providerOptions,
        prompt: 'Comprehensive test',
      });

      expect(response.status).toBe(200);

      // Verify testResult structure
      expect(response.body.testResult.success).toBe(true);
      expect(response.body.testResult.message).toBe('All systems operational');
      expect(response.body.testResult.error).toBeUndefined();
      expect(response.body.testResult.changes_needed).toBe(false);
      expect(response.body.testResult.changes_needed_reason).toBeUndefined();
      expect(response.body.testResult.changes_needed_suggestions).toBeUndefined();

      // Verify providerResponse
      expect(response.body.providerResponse).toEqual({
        output: 'AI response text',
        metadata: { latency: 150 },
      });

      // Verify transformedRequest
      expect(response.body.transformedRequest).toEqual({
        url: 'http://example.com/api',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { prompt: 'Comprehensive test' },
      });
    });

    it('should pass maxRetries: 1 to provider config', async () => {
      const providerOptions: ProviderOptions = {
        id: 'http://example.com/api',
        config: {
          maxRetries: 5, // Should be overridden to 1
          timeout: 30000,
        },
      };

      const mockResult: ProviderTestResult = {
        success: true,
        message: 'Success',
      };

      mockedTestProviderConnectivity.mockResolvedValue(mockResult);

      const response = await request(app).post('/api/providers/test').send({
        providerOptions,
      });

      expect(response.status).toBe(200);
      expect(mockedLoadApiProvider).toHaveBeenCalledWith('http://example.com/api', {
        options: {
          ...providerOptions,
          config: {
            maxRetries: 1, // Should be 1, not 5
            timeout: 30000,
          },
        },
      });
    });
  });

  describe('POST /providers/http-generator', () => {
    let app: ReturnType<typeof createApp>;

    beforeEach(() => {
      vi.clearAllMocks();
      app = createApp();
      mockedNeverGenerateRemote.mockReturnValue(false);
    });

    it('should return 400 when remote generation is disabled', async () => {
      mockedNeverGenerateRemote.mockReturnValue(true);

      const response = await request(app).post('/api/providers/http-generator').send({
        requestExample:
          'POST /api/chat HTTP/1.1\nContent-Type: application/json\n\n{"message":"hi"}',
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Remote generation is disabled');
      expect(mockedFetchWithProxy).not.toHaveBeenCalled();
    });

    it('should sanitize auth headers from request example', async () => {
      const requestWithAuth = [
        'POST /api/chat HTTP/1.1',
        'Content-Type: application/json',
        'Authorization: Bearer sk-secret-key-12345',
        'Cookie: session=abc123; user=test',
        '',
        '{"message": "hello"}',
      ].join('\n');

      mockedFetchWithProxy.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ config: { url: '/api/chat', method: 'POST' } }),
      } as any);

      await request(app).post('/api/providers/http-generator').send({
        requestExample: requestWithAuth,
        responseExample: '{"response": "hi"}',
      });

      expect(mockedFetchWithProxy).toHaveBeenCalledTimes(1);
      const callArgs = mockedFetchWithProxy.mock.calls[0];
      const body = JSON.parse(callArgs[1]!.body as string);

      // Auth headers should be redacted
      expect(body.requestExample).toContain('Authorization: [REDACTED]');
      expect(body.requestExample).toContain('Cookie: [REDACTED]');
      expect(body.requestExample).not.toContain('sk-secret-key-12345');
      expect(body.requestExample).not.toContain('session=abc123');

      // Non-sensitive headers should be preserved
      expect(body.requestExample).toContain('Content-Type: application/json');

      // Response example should be unchanged
      expect(body.responseExample).toBe('{"response": "hi"}');
    });

    it('should pass through non-sensitive headers unchanged', async () => {
      const requestWithoutAuth = [
        'POST /api/chat HTTP/1.1',
        'Content-Type: application/json',
        'Accept: application/json',
        'X-Request-Id: req-12345',
        '',
        '{"message": "hello"}',
      ].join('\n');

      mockedFetchWithProxy.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ config: {} }),
      } as any);

      await request(app).post('/api/providers/http-generator').send({
        requestExample: requestWithoutAuth,
      });

      const callArgs = mockedFetchWithProxy.mock.calls[0];
      const body = JSON.parse(callArgs[1]!.body as string);

      expect(body.requestExample).toContain('Content-Type: application/json');
      expect(body.requestExample).toContain('Accept: application/json');
      expect(body.requestExample).toContain('X-Request-Id: req-12345');
    });

    it('should return 400 when request example is missing', async () => {
      const response = await request(app).post('/api/providers/http-generator').send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Request example is required');
    });
  });

  describe('sanitizeRawHttpRequest bypass tests', () => {
    it('should redact common non-standard auth header names', () => {
      const input = [
        'POST /api HTTP/1.1',
        'Token: my-secret-token',
        'Api-Key: secret123',
        'X-Token: another-secret',
        'Content-Type: application/json',
      ].join('\n');

      const sanitized = sanitizeRawHttpRequest(input);

      expect(sanitized).toContain('Token: [REDACTED]');
      expect(sanitized).toContain('Api-Key: [REDACTED]');
      expect(sanitized).toContain('X-Token: [REDACTED]');
      expect(sanitized).toContain('Content-Type: application/json');
    });

    it('should redact Bearer prefix in header values', () => {
      const input = [
        'POST /api HTTP/1.1',
        'Custom-Header: Bearer sk-abcdef123456',
        'Content-Type: application/json',
      ].join('\n');

      const sanitized = sanitizeRawHttpRequest(input);

      expect(sanitized).not.toContain('sk-abcdef123456');
    });

    it('should handle case variations in header names', () => {
      const input = [
        'authorization: Bearer secret',
        'AUTHORIZATION: Bearer secret',
        'x-api-key: my-key',
        'X-API-KEY: my-key',
      ].join('\n');

      const sanitized = sanitizeRawHttpRequest(input);

      expect(sanitized).not.toContain('Bearer secret');
      expect(sanitized).not.toContain('my-key');
    });

    it('should handle headers with extra whitespace before colon', () => {
      const input = 'Authorization : Bearer sk-secret-key\n';
      const sanitized = sanitizeRawHttpRequest(input);

      expect(sanitized).not.toContain('sk-secret-key');
    });

    it('should handle CRLF line endings', () => {
      const input =
        'POST /api HTTP/1.1\r\nAuthorization: Bearer sk-secret\r\nContent-Type: application/json\r\n\r\n{}';
      const sanitized = sanitizeRawHttpRequest(input);

      expect(sanitized).not.toContain('sk-secret');
      expect(sanitized).toContain('Content-Type: application/json');
    });

    it('should redact Basic auth in arbitrary headers', () => {
      const input = 'X-Forwarded-Auth: Basic dXNlcjpwYXNzd29yZA==\nAccept: */*';
      const sanitized = sanitizeRawHttpRequest(input);

      expect(sanitized).not.toContain('dXNlcjpwYXNzd29yZA==');
      expect(sanitized).toContain('Accept: */*');
    });

    it('should handle multiple calls without regex state leaking', () => {
      // Regression: /g flag regex can carry lastIndex across calls
      const input1 = 'Authorization: Bearer secret1\nContent-Type: text/plain';
      const input2 = 'Cookie: session=abc\nAccept: */*';
      const input3 = 'Authorization: Bearer secret3';

      const s1 = sanitizeRawHttpRequest(input1);
      const s2 = sanitizeRawHttpRequest(input2);
      const s3 = sanitizeRawHttpRequest(input3);

      expect(s1).not.toContain('secret1');
      expect(s2).not.toContain('session=abc');
      expect(s3).not.toContain('secret3');
    });
  });
});
