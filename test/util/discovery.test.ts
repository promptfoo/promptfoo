import { cloudConfig } from '../../src/globalConfig/cloud';
import * as cloudModule from '../../src/util/cloud';
import {
  mapDiscoveryToApplicationDescription,
  saveDiscoveryToCloud,
  type ApplicationDescription,
} from '../../src/util/discovery';
import logger from '../../src/logger';
import type { ApiProvider, UnifiedConfig } from '../../src/types';
import type { TargetPurposeDiscoveryResult } from '../../src/redteam/commands/discover';

// Mock dependencies
jest.mock('../../src/globalConfig/cloud');
jest.mock('../../src/util/cloud');
jest.mock('../../src/logger');

describe('Discovery Persistence Service', () => {
  const mockCloudConfig = cloudConfig as jest.Mocked<typeof cloudConfig>;
  const mockCloudModule = cloudModule as jest.Mocked<typeof cloudModule>;
  const mockLogger = logger as jest.Mocked<typeof logger>;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('mapDiscoveryToApplicationDescription', () => {
    it('should map discovery results to ApplicationDescription format', () => {
      const discoveryResult: TargetPurposeDiscoveryResult = {
        purpose: 'Test assistant for code review',
        limitations: 'Cannot access external APIs',
        tools: [
          {
            name: 'search_code',
            description: 'Search for code patterns',
            arguments: [
              { name: 'query', type: 'string', description: 'Search query' },
              { name: 'limit', type: 'number', description: 'Max results' },
            ],
          },
          {
            name: 'analyze_file',
            description: 'Analyze a source file',
            arguments: [
              { name: 'filepath', type: 'string', description: 'Path to file' },
            ],
          },
        ],
        user: 'Developer conducting code review',
      };

      const result = mapDiscoveryToApplicationDescription(discoveryResult);

      expect(result.purpose).toBe('Test assistant for code review');
      expect(result.redteamUser).toBe('Developer conducting code review');
      expect(result.forbiddenActions).toBe('Cannot access external APIs');
      expect(result.accessToActions).toBe(
        'search_code: Search for code patterns (query: string, limit: number); analyze_file: Analyze a source file (filepath: string)',
      );
    });

    it('should preserve existing ApplicationDescription fields when merging', () => {
      const discoveryResult: TargetPurposeDiscoveryResult = {
        purpose: 'New purpose',
        limitations: null,
        tools: [],
        user: null,
      };

      const existing: ApplicationDescription = {
        purpose: 'Old purpose',
        redteamUser: 'Existing user',
        accessToData: 'Database access',
        forbiddenData: 'PII data',
        accessToActions: 'Existing actions',
        forbiddenActions: 'Existing limitations',
        connectedSystems: 'System A, System B',
        features: 'Feature 1, Feature 2',
        industry: 'Healthcare',
        testGenerationInstructions: 'Test carefully',
      };

      const result = mapDiscoveryToApplicationDescription(discoveryResult, existing);

      // New discovery data should override
      expect(result.purpose).toBe('New purpose');

      // Existing data should be preserved where discovery doesn't provide new data
      expect(result.redteamUser).toBe('Existing user');
      expect(result.accessToData).toBe('Database access');
      expect(result.forbiddenData).toBe('PII data');
      expect(result.accessToActions).toBe('Existing actions');
      expect(result.forbiddenActions).toBe('Existing limitations');
      expect(result.connectedSystems).toBe('System A, System B');
      expect(result.features).toBe('Feature 1, Feature 2');
      expect(result.industry).toBe('Healthcare');
      expect(result.testGenerationInstructions).toBe('Test carefully');
    });

    it('should handle empty discovery results gracefully', () => {
      const discoveryResult: TargetPurposeDiscoveryResult = {
        purpose: null,
        limitations: null,
        tools: null as any,
        user: null,
      };

      const result = mapDiscoveryToApplicationDescription(discoveryResult);

      expect(result.purpose).toBe('');
      expect(result.redteamUser).toBe('');
      expect(result.accessToActions).toBe('');
      expect(result.forbiddenActions).toBe('');
      expect(result.accessToData).toBe('');
    });

    it('should format tools without arguments correctly', () => {
      const discoveryResult: TargetPurposeDiscoveryResult = {
        purpose: null,
        limitations: null,
        tools: [
          {
            name: 'simple_tool',
            description: 'A simple tool',
            arguments: [],
          },
          {
            name: 'no_args_tool',
            description: 'Tool with no arguments property',
          } as any,
        ],
        user: null,
      };

      const result = mapDiscoveryToApplicationDescription(discoveryResult);

      expect(result.accessToActions).toBe(
        'simple_tool: A simple tool; no_args_tool: Tool with no arguments property',
      );
    });
  });

  describe('saveDiscoveryToCloud', () => {
    const mockTarget: ApiProvider = {
      id: 'cloud://provider123',
      callApi: jest.fn(),
      label: 'Test Provider',
    };

    const mockDiscoveryResult: TargetPurposeDiscoveryResult = {
      purpose: 'Test assistant',
      limitations: 'Test limitations',
      tools: [
        {
          name: 'test_tool',
          description: 'A test tool',
          arguments: [],
        },
      ],
      user: 'Test user',
    };

    it('should save discovery results when cloud is enabled and target is cloud provider', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(true);
      mockCloudModule.isCloudProvider.mockReturnValue(true);
      mockCloudModule.getCloudDatabaseId.mockReturnValue('provider123');
      mockCloudModule.makeRequest.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true }),
        text: jest.fn(),
      } as any);

      await saveDiscoveryToCloud(mockTarget, mockDiscoveryResult);

      expect(mockCloudModule.makeRequest).toHaveBeenCalledWith(
        'providers/provider123/discovery',
        'PUT',
        {
          discoveryResult: mockDiscoveryResult,
          mergeStrategy: 'merge',
        },
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        '[Discovery] Saving discovery results to cloud provider provider123',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[Discovery] Successfully saved discovery results to cloud',
      );
    });

    it('should skip save when cloud is not enabled', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(false);

      await saveDiscoveryToCloud(mockTarget, mockDiscoveryResult);

      expect(mockCloudModule.makeRequest).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[Discovery] Cloud is not enabled, skipping discovery save',
      );
    });

    it('should skip save when target is not a cloud provider', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(true);
      mockCloudModule.isCloudProvider.mockReturnValue(false);

      const nonCloudTarget: ApiProvider = {
        id: 'openai:gpt-4',
        callApi: jest.fn(),
      };

      await saveDiscoveryToCloud(nonCloudTarget, mockDiscoveryResult);

      expect(mockCloudModule.makeRequest).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[Discovery] Target is not a cloud provider, skipping cloud save',
      );
    });

    it('should detect cloud provider from config when target lacks cloud ID', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(true);
      mockCloudModule.isCloudProvider.mockImplementation((id) =>
        typeof id === 'string' && id.startsWith('cloud://'),
      );
      mockCloudModule.getCloudDatabaseId.mockReturnValue('provider456');
      mockCloudModule.makeRequest.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true }),
        text: jest.fn(),
      } as any);

      const nonCloudTarget: ApiProvider = {
        id: 'http://localhost:3000',
        callApi: jest.fn(),
      };

      const config: UnifiedConfig = {
        providers: ['cloud://provider456'],
        prompts: [],
        tests: [],
      };

      await saveDiscoveryToCloud(nonCloudTarget, mockDiscoveryResult, config);

      expect(mockCloudModule.makeRequest).toHaveBeenCalledWith(
        'providers/provider456/discovery',
        'PUT',
        {
          discoveryResult: mockDiscoveryResult,
          mergeStrategy: 'merge',
        },
      );
    });

    it('should detect cloud provider from object config', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(true);
      mockCloudModule.isCloudProvider.mockImplementation((id) =>
        typeof id === 'string' && id.startsWith('cloud://'),
      );
      mockCloudModule.getCloudDatabaseId.mockReturnValue('provider789');
      mockCloudModule.makeRequest.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true }),
        text: jest.fn(),
      } as any);

      const nonCloudTarget: ApiProvider = {
        id: 'http://localhost:3000',
        callApi: jest.fn(),
      };

      const config: UnifiedConfig = {
        providers: [
          {
            id: 'cloud://provider789',
            config: { apiKey: 'test' },
          } as ApiProvider,
        ],
        prompts: [],
        tests: [],
      };

      await saveDiscoveryToCloud(nonCloudTarget, mockDiscoveryResult, config);

      expect(mockCloudModule.makeRequest).toHaveBeenCalledWith(
        'providers/provider789/discovery',
        'PUT',
        {
          discoveryResult: mockDiscoveryResult,
          mergeStrategy: 'merge',
        },
      );
    });

    it('should handle API errors gracefully without throwing', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(true);
      mockCloudModule.isCloudProvider.mockReturnValue(true);
      mockCloudModule.getCloudDatabaseId.mockReturnValue('provider123');
      mockCloudModule.makeRequest.mockResolvedValue({
        ok: false,
        status: 403,
        text: jest.fn().mockResolvedValue('Forbidden: insufficient permissions'),
        json: jest.fn(),
      } as any);

      await expect(
        saveDiscoveryToCloud(mockTarget, mockDiscoveryResult),
      ).resolves.not.toThrow();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[Discovery] Failed to save discovery results to cloud: 403 - Forbidden: insufficient permissions',
      );
    });

    it('should handle network errors gracefully without throwing', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(true);
      mockCloudModule.isCloudProvider.mockReturnValue(true);
      mockCloudModule.getCloudDatabaseId.mockReturnValue('provider123');
      mockCloudModule.makeRequest.mockRejectedValue(new Error('Network error'));

      await expect(
        saveDiscoveryToCloud(mockTarget, mockDiscoveryResult),
      ).resolves.not.toThrow();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[Discovery] Error saving discovery results to cloud:',
        expect.any(Error),
      );
    });

    it('should handle malformed API response gracefully', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(true);
      mockCloudModule.isCloudProvider.mockReturnValue(true);
      mockCloudModule.getCloudDatabaseId.mockReturnValue('provider123');
      mockCloudModule.makeRequest.mockResolvedValue({
        ok: true,
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
        text: jest.fn(),
      } as any);

      await expect(
        saveDiscoveryToCloud(mockTarget, mockDiscoveryResult),
      ).resolves.not.toThrow();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[Discovery] Error saving discovery results to cloud:',
        expect.any(Error),
      );
    });

    it('should handle undefined config gracefully', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(true);
      mockCloudModule.isCloudProvider.mockReturnValue(false);

      const nonCloudTarget: ApiProvider = {
        id: 'openai:gpt-4',
        callApi: jest.fn(),
      };

      await saveDiscoveryToCloud(nonCloudTarget, mockDiscoveryResult, undefined);

      expect(mockCloudModule.makeRequest).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[Discovery] Target is not a cloud provider, skipping cloud save',
      );
    });

    it('should handle empty providers array in config', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(true);
      mockCloudModule.isCloudProvider.mockReturnValue(false);

      const nonCloudTarget: ApiProvider = {
        id: 'openai:gpt-4',
        callApi: jest.fn(),
      };

      const config: UnifiedConfig = {
        providers: [],
        prompts: [],
        tests: [],
      };

      await saveDiscoveryToCloud(nonCloudTarget, mockDiscoveryResult, config);

      expect(mockCloudModule.makeRequest).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[Discovery] Target is not a cloud provider, skipping cloud save',
      );
    });

    it('should skip non-cloud providers in config when searching for cloud provider', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(true);
      mockCloudModule.isCloudProvider.mockImplementation((id) =>
        typeof id === 'string' && id.startsWith('cloud://'),
      );

      const nonCloudTarget: ApiProvider = {
        id: 'http://localhost:3000',
        callApi: jest.fn(),
      };

      const config: UnifiedConfig = {
        providers: [
          'openai:gpt-4',
          { id: 'anthropic:claude-3', config: {} } as ApiProvider,
          'http://example.com',
        ],
        prompts: [],
        tests: [],
      };

      await saveDiscoveryToCloud(nonCloudTarget, mockDiscoveryResult, config);

      expect(mockCloudModule.makeRequest).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[Discovery] Target is not a cloud provider, skipping cloud save',
      );
    });
  });
});