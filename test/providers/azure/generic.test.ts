import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AzureGenericProvider } from '../../../src/providers/azure/generic';
import { mockProcessEnv } from '../../util/utils';

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
});
