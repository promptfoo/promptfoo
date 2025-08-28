import { fetchWithProxy } from '../../src/fetch';
import { cloudConfig } from '../../src/globalConfig/cloud';
import {
  canCreateTargets,
  getConfigFromCloud,
  getDefaultTeam,
  getPluginSeverityOverridesFromCloud,
  getProviderFromCloud,
  makeRequest,
} from '../../src/util/cloud';

jest.mock('../../src/fetch');
jest.mock('../../src/globalConfig/cloud');
jest.mock('../../src/util/cloud', () => ({
  ...jest.requireActual('../../src/util/cloud'),
  cloudCanBuildFormattedConfig: jest.fn().mockResolvedValue(true),
}));

describe('cloud utils', () => {
  const mockFetchWithProxy = jest.mocked(fetchWithProxy);
  const mockCloudConfig = cloudConfig as jest.Mocked<typeof cloudConfig>;

  beforeEach(() => {
    jest.resetAllMocks();

    mockCloudConfig.getApiHost.mockReturnValue('https://api.example.com');
    mockCloudConfig.getApiKey.mockReturnValue('test-api-key');
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
        headers: { Authorization: 'Bearer test-api-key' },
      });
    });

    it('should make GET request without body', async () => {
      const path = 'test/path';
      const method = 'GET';

      await makeRequest(path, method);

      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://api.example.com/api/v1/test/path', {
        method: 'GET',
        body: undefined,
        headers: { Authorization: 'Bearer test-api-key' },
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
        headers: { Authorization: 'Bearer undefined' },
      });
    });

    it('should handle empty path', async () => {
      const path = '';
      const method = 'GET';

      await makeRequest(path, method);

      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://api.example.com/api/v1/', {
        method: 'GET',
        body: undefined,
        headers: { Authorization: 'Bearer test-api-key' },
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
        headers: { Authorization: 'Bearer test-api-key' },
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
        headers: { Authorization: 'Bearer test-api-key' },
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
        headers: { Authorization: 'Bearer test-api-key' },
      });
    });

    it('should handle null/undefined body', async () => {
      const path = 'test/path';
      const method = 'POST';

      await makeRequest(path, method, null);
      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://api.example.com/api/v1/test/path', {
        method: 'POST',
        body: 'null',
        headers: { Authorization: 'Bearer test-api-key' },
      });

      await makeRequest(path, method, undefined);
      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://api.example.com/api/v1/test/path', {
        method: 'POST',
        body: undefined,
        headers: { Authorization: 'Bearer test-api-key' },
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
          headers: { Authorization: 'Bearer test-api-key' },
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
          headers: { Authorization: 'Bearer test-api-key' },
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
          headers: { Authorization: 'Bearer test-api-key' },
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
          headers: { Authorization: 'Bearer test-api-key' },
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

  describe('canCreateTargets', () => {
    it('should return true when user has create Provider ability', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(true);

      const mockAbilities = [
        { action: 'read', subject: 'Provider' },
        { action: 'create', subject: 'Provider' },
        { action: 'update', subject: 'Provider' },
      ];

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAbilities),
      } as Response);

      const result = await canCreateTargets('team-123');

      expect(result).toBe(true);
      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/users/me/abilities?teamId=team-123',
        {
          method: 'GET',
          headers: { Authorization: 'Bearer test-api-key' },
        },
      );
    });

    it('should return false when user does not have create Target ability', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(true);

      const mockAbilities = [
        { action: 'read', subject: 'Provider' },
        { action: 'update', subject: 'Provider' },
      ];

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAbilities),
      } as Response);

      const result = await canCreateTargets('team-123');

      expect(result).toBe(false);
    });

    it('should fetch default team when teamId is not provided', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(true);

      const mockTeams = [
        { id: 'default-team', name: 'Default Team', createdAt: '2023-01-01T00:00:00Z' },
      ];
      const mockAbilities = [{ action: 'create', subject: 'Provider' }];

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTeams),
      } as Response);

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAbilities),
      } as Response);

      const result = await canCreateTargets(undefined);

      expect(result).toBe(true);
      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/users/me/abilities?teamId=default-team',
        {
          method: 'GET',
          headers: { Authorization: 'Bearer test-api-key' },
        },
      );
    });

    it('should return true when cloud config is not enabled', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(false);

      const result = await canCreateTargets('team-123');

      expect(result).toBe(true);
      expect(mockFetchWithProxy).not.toHaveBeenCalled();
    });

    it('should handle empty abilities array', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(true);

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);

      const result = await canCreateTargets('team-123');

      expect(result).toBe(false);
    });

    it('should handle abilities with different subjects', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(true);

      const mockAbilities = [
        { action: 'create', subject: 'User' },
        { action: 'create', subject: 'Team' },
        { action: 'read', subject: 'Provider' },
      ];

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAbilities),
      } as Response);

      const result = await canCreateTargets('team-123');

      expect(result).toBe(false);
    });

    it('should throw error when request fails', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(true);

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: false,
        statusText: 'Forbidden',
      } as Response);

      await expect(canCreateTargets('team-123')).rejects.toThrow(
        'Failed to check provider permissions: Forbidden',
      );
    });

    it('should throw error when fetch throws', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(true);

      mockFetchWithProxy.mockRejectedValueOnce(new Error('Network error'));

      await expect(canCreateTargets('team-123')).rejects.toThrow('Network error');
    });

    it('should handle case-sensitive action and subject matching', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(true);

      const mockAbilities = [
        { action: 'CREATE', subject: 'Provider' }, // uppercase action
        { action: 'create', subject: 'provider' }, // lowercase subject
      ];

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAbilities),
      } as Response);

      const result = await canCreateTargets('team-123');

      expect(result).toBe(false); // Should not match due to case sensitivity
    });
  });
});
