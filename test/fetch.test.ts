import fs from 'fs';
import { ProxyAgent } from 'proxy-agent';
import { VERSION } from '../src/constants';
import { getEnvString, getEnvBool } from '../src/envars';
import {
  fetchWithProxy,
  fetchWithRetries,
  fetchWithTimeout,
  handleRateLimit,
  isRateLimited,
} from '../src/fetch';
import logger from '../src/logger';
import { sleep } from '../src/util/time';
import { createMockResponse } from './util/utils';

// Mock modules
jest.mock('../src/util/time', () => ({
  sleep: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('proxy-agent', () => {
  return {
    ProxyAgent: jest.fn().mockImplementation((options) => ({
      options,
      // Add required agent methods
      addRequest: jest.fn(),
      destroy: jest.fn(),
    })),
  };
});

jest.mock('../src/logger');
jest.mock('../src/envars', () => ({
  getEnvString: jest.fn(),
  getEnvBool: jest.fn(),
  getEnvInt: jest.fn().mockReturnValue(100),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
}));

describe('fetchWithProxy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(global, 'fetch').mockImplementation();
    jest.mocked(ProxyAgent).mockClear();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // Original tests
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
          Authorization: 'Basic dXNlcm5hbWU6', // Base64 encoded 'username:'
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

  // New CA certificate tests
  it('should use custom CA certificate when PROMPTFOO_CA_CERT_PATH is set', async () => {
    const mockCertPath = '/path/to/cert.pem';
    const mockCertContent = 'mock-cert-content';

    jest.mocked(getEnvString).mockImplementation((key: string) => {
      if (key === 'PROMPTFOO_CA_CERT_PATH') {
        return mockCertPath;
      }
      return undefined;
    });
    jest.mocked(getEnvBool).mockImplementation((key: string) => {
      if (key === 'PROMPTFOO_INSECURE_SSL') {
        return false;
      }
      return undefined;
    });
    jest.mocked(fs.readFileSync).mockReturnValue(mockCertContent);

    const mockFetch = jest.fn().mockResolvedValue(new Response());
    global.fetch = mockFetch;

    await fetchWithProxy('https://example.com');

    expect(fs.readFileSync).toHaveBeenCalledWith(mockCertPath);
    expect(ProxyAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        ca: mockCertContent,
        rejectUnauthorized: true,
      }),
    );
  });

  it('should handle missing CA certificate file gracefully', async () => {
    const mockCertPath = '/path/to/nonexistent.pem';

    jest.mocked(getEnvString).mockImplementation((key: string) => {
      if (key === 'PROMPTFOO_CA_CERT_PATH') {
        return mockCertPath;
      }
      return undefined;
    });
    jest.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('File not found');
    });

    const mockFetch = jest.fn().mockResolvedValue(new Response());
    global.fetch = mockFetch;

    await fetchWithProxy('https://example.com');

    expect(fs.readFileSync).toHaveBeenCalledWith(mockCertPath);
    expect(ProxyAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        rejectUnauthorized: true,
      }),
    );
  });

  it('should disable SSL verification when PROMPTFOO_INSECURE_SSL is true', async () => {
    jest.mocked(getEnvString).mockReturnValue(undefined);
    jest.mocked(getEnvBool).mockImplementation((key: string) => {
      if (key === 'PROMPTFOO_INSECURE_SSL') {
        return true;
      }
      return undefined;
    });

    const mockFetch = jest.fn().mockResolvedValue(new Response());
    global.fetch = mockFetch;

    await fetchWithProxy('https://example.com');

    expect(ProxyAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        rejectUnauthorized: false,
      }),
    );
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
    expect(sleep).not.toHaveBeenCalled(); // Should not sleep when retries=0
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

    expect(global.fetch).toHaveBeenCalledTimes(3); // Initial attempt + 2 retries
    expect(sleep).toHaveBeenCalledTimes(2); // Should sleep between attempts, but not after last attempt
  });

  it('should not sleep after the final attempt', async () => {
    jest.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

    await expect(fetchWithRetries('https://example.com', {}, 1000, 1)).rejects.toThrow(
      'Request failed after 1 retries: Network error',
    );

    expect(global.fetch).toHaveBeenCalledTimes(2); // Initial attempt + 1 retry
    expect(sleep).toHaveBeenCalledTimes(1); // Should only sleep once between attempts
  });

  it('should handle 5XX errors when PROMPTFOO_RETRY_5XX is true', async () => {
    jest.mocked(getEnvBool).mockImplementation((key: string) => {
      if (key === 'PROMPTFOO_RETRY_5XX') return true;
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

    expect(mockFetch).toHaveBeenCalledTimes(3); // Initial attempt + 2 retries
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
