import fs from 'fs';
import path from 'path';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import cliState from '../src/cliState';
import { VERSION } from '../src/constants';
import { getEnvBool, getEnvString } from '../src/envars';
import {
  fetchWithProxy,
  fetchWithRetries,
  fetchWithTimeout,
  handleRateLimit,
  isRateLimited,
  sanitizeUrl,
} from '../src/fetch';
import logger from '../src/logger';
import { sleep } from '../src/util/time';
import { createMockResponse } from './util/utils';

jest.mock('../src/util/time', () => ({
  sleep: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('undici', () => {
  return {
    ProxyAgent: jest.fn().mockImplementation((options) => ({
      options,
      addRequest: jest.fn(),
      destroy: jest.fn(),
    })),
    setGlobalDispatcher: jest.fn(),
  };
});

jest.mock('../src/envars', () => ({
  getEnvString: jest.fn().mockImplementation((key: string, defaultValue: string = '') => ''),
  getEnvBool: jest.fn().mockImplementation((key: string, defaultValue: boolean = false) => false),
  getEnvInt: jest.fn().mockImplementation((key: string, defaultValue: number = 0) => defaultValue),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
}));

jest.mock('../src/cliState', () => ({
  default: {
    basePath: undefined,
  },
}));

describe('fetchWithProxy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(global, 'fetch').mockImplementation();
    jest.mocked(ProxyAgent).mockClear();
    jest.mocked(setGlobalDispatcher).mockClear();
    delete process.env.HTTPS_PROXY;
    delete process.env.https_proxy;
    delete process.env.HTTP_PROXY;
    delete process.env.http_proxy;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should add version header to all requests', async () => {
    const url = 'https://example.com/api';
    await fetchWithProxy(url);

    expect(global.fetch).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-promptfoo-version': VERSION,
        }),
      }),
    );
  });

  it('should handle URLs with basic auth credentials', async () => {
    const url = 'https://username:password@example.com/api';
    const options = { headers: { 'Content-Type': 'application/json' } };

    await fetchWithProxy(url, options);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/api',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Basic dXNlcm5hbWU6cGFzc3dvcmQ=',
          'x-promptfoo-version': VERSION,
        },
      }),
    );
  });

  it('should handle URLs without auth credentials', async () => {
    const url = 'https://example.com/api';
    const options = { headers: { 'Content-Type': 'application/json' } };

    await fetchWithProxy(url, options);

    expect(global.fetch).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          'x-promptfoo-version': VERSION,
        },
      }),
    );
  });

  it('should handle invalid URLs gracefully', async () => {
    const invalidUrl = 'not-a-url';
    await fetchWithProxy(invalidUrl);

    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringMatching(/URL parsing failed in fetchWithProxy: TypeError/),
    );
    expect(global.fetch).toHaveBeenCalledWith(invalidUrl, expect.any(Object));
  });

  it('should preserve existing Authorization headers when no URL credentials', async () => {
    const url = 'https://example.com/api';
    const options = {
      headers: {
        Authorization: 'Bearer token123',
        'Content-Type': 'application/json',
      },
    };

    await fetchWithProxy(url, options);

    expect(global.fetch).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer token123',
          'Content-Type': 'application/json',
          'x-promptfoo-version': VERSION,
        },
      }),
    );
  });

  it('should warn and prefer existing Authorization header over URL credentials', async () => {
    const url = 'https://username:password@example.com/api';
    const options = {
      headers: {
        Authorization: 'Bearer token123',
      },
    };

    await fetchWithProxy(url, options);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Both URL credentials and Authorization header present'),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/api',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer token123',
          'x-promptfoo-version': VERSION,
        },
      }),
    );
  });

  it('should handle empty username or password in URL', async () => {
    const url = 'https://:password@example.com/api';
    await fetchWithProxy(url);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/api',
      expect.objectContaining({
        headers: {
          Authorization: 'Basic OnBhc3N3b3Jk',
          'x-promptfoo-version': VERSION,
        },
      }),
    );
  });

  it('should handle URLs with only username', async () => {
    const url = 'https://username@example.com/api';
    await fetchWithProxy(url);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/api',
      expect.objectContaining({
        headers: {
          Authorization: 'Basic dXNlcm5hbWU6',
          'x-promptfoo-version': VERSION,
        },
      }),
    );
  });

  it('should preserve existing headers when adding Authorization from URL credentials', async () => {
    const url = 'https://username:password@example.com/api';
    const options = {
      headers: {
        'Content-Type': 'application/json',
        'X-Custom-Header': 'value',
      },
    };

    await fetchWithProxy(url, options);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/api',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          'X-Custom-Header': 'value',
          Authorization: 'Basic dXNlcm5hbWU6cGFzc3dvcmQ=',
          'x-promptfoo-version': VERSION,
        },
      }),
    );
  });

  it('should use custom CA certificate when PROMPTFOO_CA_CERT_PATH is set', async () => {
    const mockCertPath = path.normalize('/path/to/cert.pem');
    const mockCertContent = 'mock-cert-content';
    const mockProxyUrl = 'http://proxy.example.com';

    process.env.HTTPS_PROXY = mockProxyUrl;

    jest.mocked(getEnvString).mockImplementation((key: string, defaultValue: string = '') => {
      if (key === 'PROMPTFOO_CA_CERT_PATH') {
        return mockCertPath;
      }
      return defaultValue;
    });
    jest.mocked(getEnvBool).mockImplementation((key: string, defaultValue: boolean = false) => {
      if (key === 'PROMPTFOO_INSECURE_SSL') {
        return false;
      }
      return defaultValue;
    });
    jest.mocked(fs.readFileSync).mockReturnValue(mockCertContent);

    const mockFetch = jest.fn().mockResolvedValue(new Response());
    global.fetch = mockFetch;

    await fetchWithProxy('https://example.com');

    const actualPath = jest.mocked(fs.readFileSync).mock.calls[0][0] as string;
    const actualEncoding = jest.mocked(fs.readFileSync).mock.calls[0][1];
    const normalizedActual = path.normalize(actualPath).replace(/^\w:/, '');
    const normalizedExpected = path.normalize(mockCertPath).replace(/^\w:/, '');
    expect(normalizedActual).toBe(normalizedExpected);
    expect(actualEncoding).toBe('utf8');
    expect(ProxyAgent).toHaveBeenCalledWith({
      uri: mockProxyUrl,
      proxyTls: {
        ca: mockCertContent,
        rejectUnauthorized: true,
      },
      requestTls: {
        ca: mockCertContent,
        rejectUnauthorized: true,
      },
    });
    expect(setGlobalDispatcher).toHaveBeenCalledWith(expect.any(ProxyAgent));
  });

  it('should handle missing CA certificate file gracefully', async () => {
    const mockCertPath = path.normalize('/path/to/nonexistent.pem');
    const mockProxyUrl = 'http://proxy.example.com';

    process.env.HTTPS_PROXY = mockProxyUrl;

    jest.mocked(getEnvString).mockImplementation((key: string, defaultValue: string = '') => {
      if (key === 'PROMPTFOO_CA_CERT_PATH') {
        return mockCertPath;
      }
      return defaultValue;
    });
    jest.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('File not found');
    });

    const mockFetch = jest.fn().mockResolvedValue(new Response());
    global.fetch = mockFetch;

    await fetchWithProxy('https://example.com');

    const actualPath = jest.mocked(fs.readFileSync).mock.calls[0][0] as string;
    const normalizedActual = path.normalize(actualPath).replace(/^\w:/, '');
    const normalizedExpected = path.normalize(mockCertPath).replace(/^\w:/, '');
    expect(normalizedActual).toBe(normalizedExpected);
    expect(ProxyAgent).toHaveBeenCalledWith({
      uri: mockProxyUrl,
      proxyTls: {
        rejectUnauthorized: true,
      },
      requestTls: {
        rejectUnauthorized: true,
      },
    });
    expect(setGlobalDispatcher).toHaveBeenCalledWith(expect.any(ProxyAgent));
  });

  it('should disable SSL verification when PROMPTFOO_INSECURE_SSL is true', async () => {
    const mockProxyUrl = 'http://proxy.example.com';
    process.env.HTTPS_PROXY = mockProxyUrl;

    jest
      .mocked(getEnvString)
      .mockImplementation((key: string, defaultValue: string = '') => defaultValue);
    jest.mocked(getEnvBool).mockImplementation((key: string, defaultValue: boolean = false) => {
      if (key === 'PROMPTFOO_INSECURE_SSL') {
        return true;
      }
      return defaultValue;
    });

    const mockFetch = jest.fn().mockResolvedValue(new Response());
    global.fetch = mockFetch;

    await fetchWithProxy('https://example.com');

    expect(ProxyAgent).toHaveBeenCalledWith({
      uri: mockProxyUrl,
      proxyTls: {
        rejectUnauthorized: false,
      },
      requestTls: {
        rejectUnauthorized: false,
      },
    });
    expect(setGlobalDispatcher).toHaveBeenCalledWith(expect.any(ProxyAgent));
  });

  it('should resolve CA certificate path relative to basePath when available', async () => {
    const mockBasePath = path.normalize('/base/path');
    const mockCertPath = 'certs/cert.pem';
    const mockCertContent = 'mock-cert-content';
    const mockProxyUrl = 'http://proxy.example.com';

    process.env.HTTPS_PROXY = mockProxyUrl;

    cliState.basePath = mockBasePath;

    jest.mocked(getEnvString).mockImplementation((key: string, defaultValue: string = '') => {
      if (key === 'PROMPTFOO_CA_CERT_PATH') {
        return mockCertPath;
      }
      return defaultValue;
    });
    jest.mocked(getEnvBool).mockImplementation((key: string, defaultValue: boolean = false) => {
      if (key === 'PROMPTFOO_INSECURE_SSL') {
        return false;
      }
      return defaultValue;
    });
    jest.mocked(fs.readFileSync).mockReturnValue(mockCertContent);

    const mockFetch = jest.fn().mockResolvedValue(new Response());
    global.fetch = mockFetch;

    await fetchWithProxy('https://example.com');

    const expectedPath = path.normalize(path.join(mockBasePath, mockCertPath));
    const actualPath = jest.mocked(fs.readFileSync).mock.calls[0][0] as string;
    const actualEncoding = jest.mocked(fs.readFileSync).mock.calls[0][1];

    const normalizedActual = path.normalize(actualPath).replace(/^\w:/, '');
    const normalizedExpected = path.normalize(expectedPath).replace(/^\w:/, '');
    const normalizedBasePath = path.normalize(mockBasePath).replace(/^\w:/, '');
    const normalizedCertPath = path.normalize(mockCertPath);

    expect(normalizedActual).toBe(normalizedExpected);
    expect(actualEncoding).toBe('utf8');
    expect(normalizedActual).toContain(normalizedBasePath);
    expect(normalizedActual).toContain(normalizedCertPath);
    expect(ProxyAgent).toHaveBeenCalledWith({
      uri: mockProxyUrl,
      proxyTls: {
        ca: mockCertContent,
        rejectUnauthorized: true,
      },
      requestTls: {
        ca: mockCertContent,
        rejectUnauthorized: true,
      },
    });
    expect(setGlobalDispatcher).toHaveBeenCalledWith(expect.any(ProxyAgent));

    cliState.basePath = undefined;
  });

  it('should not create ProxyAgent when no proxy URL is found', async () => {
    await fetchWithProxy('https://example.com');

    expect(ProxyAgent).not.toHaveBeenCalled();
    expect(setGlobalDispatcher).not.toHaveBeenCalled();
  });

  it('should use proxy URL from environment variables in order of precedence', async () => {
    const mockProxyUrls = {
      HTTPS_PROXY: 'http://https-proxy.example.com',
      https_proxy: 'http://https-proxy-lower.example.com',
      HTTP_PROXY: 'http://http-proxy.example.com',
      http_proxy: 'http://http-proxy-lower.example.com',
    } as const;

    const allProxyVars = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'];

    const testCases = [
      {
        env: { HTTPS_PROXY: mockProxyUrls.HTTPS_PROXY },
        expected: { url: mockProxyUrls.HTTPS_PROXY },
      },
      {
        env: { https_proxy: mockProxyUrls.https_proxy },
        expected: { url: mockProxyUrls.https_proxy },
      },
      {
        env: { HTTP_PROXY: mockProxyUrls.HTTP_PROXY },
        expected: { url: mockProxyUrls.HTTP_PROXY },
      },
      {
        env: { http_proxy: mockProxyUrls.http_proxy },
        expected: { url: mockProxyUrls.http_proxy },
      },
    ];

    for (const testCase of testCases) {
      jest.clearAllMocks();

      allProxyVars.forEach((key) => {
        delete process.env[key];
      });

      Object.entries(testCase.env).forEach(([key, value]) => {
        process.env[key] = value;
      });

      await fetchWithProxy('https://example.com');

      expect(ProxyAgent).toHaveBeenCalledWith({
        uri: testCase.expected.url,
        proxyTls: {
          rejectUnauthorized: !getEnvBool('PROMPTFOO_INSECURE_SSL', false),
        },
        requestTls: {
          rejectUnauthorized: !getEnvBool('PROMPTFOO_INSECURE_SSL', false),
        },
      });
      expect(setGlobalDispatcher).toHaveBeenCalledWith(expect.any(ProxyAgent));

      const debugCalls = jest.mocked(logger.debug).mock.calls;
      const normalizedCalls = debugCalls.map((call) => call[0].replace(/\/$/, ''));

      // On Windows, environment variables are case-insensitive
      const isWindows = process.platform === 'win32';
      const expectedEnvVar = Object.keys(testCase.env)[0];
      const expectedUrl = testCase.expected.url;

      expect(normalizedCalls).toEqual([
        expect.stringMatching(
          new RegExp(
            `Found proxy configuration in ${isWindows ? '.*' : expectedEnvVar}: ${expectedUrl}`,
            isWindows ? 'i' : '',
          ),
        ),
        `Using proxy: ${expectedUrl}`,
      ]);

      allProxyVars.forEach((key) => {
        delete process.env[key];
      });
    }
  });
});

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(global, 'fetch').mockImplementation();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should resolve when fetch completes before timeout', async () => {
    const mockResponse = createMockResponse({ ok: true });
    jest.mocked(global.fetch).mockImplementationOnce(() => Promise.resolve(mockResponse));

    const fetchPromise = fetchWithTimeout('https://example.com', {}, 5000);
    await expect(fetchPromise).resolves.toBe(mockResponse);
  });

  it('should reject when request times out', async () => {
    jest
      .mocked(global.fetch)
      .mockImplementationOnce(() => new Promise((resolve) => setTimeout(resolve, 6000)));

    const fetchPromise = fetchWithTimeout('https://example.com', {}, 5000);
    jest.advanceTimersByTime(5000);

    await expect(fetchPromise).rejects.toThrow('Request timed out after 5000 ms');
  });
});

describe('isRateLimited', () => {
  it('should detect standard rate limit headers', () => {
    const response = createMockResponse({
      headers: new Headers({
        'X-RateLimit-Remaining': '0',
      }),
      status: 200,
    });
    expect(isRateLimited(response)).toBe(true);
  });

  it('should detect 429 status code', () => {
    const response = createMockResponse({
      status: 429,
    });
    expect(isRateLimited(response)).toBe(true);
  });

  it('should detect OpenAI specific rate limits', () => {
    const response = createMockResponse({
      headers: new Headers({
        'x-ratelimit-remaining-requests': '0',
      }),
    });
    expect(isRateLimited(response)).toBe(true);

    const tokenResponse = createMockResponse({
      headers: new Headers({
        'x-ratelimit-remaining-tokens': '0',
      }),
    });
    expect(isRateLimited(tokenResponse)).toBe(true);
  });

  it('should return false when not rate limited', () => {
    const response = createMockResponse({
      headers: new Headers({
        'X-RateLimit-Remaining': '10',
      }),
      status: 200,
    });
    expect(isRateLimited(response)).toBe(false);
  });
});

describe('handleRateLimit', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.mocked(sleep).mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should handle OpenAI reset headers', async () => {
    const response = createMockResponse({
      headers: new Headers({
        'x-ratelimit-reset-requests': '5',
      }),
    });

    const promise = handleRateLimit(response);
    jest.advanceTimersByTime(5000);
    await promise;

    expect(logger.debug).toHaveBeenCalledWith('Rate limited, waiting 5000ms before retry');
  });

  it('should handle standard rate limit reset headers', async () => {
    const futureTime = Math.floor((Date.now() + 5000) / 1000);
    const response = createMockResponse({
      headers: new Headers({
        'X-RateLimit-Reset': futureTime.toString(),
      }),
    });

    const promise = handleRateLimit(response);
    await promise;

    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringMatching(/Rate limited, waiting \d+ms before retry/),
    );
  });

  it('should handle Retry-After headers', async () => {
    const response = createMockResponse({
      headers: new Headers({
        'Retry-After': '5',
      }),
    });

    const promise = handleRateLimit(response);
    jest.advanceTimersByTime(5000);
    await promise;

    expect(logger.debug).toHaveBeenCalledWith('Rate limited, waiting 5000ms before retry');
  });

  it('should use default wait time when no headers present', async () => {
    const response = createMockResponse();

    const promise = handleRateLimit(response);
    jest.advanceTimersByTime(60000);
    await promise;

    expect(logger.debug).toHaveBeenCalledWith('Rate limited, waiting 60000ms before retry');
  });
});

describe('fetchWithRetries', () => {
  beforeEach(() => {
    jest.mocked(sleep).mockClear();
    jest.spyOn(global, 'fetch').mockImplementation();
    jest.clearAllMocks();
  });

  it('should make exactly one attempt when retries is 0', async () => {
    const successResponse = createMockResponse();
    jest.mocked(global.fetch).mockResolvedValueOnce(successResponse);

    await fetchWithRetries('https://example.com', {}, 1000, 0);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('should handle negative retry values by treating them as 0', async () => {
    const successResponse = createMockResponse();
    jest.mocked(global.fetch).mockResolvedValueOnce(successResponse);

    await fetchWithRetries('https://example.com', {}, 1000, -1);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('should make retries+1 total attempts', async () => {
    jest.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

    await expect(fetchWithRetries('https://example.com', {}, 1000, 2)).rejects.toThrow(
      'Request failed after 2 retries: Network error',
    );

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('should not sleep after the final attempt', async () => {
    jest.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

    await expect(fetchWithRetries('https://example.com', {}, 1000, 1)).rejects.toThrow(
      'Request failed after 1 retries: Network error',
    );

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('should handle 5XX errors when PROMPTFOO_RETRY_5XX is true', async () => {
    jest.mocked(getEnvBool).mockImplementation((key: string) => {
      if (key === 'PROMPTFOO_RETRY_5XX') {
        return true;
      }
      return false;
    });

    const errorResponse = createMockResponse({
      status: 502,
      statusText: 'Bad Gateway',
    });
    const successResponse = createMockResponse();

    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce(errorResponse)
      .mockResolvedValueOnce(successResponse);
    global.fetch = mockFetch;

    await fetchWithRetries('https://example.com', {}, 1000, 2);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('should handle rate limits with proper backoff', async () => {
    const rateLimitedResponse = createMockResponse({
      status: 429,
      headers: new Headers({
        'Retry-After': '1',
      }),
    });
    const successResponse = createMockResponse();

    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce(rateLimitedResponse)
      .mockResolvedValueOnce(successResponse);
    global.fetch = mockFetch;

    await fetchWithRetries('https://example.com', {}, 1000, 2);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Rate limited on URL'));
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('should respect maximum retry count', async () => {
    const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
    global.fetch = mockFetch;

    await expect(fetchWithRetries('https://example.com', {}, 1000, 2)).rejects.toThrow(
      'Request failed after 2 retries: Network error',
    );

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('should handle detailed error information', async () => {
    const error = new Error('Network error');
    (error as any).code = 'ECONNREFUSED';
    (error as any).cause = 'Connection refused';
    jest.mocked(global.fetch).mockRejectedValue(error);

    await expect(fetchWithRetries('https://example.com', {}, 1000, 1)).rejects.toThrow(
      'Request failed after 1 retries: Network error',
    );

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('should handle non-Error objects in rejection', async () => {
    jest.mocked(global.fetch).mockRejectedValue('String error');

    await expect(fetchWithRetries('https://example.com', {}, 1000, 1)).rejects.toThrow(
      'Request failed after 1 retries: undefined',
    );

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('should handle rate limits with OpenAI specific headers', async () => {
    const rateLimitedResponse = createMockResponse({
      status: 429,
      headers: new Headers({
        'x-ratelimit-reset-tokens': '5',
      }),
    });
    const successResponse = createMockResponse();

    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce(rateLimitedResponse)
      .mockResolvedValueOnce(successResponse);
    global.fetch = mockFetch;

    await fetchWithRetries('https://example.com', {}, 1000, 2);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Rate limited on URL'));
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});

describe('sanitizeUrl', () => {
  it('should mask credentials in URLs', () => {
    const url = 'https://username:password@example.com/api';
    expect(sanitizeUrl(url)).toBe('https://***:***@example.com/api');
  });

  it('should handle URLs without credentials', () => {
    const url = 'https://example.com/api';
    expect(sanitizeUrl(url)).toBe(url);
  });

  it('should return original string for invalid URLs', () => {
    const invalidUrl = 'not-a-url';
    expect(sanitizeUrl(invalidUrl)).toBe(invalidUrl);
  });
});
