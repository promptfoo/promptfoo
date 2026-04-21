// Authentication tests: RSA signatures, JKS keystores, OAuth token refresh, file-based auth, bearer/API key auth.
import './setup';

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import dedent from 'dedent';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { importModule } from '../../../src/esm';
import logger from '../../../src/logger';
import { HttpProvider } from '../../../src/providers/http';
import { runPython } from '../../../src/python/pythonUtils';
import { TOKEN_REFRESH_BUFFER_MS } from '../../../src/util/oauth';
import { createDeferred, mockProcessEnv } from '../../util/utils';

describe('RSA signature authentication', () => {
  let mockPrivateKey: string;
  let mockSign: MockInstance;
  let mockUpdate: MockInstance;
  let mockEnd: MockInstance;
  let actualReadFileSync: typeof fs.readFileSync;

  beforeEach(() => {
    mockPrivateKey = '-----BEGIN PRIVATE KEY-----\nMOCK_KEY\n-----END PRIVATE KEY-----';
    actualReadFileSync = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation(((path, options) => {
      if (path === '/path/to/key.pem') {
        return mockPrivateKey;
      }

      return actualReadFileSync(path as any, options as any);
    }) as typeof fs.readFileSync);

    mockUpdate = vi.fn();
    mockEnd = vi.fn();
    mockSign = vi.fn().mockReturnValue(Buffer.from('mocksignature'));

    const mockSignObject = {
      update: mockUpdate,
      end: mockEnd,
      sign: mockSign,
    };

    vi.spyOn(crypto, 'createSign').mockReturnValue(mockSignObject as any);
    vi.spyOn(Date, 'now').mockReturnValue(1000); // Mock timestamp
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should generate and include signature in vars', async () => {
    const provider = new HttpProvider('http://example.com', {
      config: {
        method: 'POST',
        body: { key: 'value' },
        signatureAuth: {
          privateKeyPath: '/path/to/key.pem',
          signatureValidityMs: 300000, // 5 minutes
        },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test');

    // Verify signature generation with specific data
    expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/key.pem', 'utf8');
    expect(crypto.createSign).toHaveBeenCalledWith('SHA256');
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockEnd).toHaveBeenCalledTimes(1);
    expect(mockSign).toHaveBeenCalledWith(mockPrivateKey);
  });

  it('should reuse cached signature when within validity period', async () => {
    const provider = new HttpProvider('http://example.com', {
      config: {
        method: 'POST',
        body: { key: 'value' },
        signatureAuth: {
          privateKeyPath: '/path/to/key.pem',
          signatureValidityMs: 300000,
        },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    // First call should generate signature
    await provider.callApi('test');
    expect(crypto.createSign).toHaveBeenCalledTimes(1);

    // Second call within validity period should reuse signature
    vi.spyOn(Date, 'now').mockReturnValue(2000); // Still within validity period
    await provider.callApi('test');
    expect(crypto.createSign).toHaveBeenCalledTimes(1); // Should not be called again
  });

  it('should regenerate signature when expired', async () => {
    const provider = new HttpProvider('http://example.com', {
      config: {
        method: 'POST',
        body: { key: 'value' },
        signatureAuth: {
          privateKeyPath: '/path/to/key.pem',
          signatureValidityMs: 300000,
        },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    // First call should generate signature
    await provider.callApi('test');
    expect(crypto.createSign).toHaveBeenCalledTimes(1);

    // Second call after validity period should regenerate signature
    vi.spyOn(Date, 'now').mockReturnValue(301000); // After validity period
    await provider.callApi('test');
    expect(crypto.createSign).toHaveBeenCalledTimes(2); // Should be called again
  });

  it('should use custom signature data template', async () => {
    const provider = new HttpProvider('http://example.com', {
      config: {
        method: 'POST',
        body: { key: 'value' },
        signatureAuth: {
          privateKeyPath: '/path/to/key.pem',
          signatureValidityMs: 300000,
          signatureDataTemplate: 'custom-{{signatureTimestamp}}',
        },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test');

    // Verify signature generation with custom template
    expect(crypto.createSign).toHaveBeenCalledWith('SHA256');
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith('custom-1000'); // Custom template
    expect(mockEnd).toHaveBeenCalledTimes(1);
    expect(mockSign).toHaveBeenCalledWith(mockPrivateKey);
  });

  it('should support using privateKey directly instead of privateKeyPath', async () => {
    const provider = new HttpProvider('http://example.com', {
      config: {
        method: 'POST',
        body: { key: 'value' },
        signatureAuth: {
          privateKey: mockPrivateKey,
          signatureValidityMs: 300000,
        },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test');

    // Verify signature generation using privateKey directly
    const privateKeyFileReads = vi
      .mocked(fs.readFileSync)
      .mock.calls.filter(([filePath]) => filePath === '/path/to/key.pem');
    expect(privateKeyFileReads).toHaveLength(0);
    expect(crypto.createSign).toHaveBeenCalledWith('SHA256');
    expect(mockSign).toHaveBeenCalledWith(mockPrivateKey);
  });

  it('should warn when vars already contain signatureTimestamp', async () => {
    const provider = new HttpProvider('http://example.com', {
      config: {
        method: 'POST',
        body: { key: 'value' },
        signatureAuth: {
          privateKey: mockPrivateKey,
          signatureValidityMs: 300000,
        },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const mockWarn = vi.spyOn(logger, 'warn');
    const timestampWarning =
      '[HTTP Provider Auth]: `signatureTimestamp` is already defined in vars and will be overwritten';

    try {
      await provider.callApi('test', {
        prompt: { raw: 'test', label: 'test' },
        vars: {
          signatureTimestamp: 'existing-timestamp',
        },
      });

      expect(mockWarn).toHaveBeenCalledWith(timestampWarning);
    } finally {
      mockWarn.mockRestore();
    }
  });

  it('should use JKS keystore password from environment variable when config password not provided', async () => {
    // Get the mocked JKS module
    const jksMock = vi.mocked(await import('jks-js'));
    jksMock.toPem.mockReturnValue({
      client: {
        key: mockPrivateKey,
      },
    });

    // Mock fs.readFileSync to return mock keystore data
    const readFileSyncSpy = vi
      .spyOn(fs, 'readFileSync')
      .mockReturnValue(Buffer.from('mock-keystore-data'));

    const restoreEnv = mockProcessEnv({
      PROMPTFOO_JKS_PASSWORD: 'env-password',
    });

    try {
      const provider = new HttpProvider('http://example.com', {
        config: {
          method: 'POST',
          body: { key: 'value' },
          signatureAuth: {
            type: 'jks',
            keystorePath: '/path/to/keystore.jks',
            // keystorePassword not provided - should use env var
            keyAlias: 'client',
          },
        },
      });

      const mockResponse = {
        data: JSON.stringify({ result: 'success' }),
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      await provider.callApi('test');

      // Verify JKS module was called with environment variable password
      expect(jksMock.toPem).toHaveBeenCalledWith(expect.anything(), 'env-password');
    } finally {
      restoreEnv();

      // Clean up
      readFileSyncSpy.mockRestore();
    }
  });

  it('should prioritize config keystorePassword over environment variable', async () => {
    // Get the mocked JKS module
    const jksMock = vi.mocked(await import('jks-js'));
    jksMock.toPem.mockReturnValue({
      client: {
        key: mockPrivateKey,
      },
    });

    // Mock fs.readFileSync to return mock keystore data
    const readFileSyncSpy = vi
      .spyOn(fs, 'readFileSync')
      .mockReturnValue(Buffer.from('mock-keystore-data'));

    const restoreEnv = mockProcessEnv({
      PROMPTFOO_JKS_PASSWORD: 'env-password',
    });

    try {
      const provider = new HttpProvider('http://example.com', {
        config: {
          method: 'POST',
          body: { key: 'value' },
          signatureAuth: {
            type: 'jks',
            keystorePath: '/path/to/keystore.jks',
            keystorePassword: 'config-password', // This should take precedence
            keyAlias: 'client',
          },
        },
      });

      const mockResponse = {
        data: JSON.stringify({ result: 'success' }),
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      await provider.callApi('test');

      // Verify JKS module was called with config password, not env var
      expect(jksMock.toPem).toHaveBeenCalledWith(expect.any(Buffer), 'config-password');
    } finally {
      restoreEnv();

      // Clean up
      readFileSyncSpy.mockRestore();
    }
  });

  it('should throw error when neither config password nor environment variable is provided for JKS', async () => {
    // Get the mocked JKS module
    const jksMock = vi.mocked(await import('jks-js'));
    jksMock.toPem.mockImplementation(function () {
      throw new Error('Should not be called');
    });

    // Mock fs.readFileSync to return mock keystore data
    const readFileSyncSpy = vi
      .spyOn(fs, 'readFileSync')
      .mockReturnValue(Buffer.from('mock-keystore-data'));

    const provider = new HttpProvider('http://example.com', {
      config: {
        method: 'POST',
        body: { key: 'value' },
        signatureAuth: {
          type: 'jks',
          keystorePath: '/path/to/keystore.jks',
          // keystorePassword not provided and env var is empty
          keyAlias: 'client',
        },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const restoreEnv = mockProcessEnv({
      PROMPTFOO_JKS_PASSWORD: undefined,
    });
    try {
      expect(process.env.PROMPTFOO_JKS_PASSWORD).toBeUndefined();
      await expect(provider.callApi('test')).rejects.toThrow(
        'JKS keystore password is required. Provide it via config keystorePassword/certificatePassword or PROMPTFOO_JKS_PASSWORD environment variable',
      );
    } finally {
      restoreEnv();

      // Clean up
      readFileSyncSpy.mockRestore();
    }
  });
});

describe('HttpProvider - OAuth Token Refresh Deduplication', () => {
  const mockUrl = 'http://example.com/api';
  const tokenUrl = 'https://auth.example.com/oauth/token';
  let tokenRefreshCallCount: number;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchWithCache).mockReset();
    tokenRefreshCallCount = 0;
  });

  it('should deduplicate concurrent token refresh requests', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer {{token}}',
        },
        body: { key: '{{ prompt }}' },
        auth: {
          type: 'oauth',
          grantType: 'client_credentials',
          tokenUrl,
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
        },
      },
    });

    // Mock token refresh response (delayed to simulate network latency)
    const tokenResponse = {
      data: JSON.stringify({
        access_token: 'new-access-token-123',
        expires_in: 3600,
      }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };

    // Mock API response
    const apiResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };

    // Track token refresh calls
    vi.mocked(fetchWithCache).mockImplementation(async (url: RequestInfo) => {
      const urlString =
        typeof url === 'string' ? url : url instanceof Request ? url.url : String(url);
      if (urlString === tokenUrl) {
        tokenRefreshCallCount++;
        // Simulate network delay
        await new Promise((resolve) => setTimeout(resolve, 50));
        return tokenResponse;
      }
      return apiResponse;
    });

    // Make 5 concurrent API calls
    const promises = Array.from({ length: 5 }, () => provider.callApi('test prompt'));

    await Promise.all(promises);

    // Should only make 1 token refresh request despite 5 concurrent calls
    expect(tokenRefreshCallCount).toBe(1);

    // Verify token refresh was called exactly once
    const tokenRefreshCalls = vi
      .mocked(fetchWithCache)
      .mock.calls.filter((call) => call[0] === tokenUrl);
    expect(tokenRefreshCalls).toHaveLength(1);
  });

  it('should use the same token for all concurrent API calls', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: '{{ prompt }}' },
        auth: {
          type: 'oauth',
          grantType: 'client_credentials',
          tokenUrl,
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
        },
      },
    });

    const expectedToken = 'shared-token-456';
    const tokenResponse = {
      data: JSON.stringify({
        access_token: expectedToken,
        expires_in: 3600,
      }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };

    const apiResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };

    vi.mocked(fetchWithCache).mockImplementation(async (url: RequestInfo) => {
      const urlString =
        typeof url === 'string' ? url : url instanceof Request ? url.url : String(url);
      if (urlString === tokenUrl) {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return tokenResponse;
      }
      return apiResponse;
    });

    // Make 3 concurrent API calls
    await Promise.all([
      provider.callApi('test 1'),
      provider.callApi('test 2'),
      provider.callApi('test 3'),
    ]);

    // Verify all API calls used the same token
    const apiCalls = vi.mocked(fetchWithCache).mock.calls.filter((call) => call[0] === mockUrl);
    expect(apiCalls.length).toBeGreaterThan(0);

    apiCalls.forEach((call) => {
      const headers = call[1]?.headers as Record<string, string> | undefined;
      expect(headers?.authorization).toBe(`Bearer ${expectedToken}`);
    });
  });

  it('should retry token refresh if the in-progress refresh fails', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: '{{ prompt }}' },
        auth: {
          type: 'oauth',
          grantType: 'client_credentials',
          tokenUrl,
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
        },
      },
    });

    const failingTokenResponse = {
      data: JSON.stringify({ error: 'invalid_client' }),
      status: 401,
      statusText: 'Unauthorized',
      cached: false,
    };

    const successTokenResponse = {
      data: JSON.stringify({
        access_token: 'retry-success-token',
        expires_in: 3600,
      }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };

    const apiResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };

    const firstRefreshStarted = createDeferred<void>();
    const firstRefreshContinue = createDeferred<void>();
    let callCount = 0;
    vi.mocked(fetchWithCache).mockImplementation(async (url: RequestInfo) => {
      const urlString =
        typeof url === 'string' ? url : url instanceof Request ? url.url : String(url);
      if (urlString === tokenUrl) {
        callCount++;
        if (callCount === 1) {
          // First call fails
          firstRefreshStarted.resolve(undefined);
          await firstRefreshContinue.promise;
          return failingTokenResponse;
        }
        // Second call succeeds
        return successTokenResponse;
      }
      return apiResponse;
    });

    // First call will fail, but subsequent calls should retry
    const promise1 = provider.callApi('test 1').catch((err: Error) => {
      expect(err.message).toMatch(/token|auth|refresh|401|fetch/i);
    });
    await firstRefreshStarted.promise;
    // Second call should trigger a retry
    const promise2 = provider.callApi('test 2');
    firstRefreshContinue.resolve(undefined);

    const response2 = await promise2;
    expect(response2.error).toBeUndefined();
    await promise1;

    // Should have attempted token refresh twice (initial + retry)
    const tokenRefreshCalls = vi
      .mocked(fetchWithCache)
      .mock.calls.filter((call) => call[0] === tokenUrl);
    expect(tokenRefreshCalls).toHaveLength(2);

    const apiCalls = vi.mocked(fetchWithCache).mock.calls.filter((call) => call[0] === mockUrl);
    expect(apiCalls).toHaveLength(1);
    const headers = apiCalls[0][1]?.headers as Record<string, string> | undefined;
    expect(headers?.authorization).toBe('Bearer retry-success-token');
  });

  it('should deduplicate retries when multiple callers observe a failed in-progress refresh', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: '{{ prompt }}' },
        auth: {
          type: 'oauth',
          grantType: 'client_credentials',
          tokenUrl,
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
        },
      },
    });

    const failingTokenResponse = {
      data: JSON.stringify({ error: 'invalid_client' }),
      status: 401,
      statusText: 'Unauthorized',
      cached: false,
    };

    const successTokenResponse = {
      data: JSON.stringify({
        access_token: 'retry-success-token',
        expires_in: 3600,
      }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };

    const apiResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };

    const firstRefreshStarted = createDeferred<void>();
    const firstRefreshContinue = createDeferred<void>();
    const secondRefreshStarted = createDeferred<void>();
    const secondRefreshContinue = createDeferred<void>();

    let callCount = 0;
    vi.mocked(fetchWithCache).mockImplementation(async (url: RequestInfo) => {
      const urlString =
        typeof url === 'string' ? url : url instanceof Request ? url.url : String(url);
      if (urlString === tokenUrl) {
        callCount++;
        if (callCount === 1) {
          firstRefreshStarted.resolve(undefined);
          await firstRefreshContinue.promise;
          return failingTokenResponse;
        }
        secondRefreshStarted.resolve(undefined);
        await secondRefreshContinue.promise;
        return successTokenResponse;
      }
      return apiResponse;
    });

    const promise1 = provider.callApi('test 1').catch((err: Error) => {
      expect(err.message).toMatch(/token|auth|refresh|401|fetch/i);
    });
    await firstRefreshStarted.promise;
    const promise2 = provider.callApi('test 2');
    const promise3 = provider.callApi('test 3');

    firstRefreshContinue.resolve(undefined);
    await secondRefreshStarted.promise;
    secondRefreshContinue.resolve(undefined);

    const [response2, response3] = await Promise.all([promise2, promise3]);
    expect(response2.error).toBeUndefined();
    expect(response3.error).toBeUndefined();
    await promise1;

    const tokenRefreshCalls = vi
      .mocked(fetchWithCache)
      .mock.calls.filter((call) => call[0] === tokenUrl);
    expect(tokenRefreshCalls).toHaveLength(2);

    const apiCalls = vi.mocked(fetchWithCache).mock.calls.filter((call) => call[0] === mockUrl);
    expect(apiCalls).toHaveLength(2);
    for (const apiCall of apiCalls) {
      const headers = apiCall[1]?.headers as Record<string, string> | undefined;
      expect(headers?.authorization).toBe('Bearer retry-success-token');
    }
  });

  it('should use cached token if refresh is already in progress', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: '{{ prompt }}' },
        auth: {
          type: 'oauth',
          grantType: 'client_credentials',
          tokenUrl,
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
        },
      },
    });

    const tokenResponse = {
      data: JSON.stringify({
        access_token: 'cached-token-789',
        expires_in: 3600,
      }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };

    const apiResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };

    let tokenRefreshResolve: (value: any) => void;
    const tokenRefreshPromise = new Promise((resolve) => {
      tokenRefreshResolve = resolve;
    });

    vi.mocked(fetchWithCache).mockImplementation(async (url: RequestInfo) => {
      const urlString =
        typeof url === 'string' ? url : url instanceof Request ? url.url : String(url);
      if (urlString === tokenUrl) {
        await tokenRefreshPromise;
        return tokenResponse;
      }
      return apiResponse;
    });

    // Start first call (will trigger token refresh)
    const promise1 = provider.callApi('test 1');
    // Wait a bit to ensure token refresh has started
    await new Promise((resolve) => setTimeout(resolve, 10));
    // Start second call (should wait for first refresh)
    const promise2 = provider.callApi('test 2');

    // Resolve token refresh
    tokenRefreshResolve!(tokenResponse);

    await Promise.all([promise1, promise2]);

    // Should only have one token refresh call
    const tokenRefreshCalls = vi
      .mocked(fetchWithCache)
      .mock.calls.filter((call) => call[0] === tokenUrl);
    expect(tokenRefreshCalls).toHaveLength(1);
  });

  it('should include the refreshed token in API request headers', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: '{{ prompt }}' },
        auth: {
          type: 'oauth',
          grantType: 'client_credentials',
          tokenUrl,
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
        },
      },
    });

    const expectedToken = 'final-token-abc';
    const tokenResponse = {
      data: JSON.stringify({
        access_token: expectedToken,
        expires_in: 3600,
      }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };

    const apiResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };

    vi.mocked(fetchWithCache).mockImplementation(async (url: RequestInfo) => {
      const urlString =
        typeof url === 'string' ? url : url instanceof Request ? url.url : String(url);
      if (urlString === tokenUrl) {
        return tokenResponse;
      }
      return apiResponse;
    });

    await provider.callApi('test prompt');

    // Find the API call (not the token refresh call)
    const apiCall = vi.mocked(fetchWithCache).mock.calls.find((call) => call[0] === mockUrl);
    expect(apiCall).toBeDefined();

    const headers = apiCall![1]?.headers as Record<string, string> | undefined;
    expect(headers?.authorization).toBe(`Bearer ${expectedToken}`);
  });

  it('should expose the refreshed token as vars.token for header templating', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': '{{ token }}',
        },
        body: { key: '{{ prompt }}' },
        auth: {
          type: 'oauth',
          grantType: 'client_credentials',
          tokenUrl,
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
        },
      },
    });

    const expectedToken = 'templated-header-token';
    const tokenResponse = {
      data: JSON.stringify({
        access_token: expectedToken,
        expires_in: 3600,
      }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };

    const apiResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };

    vi.mocked(fetchWithCache).mockImplementation(async (url: RequestInfo) => {
      const urlString =
        typeof url === 'string' ? url : url instanceof Request ? url.url : String(url);
      return urlString === tokenUrl ? tokenResponse : apiResponse;
    });

    await provider.callApi('test prompt');

    const apiCall = vi.mocked(fetchWithCache).mock.calls.find((call) => call[0] === mockUrl);
    expect(apiCall).toBeDefined();

    const headers = apiCall![1]?.headers as Record<string, string> | undefined;
    expect(headers?.authorization).toBe(`Bearer ${expectedToken}`);
    expect(headers?.['x-auth-token']).toBe(expectedToken);
  });

  it('should expose the refreshed token as vars.token for body templating', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          key: '{{ prompt }}',
          token: '{{ token }}',
        },
        auth: {
          type: 'oauth',
          grantType: 'client_credentials',
          tokenUrl,
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
        },
      },
    });

    const expectedToken = 'templated-body-token';
    const tokenResponse = {
      data: JSON.stringify({
        access_token: expectedToken,
        expires_in: 3600,
      }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };

    const apiResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };

    vi.mocked(fetchWithCache).mockImplementation(async (url: RequestInfo) => {
      const urlString =
        typeof url === 'string' ? url : url instanceof Request ? url.url : String(url);
      return urlString === tokenUrl ? tokenResponse : apiResponse;
    });

    await provider.callApi('test prompt');

    const apiCall = vi.mocked(fetchWithCache).mock.calls.find((call) => call[0] === mockUrl);
    expect(apiCall).toBeDefined();

    expect(apiCall![1]?.body).toBe(
      JSON.stringify({
        key: 'test prompt',
        token: expectedToken,
      }),
    );
  });

  it('should handle password grant type with deduplication', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: '{{ prompt }}' },
        auth: {
          type: 'oauth',
          grantType: 'password',
          tokenUrl,
          username: 'test-user',
          password: 'test-password',
        },
      },
    });

    const tokenResponse = {
      data: JSON.stringify({
        access_token: 'password-grant-token',
        expires_in: 3600,
      }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };

    const apiResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };

    let refreshCallCount = 0;
    vi.mocked(fetchWithCache).mockImplementation(async (url: RequestInfo) => {
      const urlString =
        typeof url === 'string' ? url : url instanceof Request ? url.url : String(url);
      if (urlString === tokenUrl) {
        refreshCallCount++;
        await new Promise((resolve) => setTimeout(resolve, 30));
        return tokenResponse;
      }
      return apiResponse;
    });

    // Make concurrent calls with password grant
    await Promise.all([
      provider.callApi('test 1'),
      provider.callApi('test 2'),
      provider.callApi('test 3'),
    ]);

    // Should only refresh once
    expect(refreshCallCount).toBe(1);
  });
});

describe('HttpProvider - File Auth', () => {
  const mockUrl = 'http://example.com/api';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should deduplicate retries when multiple callers observe a failed in-progress file auth refresh', async () => {
    const firstRefreshStarted = createDeferred<void>();
    const firstRefreshContinue = createDeferred<void>();
    const secondRefreshStarted = createDeferred<void>();
    const secondRefreshContinue = createDeferred<void>();

    const authFn = vi
      .fn()
      .mockImplementationOnce(async () => {
        firstRefreshStarted.resolve(undefined);
        await firstRefreshContinue.promise;
        throw new Error('file auth failed');
      })
      .mockImplementationOnce(async () => {
        secondRefreshStarted.resolve(undefined);
        await secondRefreshContinue.promise;
        return {
          token: 'retry-file-token',
          expiration: Date.now() + 3_600_000,
        };
      });
    vi.mocked(importModule).mockResolvedValue(authFn);

    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer {{token}}',
        },
        body: { key: '{{ prompt }}' },
        auth: {
          type: 'file',
          path: 'file://auth.js',
        },
      },
    });

    const promise1 = provider.callApi('test 1').catch((err: Error) => {
      expect(err.message).toMatch(/token|auth|refresh|401|fetch/i);
    });
    await firstRefreshStarted.promise;
    const promise2 = provider.callApi('test 2');
    const promise3 = provider.callApi('test 3');

    firstRefreshContinue.resolve(undefined);
    await secondRefreshStarted.promise;
    secondRefreshContinue.resolve(undefined);

    const [response2, response3] = await Promise.all([promise2, promise3]);
    expect(response2.error).toBeUndefined();
    expect(response3.error).toBeUndefined();
    await promise1;

    expect(authFn).toHaveBeenCalledTimes(2);

    const apiCalls = vi.mocked(fetchWithCache).mock.calls.filter((call) => call[0] === mockUrl);
    expect(apiCalls).toHaveLength(2);
    for (const apiCall of apiCalls) {
      const headers = apiCall[1]?.headers as Record<string, string> | undefined;
      expect(headers?.authorization).toBe('Bearer retry-file-token');
    }
  });

  it('should parse auth.type file in the provider config schema', () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'GET',
        auth: {
          type: 'file',
          path: './auth/get-token.js',
        },
      },
    });

    expect(provider.config.auth).toEqual({
      type: 'file',
      path: './auth/get-token.js',
    });
  });

  it('should inject a file auth token into templated headers, query params, and body', async () => {
    const authFn = vi.fn().mockResolvedValue({
      token: 'file-token-123',
      expiration: Date.now() + 60_000,
    });
    vi.mocked(importModule).mockImplementation(
      async (_modulePath: string, functionName?: string) => {
        if (functionName) {
          return authFn;
        }
        return { default: authFn };
      },
    );

    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer {{token}}',
          'X-Token-Expiry': '{{expiration}}',
        },
        queryParams: {
          access_token: '{{token}}',
        },
        body: {
          prompt: '{{prompt}}',
          token: '{{token}}',
        },
        auth: {
          type: 'file',
          path: './auth/get-token.js',
        },
      },
    });

    await provider.callApi('test prompt', {
      prompt: { raw: 'test prompt', label: 'test prompt' },
      vars: {},
    });

    expect(authFn).toHaveBeenCalledWith(
      expect.objectContaining({
        vars: expect.objectContaining({
          prompt: 'test prompt',
        }),
      }),
    );
    expect(fetchWithCache).toHaveBeenCalledWith(
      `${mockUrl}?access_token=file-token-123`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer file-token-123',
          'x-token-expiry': expect.any(String),
        }),
        body: JSON.stringify({
          prompt: 'test prompt',
          token: 'file-token-123',
        }),
      }),
      expect.any(Number),
      'text',
      undefined,
      undefined,
    );
  });

  it('should support named TypeScript exports via file:// references', async () => {
    const authFn = vi.fn().mockResolvedValue({
      token: 'named-export-token',
    });
    vi.mocked(importModule).mockImplementation(
      async (_modulePath: string, functionName?: string) => {
        if (functionName === 'buildAuth') {
          return authFn;
        }
        return { default: authFn };
      },
    );

    const provider = new HttpProvider(mockUrl, {
      config: {
        request: dedent`
          POST /chat HTTP/1.1
          Host: example.com
          Authorization: Bearer {{token}}
          Content-Type: application/json

          {"token":"{{token}}","prompt":"{{prompt}}"}
        `,
        auth: {
          type: 'file',
          path: 'file://./auth/get-token.ts:buildAuth',
        },
      },
    });

    await provider.callApi('raw prompt', {
      prompt: { raw: 'raw prompt', label: 'raw prompt' },
      vars: {},
    });

    const rawRequestCall = vi
      .mocked(fetchWithCache)
      .mock.calls.find((call) => String(call[0]) === 'http://example.com/chat');
    expect(rawRequestCall).toBeDefined();
    expect(rawRequestCall?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer named-export-token',
          'content-type': 'application/json',
          host: 'example.com',
        }),
        body: '{"token":"named-export-token","prompt":"raw prompt"}',
      }),
    );
  });

  it('should load Python auth files using get_auth by default', async () => {
    vi.mocked(runPython).mockResolvedValue({
      token: 'python-token',
    });

    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'GET',
        headers: {
          Authorization: 'Bearer {{token}}',
        },
        auth: {
          type: 'file',
          path: './auth/get-token.py',
        },
      },
    });

    await provider.callApi('test prompt', {
      prompt: { raw: 'test prompt', label: 'test prompt' },
      vars: {},
    });

    expect(runPython).toHaveBeenCalledWith(
      path.resolve('/mock/base/path', './auth/get-token.py'),
      'get_auth',
      [
        expect.objectContaining({
          vars: expect.objectContaining({
            prompt: 'test prompt',
          }),
        }),
      ],
    );
    expect(fetchWithCache).toHaveBeenCalledWith(
      mockUrl,
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer python-token',
        }),
        method: 'GET',
      }),
      expect.any(Number),
      'text',
      undefined,
      undefined,
    );
  });

  it('should reuse a non-expiring file auth token across requests', async () => {
    const authFn = vi.fn().mockResolvedValue({
      token: 'never-expire-token',
    });
    vi.mocked(importModule).mockImplementation(async () => ({ default: authFn }));

    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'GET',
        headers: {
          Authorization: 'Bearer {{token}}',
        },
        auth: {
          type: 'file',
          path: './auth/get-token.js',
        },
      },
    });

    await provider.callApi('first prompt', {
      prompt: { raw: 'first prompt', label: 'first prompt' },
      vars: {},
    });
    await provider.callApi('second prompt', {
      prompt: { raw: 'second prompt', label: 'second prompt' },
      vars: {},
    });

    expect(authFn).toHaveBeenCalledTimes(1);
  });

  it('should refresh a file auth token when it is within the oauth refresh buffer', async () => {
    const authFn = vi
      .fn()
      .mockResolvedValueOnce({
        token: 'stale-token',
        expiration: Date.now() + TOKEN_REFRESH_BUFFER_MS - 1,
      })
      .mockResolvedValueOnce({
        token: 'fresh-token',
        expiration: Date.now() + TOKEN_REFRESH_BUFFER_MS + 60_000,
      });
    vi.mocked(importModule).mockImplementation(async () => ({ default: authFn }));

    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'GET',
        headers: {
          Authorization: 'Bearer {{token}}',
        },
        auth: {
          type: 'file',
          path: './auth/get-token.js',
        },
      },
    });

    await provider.callApi('first prompt', {
      prompt: { raw: 'first prompt', label: 'first prompt' },
      vars: {},
    });
    await provider.callApi('second prompt', {
      prompt: { raw: 'second prompt', label: 'second prompt' },
      vars: {},
    });

    expect(authFn).toHaveBeenCalledTimes(2);
    const secondApiCall = vi.mocked(fetchWithCache).mock.calls[1];
    expect(secondApiCall?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer fresh-token',
        }),
      }),
    );
  });

  it('should deduplicate concurrent file auth refreshes', async () => {
    const authFn = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {
        token: 'shared-file-token',
        expiration: Date.now() + TOKEN_REFRESH_BUFFER_MS + 60_000,
      };
    });
    vi.mocked(importModule).mockImplementation(async () => ({ default: authFn }));

    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'GET',
        headers: {
          Authorization: 'Bearer {{token}}',
        },
        auth: {
          type: 'file',
          path: './auth/get-token.js',
        },
      },
    });

    const requests = Promise.all([
      provider.callApi('test 1', {
        prompt: { raw: 'test 1', label: 'test 1' },
        vars: {},
      }),
      provider.callApi('test 2', {
        prompt: { raw: 'test 2', label: 'test 2' },
        vars: {},
      }),
      provider.callApi('test 3', {
        prompt: { raw: 'test 3', label: 'test 3' },
        vars: {},
      }),
    ]);
    await vi.advanceTimersByTimeAsync(50);
    await requests;

    expect(authFn).toHaveBeenCalledTimes(1);
    for (const call of vi.mocked(fetchWithCache).mock.calls) {
      expect(call[1]).toEqual(
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: 'Bearer shared-file-token',
          }),
        }),
      );
    }
  });

  it('should make file auth values available to transformRequest before the request is rendered', async () => {
    const authFn = vi.fn().mockResolvedValue({
      token: 'transform-token',
    });
    const transformRequest = vi.fn((_prompt: string, vars: Record<string, any>) => ({
      transformedToken: vars.token,
      transformedExpiration: vars.expiration,
    }));
    vi.mocked(importModule).mockImplementation(async () => ({ default: authFn }));

    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {},
        transformRequest,
        auth: {
          type: 'file',
          path: './auth/get-token.js',
        },
      },
    });

    await provider.callApi('test prompt', {
      prompt: { raw: 'test prompt', label: 'test prompt' },
      vars: {},
    });

    expect(transformRequest).toHaveBeenCalledWith(
      'test prompt',
      expect.objectContaining({
        token: 'transform-token',
        expiration: undefined,
      }),
      expect.anything(),
    );
    expect(fetchWithCache).toHaveBeenCalledWith(
      mockUrl,
      expect.objectContaining({
        body: JSON.stringify({
          transformedToken: 'transform-token',
          transformedExpiration: undefined,
        }),
      }),
      expect.any(Number),
      'text',
      undefined,
      undefined,
    );
  });

  it('should make file auth values available when rendering the session endpoint config', async () => {
    const authFn = vi.fn().mockResolvedValue({
      token: 'session-token',
      expiration: 1234567890,
    });
    vi.mocked(importModule).mockImplementation(async () => ({ default: authFn }));

    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          prompt: '{{prompt}}',
          session: '{{sessionId}}',
        },
        session: {
          url: 'http://example.com/session',
          method: 'POST',
          headers: {
            Authorization: 'Bearer {{token}}',
            'X-Token-Expiration': '{{expiration}}',
          },
          body: {
            token: '{{token}}',
          },
          responseParser: 'data.body.sessionId',
        },
        auth: {
          type: 'file',
          path: './auth/get-token.js',
        },
      },
    });

    vi.mocked(fetchWithCache)
      .mockResolvedValueOnce({
        data: JSON.stringify({ sessionId: 'session-123' }),
        status: 200,
        statusText: 'OK',
        cached: false,
        headers: {},
      })
      .mockResolvedValueOnce({
        data: JSON.stringify({ result: 'success' }),
        status: 200,
        statusText: 'OK',
        cached: false,
        headers: {},
      });

    await provider.callApi('test prompt', {
      prompt: { raw: 'test prompt', label: 'test prompt' },
      vars: {},
    });

    const sessionCall = vi.mocked(fetchWithCache).mock.calls[0];
    expect(sessionCall?.[0]).toBe('http://example.com/session');
    expect(sessionCall?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer session-token',
          'x-token-expiration': '1234567890',
        }),
        body: JSON.stringify({
          token: 'session-token',
        }),
      }),
    );

    const mainCall = vi.mocked(fetchWithCache).mock.calls[1];
    expect(mainCall?.[1]).toEqual(
      expect.objectContaining({
        body: JSON.stringify({
          prompt: 'test prompt',
          session: 'session-123',
        }),
      }),
    );
  });

  it('should warn when file auth overwrites token vars', async () => {
    const authFn = vi.fn().mockResolvedValue({
      token: 'replacement-token',
      expiration: 123456,
    });
    vi.mocked(importModule).mockImplementation(async () => ({ default: authFn }));
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'GET',
        headers: {
          Authorization: 'Bearer {{token}}',
        },
        auth: {
          type: 'file',
          path: './auth/get-token.js',
        },
      },
    });

    await provider.callApi('test prompt', {
      prompt: { raw: 'test prompt', label: 'test prompt' },
      vars: {
        token: 'existing-token',
        expiration: 1,
      },
    });

    expect(warnSpy).toHaveBeenCalledWith(
      '[HTTP Provider Auth]: `token` is already defined in vars and will be overwritten',
    );
    expect(warnSpy).toHaveBeenCalledWith(
      '[HTTP Provider Auth]: `expiration` is already defined in vars and will be overwritten',
    );
  });

  it.each([
    { label: 'null', result: null },
    { label: 'string', result: 'token' },
    { label: 'missing token', result: { expiration: 123 } },
    { label: 'empty token', result: { token: '' } },
    { label: 'invalid expiration', result: { token: 'abc', expiration: 'soon' } },
  ])('should reject invalid file auth return values: $label', async ({ result }) => {
    const authFn = vi.fn().mockResolvedValue(result);
    vi.mocked(importModule).mockImplementation(async () => ({ default: authFn }));

    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'GET',
        headers: {
          Authorization: 'Bearer {{token}}',
        },
        auth: {
          type: 'file',
          path: './auth/get-token.js',
        },
      },
    });

    await expect(
      provider.callApi('test prompt', {
        prompt: { raw: 'test prompt', label: 'test prompt' },
        vars: {},
      }),
    ).rejects.toThrow('Failed to refresh file auth token');
  });

  it('should surface thrown errors from the auth file', async () => {
    const authFn = vi.fn().mockRejectedValue(new Error('boom'));
    vi.mocked(importModule).mockImplementation(async () => ({ default: authFn }));

    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'GET',
        headers: {
          Authorization: 'Bearer {{token}}',
        },
        auth: {
          type: 'file',
          path: './auth/get-token.js',
        },
      },
    });

    await expect(
      provider.callApi('test prompt', {
        prompt: { raw: 'test prompt', label: 'test prompt' },
        vars: {},
      }),
    ).rejects.toThrow('Failed to refresh file auth token: Error: boom');
  });

  it('should surface missing JavaScript exports clearly', async () => {
    vi.mocked(importModule).mockImplementation(async () => ({
      default: {
        notAFunction: true,
      },
    }));

    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'GET',
        headers: {
          Authorization: 'Bearer {{token}}',
        },
        auth: {
          type: 'file',
          path: './auth/get-token.js',
        },
      },
    });

    await expect(
      provider.callApi('test prompt', {
        prompt: { raw: 'test prompt', label: 'test prompt' },
        vars: {},
      }),
    ).rejects.toThrow('JavaScript file must export a function');
  });

  it('should surface missing files clearly', async () => {
    vi.mocked(importModule).mockRejectedValue(new Error('ENOENT: no such file or directory'));

    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'GET',
        headers: {
          Authorization: 'Bearer {{token}}',
        },
        auth: {
          type: 'file',
          path: './auth/missing.js',
        },
      },
    });

    await expect(
      provider.callApi('test prompt', {
        prompt: { raw: 'test prompt', label: 'test prompt' },
        vars: {},
      }),
    ).rejects.toThrow('ENOENT: no such file or directory');
  });

  it('should surface missing Python function names clearly', async () => {
    vi.mocked(runPython).mockRejectedValue(new Error("Function 'missing_auth' not found"));

    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'GET',
        headers: {
          Authorization: 'Bearer {{token}}',
        },
        auth: {
          type: 'file',
          path: 'file://./auth/get-token.py:missing_auth',
        },
      },
    });

    await expect(
      provider.callApi('test prompt', {
        prompt: { raw: 'test prompt', label: 'test prompt' },
        vars: {},
      }),
    ).rejects.toThrow("Function 'missing_auth' not found");
  });
});

describe('HttpProvider - Bearer Authentication', () => {
  const mockUrl = 'http://example.com/api';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should add Bearer token to Authorization header', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: '{{ prompt }}' },
        auth: {
          type: 'bearer',
          token: 'my-secret-token-123',
        },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    expect(fetchWithCache).toHaveBeenCalledWith(
      mockUrl,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          authorization: 'Bearer my-secret-token-123',
        }),
      }),
      expect.any(Number),
      'text',
      undefined,
      undefined,
    );
  });

  it('should add Bearer token in raw request mode', async () => {
    const rawRequest = dedent`
      POST /api HTTP/1.1
      Host: example.com
      Content-Type: application/json

      {"key": "{{ prompt }}"}
    `;

    const provider = new HttpProvider('http://example.com', {
      config: {
        request: rawRequest,
        auth: {
          type: 'bearer',
          token: 'raw-request-token-456',
        },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    const apiCall = vi
      .mocked(fetchWithCache)
      .mock.calls.find((call) => String(call[0]).includes('/api'));
    expect(apiCall).toBeDefined();

    const headers = apiCall![1]?.headers as Record<string, string> | undefined;
    expect(headers?.authorization).toBe('Bearer raw-request-token-456');
  });
});

describe('HttpProvider - API Key Authentication', () => {
  const mockUrl = 'http://example.com/api';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should add API key to header when placement is header', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: '{{ prompt }}' },
        auth: {
          type: 'api_key',
          value: 'my-api-key-123',
          placement: 'header',
          keyName: 'X-API-Key',
        },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    expect(fetchWithCache).toHaveBeenCalledWith(
      mockUrl,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'x-api-key': 'my-api-key-123',
        }),
      }),
      expect.any(Number),
      'text',
      undefined,
      undefined,
    );
  });

  it('should add API key to query params when placement is query', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        auth: {
          type: 'api_key',
          value: 'query-api-key-456',
          placement: 'query',
          keyName: 'api_key',
        },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    // Check that the URL includes the API key as a query parameter
    const apiCall = vi.mocked(fetchWithCache).mock.calls[0];
    const url = apiCall[0] as string;
    expect(url).toContain('api_key=query-api-key-456');
    expect(url).toContain('api_key=');
  });

  it('should add API key to query params and merge with existing query params', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        queryParams: {
          foo: 'bar',
        },
        auth: {
          type: 'api_key',
          value: 'merged-api-key',
          placement: 'query',
          keyName: 'api_key',
        },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    // Check that the URL includes both the existing query param and the API key
    const apiCall = vi.mocked(fetchWithCache).mock.calls[0];
    const url = apiCall[0] as string;
    expect(url).toContain('foo=bar');
    expect(url).toContain('api_key=merged-api-key');
  });

  it('should add API key to header in raw request mode', async () => {
    const rawRequest = dedent`
      POST /api HTTP/1.1
      Host: example.com
      Content-Type: application/json

      {"key": "{{ prompt }}"}
    `;

    const provider = new HttpProvider('http://example.com', {
      config: {
        request: rawRequest,
        auth: {
          type: 'api_key',
          value: 'raw-header-key',
          placement: 'header',
          keyName: 'X-API-Key',
        },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    const apiCall = vi
      .mocked(fetchWithCache)
      .mock.calls.find((call) => String(call[0]).includes('/api'));
    expect(apiCall).toBeDefined();

    const headers = apiCall![1]?.headers as Record<string, string> | undefined;
    expect(headers?.['x-api-key']).toBe('raw-header-key');
  });

  it('should add API key to query params in raw request mode', async () => {
    const rawRequest = dedent`
      GET /api/data HTTP/1.1
      Host: example.com
      Content-Type: application/json
    `;

    const provider = new HttpProvider('http://example.com', {
      config: {
        request: rawRequest,
        auth: {
          type: 'api_key',
          value: 'raw-query-key',
          placement: 'query',
          keyName: 'api_key',
        },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    const apiCall = vi
      .mocked(fetchWithCache)
      .mock.calls.find((call) => String(call[0]).includes('/api'));
    expect(apiCall).toBeDefined();

    const url = apiCall![0] as string;
    expect(url).toContain('api_key=raw-query-key');
  });

  it('should use custom key name for API key header', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: '{{ prompt }}' },
        auth: {
          type: 'api_key',
          value: 'custom-key-value',
          placement: 'header',
          keyName: 'Authorization',
        },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    expect(fetchWithCache).toHaveBeenCalledWith(
      mockUrl,
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'custom-key-value',
        }),
      }),
      expect.any(Number),
      'text',
      undefined,
      undefined,
    );
  });

  it('should add API key to query params when URL already has query parameters', async () => {
    const urlWithQuery = 'http://example.com/api?existing=value&other=param';
    const provider = new HttpProvider(urlWithQuery, {
      config: {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        auth: {
          type: 'api_key',
          value: 'new-api-key',
          placement: 'query',
          keyName: 'api_key',
        },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    const apiCall = vi.mocked(fetchWithCache).mock.calls[0];
    const url = apiCall[0] as string;
    // Should contain all query params
    expect(url).toContain('existing=value');
    expect(url).toContain('other=param');
    expect(url).toContain('api_key=new-api-key');
    // Should be a valid URL with all params
    const urlObj = new URL(url);
    expect(urlObj.searchParams.get('existing')).toBe('value');
    expect(urlObj.searchParams.get('other')).toBe('param');
    expect(urlObj.searchParams.get('api_key')).toBe('new-api-key');
  });

  it('should add API key to query params with config queryParams and URL query params', async () => {
    const urlWithQuery = 'http://example.com/api?urlParam=urlValue';
    const provider = new HttpProvider(urlWithQuery, {
      config: {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        queryParams: {
          configParam: 'configValue',
        },
        auth: {
          type: 'api_key',
          value: 'triple-merge-key',
          placement: 'query',
          keyName: 'api_key',
        },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    const apiCall = vi.mocked(fetchWithCache).mock.calls[0];
    const url = apiCall[0] as string;
    const urlObj = new URL(url);
    // Should contain all three sources of query params
    expect(urlObj.searchParams.get('urlParam')).toBe('urlValue');
    expect(urlObj.searchParams.get('configParam')).toBe('configValue');
    expect(urlObj.searchParams.get('api_key')).toBe('triple-merge-key');
  });

  it('should properly URL encode API key value in query params', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        auth: {
          type: 'api_key',
          value: 'key with spaces & special=chars',
          placement: 'query',
          keyName: 'api_key',
        },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    const apiCall = vi.mocked(fetchWithCache).mock.calls[0];
    const url = apiCall[0] as string;
    const urlObj = new URL(url);
    // Should properly decode the value (URLSearchParams handles encoding/decoding)
    expect(urlObj.searchParams.get('api_key')).toBe('key with spaces & special=chars');
    // Should be URL encoded in the actual URL string
    expect(url).toContain('api_key=');
    // Verify special characters are encoded (not present as literals)
    expect(url).not.toContain('api_key=key with spaces'); // Should not have unencoded spaces
    expect(url).not.toContain('& special'); // Should not have unencoded &
    expect(url).not.toContain('special=chars'); // Should not have unencoded =
  });

  it('should add API key to query params with custom key name', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        auth: {
          type: 'api_key',
          value: 'custom-name-key',
          placement: 'query',
          keyName: 'X-API-Key',
        },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    const apiCall = vi.mocked(fetchWithCache).mock.calls[0];
    const url = apiCall[0] as string;
    const urlObj = new URL(url);
    // Should use the custom key name
    expect(urlObj.searchParams.get('X-API-Key')).toBe('custom-name-key');
    expect(url).toContain('X-API-Key=custom-name-key');
  });

  it('should add API key to query params in POST requests', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: '{{ prompt }}' },
        auth: {
          type: 'api_key',
          value: 'post-query-key',
          placement: 'query',
          keyName: 'api_key',
        },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    const apiCall = vi.mocked(fetchWithCache).mock.calls[0];
    const url = apiCall[0] as string;
    const urlObj = new URL(url);
    expect(urlObj.searchParams.get('api_key')).toBe('post-query-key');
    // Should still have the body
    expect(apiCall[1]?.body).toBeDefined();
  });

  it('should add API key to query params in raw request mode with existing query params', async () => {
    const rawRequest = dedent`
      GET /api/data?existing=value&other=param HTTP/1.1
      Host: example.com
      Content-Type: application/json
    `;

    const provider = new HttpProvider('http://example.com', {
      config: {
        request: rawRequest,
        auth: {
          type: 'api_key',
          value: 'raw-query-merge-key',
          placement: 'query',
          keyName: 'api_key',
        },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    const apiCall = vi
      .mocked(fetchWithCache)
      .mock.calls.find((call) => String(call[0]).includes('/api'));
    expect(apiCall).toBeDefined();

    const url = apiCall![0] as string;
    const urlObj = new URL(url);
    // Should contain all query params including the API key
    expect(urlObj.searchParams.get('existing')).toBe('value');
    expect(urlObj.searchParams.get('other')).toBe('param');
    expect(urlObj.searchParams.get('api_key')).toBe('raw-query-merge-key');
  });

  it('should handle API key query param with URL that has hash fragment', async () => {
    const urlWithHash = 'http://example.com/api#fragment';
    const provider = new HttpProvider(urlWithHash, {
      config: {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        auth: {
          type: 'api_key',
          value: 'hash-url-key',
          placement: 'query',
          keyName: 'api_key',
        },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    const apiCall = vi.mocked(fetchWithCache).mock.calls[0];
    const url = apiCall[0] as string;
    const urlObj = new URL(url);
    expect(urlObj.searchParams.get('api_key')).toBe('hash-url-key');
    // Hash should be preserved
    expect(urlObj.hash).toBe('#fragment');
  });
});
