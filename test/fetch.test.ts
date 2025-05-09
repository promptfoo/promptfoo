import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { VERSION } from '../src/constants';
import { getEnvString } from '../src/envars';
import { fetchWithProxy, getProxyUrl, isRateLimited, shouldProxy } from '../src/fetch';
import logger from '../src/logger';

jest.mock('../src/util/time', () => ({
  sleep: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('undici', () => {
  const mockProxyAgentConstructor = jest.fn();
  const mockProxyAgentInstance = {
    options: null,
    addRequest: jest.fn(),
    destroy: jest.fn(),
  };

  mockProxyAgentConstructor.mockImplementation((options) => {
    mockProxyAgentInstance.options = options;
    return mockProxyAgentInstance;
  });

  const mockAgentConstructor = jest.fn();
  const mockAgentInstance = {
    addRequest: jest.fn(),
    destroy: jest.fn(),
  };

  mockAgentConstructor.mockImplementation(() => {
    return mockAgentInstance;
  });

  return {
    ProxyAgent: mockProxyAgentConstructor,
    Agent: mockAgentConstructor,
    setGlobalDispatcher: jest.fn(),
  };
});

jest.mock('../src/envars', () => ({
  getEnvString: jest.fn(),
  getEnvBool: jest.fn().mockImplementation((key: string, defaultValue: boolean = false) => {
    if (key === 'PROMPTFOO_INSECURE_SSL') {
      return process.env.PROMPTFOO_INSECURE_SSL === 'true' || false;
    }
    if (key === 'PROMPTFOO_RETRY_5XX') {
      return process.env.PROMPTFOO_RETRY_5XX === 'true' || false;
    }
    return defaultValue;
  }),
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
    jest.mocked(getEnvString).mockReset();
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

    jest.spyOn(Buffer, 'from').mockReturnValueOnce({
      toString: () => 'mock-auth-token',
    } as any);

    await fetchWithProxy(url, options);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/api',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Basic mock-auth-token',
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

  it('should handle URL objects', async () => {
    const url = new URL('https://example.com/api');
    await fetchWithProxy(url.toString());

    expect(global.fetch).toHaveBeenCalledWith(
      url.toString(),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-promptfoo-version': VERSION,
        }),
      }),
    );
  });

  it('should handle Request objects', async () => {
    const request = new Request('https://example.com/api');
    await fetchWithProxy(request);

    expect(global.fetch).toHaveBeenCalledWith(
      request,
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-promptfoo-version': VERSION,
        }),
      }),
    );
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

    jest.spyOn(Buffer, 'from').mockReturnValueOnce({
      toString: () => 'OnBhc3N3b3Jk',
    } as any);

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
});

describe('shouldProxy', () => {
  beforeEach(() => {
    jest.mocked(getEnvString).mockReset();
  });

  it('should return true when NO_PROXY is not set', () => {
    jest.mocked(getEnvString).mockReturnValue('');
    expect(shouldProxy('https://example.com')).toBe(true);
  });

  it('should return false for localhost URLs when in NO_PROXY', () => {
    jest.mocked(getEnvString).mockReturnValue('localhost,127.0.0.1,[::1]');
    expect(shouldProxy('http://localhost:3000')).toBe(false);
    expect(shouldProxy('http://127.0.0.1:3000')).toBe(false);
    expect(shouldProxy('http://[::1]:3000')).toBe(false);
  });

  it('should handle wildcard domain patterns', () => {
    jest.mocked(getEnvString).mockReturnValue('*.example.com,*.test.com');
    expect(shouldProxy('https://api.example.com')).toBe(false);
    expect(shouldProxy('https://sub.test.com')).toBe(false);
    expect(shouldProxy('https://other.com')).toBe(true);
  });

  it('should handle domain suffix patterns', () => {
    jest.mocked(getEnvString).mockReturnValue('.example.com,.test.com');
    expect(shouldProxy('https://sub.example.com')).toBe(false);
    expect(shouldProxy('https://sub.test.com')).toBe(false);
    expect(shouldProxy('https://example.com')).toBe(true);
  });

  it('should handle invalid URLs', () => {
    jest.mocked(getEnvString).mockReturnValue('*.example.com');
    expect(shouldProxy('invalid-url')).toBe(true);
  });
});

describe('getProxyUrl', () => {
  beforeEach(() => {
    jest.mocked(getEnvString).mockReset();
  });

  it('should return undefined when no proxy is configured', () => {
    jest.mocked(getEnvString).mockReturnValue('');
    expect(getProxyUrl()).toBeUndefined();
  });

  it('should prioritize HTTPS_PROXY over HTTP_PROXY', () => {
    jest.mocked(getEnvString).mockImplementation((key: string): string => {
      const envVars: Record<string, string> = {
        HTTPS_PROXY: 'https://secure-proxy.com',
        HTTP_PROXY: 'http://proxy.com',
      };
      return envVars[key] || '';
    });
    expect(getProxyUrl()).toBe('https://secure-proxy.com');
  });

  it('should respect NO_PROXY settings', () => {
    jest.mocked(getEnvString).mockImplementation((key: string): string => {
      const envVars: Record<string, string> = {
        HTTPS_PROXY: 'https://proxy.com',
        NO_PROXY: 'example.com',
      };
      return envVars[key] || '';
    });
    expect(getProxyUrl('https://example.com')).toBeUndefined();
    expect(getProxyUrl('https://other.com')).toBe('https://proxy.com');
  });
});

describe('isRateLimited', () => {
  it('should detect rate limiting from status code', () => {
    const response = new Response(null, {
      status: 429,
      headers: new Headers(),
    });
    expect(isRateLimited(response)).toBe(true);
  });

  it('should detect rate limiting from headers', () => {
    const response = new Response(null, {
      status: 200,
      headers: new Headers({
        'X-RateLimit-Remaining': '0',
      }),
    });
    expect(isRateLimited(response)).toBe(true);
  });

  it('should detect OpenAI specific rate limiting', () => {
    const response = new Response(null, {
      status: 200,
      headers: new Headers({
        'x-ratelimit-remaining-tokens': '0',
      }),
    });
    expect(isRateLimited(response)).toBe(true);
  });

  it('should return false when not rate limited', () => {
    const response = new Response(null, {
      status: 200,
      headers: new Headers({
        'X-RateLimit-Remaining': '100',
      }),
    });
    expect(isRateLimited(response)).toBe(false);
  });
});
