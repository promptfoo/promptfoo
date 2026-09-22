import { AzureCliCredential, ClientSecretCredential } from '@azure/identity';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../../../src/logger';
import { AzureGenericProvider } from '../../../src/providers/azure/generic';
import { mockProcessEnv } from '../../util/utils';

vi.mock('@azure/identity', () => {
  class FakeCredential {
    async getToken() {
      return { token: 't', expiresOnTimestamp: Date.now() + 3_600_000 };
    }
  }
  return {
    ClientSecretCredential: vi.fn(function () {
      return new FakeCredential();
    }),
    AzureCliCredential: vi.fn(function () {
      return new FakeCredential();
    }),
  };
});

describe('AzureGenericProvider', () => {
  describe('getApiBaseUrl', () => {
    let restoreEnv: () => void;

    beforeEach(() => {
      restoreEnv = mockProcessEnv({ AZURE_OPENAI_API_HOST: undefined });
    });

    afterEach(() => {
      restoreEnv();
    });

    it('should return apiBaseUrl if set', () => {
      const provider = new AzureGenericProvider('test-deployment', {
        config: { apiBaseUrl: 'https://custom.azure.com' },
      });
      expect(provider.getApiBaseUrl()).toBe('https://custom.azure.com');
    });

    it('should return apiBaseUrl without trailing slash if set', () => {
      const provider = new AzureGenericProvider('test-deployment', {
        config: { apiBaseUrl: 'https://custom.azure.com/' },
      });
      expect(provider.getApiBaseUrl()).toBe('https://custom.azure.com');
    });

    it('should construct URL from apiHost without protocol', () => {
      const provider = new AzureGenericProvider('test-deployment', {
        config: { apiHost: 'api.azure.com' },
      });
      expect(provider.getApiBaseUrl()).toBe('https://api.azure.com');
    });

    it('should remove protocol from apiHost if present', () => {
      const provider = new AzureGenericProvider('test-deployment', {
        config: { apiHost: 'https://api.azure.com' },
      });
      expect(provider.getApiBaseUrl()).toBe('https://api.azure.com');
    });

    it('should remove trailing slash from apiHost if present', () => {
      const provider = new AzureGenericProvider('test-deployment', {
        config: { apiHost: 'api.azure.com/' },
      });
      expect(provider.getApiBaseUrl()).toBe('https://api.azure.com');
    });

    it('should return undefined if neither apiBaseUrl nor apiHost is set', () => {
      const provider = new AzureGenericProvider('test-deployment', {});
      expect(provider.getApiBaseUrl()).toBeUndefined();
    });
  });

  describe('Entra ID token refresh', () => {
    let restoreEnv: () => void;
    beforeEach(() => {
      restoreEnv = mockProcessEnv({ AZURE_API_KEY: undefined, AZURE_OPENAI_API_KEY: undefined });
    });
    afterEach(() => {
      restoreEnv();
      vi.restoreAllMocks();
    });

    it('does not re-fetch api-key auth headers on subsequent requests', async () => {
      const spy = vi
        .spyOn(AzureGenericProvider.prototype as any, 'getAuthHeaders')
        .mockResolvedValue({ 'api-key': 'k' });
      const p = new AzureGenericProvider('d', { config: { apiKey: 'k' } });
      await p.ensureInitialized();
      const callsAfterInit = spy.mock.calls.length;
      await p.ensureInitialized();
      await p.ensureInitialized();
      expect(spy.mock.calls.length).toBe(callsAfterInit); // api-key never refreshes
    });

    it('refreshes a bearer token that is at/near expiry', async () => {
      const spy = vi
        .spyOn(AzureGenericProvider.prototype as any, 'getAuthHeaders')
        .mockResolvedValueOnce({ Authorization: 'Bearer first' })
        .mockResolvedValue({ Authorization: 'Bearer refreshed' });
      const p = new AzureGenericProvider('d', {});
      await p.ensureInitialized();
      expect((p as any).authHeaders).toEqual({ Authorization: 'Bearer first' });
      // Simulate the captured token being already expired.
      (p as any).authTokenExpiresOnTimestamp = Date.now() - 1000;
      await p.ensureInitialized();
      expect((p as any).authHeaders).toEqual({ Authorization: 'Bearer refreshed' });
      expect(spy).toHaveBeenCalledTimes(2); // once at init, once on refresh
    });

    it('does not refresh a still-valid bearer token', async () => {
      const spy = vi
        .spyOn(AzureGenericProvider.prototype as any, 'getAuthHeaders')
        .mockResolvedValue({ Authorization: 'Bearer t' });
      const p = new AzureGenericProvider('d', {});
      await p.ensureInitialized();
      (p as any).authTokenExpiresOnTimestamp = Date.now() + 60 * 60 * 1000; // valid for ~1h
      const callsAfterInit = spy.mock.calls.length;
      await p.ensureInitialized();
      expect(spy.mock.calls.length).toBe(callsAfterInit); // no refetch while valid
    });
  });

  describe('getAzureTokenCredential', () => {
    let restoreEnv: () => void;

    beforeEach(() => {
      restoreEnv = mockProcessEnv({
        AZURE_API_KEY: undefined,
        AZURE_OPENAI_API_KEY: undefined,
        AZURE_CLIENT_ID: undefined,
        AZURE_CLIENT_SECRET: undefined,
        AZURE_TENANT_ID: undefined,
        AZURE_AUTHORITY_HOST: undefined,
      });
      vi.mocked(ClientSecretCredential).mockClear();
      vi.mocked(AzureCliCredential).mockClear();
    });

    afterEach(() => {
      restoreEnv();
      vi.restoreAllMocks();
    });

    it('uses a service principal when client id, secret, and tenant are all set', async () => {
      const warnSpy = vi.spyOn(logger, 'warn');
      const provider = new AzureGenericProvider('d', {
        config: { azureClientId: 'client', azureClientSecret: 'secret', azureTenantId: 'tenant' },
      });
      await provider.ensureInitialized();

      expect(ClientSecretCredential).toHaveBeenCalledWith('tenant', 'client', 'secret', {
        authorityHost: 'https://login.microsoftonline.com',
      });
      expect(AzureCliCredential).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('warns and names the missing fields before falling back to Azure CLI', async () => {
      const warnSpy = vi.spyOn(logger, 'warn');
      const provider = new AzureGenericProvider('d', {
        config: { azureClientId: 'client', azureTenantId: 'tenant' },
      });
      await provider.ensureInitialized();

      expect(ClientSecretCredential).not.toHaveBeenCalled();
      expect(AzureCliCredential).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const [message] = warnSpy.mock.calls[0];
      expect(message).toContain('azureClientSecret');
      expect(message).not.toContain('azureClientId');
      expect(message).not.toContain('azureTenantId');
    });

    it('falls back to Azure CLI silently when no service principal fields are set', async () => {
      const warnSpy = vi.spyOn(logger, 'warn');
      const provider = new AzureGenericProvider('d', {});
      await provider.ensureInitialized();

      expect(ClientSecretCredential).not.toHaveBeenCalled();
      expect(AzureCliCredential).toHaveBeenCalledTimes(1);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
