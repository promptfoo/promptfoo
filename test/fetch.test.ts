import * as fsPromises from 'node:fs/promises';
import path from 'node:path';

import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../src/cliState';
import { VERSION } from '../src/constants';
import { getEnvBool, getEnvString } from '../src/envars';
import logger from '../src/logger';
import { REQUEST_TIMEOUT_MS } from '../src/providers/shared';
import {
  fetchWithProxy,
  fetchWithRetries,
  fetchWithTimeout,
  handleRateLimit,
  isRateLimited,
  isTransientError,
} from '../src/util/fetch/index';
import { sleep } from '../src/util/time';
import { createMockResponse } from './util/utils';

vi.mock('../src/util/time', () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));

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
    getApiKey: vi.fn(),
  },
}));

vi.mock('undici', () => {
  const mockProxyAgentInstance = {
    options: null,
    addRequest: vi.fn(),
    destroy: vi.fn(),
  };

  const mockAgentInstance = {
    addRequest: vi.fn(),
    destroy: vi.fn(),
  };

  // Use regular functions instead of arrow functions for constructors
  const ProxyAgent = vi.fn(function (this: any, options: any) {
    mockProxyAgentInstance.options = options;
    return mockProxyAgentInstance;
  });

  const Agent = vi.fn(function (this: any) {
    return mockAgentInstance;
  });

  return {
    ProxyAgent,
    Agent,
    setGlobalDispatcher: vi.fn(),
  };
});

vi.mock('../src/envars', () => {
  return {
    getEnvString: vi.fn().mockImplementation((key: string, defaultValue: string = '') => {
      if (key === 'HTTPS_PROXY' && process.env.HTTPS_PROXY) {
        return process.env.HTTPS_PROXY;
      }
      if (key === 'https_proxy' && process.env.https_proxy) {
        return process.env.https_proxy;
      }
      if (key === 'HTTP_PROXY' && process.env.HTTP_PROXY) {
        return process.env.HTTP_PROXY;
      }
      if (key === 'http_proxy' && process.env.http_proxy) {
        return process.env.http_proxy;
      }
      if (key === 'NO_PROXY' && process.env.NO_PROXY) {
        return process.env.NO_PROXY;
      }
      if (key === 'no_proxy' && process.env.no_proxy) {
        return process.env.no_proxy;
      }
      if (key === 'PROMPTFOO_CA_CERT_PATH' && process.env.PROMPTFOO_CA_CERT_PATH) {
        return process.env.PROMPTFOO_CA_CERT_PATH;
      }
      if (key === 'PROMPTFOO_INSECURE_SSL') {
        return process.env.PROMPTFOO_INSECURE_SSL || defaultValue;
      }
      return defaultValue;
    }),
    getEnvBool: vi.fn().mockImplementation((key: string, defaultValue: boolean = false) => {
      if (key === 'PROMPTFOO_RETRY_5XX_ENABLED') {
        return process.env.PROMPTFOO_RETRY_5XX_ENABLED === 'true' || false;
      }
      if (key === 'PROMPTFOO_INSECURE_SSL') {
        return process.env.PROMPTFOO_INSECURE_SSL === 'true' || false;
      }
      if (key === 'PROMPTFOO_RETRY_5XX') {
        return process.env.PROMPTFOO_RETRY_5XX === 'true' || false;
      }
      return defaultValue;
    }),
    getEnvInt: vi.fn().mockImplementation((key: string, defaultValue: number = 0) => {
      if (key === 'REQUEST_TIMEOUT_MS') {
        return Number.parseInt(process.env.REQUEST_TIMEOUT_MS || '300000', 10);
      }
      return defaultValue;
    }),
  };
});

vi.mock('node:fs', () => ({
  default: {
    readFileSync: vi.fn(),
  },
  readFileSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

vi.mock('../src/cliState', () => ({
  default: {
    basePath: undefined,
  },
}));

describe('fetchWithProxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response());
    vi.mocked(ProxyAgent).mockClear();
    vi.mocked(setGlobalDispatcher).mockClear();
    delete process.env.HTTPS_PROXY;
    delete process.env.https_proxy;
    delete process.env.HTTP_PROXY;
    delete process.env.http_proxy;
    delete process.env.npm_config_https_proxy;
    delete process.env.npm_config_http_proxy;
    delete process.env.npm_config_proxy;
    delete process.env.all_proxy;
    delete process.env.PROMPTFOO_INSECURE_SSL;
    delete process.env.PROMPTFOO_CA_CERT_PATH;
  });

  afterEach(() => {
    vi.resetAllMocks();
    delete process.env.PROMPTFOO_INSECURE_SSL;
    delete process.env.PROMPTFOO_CA_CERT_PATH;
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
          Authorization: expect.any(String),
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
          Authorization: expect.any(String),
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
    process.env.PROMPTFOO_CA_CERT_PATH = mockCertPath;

    vi.mocked(getEnvString).mockImplementation((key: string, defaultValue: string = '') => {
      if (key === 'PROMPTFOO_CA_CERT_PATH') {
        return mockCertPath;
      }
      if (key === 'HTTPS_PROXY') {
        return mockProxyUrl;
      }
      return defaultValue;
    });
    vi.mocked(getEnvBool).mockImplementation((key: string, defaultValue: boolean = false) => {
      if (key === 'PROMPTFOO_INSECURE_SSL') {
        return false;
      }
      return defaultValue;
    });
    vi.mocked(fsPromises.readFile).mockResolvedValue(mockCertContent);

    const mockFetch = vi.fn().mockResolvedValue(new Response());
    global.fetch = mockFetch;

    await fetchWithProxy('https://example.com');

    const actualPath = vi.mocked(fsPromises.readFile).mock.calls[0][0] as string;
    const actualEncoding = vi.mocked(fsPromises.readFile).mock.calls[0][1];
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
      headersTimeout: REQUEST_TIMEOUT_MS,
    });
    expect(setGlobalDispatcher).toHaveBeenCalledWith(expect.any(Object));
  });

  it('should handle missing CA certificate file gracefully', async () => {
    const mockCertPath = path.normalize('/path/to/nonexistent.pem');
    const mockProxyUrl = 'http://proxy.example.com';

    process.env.HTTPS_PROXY = mockProxyUrl;
    process.env.PROMPTFOO_CA_CERT_PATH = mockCertPath;

    vi.mocked(getEnvString).mockImplementation((key: string, defaultValue: string = '') => {
      if (key === 'PROMPTFOO_CA_CERT_PATH') {
        return mockCertPath;
      }
      if (key === 'HTTPS_PROXY') {
        return mockProxyUrl;
      }
      return defaultValue;
    });
    vi.mocked(getEnvBool).mockImplementation((key: string, defaultValue: boolean = false) => {
      if (key === 'PROMPTFOO_INSECURE_SSL') {
        return false;
      }
      return defaultValue;
    });
    vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('File not found'));

    const mockFetch = vi.fn().mockResolvedValue(new Response());
    global.fetch = mockFetch;

    await fetchWithProxy('https://example.com');

    const actualPath = vi.mocked(fsPromises.readFile).mock.calls[0][0] as string;
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
      headersTimeout: REQUEST_TIMEOUT_MS,
    });
    expect(setGlobalDispatcher).toHaveBeenCalledWith(expect.any(Object));
  });

  it('should disable SSL verification when PROMPTFOO_INSECURE_SSL is true', async () => {
    const mockProxyUrl = 'http://proxy.example.com';

    process.env.HTTPS_PROXY = mockProxyUrl;
    process.env.PROMPTFOO_INSECURE_SSL = 'true';

    vi.mocked(getEnvString).mockImplementation((key: string, defaultValue: string = '') => {
      if (key === 'HTTPS_PROXY') {
        return mockProxyUrl;
      }
      return defaultValue;
    });
    vi.mocked(getEnvBool).mockImplementation((key: string, defaultValue: boolean = false) => {
      if (key === 'PROMPTFOO_INSECURE_SSL') {
        return true;
      }
      return defaultValue;
    });

    const mockFetch = vi.fn().mockResolvedValue(new Response());
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
      headersTimeout: REQUEST_TIMEOUT_MS,
    });
    expect(setGlobalDispatcher).toHaveBeenCalledWith(expect.any(Object));
  });

  it('should resolve CA certificate path relative to basePath when available', async () => {
    const mockBasePath = path.normalize('/base/path');
    const mockCertPath = 'certs/cert.pem';
    const mockCertContent = 'mock-cert-content';
    const mockProxyUrl = 'http://proxy.example.com';

    process.env.HTTPS_PROXY = mockProxyUrl;
    process.env.PROMPTFOO_CA_CERT_PATH = mockCertPath;

    cliState.basePath = mockBasePath;

    vi.mocked(getEnvString).mockImplementation((key: string, defaultValue: string = '') => {
      if (key === 'PROMPTFOO_CA_CERT_PATH') {
        return mockCertPath;
      }
      if (key === 'HTTPS_PROXY') {
        return mockProxyUrl;
      }
      return defaultValue;
    });
    vi.mocked(getEnvBool).mockImplementation((key: string, defaultValue: boolean = false) => {
      if (key === 'PROMPTFOO_INSECURE_SSL') {
        return false;
      }
      return defaultValue;
    });
    vi.mocked(fsPromises.readFile).mockResolvedValue(mockCertContent);

    const mockFetch = vi.fn().mockResolvedValue(new Response());
    global.fetch = mockFetch;

    await fetchWithProxy('https://example.com');

    const expectedPath = path.normalize(path.join(mockBasePath, mockCertPath));
    const actualPath = vi.mocked(fsPromises.readFile).mock.calls[0][0] as string;
    const actualEncoding = vi.mocked(fsPromises.readFile).mock.calls[0][1];

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
      headersTimeout: REQUEST_TIMEOUT_MS,
    });
    expect(setGlobalDispatcher).toHaveBeenCalledWith(expect.any(Object));

    cliState.basePath = undefined;
  });

  it('should not create ProxyAgent when no proxy URL is found', async () => {
    await fetchWithProxy('https://example.com');

    expect(ProxyAgent).not.toHaveBeenCalled();
  });

  it('should use proxy URL from environment variables in order of precedence', async () => {
    const mockProxyUrls = {
      HTTPS_PROXY: 'http://https-proxy.example.com',
      https_proxy: 'http://https-proxy-lower.example.com',
      HTTP_PROXY: 'http://http-proxy.example.com',
      http_proxy: 'http://http-proxy-lower.example.com',
    } as const;

    const allProxyVars = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'];

    const httpTestCases = [
      {
        env: { HTTP_PROXY: mockProxyUrls.HTTP_PROXY },
        expected: { url: mockProxyUrls.HTTP_PROXY },
      },
      {
        env: { http_proxy: mockProxyUrls.http_proxy },
        expected: { url: mockProxyUrls.http_proxy },
      },
    ];

    const httpsTestCases = [
      {
        env: { HTTPS_PROXY: mockProxyUrls.HTTPS_PROXY },
        expected: { url: mockProxyUrls.HTTPS_PROXY },
      },
      {
        env: { https_proxy: mockProxyUrls.https_proxy },
        expected: { url: mockProxyUrls.https_proxy },
      },
    ];

    for (const testCase of httpTestCases) {
      vi.clearAllMocks();

      allProxyVars.forEach((key) => {
        delete process.env[key];
      });

      Object.entries(testCase.env).forEach(([key, value]) => {
        process.env[key] = value;
      });

      await fetchWithProxy('http://example.com');

      expect(ProxyAgent).toHaveBeenCalledWith({
        uri: testCase.expected.url,
        proxyTls: {
          rejectUnauthorized: !getEnvBool('PROMPTFOO_INSECURE_SSL', true),
        },
        requestTls: {
          rejectUnauthorized: !getEnvBool('PROMPTFOO_INSECURE_SSL', true),
        },
        headersTimeout: REQUEST_TIMEOUT_MS,
      });
      expect(setGlobalDispatcher).toHaveBeenCalledWith(expect.any(Object));

      const debugCalls = vi.mocked(logger.debug).mock.calls;
      const normalizedCalls = debugCalls.map((call) => call[0].replace(/\/$/, ''));

      const proxyConfigCalls = normalizedCalls.filter((msg) => msg.includes(`Using proxy:`));

      expect(proxyConfigCalls).toEqual([`Using proxy: ${testCase.expected.url}`]);

      allProxyVars.forEach((key) => {
        delete process.env[key];
      });
    }

    for (const testCase of httpsTestCases) {
      vi.clearAllMocks();

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
          rejectUnauthorized: !getEnvBool('PROMPTFOO_INSECURE_SSL', true),
        },
        requestTls: {
          rejectUnauthorized: !getEnvBool('PROMPTFOO_INSECURE_SSL', true),
        },
        headersTimeout: REQUEST_TIMEOUT_MS,
      });
      expect(setGlobalDispatcher).toHaveBeenCalledWith(expect.any(Object));

      const debugCalls = vi.mocked(logger.debug).mock.calls;
      const normalizedCalls = debugCalls.map((call) => call[0].replace(/\/$/, ''));

      const proxyConfigCalls = normalizedCalls.filter((msg) => msg.includes(`Using proxy:`));

      expect(proxyConfigCalls).toEqual([`Using proxy: ${testCase.expected.url}`]);

      allProxyVars.forEach((key) => {
        delete process.env[key];
      });
    }
  });

  it('should use proxy for domains not in NO_PROXY', async () => {
    const mockProxyUrl = 'http://proxy.example.com:8080';

    process.env.HTTPS_PROXY = mockProxyUrl;
    process.env.NO_PROXY = 'localhost,internal.example.com';

    await fetchWithProxy('https://api.example.com/v1');

    expect(ProxyAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: mockProxyUrl,
      }),
    );
    expect(setGlobalDispatcher).toHaveBeenCalledWith(expect.any(Object));
  });

  describe('Abort Signal Handling', () => {
    it('should pass abortSignal parameter to fetch', async () => {
      const abortController = new AbortController();
      const url = 'https://example.com/api';

      await fetchWithProxy(url, {}, abortController.signal);

      expect(global.fetch).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          signal: abortController.signal,
        }),
      );
    });

    it('should combine abortSignal parameter with options.signal', async () => {
      const abortController1 = new AbortController();
      const abortController2 = new AbortController();
      const url = 'https://example.com/api';

      await fetchWithProxy(url, { signal: abortController1.signal }, abortController2.signal);

      // The combined signal should be passed
      expect(global.fetch).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          signal: expect.any(Object),
        }),
      );
    });

    it('should use only options.signal when abortSignal parameter is not provided', async () => {
      const abortController = new AbortController();
      const url = 'https://example.com/api';

      await fetchWithProxy(url, { signal: abortController.signal });

      expect(global.fetch).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          signal: abortController.signal,
        }),
      );
    });
  });
});

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(global, 'fetch').mockImplementation(() => Promise.resolve(new Response()));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should resolve when fetch completes before timeout', async () => {
    const mockResponse = createMockResponse({ ok: true });
    vi.mocked(global.fetch).mockImplementationOnce(() => Promise.resolve(mockResponse));

    const fetchPromise = fetchWithTimeout('https://example.com', {}, 5000);
    await expect(fetchPromise).resolves.toBe(mockResponse);
  });

  it('should reject when request times out', async () => {
    vi.mocked(global.fetch).mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(resolve, 6000)),
    );

    const fetchPromise = fetchWithTimeout('https://example.com', {}, 5000);
    vi.advanceTimersByTime(5000);

    await expect(fetchPromise).rejects.toThrow('Request timed out after 5000 ms');
  });

  it('should combine options.signal with timeout signal using AbortSignal.any', async () => {
    const userAbortController = new AbortController();
    const mockResponse = createMockResponse({ ok: true });
    vi.mocked(global.fetch).mockImplementationOnce(() => Promise.resolve(mockResponse));

    const fetchPromise = fetchWithTimeout(
      'https://example.com',
      { signal: userAbortController.signal },
      5000,
    );
    await expect(fetchPromise).resolves.toBe(mockResponse);

    // The signal passed to fetch should be a combined signal
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        signal: expect.any(Object),
      }),
    );
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
    vi.useFakeTimers();
    vi.mocked(sleep).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should handle OpenAI reset headers', async () => {
    const response = createMockResponse({
      headers: new Headers({
        'x-ratelimit-reset-requests': '5',
      }),
    });

    const promise = handleRateLimit(response);
    vi.advanceTimersByTime(5000);
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
    vi.advanceTimersByTime(5000);
    await promise;

    expect(logger.debug).toHaveBeenCalledWith('Rate limited, waiting 5000ms before retry');
  });

  it('should use default wait time when no headers present', async () => {
    const response = createMockResponse();

    const promise = handleRateLimit(response);
    vi.advanceTimersByTime(60000);
    await promise;

    expect(logger.debug).toHaveBeenCalledWith('Rate limited, waiting 60000ms before retry');
  });
});

describe('fetchWithRetries', () => {
  beforeEach(() => {
    vi.mocked(sleep).mockClear();
    vi.spyOn(global, 'fetch').mockImplementation(() => Promise.resolve(new Response()));
    vi.clearAllMocks();
  });

  it('should make exactly one attempt when retries is 0', async () => {
    const successResponse = createMockResponse();
    vi.mocked(global.fetch).mockResolvedValueOnce(successResponse);

    await fetchWithRetries('https://example.com', {}, 1000, 0);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('should handle negative retry values by treating them as 0', async () => {
    const successResponse = createMockResponse();
    vi.mocked(global.fetch).mockResolvedValueOnce(successResponse);

    await fetchWithRetries('https://example.com', {}, 1000, -1);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('should make retries+1 total attempts', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

    await expect(fetchWithRetries('https://example.com', {}, 1000, 2)).rejects.toThrow(
      'Request failed after 2 retries: Error: Network error',
    );

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('should not sleep after the final attempt', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

    await expect(fetchWithRetries('https://example.com', {}, 1000, 1)).rejects.toThrow(
      'Request failed after 1 retries: Error: Network error',
    );

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('should handle 5XX errors when PROMPTFOO_RETRY_5XX is true', async () => {
    vi.mocked(getEnvBool).mockImplementation((key: string) => {
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

    const mockFetch = vi
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

    const mockFetch = vi
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
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    global.fetch = mockFetch;

    await expect(fetchWithRetries('https://example.com', {}, 1000, 2)).rejects.toThrow(
      'Request failed after 2 retries: Error: Network error',
    );

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('should handle detailed error information', async () => {
    const error = new Error('Network error');
    (error as any).code = 'ECONNREFUSED';
    (error as any).cause = 'Connection refused';
    vi.mocked(global.fetch).mockRejectedValue(error);

    await expect(fetchWithRetries('https://example.com', {}, 1000, 1)).rejects.toThrow(
      'Request failed after 1 retries: Error: Network error (Cause: Connection refused) (Code: ECONNREFUSED)',
    );

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('should handle non-Error objects in rejection', async () => {
    vi.mocked(global.fetch).mockRejectedValue('String error');

    await expect(fetchWithRetries('https://example.com', {}, 1000, 1)).rejects.toThrow(
      'Request failed after 1 retries: String error',
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

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(rateLimitedResponse)
      .mockResolvedValueOnce(successResponse);
    global.fetch = mockFetch;

    await fetchWithRetries('https://example.com', {}, 1000, 2);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Rate limited on URL'));
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('should log attempt count with total attempts on rate limit', async () => {
    const rateLimitedResponse = createMockResponse({
      status: 429,
      headers: new Headers({ 'Retry-After': '0' }),
    });
    vi.mocked(global.fetch).mockResolvedValue(rateLimitedResponse);

    await expect(fetchWithRetries('https://example.com', {}, 1000, 2)).rejects.toThrow();

    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('attempt 1/3'));
  });

  it('should include error details in final error message for rate limits', async () => {
    const rateLimitResponse = createMockResponse({
      status: 429,
      statusText: 'Too Many Requests',
    });

    vi.mocked(global.fetch).mockResolvedValue(rateLimitResponse);

    await expect(fetchWithRetries('https://example.com', {}, 1000, 2)).rejects.toThrow(
      'Rate limited: 429 Too Many Requests',
    );
  });

  describe('Abort Signal Handling', () => {
    it('should immediately re-throw AbortError without retrying', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      vi.mocked(global.fetch).mockRejectedValue(abortError);

      await expect(fetchWithRetries('https://example.com', {}, 1000, 3)).rejects.toThrow(
        'The operation was aborted',
      );

      // Should only be called once - no retries
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    });

    it('should pass signal through options to underlying fetch', async () => {
      const abortController = new AbortController();
      const successResponse = createMockResponse();
      vi.mocked(global.fetch).mockResolvedValueOnce(successResponse);

      await fetchWithRetries('https://example.com', { signal: abortController.signal }, 1000, 0);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(Object),
        }),
      );
    });

    it('should not retry when abort signal is triggered during request', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      // First call throws AbortError
      vi.mocked(global.fetch).mockRejectedValueOnce(abortError);

      await expect(fetchWithRetries('https://example.com', {}, 1000, 5)).rejects.toThrow(
        'The operation was aborted',
      );

      // Should not retry on abort
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});

describe('fetchWithProxy with NO_PROXY', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(global, 'fetch').mockImplementation(() => Promise.resolve(new Response()));
    vi.mocked(ProxyAgent).mockClear();
    vi.mocked(setGlobalDispatcher).mockClear();
    delete process.env.HTTPS_PROXY;
    delete process.env.https_proxy;
    delete process.env.HTTP_PROXY;
    delete process.env.http_proxy;
    delete process.env.npm_config_https_proxy;
    delete process.env.npm_config_http_proxy;
    delete process.env.npm_config_proxy;
    delete process.env.all_proxy;
    delete process.env.NO_PROXY;
    delete process.env.no_proxy;
  });

  afterEach(() => {
    delete process.env.HTTPS_PROXY;
    delete process.env.https_proxy;
    delete process.env.HTTP_PROXY;
    delete process.env.http_proxy;
    delete process.env.npm_config_https_proxy;
    delete process.env.npm_config_http_proxy;
    delete process.env.npm_config_proxy;
    delete process.env.all_proxy;
    delete process.env.NO_PROXY;
    delete process.env.no_proxy;
    vi.resetAllMocks();
  });

  it('should respect NO_PROXY for localhost URLs', async () => {
    const mockProxyUrl = 'http://proxy.example.com:8080';

    process.env.HTTP_PROXY = mockProxyUrl;
    process.env.NO_PROXY = 'localhost';

    await fetchWithProxy('http://localhost:3000/api');

    expect(ProxyAgent).not.toHaveBeenCalled();
  });

  it('should respect NO_PROXY for 127.0.0.1', async () => {
    const mockProxyUrl = 'http://proxy.example.com:8080';

    process.env.HTTP_PROXY = mockProxyUrl;
    process.env.NO_PROXY = '127.0.0.1';

    await fetchWithProxy('http://127.0.0.1:3000/api');

    expect(ProxyAgent).not.toHaveBeenCalled();
  });

  it('should respect NO_PROXY with multiple entries', async () => {
    const mockProxyUrl = 'http://proxy.example.com:8080';
    const noProxyList = 'example.org,localhost,internal.example.com';

    process.env.HTTP_PROXY = mockProxyUrl;
    process.env.NO_PROXY = noProxyList;

    await fetchWithProxy('http://localhost:3000/api');
    expect(ProxyAgent).not.toHaveBeenCalled();

    vi.clearAllMocks();
    process.env.HTTPS_PROXY = mockProxyUrl;
    process.env.NO_PROXY = noProxyList;
    await fetchWithProxy('https://example.org/api');
    expect(ProxyAgent).not.toHaveBeenCalled();

    vi.clearAllMocks();
    process.env.HTTPS_PROXY = mockProxyUrl;
    process.env.NO_PROXY = noProxyList;
    await fetchWithProxy('https://internal.example.com/api');
    expect(ProxyAgent).not.toHaveBeenCalled();

    vi.clearAllMocks();
    process.env.HTTPS_PROXY = mockProxyUrl;
    process.env.NO_PROXY = noProxyList;
    await fetchWithProxy('https://example.com/api');
    expect(ProxyAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: mockProxyUrl,
      }),
    );
    expect(setGlobalDispatcher).toHaveBeenCalledWith(expect.any(Object));
  });

  it('should use proxy for domains not in NO_PROXY', async () => {
    const mockProxyUrl = 'http://proxy.example.com:8080';

    process.env.HTTPS_PROXY = mockProxyUrl;
    process.env.NO_PROXY = 'localhost,internal.example.com';

    await fetchWithProxy('https://api.example.com/v1');

    expect(ProxyAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: mockProxyUrl,
      }),
    );
    expect(setGlobalDispatcher).toHaveBeenCalledWith(expect.any(Object));
  });

  it('should handle wildcard patterns in NO_PROXY', async () => {
    const mockProxyUrl = 'http://proxy.example.com:8080';

    process.env.HTTPS_PROXY = mockProxyUrl;
    process.env.NO_PROXY = '*.example.org,localhost';

    await fetchWithProxy('https://api.example.org/v1');
    expect(ProxyAgent).not.toHaveBeenCalled();

    vi.clearAllMocks();
    process.env.HTTPS_PROXY = mockProxyUrl;
    await fetchWithProxy('https://subdomain.api.example.org/v1');
    expect(ProxyAgent).not.toHaveBeenCalled();

    vi.clearAllMocks();
    process.env.HTTPS_PROXY = mockProxyUrl;
    await fetchWithProxy('https://example.com/v1');
    expect(ProxyAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: mockProxyUrl,
      }),
    );
  });

  it('should handle domain suffix patterns in NO_PROXY', async () => {
    const mockProxyUrl = 'http://proxy.example.com:8080';

    process.env.HTTPS_PROXY = mockProxyUrl;
    process.env.NO_PROXY = '.example.org,localhost';

    await fetchWithProxy('https://api.example.org/v1');
    expect(ProxyAgent).not.toHaveBeenCalled();

    vi.clearAllMocks();
    process.env.HTTPS_PROXY = mockProxyUrl;
    await fetchWithProxy('https://subdomain.api.example.org/v1');
    expect(ProxyAgent).not.toHaveBeenCalled();

    vi.clearAllMocks();
    process.env.HTTPS_PROXY = mockProxyUrl;
    await fetchWithProxy('https://abc.example.org/v1');
    expect(ProxyAgent).not.toHaveBeenCalled();

    vi.clearAllMocks();
    process.env.HTTPS_PROXY = mockProxyUrl;
    await fetchWithProxy('https://abc.example.com/v1');
    expect(ProxyAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: mockProxyUrl,
      }),
    );
  });

  it('should handle URLs without schemes', async () => {
    const mockProxyUrl = 'http://proxy.example.com:8080';

    process.env.HTTP_PROXY = mockProxyUrl;
    process.env.NO_PROXY = 'localhost,example.org';

    await fetchWithProxy('localhost:3000');
    expect(ProxyAgent).not.toHaveBeenCalled();

    vi.clearAllMocks();
    await fetchWithProxy('example.org');
    expect(ProxyAgent).not.toHaveBeenCalled();
  });

  it('should properly parse URLs with credentials when checking against NO_PROXY', async () => {
    const mockProxyUrl = 'http://proxy.example.com:8080';

    process.env.HTTP_PROXY = mockProxyUrl;
    process.env.NO_PROXY = 'api.example.org';

    await fetchWithProxy('https://username:password@api.example.org/v1');

    expect(ProxyAgent).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.org/v1',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.any(String),
        }),
      }),
    );
  });

  it('should handle bad URL inputs gracefully when checking NO_PROXY', async () => {
    const mockProxyUrl = 'http://proxy.example.com:8080';

    process.env.HTTP_PROXY = mockProxyUrl;
    process.env.HTTPS_PROXY = mockProxyUrl;
    process.env.NO_PROXY = 'localhost';

    await fetchWithProxy(':::not-a-valid-url:::');

    expect(ProxyAgent).not.toHaveBeenCalled();
  });

  it('should use lowercase for NO_PROXY checks', async () => {
    const mockProxyUrl = 'http://proxy.example.com:8080';

    process.env.HTTPS_PROXY = mockProxyUrl;
    process.env.NO_PROXY = 'LOCALHOST,API.EXAMPLE.ORG';

    await fetchWithProxy('http://localhost:3000');
    expect(ProxyAgent).not.toHaveBeenCalled();

    vi.clearAllMocks();
    await fetchWithProxy('https://api.example.org/v1');
    expect(ProxyAgent).not.toHaveBeenCalled();
  });

  it('should handle URL objects and Request objects', async () => {
    const mockProxyUrl = 'http://proxy.example.com:8080';

    process.env.HTTP_PROXY = mockProxyUrl;
    process.env.NO_PROXY = 'localhost,example.org';

    const urlObj = new URL('http://localhost:3000');
    await fetchWithProxy(urlObj.toString());
    expect(ProxyAgent).not.toHaveBeenCalled();

    vi.clearAllMocks();

    process.env.HTTPS_PROXY = mockProxyUrl;
    process.env.NO_PROXY = 'localhost,example.org';
    const request = new Request('https://example.org/api');
    await fetchWithProxy(request);
    expect(ProxyAgent).not.toHaveBeenCalled();

    vi.clearAllMocks();

    process.env.HTTP_PROXY = mockProxyUrl;
    process.env.NO_PROXY = 'localhost,example.org';
    const otherRequest = new Request('http://example.com/api');
    await fetchWithProxy(otherRequest);
    expect(ProxyAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: mockProxyUrl,
      }),
    );
  });
});

describe('isTransientError', () => {
  it('should return true for 502 Bad Gateway', () => {
    const response = createMockResponse({
      status: 502,
      statusText: 'Bad Gateway',
    });
    expect(isTransientError(response)).toBe(true);
  });

  it('should return true for 503 Service Unavailable', () => {
    const response = createMockResponse({
      status: 503,
      statusText: 'Service Unavailable',
    });
    expect(isTransientError(response)).toBe(true);
  });

  it('should return true for 504 Gateway Timeout', () => {
    const response = createMockResponse({
      status: 504,
      statusText: 'Gateway Timeout',
    });
    expect(isTransientError(response)).toBe(true);
  });

  it('should be case insensitive for status text', () => {
    expect(
      isTransientError(
        createMockResponse({
          status: 502,
          statusText: 'BAD GATEWAY',
        }),
      ),
    ).toBe(true);

    expect(
      isTransientError(
        createMockResponse({
          status: 503,
          statusText: 'SERVICE UNAVAILABLE',
        }),
      ),
    ).toBe(true);

    expect(
      isTransientError(
        createMockResponse({
          status: 504,
          statusText: 'GATEWAY TIMEOUT',
        }),
      ),
    ).toBe(true);
  });

  it('should return false for 502 without matching text', () => {
    const response = createMockResponse({
      status: 502,
      statusText: 'Invalid API Key',
    });
    expect(isTransientError(response)).toBe(false);
  });

  it('should return false for 500 Internal Server Error', () => {
    const response = createMockResponse({
      status: 500,
      statusText: 'Internal Server Error',
    });
    expect(isTransientError(response)).toBe(false);
  });
});

describe('fetchWithProxy transient error retries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(global, 'fetch').mockImplementation(() => Promise.resolve(new Response()));
    vi.mocked(sleep).mockClear();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should retry on 503 Service Unavailable', async () => {
    const transientResponse = createMockResponse({
      status: 503,
      statusText: 'Service Unavailable',
    });
    const successResponse = createMockResponse({ ok: true });

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(transientResponse)
      .mockResolvedValueOnce(successResponse);
    global.fetch = mockFetch;

    const result = await fetchWithProxy('https://example.com');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toBe(successResponse);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(1000); // First retry: 2^0 * 1000 = 1000ms
  });

  it('should not retry on 502 without matching status text', async () => {
    const nonTransientResponse = createMockResponse({
      status: 502,
      statusText: 'Invalid API Key',
    });

    const mockFetch = vi.fn().mockResolvedValueOnce(nonTransientResponse);
    global.fetch = mockFetch;

    const result = await fetchWithProxy('https://example.com');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result).toBe(nonTransientResponse);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('should retry up to 3 times with exponential backoff', async () => {
    const transientResponse = createMockResponse({
      status: 503,
      statusText: 'Service Unavailable',
    });
    const successResponse = createMockResponse({ ok: true });

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(transientResponse)
      .mockResolvedValueOnce(transientResponse)
      .mockResolvedValueOnce(transientResponse)
      .mockResolvedValueOnce(successResponse);
    global.fetch = mockFetch;

    const result = await fetchWithProxy('https://example.com');

    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(result).toBe(successResponse);
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 1000); // 2^0 * 1000
    expect(sleep).toHaveBeenNthCalledWith(2, 2000); // 2^1 * 1000
    expect(sleep).toHaveBeenNthCalledWith(3, 4000); // 2^2 * 1000
  });

  it('should not retry when disableTransientRetries is true', async () => {
    const transientResponse = createMockResponse({
      status: 503,
      statusText: 'Service Unavailable',
    });

    const mockFetch = vi.fn().mockResolvedValueOnce(transientResponse);
    global.fetch = mockFetch;

    const result = await fetchWithProxy('https://example.com', {
      disableTransientRetries: true,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result).toBe(transientResponse);
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe('fetchWithRetries with disableTransientRetries', () => {
  beforeEach(() => {
    vi.mocked(sleep).mockClear();
    vi.spyOn(global, 'fetch').mockImplementation(() => Promise.resolve(new Response()));
    vi.clearAllMocks();
    // Ensure PROMPTFOO_RETRY_5XX is false so 503 responses don't throw
    vi.mocked(getEnvBool).mockImplementation((key: string, defaultValue: boolean = false) => {
      if (key === 'PROMPTFOO_RETRY_5XX') {
        return false;
      }
      return defaultValue;
    });
  });

  it('should disable transient retries in fetchWithProxy to avoid double-retrying', async () => {
    // This test verifies that fetchWithRetries passes disableTransientRetries: true
    // to prevent fetchWithProxy from also retrying transient errors
    const transientResponse = createMockResponse({
      status: 503,
      statusText: 'Service Unavailable',
    });

    const mockFetch = vi.fn().mockResolvedValue(transientResponse);
    global.fetch = mockFetch;

    // fetchWithRetries with 0 retries - should make exactly 1 attempt
    // If disableTransientRetries wasn't being passed, fetchWithProxy would retry 3 times
    const result = await fetchWithRetries('https://example.com', {}, 1000, 0);

    // With disableTransientRetries: true, fetchWithProxy shouldn't retry
    // So we should see exactly 1 fetch call
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result).toBe(transientResponse);
  });
});
