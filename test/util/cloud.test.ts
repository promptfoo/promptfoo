import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { cloudConfig } from '../../src/globalConfig/cloud';
import * as cloudModule from '../../src/util/cloud';
import {
  ConfigPermissionError,
  checkCloudPermissions,
  createEvalInCloud,
  getCompletedPairsFromCloud,
  getConfigFromCloud,
  getDefaultTeam,
  getEvalFromCloud,
  getEvalSummaryFromCloud,
  getPluginSeverityOverridesFromCloud,
  getPoliciesFromCloud,
  getProviderFromCloud,
  makeRequest,
  streamResultsToCloud,
  validateLinkedTargetId,
} from '../../src/util/cloud';
import { fetchWithProxy } from '../../src/util/fetch/index';
import { checkServerFeatureSupport } from '../../src/util/server';

vi.mock('../../src/util/fetch/index.ts');
vi.mock('../../src/globalConfig/cloud');
vi.mock('../../src/util/server');
vi.mock('../../src/util/cloud', async () => {
  const actual =
    await vi.importActual<typeof import('../../src/util/cloud')>('../../src/util/cloud');
  return {
    ...actual,
    cloudCanBuildFormattedConfig: vi.fn().mockResolvedValue(true),
  };
});

describe('cloud utils', () => {
  const mockFetchWithProxy = vi.mocked(fetchWithProxy);
  const mockCloudConfig = vi.mocked(cloudConfig);
  const mockCheckServerFeatureSupport = vi.mocked(checkServerFeatureSupport);
  let mockMakeRequest: MockInstance;

  beforeEach(() => {
    vi.resetAllMocks();

    mockCloudConfig.getApiHost.mockReturnValue('https://api.example.com');
    mockCloudConfig.getApiKey.mockReturnValue('test-api-key');

    mockMakeRequest = vi.spyOn(cloudModule, 'makeRequest');
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

      mockFetchWithProxy.mockResolvedValueOnce({
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

      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/custom-policies/?id=policy-1&id=policy-2&id=policy-3&teamId=team-123',
        {
          method: 'GET',
          body: undefined,
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
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

      mockFetchWithProxy.mockResolvedValueOnce({
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

      mockFetchWithProxy.mockResolvedValueOnce({
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

      mockFetchWithProxy.mockResolvedValueOnce({
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
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);

      const result = await getPoliciesFromCloud([], 'team-empty');

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);

      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/custom-policies/?&teamId=team-empty',
        {
          method: 'GET',
          body: undefined,
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
      );
    });

    it('should throw error when cloud config is not enabled', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(false);

      await expect(getPoliciesFromCloud(['policy-1'], 'team-123')).rejects.toThrow(
        'Could not fetch policies from cloud. Cloud config is not enabled. Please run `promptfoo auth login` to login.',
      );

      expect(mockFetchWithProxy).not.toHaveBeenCalled();
    });

    it('should throw error when response is not ok', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
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
      mockFetchWithProxy.mockRejectedValueOnce(new Error('Network error'));

      await expect(getPoliciesFromCloud(['policy-1'], 'team-123')).rejects.toThrow(
        'Failed to fetch policies from cloud.',
      );
    });

    it('should throw error when response has invalid JSON', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
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

      mockFetchWithProxy.mockResolvedValueOnce({
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

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);

      await getPoliciesFromCloud(policyIds, 'team-multi');

      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/custom-policies/?id=policy-1&id=policy-2&id=policy-3&id=policy-4&id=policy-5&teamId=team-multi',
        {
          method: 'GET',
          body: undefined,
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
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

      mockFetchWithProxy.mockResolvedValueOnce({
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

      mockFetchWithProxy.mockResolvedValueOnce({
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

      mockFetchWithProxy.mockResolvedValueOnce({
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

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);

      await getPoliciesFromCloud(['policy-1'], specialTeamId);

      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        `https://api.example.com/api/v1/custom-policies/?id=policy-1&teamId=${specialTeamId}`,
        {
          method: 'GET',
          body: undefined,
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
      );
    });

    it('should handle HTTP error with detailed message', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
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

      await expect(getDefaultTeam()).rejects.toThrow('Failed to get user teams: Unauthorized');
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

  describe('validateLinkedTargetId', () => {
    beforeEach(() => {
      mockCloudConfig.isEnabled.mockReturnValue(true);
    });

    it('should accept valid linkedTargetId when cloud is enabled', async () => {
      const validLinkedTargetId = 'promptfoo://provider/12345678-1234-1234-1234-123456789abc';
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

      await expect(validateLinkedTargetId(validLinkedTargetId)).resolves.toBeUndefined();

      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/providers/12345678-1234-1234-1234-123456789abc',
        {
          method: 'GET',
          body: undefined,
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
      );
    });

    it('should warn but not fail when cloud is disabled', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(false);
      const validLinkedTargetId = 'promptfoo://provider/12345678-1234-1234-1234-123456789abc';

      await expect(validateLinkedTargetId(validLinkedTargetId)).resolves.toBeUndefined();

      // Should not make API call when cloud is disabled
      expect(mockFetchWithProxy).not.toHaveBeenCalled();
    });

    it('should throw error for invalid prefix', async () => {
      const invalidPrefix = 'wrong://provider/12345678-1234-1234-1234-123456789abc';

      const promise = validateLinkedTargetId(invalidPrefix);

      await expect(promise).rejects.toThrow('Invalid linkedTargetId format');
      await expect(promise).rejects.toThrow(invalidPrefix);
      await expect(promise).rejects.toThrow('promptfoo://provider/');
      await expect(promise).rejects.toThrow('To get a valid linkedTargetId:');
    });

    it('should throw error when target does not exist in cloud', async () => {
      const validLinkedTargetId = 'promptfoo://provider/12345678-1234-1234-1234-123456789abc';

      mockFetchWithProxy.mockRejectedValueOnce(new Error('Not found'));

      const promise = validateLinkedTargetId(validLinkedTargetId);

      await expect(promise).rejects.toThrow('linkedTargetId not found');
      await expect(promise).rejects.toThrow(validLinkedTargetId);
      await expect(promise).rejects.toThrow('Troubleshooting steps');
      await expect(promise).rejects.toThrow('promptfoo auth status');
    });

    it('should throw error when API returns non-ok response', async () => {
      const validLinkedTargetId = 'promptfoo://provider/12345678-1234-1234-1234-123456789abc';

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      const promise = validateLinkedTargetId(validLinkedTargetId);

      await expect(promise).rejects.toThrow('linkedTargetId not found');
      await expect(promise).rejects.toThrow(validLinkedTargetId);
      await expect(promise).rejects.toThrow('Troubleshooting steps');
    });

    it('should accept any ID format after valid prefix (defers to cloud)', async () => {
      // Cloud API will validate the actual format - we just check prefix
      const linkedTargetId = 'promptfoo://provider/any-id-format-here';
      const mockProvider = {
        config: {
          id: 'test-provider',
        },
      };

      mockFetchWithProxy.mockResolvedValueOnce({
        json: () => Promise.resolve(mockProvider),
        ok: true,
      } as Response);

      await expect(validateLinkedTargetId(linkedTargetId)).resolves.toBeUndefined();

      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/providers/any-id-format-here',
        {
          method: 'GET',
          body: undefined,
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
      );
    });
  });

  describe('getEvalFromCloud', () => {
    beforeEach(() => {
      mockCloudConfig.isEnabled.mockReturnValue(true);
    });

    it('should fetch eval successfully', async () => {
      const mockEval = {
        id: 'eval-123',
        config: {
          description: 'Test eval',
          providers: ['test-provider'],
          prompts: ['test prompt'],
          tests: [{ vars: { input: 'test' } }],
        },
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockEval),
      } as Response);

      const result = await getEvalFromCloud('eval-123');

      expect(result).toEqual(mockEval);
      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/results/eval-123',
        {
          method: 'GET',
          body: undefined,
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
      );
    });

    it('should throw error when cloud config is not enabled', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(false);

      await expect(getEvalFromCloud('eval-123')).rejects.toThrow(
        'Could not fetch eval eval-123 from cloud. Cloud config is not enabled.',
      );
    });

    it('should throw specific error when eval not found (404)', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not found'),
      } as Response);

      await expect(getEvalFromCloud('eval-123')).rejects.toThrow(
        'Eval eval-123 not found in cloud. It may have been deleted.',
      );
    });

    it('should throw error for other HTTP errors', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal server error'),
      } as Response);

      await expect(getEvalFromCloud('eval-123')).rejects.toThrow(
        'Failed to fetch eval from cloud: eval-123',
      );
    });

    it('should throw error when fetch fails', async () => {
      mockFetchWithProxy.mockRejectedValueOnce(new Error('Network error'));

      await expect(getEvalFromCloud('eval-123')).rejects.toThrow(
        'Failed to fetch eval from cloud: eval-123',
      );
    });
  });

  describe('getEvalSummaryFromCloud', () => {
    beforeEach(() => {
      mockCloudConfig.isEnabled.mockReturnValue(true);
    });

    it('should fetch and calculate summary correctly', async () => {
      const mockEval = {
        prompts: [
          {
            metrics: {
              testPassCount: 5,
              testFailCount: 2,
              testErrorCount: 1,
            },
          },
          {
            metrics: {
              testPassCount: 3,
              testFailCount: 1,
              testErrorCount: 0,
            },
          },
        ],
      };

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockEval),
      } as Response);

      const result = await getEvalSummaryFromCloud('eval-123');

      expect(result).toEqual({
        totalTests: 12,
        passCount: 8,
        failCount: 3,
        errorCount: 1,
        passRate: (8 / 12) * 100,
      });
    });

    it('should handle empty prompts array', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ prompts: [] }),
      } as Response);

      const result = await getEvalSummaryFromCloud('eval-123');

      expect(result).toEqual({
        totalTests: 0,
        passCount: 0,
        failCount: 0,
        errorCount: 0,
        passRate: 0,
      });
    });

    it('should return empty stats when cloud is not enabled', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(false);

      await expect(getEvalSummaryFromCloud('eval-123')).rejects.toThrow(
        'Could not fetch eval summary from cloud. Cloud config is not enabled.',
      );
    });

    it('should return empty stats on error (graceful degradation)', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      const result = await getEvalSummaryFromCloud('eval-123');

      expect(result).toEqual({
        totalTests: 0,
        passCount: 0,
        failCount: 0,
        errorCount: 0,
        passRate: 0,
      });
    });
  });

  describe('getCompletedPairsFromCloud', () => {
    beforeEach(() => {
      mockCloudConfig.isEnabled.mockReturnValue(true);
    });

    it('should fetch completed pairs successfully', async () => {
      const mockPairs = {
        pairs: ['0:0', '0:1', '1:0', '1:1', '2:0'],
      };

      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPairs),
      } as Response);

      const result = await getCompletedPairsFromCloud('eval-123');

      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(5);
      expect(result.has('0:0')).toBe(true);
      expect(result.has('2:0')).toBe(true);
      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/results/eval-123/completed-pairs',
        {
          method: 'GET',
          body: undefined,
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
      );
    });

    it('should return empty set for 404 (no results yet)', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not found'),
      } as Response);

      const result = await getCompletedPairsFromCloud('eval-123');

      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
    });

    it('should throw error when cloud config is not enabled', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(false);

      await expect(getCompletedPairsFromCloud('eval-123')).rejects.toThrow(
        'Could not fetch completed pairs from cloud. Cloud config is not enabled.',
      );
    });

    it('should throw error for other HTTP errors', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal server error'),
      } as Response);

      await expect(getCompletedPairsFromCloud('eval-123')).rejects.toThrow(
        'Failed to fetch completed pairs from cloud: eval-123',
      );
    });

    it('should handle empty pairs array', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ pairs: [] }),
      } as Response);

      const result = await getCompletedPairsFromCloud('eval-123');

      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
    });
  });

  describe('createEvalInCloud', () => {
    beforeEach(() => {
      mockCloudConfig.isEnabled.mockReturnValue(true);
    });

    it('should create eval successfully', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'new-eval-123' }),
      } as Response);

      const evalData = {
        config: {
          description: 'Test eval',
          providers: ['test-provider'],
          prompts: ['test prompt'],
          tests: [{ vars: { input: 'test' } }],
        },
        createdAt: new Date('2024-01-01T00:00:00Z'),
        author: 'test-user',
      };

      const result = await createEvalInCloud(evalData);

      expect(result).toBe('new-eval-123');
      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://api.example.com/api/v1/results', {
        method: 'POST',
        body: JSON.stringify({
          ...evalData,
          results: [],
          prompts: [],
        }),
        headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
      });
    });

    it('should throw error when cloud config is not enabled', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(false);

      await expect(
        createEvalInCloud({
          config: { providers: [] },
          createdAt: new Date(),
        }),
      ).rejects.toThrow('Could not create eval in cloud. Cloud config is not enabled.');
    });

    it('should throw error when response is not ok', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal server error'),
      } as Response);

      await expect(
        createEvalInCloud({
          config: { providers: [] },
          createdAt: new Date(),
        }),
      ).rejects.toThrow('Failed to create eval in cloud: Internal server error');
    });

    it('should throw error when no id returned', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response);

      await expect(
        createEvalInCloud({
          config: { providers: [] },
          createdAt: new Date(),
        }),
      ).rejects.toThrow('Cloud did not return an eval ID');
    });
  });

  describe('streamResultsToCloud', () => {
    beforeEach(() => {
      mockCloudConfig.isEnabled.mockReturnValue(true);
    });

    it('should stream results successfully', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response);

      const results = [
        {
          success: true,
          score: 1,
          response: { output: 'test' },
          provider: { id: () => 'test-provider', label: 'Test' },
          prompt: { raw: 'test prompt', label: 'Test Prompt' },
          testIdx: 0,
          promptIdx: 0,
        },
      ];

      await streamResultsToCloud('eval-123', results as any);

      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/results/eval-123/results',
        {
          method: 'POST',
          body: JSON.stringify(results),
          headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
        },
      );
    });

    it('should skip streaming when results array is empty', async () => {
      await streamResultsToCloud('eval-123', []);

      expect(mockFetchWithProxy).not.toHaveBeenCalled();
    });

    it('should throw error when cloud config is not enabled', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(false);

      await expect(streamResultsToCloud('eval-123', [{ success: true } as any])).rejects.toThrow(
        'Could not stream results to cloud. Cloud config is not enabled.',
      );
    });

    it('should throw error when response is not ok', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal server error'),
      } as Response);

      await expect(streamResultsToCloud('eval-123', [{ success: true } as any])).rejects.toThrow(
        'Failed to stream results to cloud: Internal server error',
      );
    });

    it('should stream multiple results', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response);

      const results = [
        { success: true, testIdx: 0, promptIdx: 0 },
        { success: false, testIdx: 1, promptIdx: 0 },
        { success: true, testIdx: 2, promptIdx: 0 },
      ];

      await streamResultsToCloud('eval-123', results as any);

      expect(mockFetchWithProxy).toHaveBeenCalledTimes(1);
      const callBody = JSON.parse((mockFetchWithProxy.mock.calls[0] as any)[1].body);
      expect(callBody).toHaveLength(3);
    });
  });
});
