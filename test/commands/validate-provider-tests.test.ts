import { Command } from 'commander';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { doValidate, doValidateTarget, validateCommand } from '../../src/commands/validate';
import logger from '../../src/logger';
import { loadApiProvider, loadApiProviders } from '../../src/providers/index';
import { getProviderFromCloud } from '../../src/util/cloud';
import { resolveConfigs } from '../../src/util/config/load';
import { testProviderConnectivity, testProviderSession } from '../../src/validators/testProvider';

import type { UnifiedConfig } from '../../src/types/index';
import type { ApiProvider } from '../../src/types/providers';

vi.mock('../../src/logger');
vi.mock('../../src/util/config/load');
vi.mock('../../src/providers/index');
vi.mock('../../src/validators/testProvider');
vi.mock('../../src/util/cloud');
vi.mock('../../src/telemetry', () => ({
  default: {
    record: vi.fn(),
    send: vi.fn(),
  },
}));
vi.mock('../../src/util/uuid', () => ({
  isUuid: vi.fn((str: string) => {
    // Check if the string looks like a UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }),
}));

describe('Validate Command Provider Tests', () => {
  let program: Command;
  const defaultConfig = {} as UnifiedConfig;
  const defaultConfigPath = 'config.yaml';

  // Mock provider objects
  const mockHttpProvider: ApiProvider = {
    id: () => 'http://example.com',
    callApi: vi.fn(),
    constructor: { name: 'HttpProvider' },
  } as any;

  const mockEchoProvider: ApiProvider = {
    id: () => 'echo',
    callApi: vi.fn(),
    constructor: { name: 'EchoProvider' },
  } as any;

  const mockOpenAIProvider: ApiProvider = {
    id: 'openai:gpt-4',
    callApi: vi.fn(),
    constructor: { name: 'OpenAIProvider' },
  } as any;

  beforeEach(() => {
    program = new Command();
    vi.clearAllMocks();
    process.exitCode = 0;

    // Default mock for successful basic connectivity
    (mockEchoProvider.callApi as Mock).mockResolvedValue({
      output: 'Hello, world!',
    });

    (mockHttpProvider.callApi as Mock).mockResolvedValue({
      output: 'Test response',
    });

    (mockOpenAIProvider.callApi as Mock).mockResolvedValue({
      output: 'OpenAI response',
    });
  });

  describe('Provider testing with -t flag (specific target)', () => {
    it('should test HTTP provider with comprehensive tests when -t flag is provided and connectivity passes', async () => {
      vi.mocked(loadApiProvider).mockResolvedValue(mockHttpProvider);
      vi.mocked(testProviderConnectivity).mockResolvedValue({
        success: true,
        message: 'Connectivity test passed',
        providerResponse: { output: 'test' },
        transformedRequest: {},
      });
      vi.mocked(testProviderSession).mockResolvedValue({
        success: true,
        message: 'Session test passed',
      });

      await doValidateTarget({ target: 'http://example.com' }, defaultConfig);

      expect(loadApiProvider).toHaveBeenCalledWith(
        'http://example.com',
        expect.objectContaining({
          options: {
            config: {
              maxRetries: 1,
              headers: {
                'x-promptfoo-silent': 'true',
              },
            },
          },
        }),
      );
      expect(testProviderConnectivity).toHaveBeenCalledWith({ provider: mockHttpProvider });
      expect(testProviderSession).toHaveBeenCalledWith({
        provider: mockHttpProvider,
        options: { skipConfigValidation: true },
      });
      // Verify provider info is logged during testing
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Provider:'));
      expect(process.exitCode).toBe(0);
    });

    it('should skip session test when connectivity test fails', async () => {
      vi.mocked(loadApiProvider).mockResolvedValue(mockHttpProvider);
      vi.mocked(testProviderConnectivity).mockResolvedValue({
        success: false,
        message: 'Connection failed',
        error: 'Network error',
        providerResponse: {},
        transformedRequest: {},
      });

      await doValidateTarget({ target: 'http://example.com' }, defaultConfig);

      expect(testProviderConnectivity).toHaveBeenCalledWith({ provider: mockHttpProvider });
      expect(testProviderSession).not.toHaveBeenCalled();
      // Session test is skipped when connectivity fails
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Session test (skipped - connectivity failed)'),
      );
    });

    it('should skip session test when target is not stateful (stateful=false)', async () => {
      const mockNonStatefulHttpProvider: ApiProvider = {
        id: () => 'http://example.com',
        callApi: vi.fn(),
        config: { stateful: false },
        constructor: { name: 'HttpProvider' },
      } as any;

      vi.mocked(loadApiProvider).mockResolvedValue(mockNonStatefulHttpProvider);
      vi.mocked(testProviderConnectivity).mockResolvedValue({
        success: true,
        message: 'Connectivity test passed',
        providerResponse: { output: 'test' },
        transformedRequest: {},
      });

      await doValidateTarget({ target: 'http://example.com' }, defaultConfig);

      expect(testProviderConnectivity).toHaveBeenCalledWith({
        provider: mockNonStatefulHttpProvider,
      });
      expect(testProviderSession).not.toHaveBeenCalled();
      // Session test is skipped for stateless targets
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Session test (skipped - target is stateless)'),
      );
    });

    it('should test non-HTTP provider with basic connectivity only when -t flag is provided', async () => {
      vi.mocked(loadApiProvider).mockResolvedValue(mockEchoProvider);

      await doValidateTarget({ target: 'echo' }, defaultConfig);

      expect(loadApiProvider).toHaveBeenCalledWith('echo', expect.objectContaining({}));
      expect(mockEchoProvider.callApi).toHaveBeenCalledWith('Hello, world!', expect.any(Object));
      expect(testProviderConnectivity).not.toHaveBeenCalled();
      expect(testProviderSession).not.toHaveBeenCalled();
      // Basic connectivity test logs success with checkmark symbol
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Connectivity test'));
    });

    it('should load cloud provider when -t flag is UUID', async () => {
      const cloudUUID = '12345678-1234-1234-1234-123456789abc';
      const mockProviderOptions = {
        id: 'openai:gpt-4',
        config: {},
      };

      vi.mocked(getProviderFromCloud).mockResolvedValue(mockProviderOptions as any);
      vi.mocked(loadApiProvider).mockResolvedValue(mockOpenAIProvider);

      await doValidateTarget({ target: cloudUUID }, defaultConfig);

      expect(getProviderFromCloud).toHaveBeenCalledWith(cloudUUID);
      expect(loadApiProvider).toHaveBeenCalledWith(
        'openai:gpt-4',
        expect.objectContaining({
          options: mockProviderOptions,
        }),
      );
      // Verify provider info is logged during testing
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Provider:'));
      expect(mockOpenAIProvider.callApi).toHaveBeenCalled();
    });
  });

  describe('Config validation without -t flag (no provider testing)', () => {
    it('should only validate config when no target is provided', async () => {
      const mockValidConfig = {
        prompts: ['test prompt'],
        providers: ['echo', 'openai:gpt-4'],
      };

      const mockValidTestSuite = {
        prompts: [{ raw: 'test prompt', label: 'test' }],
        providers: [
          { id: () => 'echo', label: 'echo', callApi: () => Promise.resolve({}) },
          { id: () => 'openai:gpt-4', label: 'openai', callApi: () => Promise.resolve({}) },
        ],
        tests: [],
      };

      vi.mocked(resolveConfigs).mockResolvedValue({
        config: mockValidConfig as any,
        testSuite: mockValidTestSuite as any,
        basePath: '/test',
      });

      await doValidate({ config: ['test-config.yaml'] }, defaultConfig, defaultConfigPath);

      // Should NOT test providers, only validate config
      expect(loadApiProviders).not.toHaveBeenCalled();
      expect(mockEchoProvider.callApi).not.toHaveBeenCalled();
      expect(mockOpenAIProvider.callApi).not.toHaveBeenCalled();

      // Should only report config validation success
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Configuration is valid'));
      expect(process.exitCode).toBe(0);
    });

    it('should validate config with empty providers list', async () => {
      const mockValidConfig = {
        prompts: ['test prompt'],
        providers: [],
      };

      const mockValidTestSuite = {
        prompts: [{ raw: 'test prompt', label: 'test' }],
        providers: [],
        tests: [],
      };

      vi.mocked(resolveConfigs).mockResolvedValue({
        config: mockValidConfig as any,
        testSuite: mockValidTestSuite as any,
        basePath: '/test',
      });

      await doValidate({ config: ['test-config.yaml'] }, defaultConfig, defaultConfigPath);

      expect(loadApiProviders).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Configuration is valid'));
    });
  });

  describe('Error handling in provider tests', () => {
    it('should log error and set exitCode 1 when provider test throws', async () => {
      vi.mocked(loadApiProvider).mockResolvedValue(mockEchoProvider);
      (mockEchoProvider.callApi as Mock).mockRejectedValue(new Error('Connection failed'));

      await doValidateTarget({ target: 'echo' }, defaultConfig);

      // When callApi throws, testBasicConnectivity logs the error
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Connectivity test'));
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Connection failed'));
      // Connectivity test failed, so exitCode is 1
      expect(process.exitCode).toBe(1);
    });

    it('should log error and set exitCode 1 when provider returns error response', async () => {
      vi.mocked(loadApiProvider).mockResolvedValue(mockEchoProvider);
      (mockEchoProvider.callApi as Mock).mockResolvedValue({
        error: 'Provider error',
      });

      await doValidateTarget({ target: 'echo' }, defaultConfig);

      // When result.error is set, testBasicConnectivity logs the error
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Connectivity test'));
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Provider error'));
      // Connectivity test failed, so exitCode is 1
      expect(process.exitCode).toBe(1);
    });

    it('should warn when provider returns no output', async () => {
      vi.mocked(loadApiProvider).mockResolvedValue(mockEchoProvider);
      (mockEchoProvider.callApi as Mock).mockResolvedValue({});

      await doValidateTarget({ target: 'echo' }, defaultConfig);

      // When result has no output, testBasicConnectivity warns
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Connectivity test'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('No output'));
      // Connectivity test failed, so exitCode is 1
      expect(process.exitCode).toBe(1);
    });

    it('should error when loadApiProvider fails with -t flag', async () => {
      vi.mocked(loadApiProvider).mockRejectedValue(new Error('Failed to load provider'));

      await doValidateTarget({ target: 'invalid-provider' }, defaultConfig);

      // When loadApiProvider fails, runProviderTests catches and logs error
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Provider tests failed: Failed to load provider'),
      );
      expect(process.exitCode).toBe(1); // Errors set exit code to 1
    });
  });

  describe('HTTP provider detection with target flag', () => {
    it('should detect HTTP provider by url in id when using target', async () => {
      const mockHttpProviderById: ApiProvider = {
        id: () => 'http://custom-api.com',
        callApi: vi.fn().mockResolvedValue({ output: 'HTTP response' }),
        constructor: { name: 'HttpProvider' },
      } as any;

      vi.mocked(loadApiProvider).mockResolvedValue(mockHttpProviderById);
      vi.mocked(testProviderConnectivity).mockResolvedValue({
        success: true,
        message: 'Test passed',
        providerResponse: { output: 'test' },
        transformedRequest: {},
      });
      vi.mocked(testProviderSession).mockResolvedValue({
        success: true,
        message: 'Test passed',
      });

      await doValidateTarget({ target: 'http://custom-api.com' }, defaultConfig);

      // Should call HTTP-specific tests for providers with http:// id
      expect(testProviderConnectivity).toHaveBeenCalled();
      expect(testProviderSession).toHaveBeenCalled();
    });
  });

  describe('Testing without config file', () => {
    it('should test provider with -t flag when no config file is present', async () => {
      // No config paths provided
      vi.mocked(loadApiProvider).mockResolvedValue(mockEchoProvider);

      await doValidateTarget({ target: 'echo' }, defaultConfig);

      expect(loadApiProvider).toHaveBeenCalledWith('echo', expect.objectContaining({}));
      expect(mockEchoProvider.callApi).toHaveBeenCalled();
      // Verify that provider info is logged during validation
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Provider:'));
      expect(process.exitCode).toBe(0);
    });

    it('should test cloud provider with UUID when no config file is present', async () => {
      const cloudUUID = '12345678-1234-1234-1234-123456789abc';
      const mockProviderOptions = {
        id: 'openai:gpt-4',
        config: {},
      };

      vi.mocked(getProviderFromCloud).mockResolvedValue(mockProviderOptions as any);
      vi.mocked(loadApiProvider).mockResolvedValue(mockOpenAIProvider);

      await doValidateTarget({ target: cloudUUID }, defaultConfig);

      expect(getProviderFromCloud).toHaveBeenCalledWith(cloudUUID);
      expect(loadApiProvider).toHaveBeenCalledWith(
        'openai:gpt-4',
        expect.objectContaining({
          options: mockProviderOptions,
        }),
      );
      // Verify that provider info is logged during validation
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Provider:'));
      expect(mockOpenAIProvider.callApi).toHaveBeenCalled();
      expect(process.exitCode).toBe(0);
    });

    it('should handle errors gracefully when testing without config', async () => {
      vi.mocked(loadApiProvider).mockRejectedValue(new Error('Provider not found'));

      await doValidateTarget({ target: 'invalid-provider' }, defaultConfig);

      // The error is caught by runProviderTests which logs an error
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Provider tests failed: Provider not found'),
      );
      // Errors cause validation to fail
      expect(process.exitCode).toBe(1);
    });
  });

  describe('Command registration', () => {
    it('should register target subcommand with -t/--target option', () => {
      validateCommand(program, defaultConfig, defaultConfigPath);

      const validateCmd = program.commands.find((cmd) => cmd.name() === 'validate');
      const targetSubCmd = validateCmd?.commands.find((cmd) => cmd.name() === 'target');

      expect(targetSubCmd).toBeDefined();

      const targetOption = targetSubCmd?.options.find((opt) => opt.long === '--target');
      expect(targetOption).toBeDefined();
      expect(targetOption?.short).toBe('-t');
      expect(targetOption?.description).toContain('Provider ID');

      const configOption = targetSubCmd?.options.find((opt) => opt.long === '--config');
      expect(configOption).toBeDefined();
      expect(configOption?.short).toBe('-c');
      expect(configOption?.description).toContain('Path to configuration file');
    });
  });
});
