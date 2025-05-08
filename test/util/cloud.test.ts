import { fetchWithProxy } from '../../src/fetch';
import { cloudConfig } from '../../src/globalConfig/cloud';
import logger from '../../src/logger';
import {
  makeRequest,
  getProviderFromCloud,
  getConfigFromCloud,
  targetApiBuildDate,
  cloudCanAcceptChunkedResults,
} from '../../src/util/cloud';

jest.mock('../../src/fetch');
jest.mock('../../src/globalConfig/cloud');
jest.mock('../../src/logger');

describe('cloud utils', () => {
  const mockFetchWithProxy = jest.mocked(fetchWithProxy);
  const mockCloudConfig = cloudConfig as jest.Mocked<typeof cloudConfig>;
  const mockLogger = logger as any;

  beforeEach(() => {
    jest.resetAllMocks();
    mockCloudConfig.getApiHost.mockReturnValue('https://api.example.com');
    mockCloudConfig.getApiKey.mockReturnValue('test-api-key');
    jest.spyOn(mockLogger, 'error').mockImplementation().mockReturnValue(mockLogger);
    jest.spyOn(mockLogger, 'info').mockImplementation().mockReturnValue(mockLogger);
    jest.spyOn(mockLogger, 'debug').mockImplementation().mockReturnValue(mockLogger);
  });

  describe('makeRequest', () => {
    it('should make request with correct URL and headers', async () => {
      await makeRequest('test/path', 'POST', { data: 'test' });

      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://api.example.com/test/path', {
        method: 'POST',
        body: JSON.stringify({ data: 'test' }),
        headers: { Authorization: 'Bearer test-api-key' },
      });
    });

    it('should make GET request without body', async () => {
      await makeRequest('test/path', 'GET');

      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://api.example.com/test/path', {
        method: 'GET',
        body: undefined,
        headers: { Authorization: 'Bearer test-api-key' },
      });
    });

    it('should handle and log error (async error)', async () => {
      const error = new Error('Network error');
      mockFetchWithProxy.mockRejectedValueOnce(error);

      await expect(makeRequest('test/path', 'GET')).rejects.toThrow(error);

      expect(mockLogger.error).not.toHaveBeenCalledWith(
        expect.stringContaining(
          'Failed to make request to https://api.example.com/test/path: Error: Network error',
        ),
      );
    });
  });

  describe('getProviderFromCloud', () => {
    beforeEach(() => {
      mockCloudConfig.isEnabled.mockReturnValue(true);
    });

    it('should fetch and parse provider successfully', async () => {
      const mockProvider = {
        config: {
          id: 'test-provider',
          label: 'Test Provider',
        },
      };

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProvider),
      } as any as Response);

      const result = await getProviderFromCloud('test-provider');

      expect(result).toEqual({ ...mockProvider.config, id: 'test-provider' });
      expect(mockLogger.info).toHaveBeenCalledWith('Provider fetched from cloud: test-provider');
    });

    it('should throw error when cloud config is not enabled', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(false);

      await expect(getProviderFromCloud('test-provider')).rejects.toThrow(
        'Could not fetch Provider test-provider from cloud. Cloud config is not enabled.',
      );
    });

    it('should handle error response and log details', async () => {
      const errorMessage = 'Resource not found';
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve(errorMessage),
      } as any as Response);

      await expect(getProviderFromCloud('test-provider')).rejects.toThrow(
        'Failed to fetch provider from cloud: test-provider.',
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[Cloud] Failed to fetch provider from cloud: Resource not found. HTTP Status: 404 -- Not Found.',
      );
    });

    it('should handle network errors', async () => {
      const error = new Error('Network error');
      mockFetchWithProxy.mockRejectedValueOnce(error);

      await expect(getProviderFromCloud('test-provider')).rejects.toThrow(
        'Failed to fetch provider from cloud: test-provider.',
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to fetch provider from cloud: test-provider.',
      );
      expect(mockLogger.error).toHaveBeenCalledWith(String(error));
    });
  });

  describe('getConfigFromCloud', () => {
    beforeEach(() => {
      mockCloudConfig.isEnabled.mockReturnValue(true);
    });

    it('should fetch config successfully', async () => {
      const mockConfig = {
        description: 'Test Config',
      };

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConfig),
      } as any as Response);

      const result = await getConfigFromCloud('test-config');

      expect(result).toEqual(mockConfig);
      expect(mockLogger.info).toHaveBeenCalledWith('Config fetched from cloud: test-config');
    });

    it('should throw error when cloud config is not enabled', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(false);

      await expect(getConfigFromCloud('test-config')).rejects.toThrow(
        'Could not fetch Config test-config from cloud. Cloud config is not enabled.',
      );
    });

    it('should handle error response and log details', async () => {
      const errorMessage = 'Access denied';
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: () => Promise.resolve(errorMessage),
      } as any as Response);

      await expect(getConfigFromCloud('test-config')).rejects.toThrow(
        'Failed to fetch config from cloud: test-config.',
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[Cloud] Failed to fetch config from cloud: Access denied. HTTP Status: 403 -- Forbidden.',
      );
    });

    it('should handle network errors', async () => {
      const error = new Error('Network error');
      mockFetchWithProxy.mockRejectedValueOnce(error);

      await expect(getConfigFromCloud('test-config')).rejects.toThrow(
        'Failed to fetch config from cloud: test-config.',
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to fetch config from cloud: test-config.',
      );
      expect(mockLogger.error).toHaveBeenCalledWith(String(error));
    });
  });

  describe('targetApiBuildDate', () => {
    it('should return build date when available', async () => {
      const buildDate = '2025-01-15';
      mockFetchWithProxy.mockResolvedValueOnce({
        json: () => Promise.resolve({ buildDate }),
      } as any as Response);

      const result = await targetApiBuildDate();

      expect(result).toEqual(new Date(buildDate));
      expect(mockLogger.debug).toHaveBeenCalledWith(`[targetApiBuildDate] ${buildDate}`);
    });

    it('should return null when build date is not available', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        json: () => Promise.resolve({}),
      } as any as Response);

      const result = await targetApiBuildDate();

      expect(result).toBeNull();
    });

    it('should return null when request fails', async () => {
      mockFetchWithProxy.mockRejectedValueOnce(new Error('Network error'));

      const result = await targetApiBuildDate();

      expect(result).toBeNull();
    });
  });

  describe('cloudCanAcceptChunkedResults', () => {
    it('should return true when build date is after cutoff', async () => {
      const buildDate = new Date('2025-02-01');
      mockFetchWithProxy.mockResolvedValueOnce({
        json: () => Promise.resolve({ buildDate: buildDate.toISOString() }),
      } as any as Response);

      const result = await cloudCanAcceptChunkedResults();

      expect(result).toBe(true);
    });

    it('should return false when build date is before cutoff', async () => {
      const buildDate = new Date('2024-12-31');
      mockFetchWithProxy.mockResolvedValueOnce({
        json: () => Promise.resolve({ buildDate: buildDate.toISOString() }),
      } as any as Response);

      const result = await cloudCanAcceptChunkedResults();

      expect(result).toBe(false);
    });

    it('should return false when build date is not available', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        json: () => Promise.resolve({}),
      } as any as Response);

      const result = await cloudCanAcceptChunkedResults();

      expect(result).toBe(false);
    });
  });
});
