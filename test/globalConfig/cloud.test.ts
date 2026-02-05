import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_HOST, CloudConfig, cloudConfig } from '../../src/globalConfig/cloud';
import { readGlobalConfig, writeGlobalConfigPartial } from '../../src/globalConfig/globalConfig';
import { fetchWithProxy } from '../../src/util/fetch/index';

vi.mock('../../src/util/fetch/index');
vi.mock('../../src/logger');
vi.mock('../../src/globalConfig/globalConfig');

describe('CloudConfig', () => {
  let cloudConfigInstance: CloudConfig;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(readGlobalConfig).mockReturnValue({
      id: 'test-id',
      cloud: {
        appUrl: 'https://test.app',
        apiHost: 'https://test.api',
        apiKey: 'test-key',
      },
    });
    cloudConfigInstance = new CloudConfig();
  });

  describe('constructor', () => {
    it('should initialize with default values when no saved config exists', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
      });
      const config = new CloudConfig();
      expect(config.getAppUrl()).toBe('https://www.promptfoo.app');
      expect(config.getApiHost()).toBe(API_HOST);
      expect(config.getApiKey()).toBeUndefined();
    });

    it('should initialize with saved config values', () => {
      expect(cloudConfigInstance.getAppUrl()).toBe('https://test.app');
      expect(cloudConfigInstance.getApiHost()).toBe('https://test.api');
      expect(cloudConfigInstance.getApiKey()).toBe('test-key');
    });
  });

  describe('isEnabled', () => {
    it('should return true when apiKey exists', () => {
      expect(cloudConfigInstance.isEnabled()).toBe(true);
    });

    it('should return false when apiKey does not exist', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
      });
      const config = new CloudConfig();
      expect(config.isEnabled()).toBe(false);
    });
  });

  describe('setters and getters', () => {
    it('should set and get apiHost', () => {
      cloudConfigInstance.setApiHost('https://new.api');
      expect(writeGlobalConfigPartial).toHaveBeenCalledWith({
        cloud: expect.objectContaining({
          apiHost: 'https://new.api',
        }),
      });
    });

    it('should set and get apiKey', () => {
      cloudConfigInstance.setApiKey('new-key');
      expect(writeGlobalConfigPartial).toHaveBeenCalledWith({
        cloud: expect.objectContaining({
          apiKey: 'new-key',
        }),
      });
    });

    it('should set and get appUrl', () => {
      cloudConfigInstance.setAppUrl('https://new.app');
      expect(writeGlobalConfigPartial).toHaveBeenCalledWith({
        cloud: expect.objectContaining({
          appUrl: 'https://new.app',
        }),
      });
    });
  });

  describe('delete', () => {
    it('should clear cloud config', () => {
      cloudConfigInstance.delete();
      expect(writeGlobalConfigPartial).toHaveBeenCalledWith({ cloud: {} });
    });
  });

  describe('validateAndSetApiToken', () => {
    const mockResponse = {
      user: {
        id: '1',
        name: 'Test User',
        email: 'test@example.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      organization: {
        id: '1',
        name: 'Test Org',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      app: {
        url: 'https://test.app',
      },
    };

    it('should validate token and update config on success', async () => {
      const mockFetchResponse = {
        ok: true,
        json: () => Promise.resolve(mockResponse),
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      } as Response;

      vi.mocked(fetchWithProxy).mockResolvedValue(mockFetchResponse);

      const result = await cloudConfigInstance.validateAndSetApiToken(
        'test-token',
        'https://test.api',
      );

      expect(result).toEqual(mockResponse);
      expect(writeGlobalConfigPartial).toHaveBeenCalledWith({
        cloud: expect.objectContaining({
          apiKey: 'test-token',
          apiHost: 'https://test.api',
          appUrl: 'https://test.app',
        }),
      });
    });

    it('should throw error on failed validation', async () => {
      const mockErrorResponse = {
        ok: false,
        statusText: 'Unauthorized',
        json: () => Promise.reject(new Error('Unauthorized')),
        text: () => Promise.resolve('Unauthorized'),
      } as Response;

      vi.mocked(fetchWithProxy).mockResolvedValue(mockErrorResponse);

      await expect(
        cloudConfigInstance.validateAndSetApiToken('invalid-token', 'https://test.api'),
      ).rejects.toThrow('Failed to validate API token: Unauthorized');
    });
  });

  describe('cloudConfig singleton', () => {
    it('should be an instance of CloudConfig', () => {
      expect(cloudConfig).toBeInstanceOf(CloudConfig);
    });
  });

  describe('getApiKey with environment variable', () => {
    const originalEnv = process.env.PROMPTFOO_API_KEY;

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env.PROMPTFOO_API_KEY = originalEnv;
      } else {
        delete process.env.PROMPTFOO_API_KEY;
      }
    });

    it('should return API key from config file when set', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
        cloud: { apiKey: 'config-key' },
      });
      delete process.env.PROMPTFOO_API_KEY;
      const config = new CloudConfig();
      expect(config.getApiKey()).toBe('config-key');
    });

    it('should return API key from PROMPTFOO_API_KEY env var when config is empty', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
      });
      process.env.PROMPTFOO_API_KEY = 'env-key';
      const config = new CloudConfig();
      expect(config.getApiKey()).toBe('env-key');
    });

    it('should prefer config file over env var when both are set', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
        cloud: { apiKey: 'config-key' },
      });
      process.env.PROMPTFOO_API_KEY = 'env-key';
      const config = new CloudConfig();
      expect(config.getApiKey()).toBe('config-key');
    });

    it('should return undefined when neither config nor env var is set', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
      });
      delete process.env.PROMPTFOO_API_KEY;
      const config = new CloudConfig();
      expect(config.getApiKey()).toBeUndefined();
    });
  });

  describe('isEnabled with environment variable', () => {
    const originalEnv = process.env.PROMPTFOO_API_KEY;

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env.PROMPTFOO_API_KEY = originalEnv;
      } else {
        delete process.env.PROMPTFOO_API_KEY;
      }
    });

    it('should return true when config file has apiKey', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
        cloud: { apiKey: 'config-key' },
      });
      delete process.env.PROMPTFOO_API_KEY;
      const config = new CloudConfig();
      expect(config.isEnabled()).toBe(true);
    });

    it('should return true when PROMPTFOO_API_KEY env var is set', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
      });
      process.env.PROMPTFOO_API_KEY = 'env-key';
      const config = new CloudConfig();
      expect(config.isEnabled()).toBe(true);
    });

    it('should return false when neither config nor env var is set', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
      });
      delete process.env.PROMPTFOO_API_KEY;
      const config = new CloudConfig();
      expect(config.isEnabled()).toBe(false);
    });
  });

  describe('getApiHost with environment variable', () => {
    const originalEnv = process.env.PROMPTFOO_CLOUD_API_URL;

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env.PROMPTFOO_CLOUD_API_URL = originalEnv;
      } else {
        delete process.env.PROMPTFOO_CLOUD_API_URL;
      }
    });

    it('should return API host from config file when set', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
        cloud: { apiHost: 'https://config-host.example.com' },
      });
      delete process.env.PROMPTFOO_CLOUD_API_URL;
      const config = new CloudConfig();
      expect(config.getApiHost()).toBe('https://config-host.example.com');
    });

    it('should return API host from PROMPTFOO_CLOUD_API_URL env var when config is empty', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
      });
      process.env.PROMPTFOO_CLOUD_API_URL = 'https://env-host.example.com';
      const config = new CloudConfig();
      expect(config.getApiHost()).toBe('https://env-host.example.com');
    });

    it('should prefer config file over env var when both are set', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
        cloud: { apiHost: 'https://config-host.example.com' },
      });
      process.env.PROMPTFOO_CLOUD_API_URL = 'https://env-host.example.com';
      const config = new CloudConfig();
      expect(config.getApiHost()).toBe('https://config-host.example.com');
    });

    it('should return default API_HOST when neither config nor env var is set', () => {
      vi.mocked(readGlobalConfig).mockReturnValue({
        id: 'test-id',
      });
      delete process.env.PROMPTFOO_CLOUD_API_URL;
      const config = new CloudConfig();
      expect(config.getApiHost()).toBe(API_HOST);
    });
  });
});
