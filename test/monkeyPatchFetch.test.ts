import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONSENT_ENDPOINT, EVENTS_ENDPOINT, R_ENDPOINT } from '../src/constants';
import { CLOUD_API_HOST, cloudConfig } from '../src/globalConfig/cloud';
import logger, { logRequestResponse } from '../src/logger';
import { createMockResponse } from './util/utils';

vi.mock('../src/logger', () => ({
  __esModule: true,
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  logRequestResponse: vi.fn(),
}));

vi.mock('../src/globalConfig/cloud', () => ({
  CLOUD_API_HOST: 'https://api.promptfoo.dev',
  cloudConfig: {
    getApiHost: vi.fn(),
    getApiKey: vi.fn(),
  },
}));

describe('monkeyPatchFetch', () => {
  let mockOriginalFetch: ReturnType<typeof vi.fn>;
  let monkeyPatchFetch: any;

  beforeAll(async () => {
    // Mock global fetch before importing the module
    mockOriginalFetch = vi.fn();
    Object.defineProperty(global, 'fetch', {
      value: mockOriginalFetch,
      writable: true,
    });

    // Now import the module after mocking global fetch
    const module = await import('../src/util/fetch/monkeyPatchFetch');
    monkeyPatchFetch = module.monkeyPatchFetch;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cloudConfig.getApiHost).mockReturnValue(CLOUD_API_HOST);
    vi.mocked(cloudConfig.getApiKey).mockReturnValue(undefined);
    vi.mocked(logRequestResponse).mockClear();
    mockOriginalFetch.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should log successful requests and responses', async () => {
    const mockResponse = createMockResponse({ ok: true, status: 200 });
    mockOriginalFetch.mockResolvedValue(mockResponse);

    const url = 'https://example.com/api';
    const options = {
      method: 'POST',
      body: JSON.stringify({ test: 'data' }),
      headers: { 'Content-Type': 'application/json' },
    };

    await monkeyPatchFetch(url, options);

    expect(logRequestResponse).toHaveBeenCalledWith({
      url: url,
      requestBody: options.body,
      requestMethod: 'POST',
      response: mockResponse,
    });
  });

  it('should not log requests to excluded endpoints', async () => {
    const mockResponse = createMockResponse({ ok: true, status: 200 });
    mockOriginalFetch.mockResolvedValue(mockResponse);

    const excludedUrls = [
      R_ENDPOINT + '/test',
      CONSENT_ENDPOINT + '/test',
      EVENTS_ENDPOINT + '/test',
    ];

    for (const url of excludedUrls) {
      await monkeyPatchFetch(url);
      expect(logRequestResponse).not.toHaveBeenCalled();
      vi.mocked(logRequestResponse).mockClear();
    }
  });

  it('should add Authorization header for cloud API requests when token is available', async () => {
    const mockResponse = createMockResponse({ ok: true, status: 200 });
    mockOriginalFetch.mockResolvedValue(mockResponse);

    const apiKey = 'test-api-key-123';
    vi.mocked(cloudConfig.getApiKey).mockReturnValue(apiKey);

    const url = CLOUD_API_HOST + '/api/test';
    await monkeyPatchFetch(url);

    expect(mockOriginalFetch).toHaveBeenCalledWith(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
  });

  it('should add Authorization header for configured on-prem cloud API requests', async () => {
    const mockResponse = createMockResponse({ ok: true, status: 200 });
    mockOriginalFetch.mockResolvedValue(mockResponse);

    const apiKey = 'test-api-key-123';
    vi.mocked(cloudConfig.getApiHost).mockReturnValue('https://onprem.example.com/api');
    vi.mocked(cloudConfig.getApiKey).mockReturnValue(apiKey);

    const url = 'https://onprem.example.com/api/v1/task';
    await monkeyPatchFetch(url);

    expect(mockOriginalFetch).toHaveBeenCalledWith(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
  });

  it.each([
    'https://custom.example.com/harmful',
    'https://api.promptfoo.dev.attacker.example.com/api/v1/task',
  ])('should not forward cloud credentials to %s', async (url) => {
    const mockResponse = createMockResponse({ ok: true, status: 200 });
    mockOriginalFetch.mockResolvedValue(mockResponse);
    vi.mocked(cloudConfig.getApiKey).mockReturnValue('test-api-key-123');

    await monkeyPatchFetch(url);

    expect(mockOriginalFetch).toHaveBeenCalledWith(url, {});
  });

  it('should attach the token for a port-bearing on-prem cloud host', async () => {
    const mockResponse = createMockResponse({ ok: true, status: 200 });
    mockOriginalFetch.mockResolvedValue(mockResponse);

    const apiKey = 'test-api-key-123';
    vi.mocked(cloudConfig.getApiHost).mockReturnValue('https://onprem.example.com:8443');
    vi.mocked(cloudConfig.getApiKey).mockReturnValue(apiKey);

    const url = 'https://onprem.example.com:8443/api/v1/task';
    await monkeyPatchFetch(url);

    expect(mockOriginalFetch).toHaveBeenCalledWith(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
  });

  it.each([
    'https://onprem.example.com/api/v1/task', // same host, default :443 -> different origin
    'http://onprem.example.com:8443/api/v1/task', // same host:port -> http vs https
  ])('should not attach the token to %s when the cloud host is https://onprem.example.com:8443', async (url) => {
    const mockResponse = createMockResponse({ ok: true, status: 200 });
    mockOriginalFetch.mockResolvedValue(mockResponse);
    vi.mocked(cloudConfig.getApiHost).mockReturnValue('https://onprem.example.com:8443');
    vi.mocked(cloudConfig.getApiKey).mockReturnValue('test-api-key-123');

    await monkeyPatchFetch(url);

    expect(mockOriginalFetch).toHaveBeenCalledWith(url, {});
  });

  it.each([
    '',
    'not a url',
    'onprem.example.com',
  ])('should fail closed (no token) when getApiHost() returns the unparseable value %p', async (host) => {
    const mockResponse = createMockResponse({ ok: true, status: 200 });
    mockOriginalFetch.mockResolvedValue(mockResponse);
    vi.mocked(cloudConfig.getApiHost).mockReturnValue(host);
    vi.mocked(cloudConfig.getApiKey).mockReturnValue('test-api-key-123');

    const url = 'https://api.promptfoo.dev/api/v1/task';
    await monkeyPatchFetch(url);

    expect(mockOriginalFetch).toHaveBeenCalledWith(url, {});
  });

  it.each([
    'Authorization',
    'authorization',
  ])('should not override a caller-supplied %s header for cloud requests', async (headerName) => {
    const mockResponse = createMockResponse({ ok: true, status: 200 });
    mockOriginalFetch.mockResolvedValue(mockResponse);
    // The saved token differs from the caller-supplied one: e.g. validating/rotating
    // a new key against an already-logged-in cloud host must send the new token, not
    // the saved one. Regression guard for CloudConfig.validateApiToken().
    vi.mocked(cloudConfig.getApiKey).mockReturnValue('saved-token');

    const url = CLOUD_API_HOST + '/api/v1/users/me';
    await monkeyPatchFetch(url, { headers: { [headerName]: 'Bearer caller-token' } });

    expect(mockOriginalFetch).toHaveBeenCalledWith(url, {
      headers: { [headerName]: 'Bearer caller-token' },
    });
  });

  it('should not override Authorization embedded in a cloud Request', async () => {
    const mockResponse = createMockResponse({ ok: true, status: 200 });
    mockOriginalFetch.mockResolvedValue(mockResponse);
    vi.mocked(cloudConfig.getApiKey).mockReturnValue('saved-token');

    const request = new Request(CLOUD_API_HOST + '/api/v1/users/me', {
      headers: { Authorization: 'Bearer caller-token' },
    });
    await monkeyPatchFetch(request);

    const requestInit = mockOriginalFetch.mock.calls[0][1] as RequestInit;
    expect(request.headers.get('authorization')).toBe('Bearer caller-token');
    expect(requestInit.headers).toBeUndefined();
  });

  it('should not override Authorization supplied with a Headers instance', async () => {
    const mockResponse = createMockResponse({ ok: true, status: 200 });
    mockOriginalFetch.mockResolvedValue(mockResponse);
    vi.mocked(cloudConfig.getApiKey).mockReturnValue('saved-token');

    const url = CLOUD_API_HOST + '/api/v1/users/me';
    const headers = new Headers({ Authorization: 'Bearer caller-token' });
    await monkeyPatchFetch(url, { headers });

    const requestInit = mockOriginalFetch.mock.calls[0][1] as RequestInit;
    expect(new Headers(requestInit.headers).get('authorization')).toBe('Bearer caller-token');
  });

  it('should preserve cloud Request headers when adding Authorization', async () => {
    const mockResponse = createMockResponse({ ok: true, status: 200 });
    mockOriginalFetch.mockResolvedValue(mockResponse);
    vi.mocked(cloudConfig.getApiKey).mockReturnValue('saved-token');

    const request = new Request(CLOUD_API_HOST + '/api/test', {
      headers: { 'X-Custom-Header': 'custom-value' },
    });
    await monkeyPatchFetch(request);

    const requestInit = mockOriginalFetch.mock.calls[0][1] as RequestInit;
    const headers = new Headers(requestInit.headers);
    expect(headers.get('authorization')).toBe('Bearer saved-token');
    expect(headers.get('x-custom-header')).toBe('custom-value');
  });

  it('should not add Authorization header for cloud API requests when no token available', async () => {
    const mockResponse = createMockResponse({ ok: true, status: 200 });
    mockOriginalFetch.mockResolvedValue(mockResponse);

    vi.mocked(cloudConfig.getApiKey).mockReturnValue(undefined);

    const url = CLOUD_API_HOST + '/api/test';
    await monkeyPatchFetch(url);

    expect(mockOriginalFetch).toHaveBeenCalledWith(url, {});
  });

  it('should handle URL objects for cloud API requests', async () => {
    const mockResponse = createMockResponse({ ok: true, status: 200 });
    mockOriginalFetch.mockResolvedValue(mockResponse);

    const apiKey = 'test-api-key-123';
    vi.mocked(cloudConfig.getApiKey).mockReturnValue(apiKey);

    const url = new URL('/api/test', CLOUD_API_HOST);
    await monkeyPatchFetch(url);

    expect(mockOriginalFetch).toHaveBeenCalledWith(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
  });

  it('should preserve existing headers when adding Authorization', async () => {
    const mockResponse = createMockResponse({ ok: true, status: 200 });
    mockOriginalFetch.mockResolvedValue(mockResponse);

    const apiKey = 'test-api-key-123';
    vi.mocked(cloudConfig.getApiKey).mockReturnValue(apiKey);

    const url = CLOUD_API_HOST + '/api/test';
    const options = {
      headers: {
        'Content-Type': 'application/json',
        'X-Custom-Header': 'custom-value',
      },
    };

    await monkeyPatchFetch(url, options);

    expect(mockOriginalFetch).toHaveBeenCalledWith(url, {
      headers: {
        'Content-Type': 'application/json',
        'X-Custom-Header': 'custom-value',
        Authorization: `Bearer ${apiKey}`,
      },
    });
  });

  it('should log errors with request details', async () => {
    const error = new Error('Network error');
    mockOriginalFetch.mockRejectedValue(error);

    const url = 'https://example.com/api';
    const options = {
      method: 'POST',
      body: JSON.stringify({ test: 'data' }),
    };

    await expect(monkeyPatchFetch(url, options)).rejects.toThrow('Network error');

    expect(logRequestResponse).toHaveBeenCalledWith({
      url: url,
      requestBody: options.body,
      requestMethod: 'POST',
      response: null,
    });

    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Error in fetch:'));
  });

  it('should handle connection errors with specific messaging', async () => {
    const connectionError = new TypeError('fetch failed');
    connectionError.cause = {
      stack: 'Error: connect ECONNREFUSED\n    at internalConnectMultiple',
    };

    mockOriginalFetch.mockRejectedValue(connectionError);

    const url = 'https://example.com/api';

    await expect(monkeyPatchFetch(url)).rejects.toThrow('fetch failed');

    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Connection error, please check your network connectivity'),
    );
  });

  it('should redact credentials in connection error target and proxy URLs', async () => {
    const connectionError = new TypeError('fetch failed');
    connectionError.cause = {
      stack: 'Error: connect ECONNREFUSED\n    at internalConnectMultiple',
    };
    mockOriginalFetch.mockRejectedValue(connectionError);
    vi.stubEnv('HTTP_PROXY', 'https://proxy-user:proxy-password@proxy.example.com?token=proxy-key');

    const url =
      'https://webhook-user:webhook-password@n8n.example.com/webhook/agent?token=webhook-secret';

    await expect(monkeyPatchFetch(url)).rejects.toThrow('fetch failed');

    const debugLogs = JSON.stringify(vi.mocked(logger.debug).mock.calls);
    expect(debugLogs).toContain('n8n.example.com');
    expect(debugLogs).toContain('proxy.example.com');
    expect(debugLogs).not.toContain('webhook-user');
    expect(debugLogs).not.toContain('webhook-password');
    expect(debugLogs).not.toContain('webhook-secret');
    expect(debugLogs).not.toContain('proxy-user');
    expect(debugLogs).not.toContain('proxy-password');
    expect(debugLogs).not.toContain('proxy-key');
  });

  it('should not log errors for excluded endpoints', async () => {
    const error = new Error('Network error');
    mockOriginalFetch.mockRejectedValue(error);

    const url = R_ENDPOINT + '/test';

    await expect(monkeyPatchFetch(url)).rejects.toThrow('Network error');

    expect(logRequestResponse).not.toHaveBeenCalled();
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('should default to GET method when none provided', async () => {
    const mockResponse = createMockResponse({ ok: true, status: 200 });
    mockOriginalFetch.mockResolvedValue(mockResponse);

    const url = 'https://example.com/api';
    await monkeyPatchFetch(url);

    expect(logRequestResponse).toHaveBeenCalledWith({
      url: url,
      requestBody: undefined,
      requestMethod: 'GET',
      response: mockResponse,
    });
  });
});
