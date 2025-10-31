import { cloudConfig } from '../../src/globalConfig/cloud';
import * as cloudModule from '../../src/util/cloud';
import {
  ConfigPermissionError,
  checkCloudPermissions,
  getConfigFromCloud,
  getDefaultTeam,
  getPluginSeverityOverridesFromCloud,
  getPoliciesFromCloud,
  getProviderFromCloud,
  makeRequest,
} from '../../src/util/cloud';
import { fetchWithRetries } from '../../src/util/fetch/index';
import { checkServerFeatureSupport } from '../../src/util/server';

jest.mock('../../src/util/fetch/index.ts');
jest.mock('../../src/globalConfig/cloud');
jest.mock('../../src/util/server');
jest.mock('../../src/util/cloud', () => ({
  ...jest.requireActual('../../src/util/cloud'),
  cloudCanBuildFormattedConfig: jest.fn().mockResolvedValue(true),
}));

describe('cloud utils', () => {
  const EXPECTED_TIMEOUT_MS = 300_000;
  const mockFetchWithRetries = jest.mocked(fetchWithRetries);
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

      expect(mockFetchWithRetries).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/test/path',
        {
          method: 'POST',
          body: JSON.stringify(body),
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
        EXPECTED_TIMEOUT_MS,
      );
    });

    it('should make GET request without body', async () => {
      const path = 'test/path';
      const method = 'GET';

      await makeRequest(path, method);

      expect(mockFetchWithRetries).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/test/path',
        {
          method: 'GET',
          body: undefined,
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
        EXPECTED_TIMEOUT_MS,
      );
    });

    it('should handle undefined API key', async () => {
      mockCloudConfig.getApiKey.mockReturnValue(undefined);

      const path = 'test/path';
      const method = 'GET';

      await makeRequest(path, method);

      expect(mockFetchWithRetries).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/test/path',
        {
          method: 'GET',
          body: undefined,
          headers: { Authorization: 'Bearer undefined', 'Content-Type': 'application/json' },
        },
        EXPECTED_TIMEOUT_MS,
      );
    });

    it('should handle empty path', async () => {
      const path = '';
      const method = 'GET';

      await makeRequest(path, method);

      expect(mockFetchWithRetries).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/',
        {
          method: 'GET',
          body: undefined,
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
        EXPECTED_TIMEOUT_MS,
      );
    });

    it('should handle API host without trailing slash', async () => {
      mockCloudConfig.getApiHost.mockReturnValue('https://api.example.com');

      const path = 'test/path';
      const method = 'GET';

      await makeRequest(path, method);

      expect(mockFetchWithRetries).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/test/path',
        expect.any(Object),
        EXPECTED_TIMEOUT_MS,
      );
    });

    it('should handle API host with trailing slash', async () => {
      mockCloudConfig.getApiHost.mockReturnValue('https://api.example.com');

      const path = 'test/path';
      const method = 'GET';

      await makeRequest(path, method);

      expect(mockFetchWithRetries).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/test/path',
        expect.any(Object),
        EXPECTED_TIMEOUT_MS,
      );
    });

    it('should handle path with leading slash', async () => {
      const path = '/test/path';
      const method = 'GET';

      await makeRequest(path, method);

      expect(mockFetchWithRetries).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/test/path',
        {
          method: 'GET',
          body: undefined,
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
        EXPECTED_TIMEOUT_MS,
      );
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

      expect(mockFetchWithRetries).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/test/path',
        {
          method: 'POST',
          body: JSON.stringify(body),
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
        EXPECTED_TIMEOUT_MS,
      );
    });

    it('should handle non-JSON body', async () => {
      const path = 'test/path';
      const method = 'POST';
      const body = 'plain text body';

      await makeRequest(path, method, body);

      expect(mockFetchWithRetries).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/test/path',
        {
          method: 'POST',
          body: JSON.stringify(body),
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
        EXPECTED_TIMEOUT_MS,
      );
    });

    it('should handle null/undefined body', async () => {
      const path = 'test/path';
      const method = 'POST';

      await makeRequest(path, method, null);
      expect(mockFetchWithRetries).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/test/path',
        {
          method: 'POST',
          body: 'null',
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
        EXPECTED_TIMEOUT_MS,
      );

      await makeRequest(path, method, undefined);
      expect(mockFetchWithRetries).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/test/path',
        {
          method: 'POST',
          body: undefined,
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
        EXPECTED_TIMEOUT_MS,
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

      mockFetchWithRetries.mockResolvedValueOnce({
        json: () => Promise.resolve(mockProvider),
        ok: true,
      } as Response);

      const result = await getProviderFromCloud('test-provider');

      expect(result).toEqual({ ...mockProvider.config });
      expect(mockFetchWithRetries).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/providers/test-provider',
        {
          method: 'GET',
          body: undefined,
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
        EXPECTED_TIMEOUT_MS,
      );
    });

    it('should throw error when cloud config is not enabled', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(false);

      await expect(getProviderFromCloud('test-provider')).rejects.toThrow(
        'Could not fetch Provider test-provider from cloud. Cloud config is not enabled.',
      );
    });

    it('should throw error when provider fetch fails', async () => {
      mockFetchWithRetries.mockRejectedValueOnce(new Error('Network error'));

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

      mockFetchWithRetries.mockResolvedValueOnce({
        json: () => Promise.resolve({ buildDate: '2025-03-011' }),
      } as Response);

      mockFetchWithRetries.mockResolvedValueOnce({
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

      mockFetchWithRetries.mockResolvedValueOnce({
        json: () => Promise.resolve(mockUnifiedConfig),
        ok: true,
      } as Response);

      const result = await getConfigFromCloud('test-config');

      expect(result).toEqual(mockUnifiedConfig);
      expect(mockFetchWithRetries).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/redteam/configs/test-config/unified',
        {
          method: 'GET',
          body: undefined,
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
        EXPECTED_TIMEOUT_MS,
      );
    });

    it('should fetch unified config with target', async () => {
      const mockUnifiedConfig = {
        description: 'Test Config',
        providers: ['test-provider'],
        prompts: ['test prompt'],
        tests: [{ vars: { input: 'test' } }],
      };

      mockFetchWithRetries.mockResolvedValueOnce({
        json: () => Promise.resolve(mockUnifiedConfig),
        ok: true,
      } as Response);

      const result = await getConfigFromCloud('test-config', 'test-provider');

      expect(result).toEqual(mockUnifiedConfig);
      expect(mockFetchWithRetries).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/redteam/configs/test-config/unified?providerId=test-provider',
        {
          method: 'GET',
          body: undefined,
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
        EXPECTED_TIMEOUT_MS,
      );
    });

    it('should throw error when cloud config is not enabled', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(false);

      await expect(getConfigFromCloud('test-config')).rejects.toThrow(
        'Could not fetch Config test-config from cloud. Cloud config is not enabled.',
      );
    });

    it('should throw error when config fetch fails', async () => {
      mockFetchWithRetries.mockRejectedValueOnce(new Error('Network error'));

      await expect(getConfigFromCloud('test-config')).rejects.toThrow(
        'Failed to fetch config from cloud: test-config.',
      );
    });

    it('should throw error when response is not ok', async () => {
      mockFetchWithRetries.mockResolvedValueOnce({
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

      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProvider),
      } as any);

      mockFetchWithRetries.mockResolvedValueOnce({
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
      mockFetchWithRetries.mockResolvedValueOnce({
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
      mockFetchWithRetries.mockResolvedValueOnce({
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
      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ pluginSeverityOverrideId: 'override-1' }),
      } as any);

      mockFetchWithRetries.mockResolvedValueOnce({
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

      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProvider),
      } as any);

      mockFetchWithRetries.mockResolvedValueOnce({
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

      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProvider),
      } as any);

      mockFetchWithRetries.mockResolvedValueOnce({
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

      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProvider),
      } as any);

      mockFetchWithRetries.mockResolvedValueOnce({
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
      mockFetchWithRetries.mockImplementationOnce(() => {
        throw new Error('Synchronous fetch error');
      });

      await expect(getPluginSeverityOverridesFromCloud('provider-err')).rejects.toThrow(
        'Failed to fetch plugin severity overrides from cloud.',
      );
    });

    it('should throw error if second fetch throws synchronously', async () => {
      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ pluginSeverityOverrideId: 'override-err' }),
      } as any);

      mockFetchWithRetries.mockImplementationOnce(() => {
        throw new Error('Synchronous fetch error 2');
      });

      await expect(getPluginSeverityOverridesFromCloud('provider-err2')).rejects.toThrow(
        'Failed to fetch plugin severity overrides from cloud.',
      );
    });

    it('should throw error if first fetch rejects', async () => {
      mockFetchWithRetries.mockRejectedValueOnce(new Error('Async fetch error'));

      await expect(getPluginSeverityOverridesFromCloud('provider-err3')).rejects.toThrow(
        'Failed to fetch plugin severity overrides from cloud.',
      );
    });

    it('should throw error if second fetch rejects', async () => {
      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ pluginSeverityOverrideId: 'override-err4' }),
      } as any);

      mockFetchWithRetries.mockRejectedValueOnce(new Error('Async fetch error 2'));

      await expect(getPluginSeverityOverridesFromCloud('provider-err4')).rejects.toThrow(
        'Failed to fetch plugin severity overrides from cloud.',
      );
    });
  });

  describe('getPoliciesFromCloud', () => {
    beforeEach(() => {
      mockCloudConfig.isEnabled.mockReturnValue(true);
    });

    it('should fetch and parse policies successfully with name attribute', async () => {
      const mockPolicies = [
        {
          id: 'policy-1',
          text: 'Policy text 1',
          name: 'Policy Name 1',
          severity: 'high',
        },
        {
          id: 'policy-2',
          text: 'Policy text 2',
          name: 'Policy Name 2',
          severity: 'medium',
        },
        {
          id: 'policy-3',
          text: 'Policy text 3',
          name: 'Policy Name 3',
          severity: 'low',
        },
      ];

      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPolicies),
      } as Response);

      const result = await getPoliciesFromCloud(['policy-1', 'policy-2', 'policy-3'], 'team-123');

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(3);

      expect(result.get('policy-1')).toEqual({
        text: 'Policy text 1',
        name: 'Policy Name 1',
        severity: 'high',
      });

      expect(result.get('policy-2')).toEqual({
        text: 'Policy text 2',
        name: 'Policy Name 2',
        severity: 'medium',
      });

      expect(result.get('policy-3')).toEqual({
        text: 'Policy text 3',
        name: 'Policy Name 3',
        severity: 'low',
      });

      expect(mockFetchWithRetries).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/custom-policies/?id=policy-1&id=policy-2&id=policy-3&teamId=team-123',
        {
          method: 'GET',
          body: undefined,
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
        EXPECTED_TIMEOUT_MS,
      );
    });

    it('should handle single policy with name attribute', async () => {
      const mockPolicies = [
        {
          id: 'single-policy',
          text: 'Single policy text',
          name: 'Single Policy Name',
          severity: 'critical',
        },
      ];

      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPolicies),
      } as Response);

      const result = await getPoliciesFromCloud(['single-policy'], 'team-456');

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(1);
      expect(result.get('single-policy')).toEqual({
        text: 'Single policy text',
        name: 'Single Policy Name',
        severity: 'critical',
      });
    });

    it('should handle policies with long names', async () => {
      const longName =
        'This is a very long policy name that contains many words and should be handled properly by the system';
      const mockPolicies = [
        {
          id: 'long-name-policy',
          text: 'Policy with long name',
          name: longName,
          severity: 'high',
        },
      ];

      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPolicies),
      } as Response);

      const result = await getPoliciesFromCloud(['long-name-policy'], 'team-789');

      expect(result.get('long-name-policy')).toEqual({
        text: 'Policy with long name',
        name: longName,
        severity: 'high',
      });
    });

    it('should handle policies with special characters in names', async () => {
      const mockPolicies = [
        {
          id: 'special-chars-policy',
          text: 'Policy text',
          name: 'Policy with special chars: @#$%^&*()_+[]{}|;\':",.<>?/',
          severity: 'medium',
        },
      ];

      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPolicies),
      } as Response);

      const result = await getPoliciesFromCloud(['special-chars-policy'], 'team-special');

      expect(result.get('special-chars-policy')).toEqual({
        text: 'Policy text',
        name: 'Policy with special chars: @#$%^&*()_+[]{}|;\':",.<>?/',
        severity: 'medium',
      });
    });

    it('should handle empty policy list', async () => {
      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);

      const result = await getPoliciesFromCloud([], 'team-empty');

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);

      expect(mockFetchWithRetries).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/custom-policies/?&teamId=team-empty',
        {
          method: 'GET',
          body: undefined,
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
        EXPECTED_TIMEOUT_MS,
      );
    });

    it('should throw error when cloud config is not enabled', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(false);

      await expect(getPoliciesFromCloud(['policy-1'], 'team-123')).rejects.toThrow(
        'Could not fetch policies from cloud. Cloud config is not enabled. Please run `promptfoo auth login` to login.',
      );

      expect(mockFetchWithRetries).not.toHaveBeenCalled();
    });

    it('should throw error when response is not ok', async () => {
      mockFetchWithRetries.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('Policies not found'),
      } as Response);

      await expect(getPoliciesFromCloud(['policy-1'], 'team-123')).rejects.toThrow(
        'Failed to fetch policies from cloud.',
      );
    });

    it('should throw error when fetch rejects', async () => {
      mockFetchWithRetries.mockRejectedValueOnce(new Error('Network error'));

      await expect(getPoliciesFromCloud(['policy-1'], 'team-123')).rejects.toThrow(
        'Failed to fetch policies from cloud.',
      );
    });

    it('should throw error when response has invalid JSON', async () => {
      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON')),
      } as Response);

      await expect(getPoliciesFromCloud(['policy-1'], 'team-123')).rejects.toThrow(
        'Failed to fetch policies from cloud.',
      );
    });

    it('should handle multiple policies with different severities and names', async () => {
      const mockPolicies = [
        {
          id: 'critical-policy',
          text: 'Critical policy text',
          name: 'Critical Security Policy',
          severity: 'critical',
        },
        {
          id: 'high-policy',
          text: 'High policy text',
          name: 'High Priority Policy',
          severity: 'high',
        },
        {
          id: 'medium-policy',
          text: 'Medium policy text',
          name: 'Medium Risk Policy',
          severity: 'medium',
        },
        {
          id: 'low-policy',
          text: 'Low policy text',
          name: 'Low Impact Policy',
          severity: 'low',
        },
      ];

      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPolicies),
      } as Response);

      const result = await getPoliciesFromCloud(
        ['critical-policy', 'high-policy', 'medium-policy', 'low-policy'],
        'team-all-severities',
      );

      expect(result.size).toBe(4);

      expect(result.get('critical-policy')).toEqual({
        text: 'Critical policy text',
        name: 'Critical Security Policy',
        severity: 'critical',
      });

      expect(result.get('high-policy')).toEqual({
        text: 'High policy text',
        name: 'High Priority Policy',
        severity: 'high',
      });

      expect(result.get('medium-policy')).toEqual({
        text: 'Medium policy text',
        name: 'Medium Risk Policy',
        severity: 'medium',
      });

      expect(result.get('low-policy')).toEqual({
        text: 'Low policy text',
        name: 'Low Impact Policy',
        severity: 'low',
      });
    });

    it('should properly encode multiple policy IDs in URL', async () => {
      const policyIds = ['policy-1', 'policy-2', 'policy-3', 'policy-4', 'policy-5'];

      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);

      await getPoliciesFromCloud(policyIds, 'team-multi');

      expect(mockFetchWithRetries).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/custom-policies/?id=policy-1&id=policy-2&id=policy-3&id=policy-4&id=policy-5&teamId=team-multi',
        {
          method: 'GET',
          body: undefined,
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
        EXPECTED_TIMEOUT_MS,
      );
    });

    it('should handle policies with empty names', async () => {
      const mockPolicies = [
        {
          id: 'empty-name-policy',
          text: 'Policy with empty name',
          name: '',
          severity: 'high',
        },
      ];

      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPolicies),
      } as Response);

      const result = await getPoliciesFromCloud(['empty-name-policy'], 'team-empty-name');

      expect(result.get('empty-name-policy')).toEqual({
        text: 'Policy with empty name',
        name: '',
        severity: 'high',
      });
    });

    it('should handle policies with unicode characters in names', async () => {
      const mockPolicies = [
        {
          id: 'unicode-policy',
          text: 'Unicode policy text',
          name: 'Policy with unicode: 你好世界 🌍 مرحبا العالم',
          severity: 'medium',
        },
      ];

      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPolicies),
      } as Response);

      const result = await getPoliciesFromCloud(['unicode-policy'], 'team-unicode');

      expect(result.get('unicode-policy')).toEqual({
        text: 'Unicode policy text',
        name: 'Policy with unicode: 你好世界 🌍 مرحبا العالم',
        severity: 'medium',
      });
    });

    it('should handle response with missing fields gracefully', async () => {
      const mockPolicies = [
        {
          id: 'incomplete-policy',
          text: 'Incomplete policy text',
          // name field might be missing in some edge cases
          severity: 'high',
        },
      ];

      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPolicies),
      } as Response);

      const result = await getPoliciesFromCloud(['incomplete-policy'], 'team-incomplete');

      // The function should still work even if name is undefined
      expect(result.get('incomplete-policy')).toEqual({
        text: 'Incomplete policy text',
        name: undefined,
        severity: 'high',
      });
    });

    it('should handle team IDs with special characters', async () => {
      const specialTeamId = 'team-123-@#$%';

      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);

      await getPoliciesFromCloud(['policy-1'], specialTeamId);

      expect(mockFetchWithRetries).toHaveBeenCalledWith(
        `https://api.example.com/api/v1/custom-policies/?id=policy-1&teamId=${specialTeamId}`,
        {
          method: 'GET',
          body: undefined,
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
        EXPECTED_TIMEOUT_MS,
      );
    });

    it('should handle HTTP error with detailed message', async () => {
      mockFetchWithRetries.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Database connection failed'),
      } as Response);

      await expect(getPoliciesFromCloud(['policy-1'], 'team-error')).rejects.toThrow(
        'Failed to fetch policies from cloud.',
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

      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTeams),
      } as Response);

      const result = await getDefaultTeam();

      expect(result).toEqual({ id: 'team-1', name: 'Team 1', createdAt: '2023-01-01T00:00:00Z' });
      expect(mockFetchWithRetries).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/users/me/teams',
        {
          method: 'GET',
          body: undefined,
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
        EXPECTED_TIMEOUT_MS,
      );
    });

    it('should handle single team', async () => {
      const mockTeams = [
        { id: 'team-single', name: 'Single Team', createdAt: '2023-01-01T00:00:00Z' },
      ];

      mockFetchWithRetries.mockResolvedValueOnce({
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

      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTeams),
      } as Response);

      const result = await getDefaultTeam();

      // Should return the first one when dates are the same
      expect(result).toEqual({ id: 'team-a', name: 'Team A', createdAt: '2023-01-01T00:00:00Z' });
    });

    it('should throw error when request fails', async () => {
      mockFetchWithRetries.mockResolvedValueOnce({
        ok: false,
        statusText: 'Unauthorized',
      } as Response);

      await expect(getDefaultTeam()).rejects.toThrow('Failed to get user teams: Unauthorized');
    });

    it('should throw error when fetch throws', async () => {
      mockFetchWithRetries.mockRejectedValueOnce(new Error('Network error'));

      await expect(getDefaultTeam()).rejects.toThrow('Network error');
    });

    it('should handle empty teams array', async () => {
      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);

      await expect(getDefaultTeam()).rejects.toThrow('No teams found for user');
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
      expect(mockFetchWithRetries).not.toHaveBeenCalled();
    });

    it('should return early with warning when no providers specified', async () => {
      await expect(checkCloudPermissions({})).resolves.toBeUndefined();

      expect(mockCheckServerFeatureSupport).not.toHaveBeenCalled();
      expect(mockFetchWithRetries).not.toHaveBeenCalled();
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
      expect(mockFetchWithRetries).not.toHaveBeenCalled();
    });

    it('should pass when permissions check succeeds', async () => {
      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response);

      await expect(
        checkCloudPermissions({ providers: ['test-provider'] }),
      ).resolves.toBeUndefined();

      expect(mockFetchWithRetries).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/permissions/check',
        {
          method: 'POST',
          body: JSON.stringify({ config: { providers: ['test-provider'] } }),
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
        EXPECTED_TIMEOUT_MS,
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
      mockFetchWithRetries.mockResolvedValue({
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
      mockFetchWithRetries.mockResolvedValue({
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
      mockFetchWithRetries.mockResolvedValue({
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
      mockFetchWithRetries.mockResolvedValueOnce({
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
      mockFetchWithRetries.mockResolvedValue({
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
      mockFetchWithRetries.mockResolvedValueOnce({
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

      expect(mockFetchWithRetries).not.toHaveBeenCalled();
    });

    it('should log warning and continue when fetch throws non-ConfigPermissionError', async () => {
      mockFetchWithRetries.mockRejectedValue(new Error('Network error'));

      await expect(
        checkCloudPermissions({ providers: ['test-provider'] }),
      ).resolves.toBeUndefined();
    });

    it('should re-throw ConfigPermissionError when makeRequest throws ConfigPermissionError', async () => {
      const configError = new ConfigPermissionError('Permission denied');
      mockFetchWithRetries.mockRejectedValue(configError);

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

      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response);

      await expect(checkCloudPermissions(complexConfig)).resolves.toBeUndefined();

      expect(mockFetchWithRetries).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/permissions/check',
        {
          method: 'POST',
          body: JSON.stringify({ config: complexConfig }),
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
        EXPECTED_TIMEOUT_MS,
      );
    });

    it('should handle config with undefined providers', async () => {
      await expect(checkCloudPermissions({ providers: undefined })).resolves.toBeUndefined();

      expect(mockCheckServerFeatureSupport).not.toHaveBeenCalled();
      expect(mockFetchWithRetries).not.toHaveBeenCalled();
    });

    it('should handle config with empty providers array', async () => {
      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response);

      await expect(checkCloudPermissions({ providers: [] })).resolves.toBeUndefined();

      expect(mockFetchWithRetries).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/permissions/check',
        {
          method: 'POST',
          body: JSON.stringify({ config: { providers: [] } }),
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
        EXPECTED_TIMEOUT_MS,
      );
    });
  });
});
