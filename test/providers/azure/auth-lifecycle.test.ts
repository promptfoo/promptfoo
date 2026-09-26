import { AzureCliCredential, ClientSecretCredential } from '@azure/identity';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AzureChatCompletionProvider } from '../../../src/providers/azure/chat';
import { AzureGenericProvider } from '../../../src/providers/azure/generic';
import { createDeferred, mockProcessEnv } from '../../util/utils';
import type { AccessToken } from '@azure/identity';

const mcp = vi.hoisted(() => ({ initialize: vi.fn(), cleanup: vi.fn() }));
vi.mock('@azure/identity', () => ({
  AzureCliCredential: vi.fn(),
  ClientSecretCredential: vi.fn(),
}));
vi.mock('../../../src/providers/mcp/client', () => ({
  MCPClient: vi.fn(function () {
    return mcp;
  }),
}));

const token = (value: string, expiresInMs = 3_600_000): AccessToken => ({
  token: value,
  expiresOnTimestamp: Date.now() + expiresInMs,
});

describe('Azure authentication lifecycle', () => {
  let restoreEnv: () => void;
  const getToken = vi.fn<() => Promise<AccessToken | null>>();

  beforeEach(async () => {
    restoreEnv = mockProcessEnv({
      AZURE_API_KEY: undefined,
      AZURE_OPENAI_API_KEY: undefined,
      AZURE_CLIENT_ID: undefined,
      AZURE_CLIENT_SECRET: undefined,
      AZURE_TENANT_ID: undefined,
      AZURE_TOKEN_SCOPE: undefined,
    });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    getToken.mockReset().mockResolvedValue(token('initial'));
    for (const constructor of [AzureCliCredential, ClientSecretCredential]) {
      vi.mocked(constructor)
        .mockReset()
        .mockImplementation(function () {
          return Object.assign(Object.create(constructor.prototype), { getToken });
        });
    }
    mcp.initialize.mockReset().mockResolvedValue(undefined);
    mcp.cleanup.mockReset().mockResolvedValue(undefined);
    await import('@azure/identity');
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each(['cli', 'service principal'])(
    'shares initial authentication and refresh for %s',
    async (auth) => {
      const initial = createDeferred<AccessToken>();
      getToken.mockReturnValueOnce(initial.promise);
      const provider = new AzureGenericProvider('deployment', {
        config:
          auth === 'cli'
            ? {}
            : {
                azureClientId: 'test-client',
                azureClientSecret: 'test-secret',
                azureTenantId: 'test-tenant',
              },
      });
      const firstRequests = Array.from({ length: 20 }, () => provider.ensureInitialized());
      await vi.dynamicImportSettled();
      expect(getToken).toHaveBeenCalledTimes(1);
      initial.resolve(token('initial'));
      await Promise.all(firstRequests);

      vi.advanceTimersByTime(3_300_000);
      const refresh = createDeferred<AccessToken>();
      getToken.mockReturnValueOnce(refresh.promise);
      const nextRequests = Array.from({ length: 20 }, () => provider.ensureInitialized());
      await vi.dynamicImportSettled();
      expect(getToken).toHaveBeenCalledTimes(2);
      refresh.resolve(token('refreshed'));
      await Promise.all(nextRequests);

      expect(provider.authHeaders).toEqual({ Authorization: 'Bearer refreshed' });
      expect(auth === 'cli' ? AzureCliCredential : ClientSecretCredential).toHaveBeenCalledTimes(1);
      await provider.ensureInitialized();
      expect(getToken).toHaveBeenCalledTimes(2);
    },
  );

  it('shares an initial authentication failure and retries with the same credential', async () => {
    const initial = createDeferred<AccessToken>();
    getToken.mockReturnValueOnce(initial.promise);
    const provider = new AzureGenericProvider('deployment');
    const requests = Promise.allSettled(
      Array.from({ length: 20 }, () => provider.ensureInitialized()),
    );
    await vi.dynamicImportSettled();
    initial.reject(new Error('temporary authentication failure'));
    const outcomes = await requests;
    expect(outcomes.every((result) => result.status === 'rejected')).toBe(true);
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(provider.authHeaders).toBeUndefined();

    await Promise.all(Array.from({ length: 20 }, () => provider.ensureInitialized()));
    expect(provider.authHeaders).toEqual({ Authorization: 'Bearer initial' });
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(AzureCliCredential).toHaveBeenCalledTimes(1);
  });

  it('recovers when eager authentication fails before the first request', async () => {
    getToken.mockRejectedValueOnce(new Error('temporary authentication failure'));
    const provider = new AzureGenericProvider('deployment');
    await vi.dynamicImportSettled();

    await provider.ensureInitialized();
    expect(provider.authHeaders).toEqual({ Authorization: 'Bearer initial' });
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  it.each([3_300_000, 3_600_000])(
    'rejects a failed refresh after %sms and retries on the next request',
    async (elapsed) => {
      const provider = new AzureGenericProvider('deployment');
      await provider.ensureInitialized();
      vi.advanceTimersByTime(elapsed);
      const refresh = createDeferred<AccessToken>();
      getToken.mockReturnValueOnce(refresh.promise);
      const requests = Promise.allSettled(
        Array.from({ length: 20 }, () => provider.ensureInitialized()),
      );
      await vi.dynamicImportSettled();
      refresh.reject(new Error('temporary refresh failure'));

      const outcomes = await requests;
      expect(outcomes.every((result) => result.status === 'rejected')).toBe(true);
      expect(
        new Set(outcomes.map((result) => result.status === 'rejected' && result.reason)).size,
      ).toBe(1);
      expect(getToken).toHaveBeenCalledTimes(2);

      getToken.mockResolvedValueOnce(token('recovered'));
      await Promise.all(Array.from({ length: 20 }, () => provider.ensureInitialized()));
      expect(provider.authHeaders).toEqual({ Authorization: 'Bearer recovered' });
      expect(getToken).toHaveBeenCalledTimes(3);
      expect(AzureCliCredential).toHaveBeenCalledTimes(1);
    },
  );

  it('preserves the refresh window and does not refetch a still-valid token', async () => {
    const provider = new AzureGenericProvider('deployment');
    await provider.ensureInitialized();
    vi.advanceTimersByTime(3_299_999);
    await Promise.all(Array.from({ length: 20 }, () => provider.ensureInitialized()));
    expect(getToken).toHaveBeenCalledTimes(1);
  });

  it('preserves tokens whose expiry is unavailable', async () => {
    getToken.mockResolvedValueOnce({ token: 'unknown-expiry' } as AccessToken);
    const provider = new AzureGenericProvider('deployment');
    await provider.ensureInitialized();
    vi.advanceTimersByTime(86_400_000);
    await provider.ensureInitialized();
    expect(provider.authHeaders).toEqual({ Authorization: 'Bearer unknown-expiry' });
    expect(getToken).toHaveBeenCalledTimes(1);
  });

  it('retries a null token response without caching unsuccessful authentication', async () => {
    getToken.mockResolvedValueOnce(null);
    const provider = new AzureGenericProvider('deployment');
    await expect(provider.ensureInitialized()).rejects.toThrow('Azure Authentication failed');
    await provider.ensureInitialized();
    expect(provider.authHeaders).toEqual({ Authorization: 'Bearer initial' });
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  it('keeps API-key precedence without constructing credentials or refreshing tokens', async () => {
    const provider = new AzureGenericProvider('deployment', {
      config: { apiKey: 'test-key', azureClientId: 'test-client' },
    });
    await Promise.all(Array.from({ length: 20 }, () => provider.ensureInitialized()));
    vi.advanceTimersByTime(86_400_000);
    await provider.ensureInitialized();
    expect(provider.authHeaders).toEqual({ 'api-key': 'test-key' });
    expect(AzureCliCredential).not.toHaveBeenCalled();
    expect(ClientSecretCredential).not.toHaveBeenCalled();
    expect(getToken).not.toHaveBeenCalled();
  });

  it('keeps refresh operations and token scopes isolated between providers', async () => {
    const firstGetToken = vi.fn(async () => token('first'));
    const secondGetToken = vi.fn(async () => token('second'));
    vi.mocked(AzureCliCredential)
      .mockImplementationOnce(function () {
        return Object.assign(Object.create(AzureCliCredential.prototype), {
          getToken: firstGetToken,
        });
      })
      .mockImplementationOnce(function () {
        return Object.assign(Object.create(AzureCliCredential.prototype), {
          getToken: secondGetToken,
        });
      });
    const first = new AzureGenericProvider('first', {
      config: { azureTokenScope: 'https://first.example/.default' },
      env: { AZURE_TOKEN_SCOPE: 'https://ignored.example/.default' },
    });
    await first.ensureInitialized();
    const second = new AzureGenericProvider('second', {
      env: { AZURE_TOKEN_SCOPE: 'https://second.example/.default' },
    });
    await second.ensureInitialized();
    vi.advanceTimersByTime(3_600_000);
    await Promise.all(
      Array.from({ length: 20 }, () =>
        Promise.all([first.ensureInitialized(), second.ensureInitialized()]),
      ),
    );

    expect(firstGetToken).toHaveBeenCalledTimes(2);
    expect(firstGetToken).toHaveBeenLastCalledWith('https://first.example/.default');
    expect(secondGetToken).toHaveBeenCalledTimes(2);
    expect(secondGetToken).toHaveBeenLastCalledWith('https://second.example/.default');
    expect(first.authHeaders).toEqual({ Authorization: 'Bearer first' });
    expect(second.authHeaders).toEqual({ Authorization: 'Bearer second' });
  });

  it('waits for and retries authentication when MCP has its own initialization promise', async () => {
    const initial = createDeferred<AccessToken>();
    getToken.mockReturnValueOnce(initial.promise);
    const provider = new AzureChatCompletionProvider('deployment', {
      config: { mcp: { enabled: true, server: { command: 'unused-mock-command' } } },
    });
    const requests = Promise.allSettled([
      provider.ensureInitialized(),
      provider.ensureInitialized(),
    ]);
    await vi.dynamicImportSettled();
    expect(mcp.initialize).toHaveBeenCalledTimes(1);
    expect(getToken).toHaveBeenCalledTimes(1);
    initial.reject(new Error('temporary authentication failure'));
    expect((await requests).every((result) => result.status === 'rejected')).toBe(true);

    await provider.ensureInitialized();
    expect(provider.authHeaders).toEqual({ Authorization: 'Bearer initial' });
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(mcp.initialize).toHaveBeenCalledTimes(1);
    await provider.cleanup();
    expect(mcp.cleanup).toHaveBeenCalledTimes(1);
  });
});
