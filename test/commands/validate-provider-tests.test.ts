import { Command } from 'commander';
import { doValidate, doValidateTarget, validateCommand } from '../../src/commands/validate';
import logger from '../../src/logger';
import { loadApiProvider, loadApiProviders } from '../../src/providers/index';
import { getProviderFromCloud } from '../../src/util/cloud';
import { resolveConfigs } from '../../src/util/config/load';
import {
  testHTTPProviderConnectivity,
  testProviderSession,
} from '../../src/validators/testProvider';

import type { UnifiedConfig } from '../../src/types/index';
import type { ApiProvider } from '../../src/types/providers';

jest.mock('../../src/logger');
jest.mock('../../src/util/config/load');
jest.mock('../../src/providers/index');
jest.mock('../../src/validators/testProvider');
jest.mock('../../src/util/cloud');
jest.mock('../../src/telemetry', () => ({
  record: jest.fn(),
  send: jest.fn(),
}));
jest.mock('uuid', () => ({
  validate: jest.fn((str: string) => {
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
    callApi: jest.fn(),
    constructor: { name: 'HttpProvider' },
  } as any;

  const mockEchoProvider: ApiProvider = {
    id: () => 'echo',
    callApi: jest.fn(),
    constructor: { name: 'EchoProvider' },
  } as any;

  const mockOpenAIProvider: ApiProvider = {
    id: 'openai:gpt-4',
    callApi: jest.fn(),
    constructor: { name: 'OpenAIProvider' },
  } as any;

  beforeEach(() => {
    program = new Command();
    jest.clearAllMocks();
    process.exitCode = 0;

    // Default mock for successful basic connectivity
    (mockEchoProvider.callApi as jest.Mock).mockResolvedValue({
      output: 'Hello, world!',
    });

    (mockHttpProvider.callApi as jest.Mock).mockResolvedValue({
      output: 'Test response',
    });

    (mockOpenAIProvider.callApi as jest.Mock).mockResolvedValue({
      output: 'OpenAI response',
    });
  });

  describe('Provider testing with -t flag (specific target)', () => {
    it('should test HTTP provider with comprehensive tests when -t flag is provided and connectivity passes', async () => {
      jest.mocked(loadApiProvider).mockResolvedValue(mockHttpProvider);
      jest.mocked(testHTTPProviderConnectivity).mockResolvedValue({
        success: true,
        message: 'Connectivity test passed',
        providerResponse: { output: 'test' },
        transformedRequest: {},
      });
      jest.mocked(testProviderSession).mockResolvedValue({
        success: true,
        message: 'Session test passed',
      });

      await doValidateTarget({ target: 'http://example.com' }, defaultConfig);

      expect(loadApiProvider).toHaveBeenCalledWith('http://example.com', {
        options: {
          config: {
            maxRetries: 1,
            headers: {
              'x-promptfoo-silent': 'true',
            },
          },
        },
      });
      expect(testHTTPProviderConnectivity).toHaveBeenCalledWith(mockHttpProvider);
      expect(testProviderSession).toHaveBeenCalledWith(mockHttpProvider, undefined, {
        skipConfigValidation: true,
      });
      expect(logger.info).toHaveBeenCalledWith('Testing provider...');
      expect(process.exitCode).toBe(0);
    });

    it('should skip session test when connectivity test fails', async () => {
      jest.mocked(loadApiProvider).mockResolvedValue(mockHttpProvider);
      jest.mocked(testHTTPProviderConnectivity).mockResolvedValue({
        success: false,
        message: 'Connection failed',
        error: 'Network error',
        providerResponse: {},
        transformedRequest: {},
      });

      await doValidateTarget({ target: 'http://example.com' }, defaultConfig);

      expect(testHTTPProviderConnectivity).toHaveBeenCalledWith(mockHttpProvider);
      expect(testProviderSession).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Skipping session management test'),
      );
    });

    it('should skip session test when target is not stateful (stateful=false)', async () => {
      const mockNonStatefulHttpProvider: ApiProvider = {
        id: () => 'http://example.com',
        callApi: jest.fn(),
        config: { stateful: false },
        constructor: { name: 'HttpProvider' },
      } as any;

      jest.mocked(loadApiProvider).mockResolvedValue(mockNonStatefulHttpProvider);
      jest.mocked(testHTTPProviderConnectivity).mockResolvedValue({
        success: true,
        message: 'Connectivity test passed',
        providerResponse: { output: 'test' },
        transformedRequest: {},
      });

      await doValidateTarget({ target: 'http://example.com' }, defaultConfig);

      expect(testHTTPProviderConnectivity).toHaveBeenCalledWith(mockNonStatefulHttpProvider);
      expect(testProviderSession).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Skipping session management test (target is not stateful)'),
      );
    });

    it('should test non-HTTP provider with basic connectivity only when -t flag is provided', async () => {
      jest.mocked(loadApiProvider).mockResolvedValue(mockEchoProvider);

      await doValidateTarget({ target: 'echo' }, defaultConfig);

      expect(loadApiProvider).toHaveBeenCalledWith('echo');
      expect(mockEchoProvider.callApi).toHaveBeenCalledWith('Hello, world!', expect.any(Object));
      expect(testHTTPProviderConnectivity).not.toHaveBeenCalled();
      expect(testProviderSession).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Connectivity test passed'));
    });

    it('should load cloud provider when -t flag is UUID', async () => {
      const cloudUUID = '12345678-1234-1234-1234-123456789abc';
      const mockProviderOptions = {
        id: 'openai:gpt-4',
        config: {},
      };

      jest.mocked(getProviderFromCloud).mockResolvedValue(mockProviderOptions as any);
      jest.mocked(loadApiProvider).mockResolvedValue(mockOpenAIProvider);

      await doValidateTarget({ target: cloudUUID }, defaultConfig);

      expect(getProviderFromCloud).toHaveBeenCalledWith(cloudUUID);
      expect(loadApiProvider).toHaveBeenCalledWith('openai:gpt-4', {
        options: mockProviderOptions,
      });
      expect(logger.info).toHaveBeenCalledWith('Testing provider...');
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
          { id: () => 'echo', label: 'echo' },
          { id: () => 'openai:gpt-4', label: 'openai' },
        ],
        tests: [],
      };

      jest.mocked(resolveConfigs).mockResolvedValue({
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

      jest.mocked(resolveConfigs).mockResolvedValue({
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
    it('should warn but not fail validation when provider test fails', async () => {
      jest.mocked(loadApiProvider).mockResolvedValue(mockEchoProvider);
      (mockEchoProvider.callApi as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      await doValidateTarget({ target: 'echo' }, defaultConfig);

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Connectivity test failed'));
      expect(process.exitCode).toBe(0); // Should not fail validation
    });

    it('should warn but not fail validation when provider returns error', async () => {
      jest.mocked(loadApiProvider).mockResolvedValue(mockEchoProvider);
      (mockEchoProvider.callApi as jest.Mock).mockResolvedValue({
        error: 'Provider error',
      });

      await doValidateTarget({ target: 'echo' }, defaultConfig);

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Connectivity test failed'));
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Provider error'));
      expect(process.exitCode).toBe(0);
    });

    it('should warn but not fail validation when provider returns no output', async () => {
      jest.mocked(loadApiProvider).mockResolvedValue(mockEchoProvider);
      (mockEchoProvider.callApi as jest.Mock).mockResolvedValue({});

      await doValidateTarget({ target: 'echo' }, defaultConfig);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Connectivity test returned no output'),
      );
      expect(process.exitCode).toBe(0);
    });

    it('should warn when loadApiProvider fails with -t flag', async () => {
      jest.mocked(loadApiProvider).mockRejectedValue(new Error('Failed to load provider'));

      await doValidateTarget({ target: 'invalid-provider' }, defaultConfig);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Provider tests failed: Failed to load provider'),
      );
      expect(process.exitCode).toBe(0);
    });
  });

  describe('HTTP provider detection with target flag', () => {
    it('should detect HTTP provider by url in id when using target', async () => {
      const mockHttpProviderById: ApiProvider = {
        id: () => 'http://custom-api.com',
        callApi: jest.fn().mockResolvedValue({ output: 'HTTP response' }),
        constructor: { name: 'HttpProvider' },
      } as any;

      jest.mocked(loadApiProvider).mockResolvedValue(mockHttpProviderById);
      jest.mocked(testHTTPProviderConnectivity).mockResolvedValue({
        success: true,
        message: 'Test passed',
        providerResponse: { output: 'test' },
        transformedRequest: {},
      });
      jest.mocked(testProviderSession).mockResolvedValue({
        success: true,
        message: 'Test passed',
      });

      await doValidateTarget({ target: 'http://custom-api.com' }, defaultConfig);

      // Should call HTTP-specific tests for providers with http:// id
      expect(testHTTPProviderConnectivity).toHaveBeenCalled();
      expect(testProviderSession).toHaveBeenCalled();
    });
  });

  describe('Testing without config file', () => {
    it('should test provider with -t flag when no config file is present', async () => {
      // No config paths provided
      jest.mocked(loadApiProvider).mockResolvedValue(mockEchoProvider);

      await doValidateTarget({ target: 'echo' }, defaultConfig);

      expect(loadApiProvider).toHaveBeenCalledWith('echo');
      expect(mockEchoProvider.callApi).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Testing provider...');
      expect(process.exitCode).toBe(0);
    });

    it('should test cloud provider with UUID when no config file is present', async () => {
      const cloudUUID = '12345678-1234-1234-1234-123456789abc';
      const mockProviderOptions = {
        id: 'openai:gpt-4',
        config: {},
      };

      jest.mocked(getProviderFromCloud).mockResolvedValue(mockProviderOptions as any);
      jest.mocked(loadApiProvider).mockResolvedValue(mockOpenAIProvider);

      await doValidateTarget({ target: cloudUUID }, defaultConfig);

      expect(getProviderFromCloud).toHaveBeenCalledWith(cloudUUID);
      expect(loadApiProvider).toHaveBeenCalledWith('openai:gpt-4', {
        options: mockProviderOptions,
      });
      expect(logger.info).toHaveBeenCalledWith('Testing provider...');
      expect(mockOpenAIProvider.callApi).toHaveBeenCalled();
      expect(process.exitCode).toBe(0);
    });

    it('should handle errors gracefully when testing without config', async () => {
      jest.mocked(loadApiProvider).mockRejectedValue(new Error('Provider not found'));

      await doValidateTarget({ target: 'invalid-provider' }, defaultConfig);

      // The error is caught by runProviderTests which logs a warning
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Provider tests failed: Provider not found'),
      );
      // Warnings don't cause validation to fail
      expect(process.exitCode).toBe(0);
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
