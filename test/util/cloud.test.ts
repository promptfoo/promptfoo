import { cloudConfig } from '../../src/globalConfig/cloud';
import * as cloudModule from '../../src/util/cloud';
import {
  ConfigPermissionError,
  checkCloudPermissions,
  getConfigFromCloud,
  getDefaultTeam,
  getPluginSeverityOverridesFromCloud,
  getProviderFromCloud,
  makeRequest,
} from '../../src/util/cloud';
import { fetchWithProxy } from '../../src/util/fetch';
import { checkServerFeatureSupport } from '../../src/util/server';

jest.mock('../../src/util/fetch/index.ts');
jest.mock('../../src/globalConfig/cloud');
jest.mock('../../src/util/server');
jest.mock('../../src/util/cloud', () => ({
  ...jest.requireActual('../../src/util/cloud'),
  cloudCanBuildFormattedConfig: jest.fn().mockResolvedValue(true),
}));

describe('cloud utils', () => {
  const mockFetchWithProxy = jest.mocked(fetchWithProxy);
  const mockCloudConfig = cloudConfig as jest.Mocked<typeof cloudConfig>;
  const mockCheckServerFeatureSupport = jest.mocked(checkServerFeatureSupport);
  let mockMakeRequest: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();

    mockCloudConfig.getApiHost.mockReturnValue('https://api.example.com');
    mockCloudConfig.getApiKey.mockReturnValue('test-api-key');

    mockMakeRequest = jest.spyOn(cloudModule, 'makeRequest');
  });

  afterEach(() => {
    mockMakeRequest?.mockRestore();
  });

  describe('makeRequest', () => {
    it('should make request with correct URL and headers', async () => {
      const path = 'test/path';
      const method = 'POST';
      const body = { data: 'test' };

      await makeRequest(path, method, body);

      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://api.example.com/api/v1/test/path', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
      });
    });

    it('should make GET request without body', async () => {
      const path = 'test/path';
      const method = 'GET';

      await makeRequest(path, method);

      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://api.example.com/api/v1/test/path', {
        method: 'GET',
        body: undefined,
        headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
      });
    });

    it('should handle undefined API key', async () => {
      mockCloudConfig.getApiKey.mockReturnValue(undefined);

      const path = 'test/path';
      const method = 'GET';

      await makeRequest(path, method);

      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://api.example.com/api/v1/test/path', {
        method: 'GET',
        body: undefined,
        headers: { Authorization: 'Bearer undefined', 'Content-Type': 'application/json' },
      });
    });

    it('should handle empty path', async () => {
      const path = '';
      const method = 'GET';

      await makeRequest(path, method);

      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://api.example.com/api/v1/', {
        method: 'GET',
        body: undefined,
        headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
      });
    });

    it('should handle API host without trailing slash', async () => {
      mockCloudConfig.getApiHost.mockReturnValue('https://api.example.com');

      const path = 'test/path';
      const method = 'GET';

      await makeRequest(path, method);

      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/test/path',
        expect.any(Object),
      );
    });

    it('should handle API host with trailing slash', async () => {
      mockCloudConfig.getApiHost.mockReturnValue('https://api.example.com');

      const path = 'test/path';
      const method = 'GET';

      await makeRequest(path, method);

      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/test/path',
        expect.any(Object),
      );
    });

    it('should handle path with leading slash', async () => {
      const path = '/test/path';
      const method = 'GET';

      await makeRequest(path, method);

      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://api.example.com/api/v1/test/path', {
        method: 'GET',
        body: undefined,
        headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
      });
    });

    it('should handle complex request body', async () => {
      const path = 'test/path';
      const method = 'POST';
      const body = {
        string: 'test',
        number: 123,
        boolean: true,
        array: [1, 2, 3],
        nested: {
          field: 'value',
        },
      };

      await makeRequest(path, method, body);

      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://api.example.com/api/v1/test/path', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
      });
    });

    it('should handle non-JSON body', async () => {
      const path = 'test/path';
      const method = 'POST';
      const body = 'plain text body';

      await makeRequest(path, method, body);

      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://api.example.com/api/v1/test/path', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
      });
    });

    it('should handle null/undefined body', async () => {
      const path = 'test/path';
      const method = 'POST';

      await makeRequest(path, method, null);
      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://api.example.com/api/v1/test/path', {
        method: 'POST',
        body: 'null',
        headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
      });

      await makeRequest(path, method, undefined);
      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://api.example.com/api/v1/test/path', {
        method: 'POST',
        body: undefined,
        headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
      });
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
        json: () => Promise.resolve(mockProvider),
        ok: true,
      } as Response);

      const result = await getProviderFromCloud('test-provider');

      expect(result).toEqual({ ...mockProvider.config });
      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/providers/test-provider',
        {
          method: 'GET',
          body: undefined,
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
      );
    });

    it('should throw error when cloud config is not enabled', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(false);

      await expect(getProviderFromCloud('test-provider')).rejects.toThrow(
        'Could not fetch Provider test-provider from cloud. Cloud config is not enabled.',
      );
    });

    it('should throw error when provider fetch fails', async () => {
      mockFetchWithProxy.mockRejectedValueOnce(new Error('Network error'));

      await expect(getProviderFromCloud('test-provider')).rejects.toThrow(
        'Failed to fetch provider from cloud: test-provider.',
      );
    });

    it('should throw error when provider has no id', async () => {
      const mockProvider = {
        config: {
          label: 'Test Provider',
          // Missing id field
        },
      };

      mockFetchWithProxy.mockResolvedValueOnce({
        json: () => Promise.resolve({ buildDate: '2025-03-011' }),
      } as Response);

      mockFetchWithProxy.mockResolvedValueOnce({
        json: () => Promise.resolve(mockProvider),
      } as Response);

      await expect(getProviderFromCloud('test-provider')).rejects.toThrow(
        'Failed to fetch provider from cloud: test-provider.',
      );
    });
  });

  describe('getConfigFromCloud', () => {
    beforeEach(() => {
      mockCloudConfig.isEnabled.mockReturnValue(true);
    });

    it('should fetch unified config when formatted config is supported', async () => {
      const mockUnifiedConfig = {
        description: 'Test Config',
        providers: ['test-provider'],
        prompts: ['test prompt'],
        tests: [{ vars: { input: 'test' } }],
      };

      mockFetchWithProxy.mockResolvedValueOnce({
        json: () => Promise.resolve(mockUnifiedConfig),
        ok: true,
      } as Response);

      const result = await getConfigFromCloud('test-config');

      expect(result).toEqual(mockUnifiedConfig);
      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/redteam/configs/test-config/unified',
        {
          method: 'GET',
          body: undefined,
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
      );
    });

    it('should fetch unified config with target', async () => {
      const mockUnifiedConfig = {
        description: 'Test Config',
        providers: ['test-provider'],
        prompts: ['test prompt'],
        tests: [{ vars: { input: 'test' } }],
      };

      mockFetchWithProxy.mockResolvedValueOnce({
        json: () => Promise.resolve(mockUnifiedConfig),
        ok: true,
      } as Response);

      const result = await getConfigFromCloud('test-config', 'test-provider');

      expect(result).toEqual(mockUnifiedConfig);
      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/redteam/configs/test-config/unified?providerId=test-provider',
        {
          method: 'GET',
          body: undefined,
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
      );
    });

    it('should throw error when cloud config is not enabled', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(false);

      await expect(getConfigFromCloud('test-config')).rejects.toThrow(
        'Could not fetch Config test-config from cloud. Cloud config is not enabled.',
      );
    });

    it('should throw error when config fetch fails', async () => {
      mockFetchWithProxy.mockRejectedValueOnce(new Error('Network error'));

      await expect(getConfigFromCloud('test-config')).rejects.toThrow(
        'Failed to fetch config from cloud: test-config.',
      );
    });

    it('should throw error when response is not ok', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
        json: () => Promise.resolve({}),
      } as Response);

      await expect(getConfigFromCloud('test-config')).rejects.toThrow(
        'Failed to fetch config from cloud: test-config.',
      );
    });
  });

  describe('getPluginSeverityOverridesFromCloud', () => {
    beforeEach(() => {
      mockCloudConfig.isEnabled.mockReturnValue(true);
    });

    it('should fetch and parse plugin severity overrides successfully', async () => {
      const mockProvider = { pluginSeverityOverrideId: 'override-1' };
      const mockOverride = {
        id: 'override-1',
        members: [
          { pluginId: 'plugin1', severity: 'HIGH' },
          { pluginId: 'plugin2', severity: 'LOW' },
        ],
      };

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProvider),
      } as any);

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockOverride),
      } as any);

      const result = await getPluginSeverityOverridesFromCloud('test-provider');

      expect(result).toEqual({
        id: 'override-1',
        severities: {
          plugin1: 'HIGH',
          plugin2: 'LOW',
        },
      });
    });

    it('should return null when no override ID exists', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      } as any);

      const result = await getPluginSeverityOverridesFromCloud('test-provider');
      expect(result).toBeNull();
    });

    it('should throw error when cloud config is not enabled', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(false);

      await expect(getPluginSeverityOverridesFromCloud('test-provider')).rejects.toThrow(
        'Could not fetch plugin severity overrides from cloud. Cloud config is not enabled.',
      );
    });

    it('should throw error when provider fetch fails', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('Provider not found'),
      } as any);

      await expect(getPluginSeverityOverridesFromCloud('test-provider')).rejects.toThrow(
        'Failed to fetch plugin severity overrides from cloud.',
      );
    });

    it('should throw error when override fetch fails', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ pluginSeverityOverrideId: 'override-1' }),
      } as any);

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('Override not found'),
      } as any);

      await expect(getPluginSeverityOverridesFromCloud('test-provider')).rejects.toThrow(
        'Failed to fetch plugin severity overrides from cloud.',
      );
    });

    it('should handle empty members array', async () => {
      const mockProvider = { pluginSeverityOverrideId: 'override-1' };
      const mockOverride = { id: 'override-1', members: [] };

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProvider),
      } as any);

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockOverride),
      } as any);

      const result = await getPluginSeverityOverridesFromCloud('test-provider');

      expect(result).toEqual({
        id: 'override-1',
        severities: {},
      });
    });

    it('should fetch and parse plugin severity overrides with one member', async () => {
      const mockProvider = { pluginSeverityOverrideId: 'override-2' };
      const mockOverride = {
        id: 'override-2',
        members: [{ pluginId: 'pluginX', severity: 'MEDIUM' }],
      };

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProvider),
      } as any);

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockOverride),
      } as any);

      const result = await getPluginSeverityOverridesFromCloud('provider-2');
      expect(result).toEqual({
        id: 'override-2',
        severities: {
          pluginX: 'MEDIUM',
        },
      });
    });

    it('should handle override response with unexpected member fields', async () => {
      const mockProvider = { pluginSeverityOverrideId: 'override-3' };
      const mockOverride = {
        id: 'override-3',
        members: [
          { pluginId: 'pluginX', severity: 'LOW', extra: 'field' },
          { pluginId: 'pluginY', severity: 'HIGH' },
        ],
      };

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProvider),
      } as any);

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockOverride),
      } as any);

      const result = await getPluginSeverityOverridesFromCloud('provider-3');
      expect(result).toEqual({
        id: 'override-3',
        severities: {
          pluginX: 'LOW',
          pluginY: 'HIGH',
        },
      });
    });

    it('should throw error if first fetch throws synchronously', async () => {
      mockFetchWithProxy.mockImplementationOnce(() => {
        throw new Error('Synchronous fetch error');
      });

      await expect(getPluginSeverityOverridesFromCloud('provider-err')).rejects.toThrow(
        'Failed to fetch plugin severity overrides from cloud.',
      );
    });

    it('should throw error if second fetch throws synchronously', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ pluginSeverityOverrideId: 'override-err' }),
      } as any);

      mockFetchWithProxy.mockImplementationOnce(() => {
        throw new Error('Synchronous fetch error 2');
      });

      await expect(getPluginSeverityOverridesFromCloud('provider-err2')).rejects.toThrow(
        'Failed to fetch plugin severity overrides from cloud.',
      );
    });

    it('should throw error if first fetch rejects', async () => {
      mockFetchWithProxy.mockRejectedValueOnce(new Error('Async fetch error'));

      await expect(getPluginSeverityOverridesFromCloud('provider-err3')).rejects.toThrow(
        'Failed to fetch plugin severity overrides from cloud.',
      );
    });

    it('should throw error if second fetch rejects', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ pluginSeverityOverrideId: 'override-err4' }),
      } as any);

      mockFetchWithProxy.mockRejectedValueOnce(new Error('Async fetch error 2'));

      await expect(getPluginSeverityOverridesFromCloud('provider-err4')).rejects.toThrow(
        'Failed to fetch plugin severity overrides from cloud.',
      );
    });
  });

  describe('getDefaultTeam', () => {
    it('should return the oldest team', async () => {
      const mockTeams = [
        { id: 'team-3', name: 'Team 3', createdAt: '2023-01-03T00:00:00Z' },
        { id: 'team-1', name: 'Team 1', createdAt: '2023-01-01T00:00:00Z' },
        { id: 'team-2', name: 'Team 2', createdAt: '2023-01-02T00:00:00Z' },
      ];

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTeams),
      } as Response);

      const result = await getDefaultTeam();

      expect(result).toEqual({ id: 'team-1', name: 'Team 1', createdAt: '2023-01-01T00:00:00Z' });
      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/users/me/teams',
        {
          method: 'GET',
          body: undefined,
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
      );
    });

    it('should handle single team', async () => {
      const mockTeams = [
        { id: 'team-single', name: 'Single Team', createdAt: '2023-01-01T00:00:00Z' },
      ];

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTeams),
      } as Response);

      const result = await getDefaultTeam();

      expect(result).toEqual({
        id: 'team-single',
        name: 'Single Team',
        createdAt: '2023-01-01T00:00:00Z',
      });
    });

    it('should handle teams with same creation date', async () => {
      const mockTeams = [
        { id: 'team-a', name: 'Team A', createdAt: '2023-01-01T00:00:00Z' },
        { id: 'team-b', name: 'Team B', createdAt: '2023-01-01T00:00:00Z' },
      ];

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTeams),
      } as Response);

      const result = await getDefaultTeam();

      // Should return the first one when dates are the same
      expect(result).toEqual({ id: 'team-a', name: 'Team A', createdAt: '2023-01-01T00:00:00Z' });
    });

    it('should throw error when request fails', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: false,
        statusText: 'Unauthorized',
      } as Response);

      await expect(getDefaultTeam()).rejects.toThrow('Failed to get default team id: Unauthorized');
    });

    it('should throw error when fetch throws', async () => {
      mockFetchWithProxy.mockRejectedValueOnce(new Error('Network error'));

      await expect(getDefaultTeam()).rejects.toThrow('Network error');
    });

    it('should handle empty teams array', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);

      const result = await getDefaultTeam();

      expect(result).toBeUndefined();
    });
  });

  describe('checkCloudPermissions', () => {
    beforeEach(() => {
      mockCloudConfig.isEnabled.mockReturnValue(true);
      mockCheckServerFeatureSupport.mockResolvedValue(true);
    });

    it('should return early when cloud config is not enabled', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(false);

      await expect(
        checkCloudPermissions({ providers: ['test-provider'] }),
      ).resolves.toBeUndefined();

      expect(mockCheckServerFeatureSupport).not.toHaveBeenCalled();
      expect(mockFetchWithProxy).not.toHaveBeenCalled();
    });

    it('should return early with warning when no providers specified', async () => {
      await expect(checkCloudPermissions({})).resolves.toBeUndefined();

      expect(mockCheckServerFeatureSupport).not.toHaveBeenCalled();
      expect(mockFetchWithProxy).not.toHaveBeenCalled();
    });

    it('should return early when server feature is not supported', async () => {
      mockCheckServerFeatureSupport.mockResolvedValue(false);

      await expect(
        checkCloudPermissions({ providers: ['test-provider'] }),
      ).resolves.toBeUndefined();

      expect(mockCheckServerFeatureSupport).toHaveBeenCalledWith(
        'config-permission-check-endpoint',
        '2025-09-03T14:49:11Z',
      );
      expect(mockFetchWithProxy).not.toHaveBeenCalled();
    });

    it('should pass when permissions check succeeds', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response);

      await expect(
        checkCloudPermissions({ providers: ['test-provider'] }),
      ).resolves.toBeUndefined();

      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/permissions/check',
        {
          method: 'POST',
          body: JSON.stringify({ config: { providers: ['test-provider'] } }),
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
      );
    });

    it('should throw ConfigPermissionError when response is 403', async () => {
      const errorData = {
        errors: [
          { type: 'permission', id: 'access_denied', message: 'Access denied' },
          {
            type: 'permission',
            id: 'insufficient_permissions',
            message: 'Insufficient permissions',
          },
        ],
      };
      mockFetchWithProxy.mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve(errorData),
      } as Response);

      await expect(checkCloudPermissions({ providers: ['test-provider'] })).rejects.toThrow(
        ConfigPermissionError,
      );

      await expect(checkCloudPermissions({ providers: ['test-provider'] })).rejects.toThrow(
        'Permission denied: permission access_denied: Access denied, permission insufficient_permissions: Insufficient permissions',
      );
    });

    it('should throw ConfigPermissionError when response is 403 with single error', async () => {
      const errorData = { error: 'Single error message' };
      mockFetchWithProxy.mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve(errorData),
      } as Response);

      await expect(checkCloudPermissions({ providers: ['test-provider'] })).rejects.toThrow(
        ConfigPermissionError,
      );

      await expect(checkCloudPermissions({ providers: ['test-provider'] })).rejects.toThrow(
        'Permission denied: config unknown: Single error message',
      );
    });

    it('should throw ConfigPermissionError when response is 403 with malformed JSON', async () => {
      mockFetchWithProxy.mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.reject(new Error('Invalid JSON')),
      } as Response);

      await expect(checkCloudPermissions({ providers: ['test-provider'] })).rejects.toThrow(
        ConfigPermissionError,
      );

      await expect(checkCloudPermissions({ providers: ['test-provider'] })).rejects.toThrow(
        'Permission denied: config unknown: Unknown error',
      );
    });

    it('should log warning and continue for non-403 errors', async () => {
      const errorData = {
        errors: [{ type: 'server', id: 'internal_error', message: 'Server error' }],
      };
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve(errorData),
      } as Response);

      await expect(
        checkCloudPermissions({ providers: ['test-provider'] }),
      ).resolves.toBeUndefined();
    });

    it('should throw ConfigPermissionError when result contains errors', async () => {
      const resultWithErrors = {
        errors: [
          { type: 'config', id: 'validation_failed', message: 'Config validation failed' },
          { type: 'config', id: 'invalid_provider', message: 'Invalid provider' },
        ],
      };
      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(resultWithErrors),
      } as Response);

      await expect(checkCloudPermissions({ providers: ['test-provider'] })).rejects.toThrow(
        ConfigPermissionError,
      );

      await expect(checkCloudPermissions({ providers: ['test-provider'] })).rejects.toThrow(
        'Not able to continue with config: config validation_failed: Config validation failed, config invalid_provider: Invalid provider',
      );
    });

    it('should pass when result contains empty errors array', async () => {
      const resultWithEmptyErrors = { errors: [] };
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(resultWithEmptyErrors),
      } as Response);

      await expect(
        checkCloudPermissions({ providers: ['test-provider'] }),
      ).resolves.toBeUndefined();
    });

    it('should log warning and continue when server feature check throws', async () => {
      mockCheckServerFeatureSupport.mockRejectedValue(new Error('Server check failed'));

      await expect(
        checkCloudPermissions({ providers: ['test-provider'] }),
      ).resolves.toBeUndefined();

      expect(mockFetchWithProxy).not.toHaveBeenCalled();
    });

    it('should log warning and continue when fetch throws non-ConfigPermissionError', async () => {
      mockFetchWithProxy.mockRejectedValue(new Error('Network error'));

      await expect(
        checkCloudPermissions({ providers: ['test-provider'] }),
      ).resolves.toBeUndefined();
    });

    it('should re-throw ConfigPermissionError when makeRequest throws ConfigPermissionError', async () => {
      const configError = new ConfigPermissionError('Permission denied');
      mockFetchWithProxy.mockRejectedValue(configError);

      await expect(checkCloudPermissions({ providers: ['test-provider'] })).rejects.toThrow(
        ConfigPermissionError,
      );

      await expect(checkCloudPermissions({ providers: ['test-provider'] })).rejects.toThrow(
        'Permission denied',
      );
    });

    it('should handle complex config object', async () => {
      const complexConfig = {
        providers: ['provider1', 'provider2'],
        prompts: ['prompt1'],
        tests: [{ vars: { input: 'test' } }],
        redteam: { plugins: [{ id: 'plugin1' }] },
      };

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response);

      await expect(checkCloudPermissions(complexConfig)).resolves.toBeUndefined();

      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/permissions/check',
        {
          method: 'POST',
          body: JSON.stringify({ config: complexConfig }),
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
      );
    });

    it('should handle config with undefined providers', async () => {
      await expect(checkCloudPermissions({ providers: undefined })).resolves.toBeUndefined();

      expect(mockCheckServerFeatureSupport).not.toHaveBeenCalled();
      expect(mockFetchWithProxy).not.toHaveBeenCalled();
    });

    it('should handle config with empty providers array', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response);

      await expect(checkCloudPermissions({ providers: [] })).resolves.toBeUndefined();

      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/permissions/check',
        {
          method: 'POST',
          body: JSON.stringify({ config: { providers: [] } }),
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
      );
    });
  });
});
