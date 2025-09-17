import type { ApiProvider, UnifiedConfig } from '../../../src/types';
import type { TargetPurposeDiscoveryResult } from '../../../src/redteam/commands/discover';
import { saveDiscoveryToCloud } from '../../../src/util/discovery';
import { cloudConfig } from '../../../src/globalConfig/cloud';
import * as cloudModule from '../../../src/util/cloud';
import logger from '../../../src/logger';

// This test focuses on the cloud save integration within the discover command flow
// It verifies that saveDiscoveryToCloud is called with the correct parameters

jest.mock('../../../src/globalConfig/cloud');
jest.mock('../../../src/util/cloud');
jest.mock('../../../src/logger');

describe('Discover Command - Cloud Save Integration', () => {
  const mockCloudConfig = cloudConfig as jest.Mocked<typeof cloudConfig>;
  const mockCloudModule = cloudModule as jest.Mocked<typeof cloudModule>;
  const mockLogger = logger as jest.Mocked<typeof logger>;

  const mockDiscoveryResult: TargetPurposeDiscoveryResult = {
    purpose: 'Test assistant for code review',
    limitations: 'Cannot access external APIs',
    tools: [
      {
        name: 'search_code',
        description: 'Search for code patterns',
        arguments: [
          { name: 'query', type: 'string', description: 'Search query' },
        ],
      },
    ],
    user: 'Developer',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('saveDiscoveryToCloud integration', () => {
    it('should be called after successful discovery with cloud provider target', async () => {
      // Setup
      mockCloudConfig.isEnabled.mockReturnValue(true);
      mockCloudModule.isCloudProvider.mockReturnValue(true);
      mockCloudModule.getCloudDatabaseId.mockReturnValue('provider123');
      mockCloudModule.makeRequest.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true }),
        text: jest.fn(),
      } as any);

      const cloudTarget: ApiProvider = {
        id: 'cloud://provider123',
        label: 'Test Cloud Provider',
        callApi: jest.fn(),
      };

      // Execute
      await saveDiscoveryToCloud(cloudTarget, mockDiscoveryResult);

      // Verify the cloud save was attempted with correct parameters
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

    it('should be called with config containing cloud provider', async () => {
      // Setup
      mockCloudConfig.isEnabled.mockReturnValue(true);
      mockCloudModule.isCloudProvider.mockImplementation(
        (id) => typeof id === 'string' && id.startsWith('cloud://'),
      );
      mockCloudModule.getCloudDatabaseId.mockReturnValue('provider456');
      mockCloudModule.makeRequest.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true }),
        text: jest.fn(),
      } as any);

      const nonCloudTarget: ApiProvider = {
        id: 'http://localhost:3000',
        label: 'Local HTTP Provider',
        callApi: jest.fn(),
      };

      const config: UnifiedConfig = {
        providers: ['cloud://provider456'],
        prompts: [],
        tests: [],
      };

      // Execute
      await saveDiscoveryToCloud(nonCloudTarget, mockDiscoveryResult, config);

      // Verify the cloud save was attempted
      expect(mockCloudModule.makeRequest).toHaveBeenCalledWith(
        'providers/provider456/discovery',
        'PUT',
        {
          discoveryResult: mockDiscoveryResult,
          mergeStrategy: 'merge',
        },
      );
    });

    it('should handle cloud save failures gracefully during discovery', async () => {
      // Setup
      mockCloudConfig.isEnabled.mockReturnValue(true);
      mockCloudModule.isCloudProvider.mockReturnValue(true);
      mockCloudModule.getCloudDatabaseId.mockReturnValue('provider789');
      mockCloudModule.makeRequest.mockRejectedValue(new Error('Network error'));

      const cloudTarget: ApiProvider = {
        id: 'cloud://provider789',
        label: 'Test Cloud Provider',
        callApi: jest.fn(),
      };

      // Execute - should not throw
      await expect(
        saveDiscoveryToCloud(cloudTarget, mockDiscoveryResult),
      ).resolves.not.toThrow();

      // Verify error was logged but didn't interrupt flow
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[Discovery] Error saving discovery results to cloud:',
        expect.any(Error),
      );
    });

    it('should not attempt cloud save for non-cloud providers when cloud is enabled', async () => {
      // Setup
      mockCloudConfig.isEnabled.mockReturnValue(true);
      mockCloudModule.isCloudProvider.mockReturnValue(false);

      const httpTarget: ApiProvider = {
        id: 'http://localhost:3000',
        label: 'Local HTTP Provider',
        callApi: jest.fn(),
      };

      // Execute
      await saveDiscoveryToCloud(httpTarget, mockDiscoveryResult);

      // Verify no cloud save was attempted
      expect(mockCloudModule.makeRequest).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[Discovery] Target is not a cloud provider, skipping cloud save',
      );
    });

    it('should not attempt cloud save when cloud is disabled', async () => {
      // Setup
      mockCloudConfig.isEnabled.mockReturnValue(false);

      const anyTarget: ApiProvider = {
        id: 'cloud://provider999',
        label: 'Any Provider',
        callApi: jest.fn(),
      };

      // Execute
      await saveDiscoveryToCloud(anyTarget, mockDiscoveryResult);

      // Verify no cloud save was attempted
      expect(mockCloudModule.makeRequest).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[Discovery] Cloud is not enabled, skipping discovery save',
      );
    });

    it('should handle mixed provider configurations correctly', async () => {
      // Setup
      mockCloudConfig.isEnabled.mockReturnValue(true);
      mockCloudModule.isCloudProvider.mockImplementation(
        (id) => typeof id === 'string' && id.startsWith('cloud://'),
      );
      mockCloudModule.getCloudDatabaseId.mockReturnValue('provider111');
      mockCloudModule.makeRequest.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true }),
        text: jest.fn(),
      } as any);

      const httpTarget: ApiProvider = {
        id: 'http://localhost:3000',
        label: 'Local HTTP Provider',
        callApi: jest.fn(),
      };

      const config: UnifiedConfig = {
        providers: [
          'openai:gpt-4',
          'cloud://provider111',
          { id: 'anthropic:claude', config: {} } as ApiProvider,
          'http://example.com',
        ],
        prompts: [],
        tests: [],
      };

      // Execute
      await saveDiscoveryToCloud(httpTarget, mockDiscoveryResult, config);

      // Verify the cloud provider was found and used
      expect(mockCloudModule.makeRequest).toHaveBeenCalledWith(
        'providers/provider111/discovery',
        'PUT',
        {
          discoveryResult: mockDiscoveryResult,
          mergeStrategy: 'merge',
        },
      );
    });

    it('should handle API error responses correctly', async () => {
      // Setup
      mockCloudConfig.isEnabled.mockReturnValue(true);
      mockCloudModule.isCloudProvider.mockReturnValue(true);
      mockCloudModule.getCloudDatabaseId.mockReturnValue('provider222');
      mockCloudModule.makeRequest.mockResolvedValue({
        ok: false,
        status: 403,
        text: jest.fn().mockResolvedValue('Forbidden: insufficient permissions'),
        json: jest.fn(),
      } as any);

      const cloudTarget: ApiProvider = {
        id: 'cloud://provider222',
        label: 'Test Cloud Provider',
        callApi: jest.fn(),
      };

      // Execute - should not throw
      await expect(
        saveDiscoveryToCloud(cloudTarget, mockDiscoveryResult),
      ).resolves.not.toThrow();

      // Verify error was logged
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[Discovery] Failed to save discovery results to cloud: 403 - Forbidden: insufficient permissions',
      );
    });
  });
});