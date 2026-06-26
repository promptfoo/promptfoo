import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../../../src/logger';
import { AzureGenericProvider } from '../../../src/providers/azure/generic';
import { mockProcessEnv } from '../../util/utils';

describe('AzureGenericProvider', () => {
  it('does not log Azure authentication error details', async () => {
    const provider = new AzureGenericProvider('test-deployment', {
      config: { apiKey: 'initialization-key' },
    });
    await provider.ensureInitialized();
    provider.config.apiKey = undefined;

    vi.spyOn(provider, 'getApiKey').mockReturnValue(undefined);
    vi.spyOn(provider, 'getAccessToken').mockRejectedValue(
      new Error('secret-auth-sdk-error-sentinel'),
    );
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);

    await expect(provider.getAuthHeaders()).rejects.toThrow('Azure Authentication failed');
    expect(infoSpy).toHaveBeenCalledWith(
      'Azure authentication failed. Please check your credentials.',
    );
    expect(JSON.stringify(infoSpy.mock.calls)).not.toContain('secret-auth-sdk-error-sentinel');

    vi.restoreAllMocks();
  });

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
});
