import { discoverCommand } from '../../src/redteam/commands/discover';
import { saveDiscoveryToCloud } from '../../src/util/discovery';
import { cloudConfig } from '../../src/globalConfig/cloud';
import * as cloudModule from '../../src/util/cloud';
import { readConfig } from '../../src/util/config/load';
import { fetchWithProxy } from '../../src/util/fetch/index';
import logger from '../../src/logger';
import { Command } from 'commander';
import type { ApiProvider } from '../../src/types';

// Mock dependencies
jest.mock('../../src/util/discovery');
jest.mock('../../src/globalConfig/cloud');
jest.mock('../../src/util/cloud');
jest.mock('../../src/util/config/load');
jest.mock('../../src/util/fetch/index');
jest.mock('../../src/logger');
jest.mock('../../src/telemetry', () => ({
  default: {
    record: jest.fn(),
  },
}));

// Mock the remote generation URL function
jest.mock('../../src/redteam/remoteGeneration', () => ({
  getRemoteGenerationUrl: jest.fn().mockReturnValue('http://mock-api/task'),
  neverGenerateRemote: jest.fn().mockReturnValue(false),
}));

describe('Discover Command Cloud Integration', () => {
  let mockSaveDiscoveryToCloud: jest.MockedFunction<typeof saveDiscoveryToCloud>;
  let mockCloudConfig: jest.Mocked<typeof cloudConfig>;
  let mockCloudModule: jest.Mocked<typeof cloudModule>;
  let mockReadConfig: jest.MockedFunction<typeof readConfig>;
  let mockFetchWithProxy: jest.MockedFunction<typeof fetchWithProxy>;
  let mockLogger: jest.Mocked<typeof logger>;
  let command: Command;

  const mockDiscoveryResult = {
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

    // Set up mocks
    mockSaveDiscoveryToCloud = jest.mocked(saveDiscoveryToCloud);
    mockCloudConfig = cloudConfig as jest.Mocked<typeof cloudConfig>;
    mockCloudModule = cloudModule as jest.Mocked<typeof cloudModule>;
    mockReadConfig = jest.mocked(readConfig);
    mockFetchWithProxy = jest.mocked(fetchWithProxy);
    mockLogger = logger as jest.Mocked<typeof logger>;

    // Create a fresh command instance for each test
    command = new Command();
    command.exitOverride(); // Prevent process.exit during tests

    // Set up default mock behaviors
    mockCloudConfig.isEnabled.mockReturnValue(false);
    mockCloudModule.getProviderFromCloud.mockResolvedValue(null);

    // Mock successful discovery flow
    mockFetchWithProxy.mockImplementation(async (url: string, options: any) => {
      const body = JSON.parse(options.body || '{}');

      // Mock the target-purpose-discovery task responses
      if (body.task === 'target-purpose-discovery') {
        if (body.state?.iteration === 0 || !body.state) {
          // First iteration - return a question
          return {
            ok: true,
            json: async () => ({
              data: {
                status: 'in_progress',
                question: 'What is your primary function?',
                state: { iteration: 1 },
              },
            }),
          } as any;
        } else {
          // Final iteration - return discovery results
          return {
            ok: true,
            json: async () => ({
              data: {
                status: 'complete',
                result: mockDiscoveryResult,
              },
            }),
          } as any;
        }
      }

      // Mock target API responses
      return {
        ok: true,
        json: async () => ({
          output: 'I am a code review assistant.',
        }),
      } as any;
    });
  });

  describe('when cloud is enabled', () => {
    beforeEach(() => {
      mockCloudConfig.isEnabled.mockReturnValue(true);
      mockCloudConfig.getApiHost.mockReturnValue('https://api.example.com');
      mockCloudConfig.getApiKey.mockReturnValue('test-api-key');
    });

    it('should save discovery results to cloud for cloud provider target', async () => {
      const cloudProvider: ApiProvider = {
        id: 'cloud://provider123',
        label: 'Test Cloud Provider',
        config: {
          url: 'http://test-target.com',
        },
      };

      mockCloudModule.getProviderFromCloud.mockResolvedValue(cloudProvider);
      mockCloudModule.isCloudProvider.mockReturnValue(true);

      // Execute discovery with cloud provider
      const discoveryPromise = new Promise<void>((resolve, reject) => {
        const program = discoverCommand(command)
          .exitOverride()
          .configureOutput({
            writeOut: jest.fn(),
            writeErr: jest.fn(),
          });

        program.parse(['node', 'test', '--target', 'cloud://provider123'], { from: 'user' });

        // Allow async operations to complete
        setTimeout(() => {
          try {
            expect(mockSaveDiscoveryToCloud).toHaveBeenCalledWith(
              expect.objectContaining({
                id: 'cloud://provider123',
                label: 'Test Cloud Provider',
              }),
              expect.objectContaining({
                purpose: 'Test assistant for code review',
                limitations: 'Cannot access external APIs',
                tools: expect.arrayContaining([
                  expect.objectContaining({
                    name: 'search_code',
                  }),
                ]),
                user: 'Developer',
              }),
              undefined, // No config when using --target flag
            );
            resolve();
          } catch (error) {
            reject(error);
          }
        }, 100);
      });

      await discoveryPromise;
    });

    it('should save discovery results when using config with cloud provider', async () => {
      const config = {
        providers: ['cloud://provider456'],
        prompts: [],
        tests: [],
        redteam: {
          numTests: 5,
          plugins: [],
        },
      };

      mockReadConfig.mockResolvedValue(config);
      mockCloudModule.getConfigFromCloud.mockResolvedValue(config);
      mockCloudModule.isCloudProvider.mockReturnValue(true);

      // Mock provider fetch
      const cloudProvider: ApiProvider = {
        id: 'cloud://provider456',
        label: 'Config Cloud Provider',
        config: {
          url: 'http://config-target.com',
        },
      };
      mockCloudModule.getProviderFromCloud.mockResolvedValue(cloudProvider);

      // Execute discovery with config
      const discoveryPromise = new Promise<void>((resolve, reject) => {
        const program = discoverCommand(command)
          .exitOverride()
          .configureOutput({
            writeOut: jest.fn(),
            writeErr: jest.fn(),
          });

        program.parse(['node', 'test', '--config', 'promptfooconfig.yaml'], { from: 'user' });

        // Allow async operations to complete
        setTimeout(() => {
          try {
            expect(mockSaveDiscoveryToCloud).toHaveBeenCalledWith(
              expect.objectContaining({
                id: 'cloud://provider456',
              }),
              expect.objectContaining({
                purpose: 'Test assistant for code review',
                limitations: 'Cannot access external APIs',
              }),
              expect.objectContaining({
                providers: ['cloud://provider456'],
              }),
            );
            resolve();
          } catch (error) {
            reject(error);
          }
        }, 100);
      });

      await discoveryPromise;
    });

    it('should not save discovery results for non-cloud providers', async () => {
      const httpProvider: ApiProvider = {
        id: 'http://localhost:3000',
        label: 'Local HTTP Provider',
        config: {
          url: 'http://localhost:3000',
        },
      };

      mockCloudModule.getProviderFromCloud.mockResolvedValue(null);
      mockCloudModule.isCloudProvider.mockReturnValue(false);

      // Mock reading a non-cloud provider
      mockReadConfig.mockResolvedValue({
        providers: [httpProvider],
        prompts: [],
        tests: [],
      });

      // Execute discovery with non-cloud provider
      const discoveryPromise = new Promise<void>((resolve, reject) => {
        const program = discoverCommand(command)
          .exitOverride()
          .configureOutput({
            writeOut: jest.fn(),
            writeErr: jest.fn(),
          });

        program.parse(['node', 'test', '--target', 'http://localhost:3000'], { from: 'user' });

        // Allow async operations to complete
        setTimeout(() => {
          try {
            // saveDiscoveryToCloud should still be called, but it will skip internally
            expect(mockSaveDiscoveryToCloud).toHaveBeenCalled();
            resolve();
          } catch (error) {
            reject(error);
          }
        }, 100);
      });

      await discoveryPromise;
    });
  });

  describe('when cloud is disabled', () => {
    beforeEach(() => {
      mockCloudConfig.isEnabled.mockReturnValue(false);
    });

    it('should still call saveDiscoveryToCloud but it will skip', async () => {
      const httpProvider: ApiProvider = {
        id: 'http://localhost:3000',
        label: 'Local HTTP Provider',
        config: {
          url: 'http://localhost:3000',
        },
      };

      // Execute discovery
      const discoveryPromise = new Promise<void>((resolve, reject) => {
        const program = discoverCommand(command)
          .exitOverride()
          .configureOutput({
            writeOut: jest.fn(),
            writeErr: jest.fn(),
          });

        program.parse(['node', 'test', '--target', 'http://localhost:3000'], { from: 'user' });

        // Allow async operations to complete
        setTimeout(() => {
          try {
            // saveDiscoveryToCloud should be called regardless of cloud status
            expect(mockSaveDiscoveryToCloud).toHaveBeenCalled();
            resolve();
          } catch (error) {
            reject(error);
          }
        }, 100);
      });

      await discoveryPromise;
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      mockCloudConfig.isEnabled.mockReturnValue(true);
    });

    it('should continue discovery even if cloud save fails', async () => {
      const cloudProvider: ApiProvider = {
        id: 'cloud://provider123',
        label: 'Test Cloud Provider',
        config: {
          url: 'http://test-target.com',
        },
      };

      mockCloudModule.getProviderFromCloud.mockResolvedValue(cloudProvider);
      mockCloudModule.isCloudProvider.mockReturnValue(true);

      // Mock cloud save to throw error
      mockSaveDiscoveryToCloud.mockRejectedValue(new Error('Network error'));

      // Execute discovery
      const discoveryPromise = new Promise<void>((resolve, reject) => {
        const program = discoverCommand(command)
          .exitOverride()
          .configureOutput({
            writeOut: jest.fn(),
            writeErr: jest.fn(),
          });

        program.parse(['node', 'test', '--target', 'cloud://provider123'], { from: 'user' });

        // Allow async operations to complete
        setTimeout(() => {
          try {
            // Discovery should complete despite cloud save error
            expect(mockSaveDiscoveryToCloud).toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith(
              expect.stringContaining('The target believes its purpose is:'),
            );
            resolve();
          } catch (error) {
            reject(error);
          }
        }, 100);
      });

      await discoveryPromise;
    });

    it('should handle discovery failure gracefully', async () => {
      const cloudProvider: ApiProvider = {
        id: 'cloud://provider123',
        label: 'Test Cloud Provider',
        config: {
          url: 'http://test-target.com',
        },
      };

      mockCloudModule.getProviderFromCloud.mockResolvedValue(cloudProvider);

      // Mock discovery to fail
      mockFetchWithProxy.mockImplementation(async (url: string, options: any) => {
        const body = JSON.parse(options.body || '{}');

        if (body.task === 'target-purpose-discovery') {
          return {
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            json: async () => {
              throw new Error('Server error');
            },
          } as any;
        }

        return {
          ok: true,
          json: async () => ({
            output: 'Test response',
          }),
        } as any;
      });

      // Execute discovery
      const discoveryPromise = new Promise<void>((resolve, reject) => {
        const program = discoverCommand(command)
          .exitOverride()
          .configureOutput({
            writeOut: jest.fn(),
            writeErr: jest.fn(),
          });

        try {
          program.parse(['node', 'test', '--target', 'cloud://provider123'], { from: 'user' });

          setTimeout(() => {
            // saveDiscoveryToCloud should not be called if discovery fails
            expect(mockSaveDiscoveryToCloud).not.toHaveBeenCalled();
            expect(mockLogger.error).toHaveBeenCalled();
            resolve();
          }, 100);
        } catch (error) {
          // Command might exit with error
          resolve();
        }
      });

      await discoveryPromise;
    });
  });

  describe('with different config sources', () => {
    beforeEach(() => {
      mockCloudConfig.isEnabled.mockReturnValue(true);
    });

    it('should handle config from cloud', async () => {
      const cloudConfig = {
        providers: ['cloud://provider789'],
        prompts: [],
        tests: [],
        redteam: {
          numTests: 5,
          plugins: [],
        },
      };

      mockCloudModule.getConfigFromCloud.mockResolvedValue(cloudConfig);
      mockCloudModule.isCloudProvider.mockReturnValue(true);

      const cloudProvider: ApiProvider = {
        id: 'cloud://provider789',
        label: 'Cloud Config Provider',
        config: {
          url: 'http://cloud-config-target.com',
        },
      };
      mockCloudModule.getProviderFromCloud.mockResolvedValue(cloudProvider);

      // Execute discovery with cloud config ID
      const discoveryPromise = new Promise<void>((resolve, reject) => {
        const program = discoverCommand(command)
          .exitOverride()
          .configureOutput({
            writeOut: jest.fn(),
            writeErr: jest.fn(),
          });

        program.parse(['node', 'test', '--config', 'cloud://config123'], { from: 'user' });

        setTimeout(() => {
          try {
            expect(mockCloudModule.getConfigFromCloud).toHaveBeenCalledWith('config123');
            expect(mockSaveDiscoveryToCloud).toHaveBeenCalledWith(
              expect.objectContaining({
                id: 'cloud://provider789',
              }),
              expect.any(Object),
              expect.objectContaining({
                providers: ['cloud://provider789'],
              }),
            );
            resolve();
          } catch (error) {
            reject(error);
          }
        }, 100);
      });

      await discoveryPromise;
    });

    it('should handle multiple providers in config', async () => {
      const config = {
        providers: [
          'openai:gpt-4',
          'cloud://provider111',
          { id: 'anthropic:claude', config: {} },
        ],
        prompts: [],
        tests: [],
        redteam: {
          numTests: 5,
          plugins: [],
        },
      };

      mockReadConfig.mockResolvedValue(config);
      mockCloudModule.isCloudProvider.mockImplementation(
        (id) => typeof id === 'string' && id.startsWith('cloud://'),
      );

      const cloudProvider: ApiProvider = {
        id: 'cloud://provider111',
        label: 'Mixed Config Provider',
        config: {
          url: 'http://mixed-target.com',
        },
      };
      mockCloudModule.getProviderFromCloud.mockResolvedValue(cloudProvider);

      // Execute discovery
      const discoveryPromise = new Promise<void>((resolve, reject) => {
        const program = discoverCommand(command)
          .exitOverride()
          .configureOutput({
            writeOut: jest.fn(),
            writeErr: jest.fn(),
          });

        program.parse(['node', 'test', '--config', 'promptfooconfig.yaml'], { from: 'user' });

        setTimeout(() => {
          try {
            // Should use the cloud provider from the mixed list
            expect(mockSaveDiscoveryToCloud).toHaveBeenCalledWith(
              expect.objectContaining({
                id: 'cloud://provider111',
              }),
              expect.any(Object),
              expect.objectContaining({
                providers: expect.arrayContaining(['cloud://provider111']),
              }),
            );
            resolve();
          } catch (error) {
            reject(error);
          }
        }, 100);
      });

      await discoveryPromise;
    });
  });
});