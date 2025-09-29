import { CONSENT_ENDPOINT, EVENTS_ENDPOINT, R_ENDPOINT } from '../src/constants';
import { CLOUD_API_HOST, cloudConfig } from '../src/globalConfig/cloud';
import logger, { logRequestResponse } from '../src/logger';
import { createMockResponse } from './util/utils';

jest.mock('../src/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  logRequestResponse: jest.fn(),
}));

jest.mock('../src/globalConfig/cloud', () => ({
  CLOUD_API_HOST: 'https://api.promptfoo.dev',
  cloudConfig: {
    getApiKey: jest.fn(),
  },
}));

describe('monkeyPatchFetch', () => {
  let mockOriginalFetch: jest.MockedFunction<typeof fetch>;
  let monkeyPatchFetch: any;

  beforeAll(() => {
    // Mock global fetch before importing the module
    mockOriginalFetch = jest.fn();
    Object.defineProperty(global, 'fetch', {
      value: mockOriginalFetch,
      writable: true,
    });

    // Now import the module after mocking global fetch
    const module = require('../src/util/fetch/monkeyPatchFetch');
    monkeyPatchFetch = module.monkeyPatchFetch;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(cloudConfig.getApiKey).mockReturnValue(undefined);
    jest.mocked(logRequestResponse).mockClear();
    mockOriginalFetch.mockClear();
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
      jest.mocked(logRequestResponse).mockClear();
    }
  });

  it('should add Authorization header for cloud API requests when token is available', async () => {
    const mockResponse = createMockResponse({ ok: true, status: 200 });
    mockOriginalFetch.mockResolvedValue(mockResponse);

    const apiKey = 'test-api-key-123';
    jest.mocked(cloudConfig.getApiKey).mockReturnValue(apiKey);

    const url = CLOUD_API_HOST + '/api/test';
    await monkeyPatchFetch(url);

    expect(mockOriginalFetch).toHaveBeenCalledWith(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
  });

  it('should not add Authorization header for cloud API requests when no token available', async () => {
    const mockResponse = createMockResponse({ ok: true, status: 200 });
    mockOriginalFetch.mockResolvedValue(mockResponse);

    jest.mocked(cloudConfig.getApiKey).mockReturnValue(undefined);

    const url = CLOUD_API_HOST + '/api/test';
    await monkeyPatchFetch(url);

    expect(mockOriginalFetch).toHaveBeenCalledWith(url, {
      headers: {},
    });
  });

  it('should handle URL objects for cloud API requests', async () => {
    const mockResponse = createMockResponse({ ok: true, status: 200 });
    mockOriginalFetch.mockResolvedValue(mockResponse);

    const apiKey = 'test-api-key-123';
    jest.mocked(cloudConfig.getApiKey).mockReturnValue(apiKey);

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
    jest.mocked(cloudConfig.getApiKey).mockReturnValue(apiKey);

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
      error: true,
    });

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error in fetch:'));
  });

  it('should handle connection errors with specific messaging', async () => {
    const connectionError = new TypeError('fetch failed');
    // @ts-expect-error undici error cause
    connectionError.cause = {
      stack: 'Error: connect ECONNREFUSED\n    at internalConnectMultiple',
    };

    mockOriginalFetch.mockRejectedValue(connectionError);

    const url = 'https://example.com/api';

    await expect(monkeyPatchFetch(url)).rejects.toThrow('fetch failed');

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Connection error, please check your network connectivity'),
    );
  });

  it('should not log errors for excluded endpoints', async () => {
    const error = new Error('Network error');
    mockOriginalFetch.mockRejectedValue(error);

    const url = R_ENDPOINT + '/test';

    await expect(monkeyPatchFetch(url)).rejects.toThrow('Network error');

    expect(logRequestResponse).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
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
