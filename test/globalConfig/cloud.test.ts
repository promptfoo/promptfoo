import { fetchWithProxy } from '../../src/fetch';
import { CloudConfig, cloudConfig, API_HOST } from '../../src/globalConfig/cloud';
import { readGlobalConfig, writeGlobalConfigPartial } from '../../src/globalConfig/globalConfig';
import logger from '../../src/logger';

jest.mock('../../src/fetch');
jest.mock('../../src/logger');
jest.mock('../../src/globalConfig/globalConfig');

describe('CloudConfig', () => {
  let cloudConfigInstance: CloudConfig;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(readGlobalConfig).mockReturnValue({
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
      jest.mocked(readGlobalConfig).mockReturnValue({});
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
      jest.mocked(readGlobalConfig).mockReturnValue({});
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
      } as Response;

      jest.mocked(fetchWithProxy).mockResolvedValue(mockFetchResponse);

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
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully logged in'));
    });

    it('should throw error on failed validation', async () => {
      const mockErrorResponse = {
        ok: false,
        statusText: 'Unauthorized',
        json: () => Promise.reject(new Error('Unauthorized')),
      } as Response;

      jest.mocked(fetchWithProxy).mockResolvedValue(mockErrorResponse);

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
});
