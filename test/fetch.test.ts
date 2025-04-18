import nock from 'nock';
import { fetchWithRetries, handleRateLimit, isRateLimited, sanitizeUrl } from '../src/fetch';
import { CLOUD_API_HOST, cloudConfig } from '../src/globalConfig/cloud';
import { sleep } from '../src/util/time';

jest.mock('../src/util/time', () => ({
  sleep: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/globalConfig/cloud', () => ({
  CLOUD_API_HOST: 'https://api.promptfoo.app',
  cloudConfig: {
    getApiKey: jest.fn(),
  },
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

describe('global fetch override', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    nock.cleanAll();
  });

  afterAll(() => {
    nock.restore();
  });

  it('should call original fetch for non-cloud requests', async () => {
    const url = 'https://example.com';
    const options = { headers: { 'Content-Type': 'application/json' } };

    nock('https://example.com').get('/').reply(200);

    await global.fetch(url, options);
    expect(nock.isDone()).toBe(true);
  });

  it('should add auth header for cloud API requests with string URL', async () => {
    const token = 'test-token';
    jest.mocked(cloudConfig.getApiKey).mockReturnValue(token);

    const url = `${CLOUD_API_HOST}/endpoint`;
    const options = { headers: { 'Content-Type': 'application/json' } };

    nock(CLOUD_API_HOST)
      .get('/endpoint')
      .matchHeader('Authorization', `Bearer ${token}`)
      .reply(200);

    await global.fetch(url, options);
    expect(nock.isDone()).toBe(true);
  });

  it('should add auth header for cloud API requests with URL object', async () => {
    const token = 'test-token';
    jest.mocked(cloudConfig.getApiKey).mockReturnValue(token);

    const url = new URL(`${CLOUD_API_HOST}/endpoint`);
    const options = { headers: { 'Content-Type': 'application/json' } };

    nock(CLOUD_API_HOST)
      .get('/endpoint')
      .matchHeader('Authorization', `Bearer ${token}`)
      .reply(200);

    await global.fetch(url, options);
    expect(nock.isDone()).toBe(true);
  });

  it('should not add auth header when no token exists', async () => {
    jest.mocked(cloudConfig.getApiKey).mockReturnValue(undefined);

    const url = `${CLOUD_API_HOST}/endpoint`;
    const options = { headers: { 'Content-Type': 'application/json' } };

    nock(CLOUD_API_HOST).get('/endpoint').reply(200);

    await global.fetch(url, options);
    expect(nock.isDone()).toBe(true);
  });

  it('should preserve existing headers for cloud API requests', async () => {
    const token = 'test-token';
    jest.mocked(cloudConfig.getApiKey).mockReturnValue(token);

    const url = `${CLOUD_API_HOST}/endpoint`;
    const options = {
      headers: {
        'Content-Type': 'application/json',
        'X-Custom-Header': 'custom-value',
      },
    };

    nock(CLOUD_API_HOST)
      .get('/endpoint')
      .matchHeader('Authorization', `Bearer ${token}`)
      .matchHeader('X-Custom-Header', 'custom-value')
      .reply(200);

    await global.fetch(url, options);
    expect(nock.isDone()).toBe(true);
  });

  it('should handle cloud API requests without options', async () => {
    const token = 'test-token';
    jest.mocked(cloudConfig.getApiKey).mockReturnValue(token);

    const url = `${CLOUD_API_HOST}/endpoint`;

    nock(CLOUD_API_HOST)
      .get('/endpoint')
      .matchHeader('Authorization', `Bearer ${token}`)
      .reply(200);

    await global.fetch(url);
    expect(nock.isDone()).toBe(true);
  });
});

describe('fetch utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sanitizeUrl', () => {
    it('should mask credentials in URL', () => {
      const url = 'https://user:pass@example.com/path';
      expect(sanitizeUrl(url)).toBe('https://***:***@example.com/path');
    });

    it('should return original URL if no credentials', () => {
      const url = 'https://example.com/path';
      expect(sanitizeUrl(url)).toBe(url);
    });

    it('should handle invalid URLs', () => {
      const url = 'invalid://url';
      expect(sanitizeUrl(url)).toBe(url);
    });
  });

  describe('isRateLimited', () => {
    it('should detect rate limiting from headers', () => {
      const headers = new Headers();
      headers.set('X-RateLimit-Remaining', '0');
      const response = new Response(null, { headers });
      expect(isRateLimited(response)).toBe(true);
    });

    it('should detect rate limiting from status code', () => {
      const response = new Response(null, { status: 429 });
      expect(isRateLimited(response)).toBe(true);
    });

    it('should detect OpenAI specific rate limits', () => {
      const headers = new Headers();
      headers.set('x-ratelimit-remaining-tokens', '0');
      const response = new Response(null, { headers });
      expect(isRateLimited(response)).toBe(true);
    });
  });

  describe('handleRateLimit', () => {
    it('should wait default time if no headers', async () => {
      const response = new Response(null);
      await handleRateLimit(response);
      expect(sleep).toHaveBeenCalledWith(60000);
    });

    it('should respect OpenAI reset headers', async () => {
      const headers = new Headers();
      headers.set('x-ratelimit-reset-tokens', '30');
      const response = new Response(null, { headers });
      await handleRateLimit(response);
      expect(sleep).toHaveBeenCalledWith(30000);
    });

    it('should respect standard rate limit headers', async () => {
      const futureTime = Math.floor(Date.now() / 1000) + 30;
      const headers = new Headers();
      headers.set('X-RateLimit-Reset', futureTime.toString());
      const response = new Response(null, { headers });
      await handleRateLimit(response);
      expect(sleep).toHaveBeenCalledWith(expect.any(Number));
    });
  });

  describe('fetchWithRetries', () => {
    it('should retry on rate limits', async () => {
      const rateLimitedResponse = new Response(null, { status: 429 });
      const successResponse = new Response(null, { status: 200 });

      jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(rateLimitedResponse)
        .mockResolvedValueOnce(successResponse);

      const result = await fetchWithRetries('https://example.com', {}, 1000);
      expect(result).toBe(successResponse);
    });

    it('should throw after max retries', async () => {
      const rateLimitedResponse = new Response(null, { status: 429 });

      jest.spyOn(global, 'fetch').mockResolvedValue(rateLimitedResponse);

      await expect(fetchWithRetries('https://example.com', {}, 1000, 2)).rejects.toThrow(
        /Request failed after 2 retries/,
      );
    });
  });
});
