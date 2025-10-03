import { Command } from 'commander';
import { doValidate, validateCommand } from '../../src/commands/validate';
import logger from '../../src/logger';
import { loadApiProvider, loadApiProviders } from '../../src/providers/index';
import { testHTTPProviderConnectivity, testProviderSession } from '../../src/providers/test';
import { getProviderFromCloud } from '../../src/util/cloud';
import { resolveConfigs } from '../../src/util/config/load';

import type { UnifiedConfig } from '../../src/types/index';
import type { ApiProvider } from '../../src/types/providers';

jest.mock('../../src/logger');
jest.mock('../../src/util/config/load');
jest.mock('../../src/providers/index');
jest.mock('../../src/providers/test');
jest.mock('../../src/util/cloud');
jest.mock('../../src/telemetry', () => ({
  record: jest.fn(),
  send: jest.fn(),
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
      const mockValidConfig = {
        prompts: ['test prompt'],
        providers: ['echo'],
      };

      const mockValidTestSuite = {
        prompts: [{ raw: 'test prompt', label: 'test' }],
        providers: [mockEchoProvider],
      };

      jest.mocked(resolveConfigs).mockResolvedValue({
        config: mockValidConfig as any,
        testSuite: mockValidTestSuite as any,
        basePath: '/test',
      });

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

      await doValidate(
        { config: ['test-config.yaml'], target: 'http://example.com' },
        defaultConfig,
        defaultConfigPath,
      );

      expect(loadApiProvider).toHaveBeenCalledWith('http://example.com');
      expect(testHTTPProviderConnectivity).toHaveBeenCalledWith(mockHttpProvider);
      expect(testProviderSession).toHaveBeenCalledWith(mockHttpProvider, undefined, {
        skipConfigValidation: true,
      });
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Configuration is valid'));
      expect(process.exitCode).toBe(0);
    });

    it('should skip session test when connectivity test fails', async () => {
      const mockValidConfig = {
        prompts: ['test prompt'],
        providers: ['echo'],
      };

      const mockValidTestSuite = {
        prompts: [{ raw: 'test prompt', label: 'test' }],
        providers: [mockEchoProvider],
      };

      jest.mocked(resolveConfigs).mockResolvedValue({
        config: mockValidConfig as any,
        testSuite: mockValidTestSuite as any,
        basePath: '/test',
      });

      jest.mocked(loadApiProvider).mockResolvedValue(mockHttpProvider);
      jest.mocked(testHTTPProviderConnectivity).mockResolvedValue({
        success: false,
        message: 'Connection failed',
        error: 'Network error',
        providerResponse: {},
        transformedRequest: {},
      });

      await doValidate(
        { config: ['test-config.yaml'], target: 'http://example.com' },
        defaultConfig,
        defaultConfigPath,
      );

      expect(testHTTPProviderConnectivity).toHaveBeenCalledWith(mockHttpProvider);
      expect(testProviderSession).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Skipping session management test'),
      );
    });

    it('should test non-HTTP provider with basic connectivity only when -t flag is provided', async () => {
      const mockValidConfig = {
        prompts: ['test prompt'],
        providers: ['echo'],
      };

      const mockValidTestSuite = {
        prompts: [{ raw: 'test prompt', label: 'test' }],
        providers: [mockEchoProvider],
      };

      jest.mocked(resolveConfigs).mockResolvedValue({
        config: mockValidConfig as any,
        testSuite: mockValidTestSuite as any,
        basePath: '/test',
      });

      jest.mocked(loadApiProvider).mockResolvedValue(mockEchoProvider);

      await doValidate(
        { config: ['test-config.yaml'], target: 'echo' },
        defaultConfig,
        defaultConfigPath,
      );

      expect(loadApiProvider).toHaveBeenCalledWith('echo');
      expect(mockEchoProvider.callApi).toHaveBeenCalledWith('Hello, world!', expect.any(Object));
      expect(testHTTPProviderConnectivity).not.toHaveBeenCalled();
      expect(testProviderSession).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Connectivity test passed'));
    });

    it('should load cloud provider when -t flag is UUID', async () => {
      const mockValidConfig = {
        prompts: ['test prompt'],
        providers: ['echo'],
      };

      const mockValidTestSuite = {
        prompts: [{ raw: 'test prompt', label: 'test' }],
        providers: [mockEchoProvider],
      };

      const cloudUUID = '12345678-1234-1234-1234-123456789abc';
      const mockProviderOptions = {
        id: 'openai:gpt-4',
        config: {},
      };

      jest.mocked(resolveConfigs).mockResolvedValue({
        config: mockValidConfig as any,
        testSuite: mockValidTestSuite as any,
        basePath: '/test',
      });

      jest.mocked(getProviderFromCloud).mockResolvedValue(mockProviderOptions);
      jest.mocked(loadApiProvider).mockResolvedValue(mockOpenAIProvider);

      await doValidate(
        { config: ['test-config.yaml'], target: cloudUUID },
        defaultConfig,
        defaultConfigPath,
      );

      expect(getProviderFromCloud).toHaveBeenCalledWith(cloudUUID);
      expect(loadApiProvider).toHaveBeenCalledWith('openai:gpt-4', {
        options: mockProviderOptions,
      });
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Configuration is valid'));
    });
  });

  describe('Provider testing without -t flag (all providers from config)', () => {
    it('should test all providers from config when -t flag is not provided', async () => {
      const mockValidConfig = {
        prompts: ['test prompt'],
        providers: ['echo', 'openai:gpt-4'],
      };

      const mockValidTestSuite = {
        prompts: [{ raw: 'test prompt', label: 'test' }],
        providers: [mockEchoProvider],
      };

      jest.mocked(resolveConfigs).mockResolvedValue({
        config: mockValidConfig as any,
        testSuite: mockValidTestSuite as any,
        basePath: '/test',
      });

      jest.mocked(loadApiProviders).mockResolvedValue([mockEchoProvider, mockOpenAIProvider]);

      await doValidate({ config: ['test-config.yaml'] }, defaultConfig, defaultConfigPath);

      expect(loadApiProviders).toHaveBeenCalledWith(['echo', 'openai:gpt-4'], { env: undefined });
      expect(mockEchoProvider.callApi).toHaveBeenCalled();
      expect(mockOpenAIProvider.callApi).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Testing provider: echo'));
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Testing provider: openai:gpt-4'),
      );
    });

    it('should test HTTP provider with comprehensive tests when found in config', async () => {
      const mockValidConfig = {
        prompts: ['test prompt'],
        providers: ['http://example.com'],
      };

      const mockValidTestSuite = {
        prompts: [{ raw: 'test prompt', label: 'test' }],
        providers: [mockHttpProvider],
      };

      jest.mocked(resolveConfigs).mockResolvedValue({
        config: mockValidConfig as any,
        testSuite: mockValidTestSuite as any,
        basePath: '/test',
      });

      jest.mocked(loadApiProviders).mockResolvedValue([mockHttpProvider]);
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

      await doValidate({ config: ['test-config.yaml'] }, defaultConfig, defaultConfigPath);

      expect(loadApiProviders).toHaveBeenCalled();
      expect(testHTTPProviderConnectivity).toHaveBeenCalledWith(mockHttpProvider);
      expect(testProviderSession).toHaveBeenCalledWith(mockHttpProvider, undefined, {
        skipConfigValidation: true,
      });
    });

    it('should skip provider tests when no providers in config', async () => {
      const mockValidConfig = {
        prompts: ['test prompt'],
        providers: [],
      };

      const mockValidTestSuite = {
        prompts: [{ raw: 'test prompt', label: 'test' }],
        providers: [],
      };

      jest.mocked(resolveConfigs).mockResolvedValue({
        config: mockValidConfig as any,
        testSuite: mockValidTestSuite as any,
        basePath: '/test',
      });

      await doValidate({ config: ['test-config.yaml'] }, defaultConfig, defaultConfigPath);

      expect(loadApiProviders).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('No providers found in configuration to test.');
    });
  });

  describe('Error handling in provider tests', () => {
    it('should warn but not fail validation when provider test fails', async () => {
      const mockValidConfig = {
        prompts: ['test prompt'],
        providers: ['echo'],
      };

      const mockValidTestSuite = {
        prompts: [{ raw: 'test prompt', label: 'test' }],
        providers: [mockEchoProvider],
      };

      jest.mocked(resolveConfigs).mockResolvedValue({
        config: mockValidConfig as any,
        testSuite: mockValidTestSuite as any,
        basePath: '/test',
      });

      jest.mocked(loadApiProvider).mockResolvedValue(mockEchoProvider);
      (mockEchoProvider.callApi as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      await doValidate(
        { config: ['test-config.yaml'], target: 'echo' },
        defaultConfig,
        defaultConfigPath,
      );

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Connectivity test failed'));
      expect(process.exitCode).toBe(0); // Should not fail validation
    });

    it('should warn but not fail validation when provider returns error', async () => {
      const mockValidConfig = {
        prompts: ['test prompt'],
        providers: ['echo'],
      };

      const mockValidTestSuite = {
        prompts: [{ raw: 'test prompt', label: 'test' }],
        providers: [mockEchoProvider],
      };

      jest.mocked(resolveConfigs).mockResolvedValue({
        config: mockValidConfig as any,
        testSuite: mockValidTestSuite as any,
        basePath: '/test',
      });

      jest.mocked(loadApiProvider).mockResolvedValue(mockEchoProvider);
      (mockEchoProvider.callApi as jest.Mock).mockResolvedValue({
        error: 'Provider error',
      });

      await doValidate(
        { config: ['test-config.yaml'], target: 'echo' },
        defaultConfig,
        defaultConfigPath,
      );

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Connectivity test failed'));
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Provider error'));
      expect(process.exitCode).toBe(0);
    });

    it('should warn but not fail validation when provider returns no output', async () => {
      const mockValidConfig = {
        prompts: ['test prompt'],
        providers: ['echo'],
      };

      const mockValidTestSuite = {
        prompts: [{ raw: 'test prompt', label: 'test' }],
        providers: [mockEchoProvider],
      };

      jest.mocked(resolveConfigs).mockResolvedValue({
        config: mockValidConfig as any,
        testSuite: mockValidTestSuite as any,
        basePath: '/test',
      });

      jest.mocked(loadApiProvider).mockResolvedValue(mockEchoProvider);
      (mockEchoProvider.callApi as jest.Mock).mockResolvedValue({});

      await doValidate(
        { config: ['test-config.yaml'], target: 'echo' },
        defaultConfig,
        defaultConfigPath,
      );

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Connectivity test returned no output'),
      );
      expect(process.exitCode).toBe(0);
    });

    it('should continue testing other providers when one fails', async () => {
      const mockValidConfig = {
        prompts: ['test prompt'],
        providers: ['echo', 'openai:gpt-4'],
      };

      const mockValidTestSuite = {
        prompts: [{ raw: 'test prompt', label: 'test' }],
        providers: [mockEchoProvider],
      };

      jest.mocked(resolveConfigs).mockResolvedValue({
        config: mockValidConfig as any,
        testSuite: mockValidTestSuite as any,
        basePath: '/test',
      });

      jest.mocked(loadApiProviders).mockResolvedValue([mockEchoProvider, mockOpenAIProvider]);
      (mockEchoProvider.callApi as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      await doValidate({ config: ['test-config.yaml'] }, defaultConfig, defaultConfigPath);

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Connection failed'));
      expect(mockOpenAIProvider.callApi).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Testing provider: openai:gpt-4'),
      );
    });

    it('should warn when loadApiProvider fails with -t flag', async () => {
      const mockValidConfig = {
        prompts: ['test prompt'],
        providers: ['echo'],
      };

      const mockValidTestSuite = {
        prompts: [{ raw: 'test prompt', label: 'test' }],
        providers: [mockEchoProvider],
      };

      jest.mocked(resolveConfigs).mockResolvedValue({
        config: mockValidConfig as any,
        testSuite: mockValidTestSuite as any,
        basePath: '/test',
      });

      jest.mocked(loadApiProvider).mockRejectedValue(new Error('Failed to load provider'));

      await doValidate(
        { config: ['test-config.yaml'], target: 'invalid-provider' },
        defaultConfig,
        defaultConfigPath,
      );

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Provider tests failed: Failed to load provider'),
      );
      expect(process.exitCode).toBe(0);
    });
  });

  describe('HTTP provider detection', () => {
    it('should detect HTTP provider by constructor name', async () => {
      const mockValidConfig = {
        prompts: ['test prompt'],
        providers: ['http://example.com'],
      };

      const mockValidTestSuite = {
        prompts: [{ raw: 'test prompt', label: 'test' }],
        providers: [mockHttpProvider],
      };

      jest.mocked(resolveConfigs).mockResolvedValue({
        config: mockValidConfig as any,
        testSuite: mockValidTestSuite as any,
        basePath: '/test',
      });

      jest.mocked(loadApiProviders).mockResolvedValue([mockHttpProvider]);
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

      await doValidate({ config: ['test-config.yaml'] }, defaultConfig, defaultConfigPath);

      // Should call HTTP-specific tests
      expect(testHTTPProviderConnectivity).toHaveBeenCalledWith(mockHttpProvider);
      expect(testProviderSession).toHaveBeenCalledWith(mockHttpProvider, undefined, {
        skipConfigValidation: true,
      });
    });

    it('should detect HTTP provider by url property', async () => {
      const mockHttpProviderWithUrl: ApiProvider = {
        id: () => 'custom-http',
        callApi: jest.fn(),
        url: 'https://api.example.com',
        constructor: { name: 'CustomProvider' },
      } as any;

      const mockValidConfig = {
        prompts: ['test prompt'],
        providers: ['custom-http'],
      };

      const mockValidTestSuite = {
        prompts: [{ raw: 'test prompt', label: 'test' }],
        providers: [mockHttpProviderWithUrl],
      };

      jest.mocked(resolveConfigs).mockResolvedValue({
        config: mockValidConfig as any,
        testSuite: mockValidTestSuite as any,
        basePath: '/test',
      });

      jest.mocked(loadApiProviders).mockResolvedValue([mockHttpProviderWithUrl]);
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

      await doValidate({ config: ['test-config.yaml'] }, defaultConfig, defaultConfigPath);

      expect(testHTTPProviderConnectivity).toHaveBeenCalledWith(mockHttpProviderWithUrl);
      expect(testProviderSession).toHaveBeenCalledWith(mockHttpProviderWithUrl, undefined, {
        skipConfigValidation: true,
      });
    });

    it('should detect HTTP provider by id starting with http:', async () => {
      const mockHttpProviderById: ApiProvider = {
        id: () => 'http://custom-api.com',
        callApi: jest.fn().mockResolvedValue({ output: 'HTTP response' }),
        constructor: { name: 'CustomProvider' },
      } as any;

      const mockValidConfig = {
        prompts: ['test prompt'],
        providers: ['http://custom-api.com'],
      };

      const mockValidTestSuite = {
        prompts: [{ raw: 'test prompt', label: 'test' }],
        providers: [mockHttpProviderById],
      };

      jest.mocked(resolveConfigs).mockResolvedValue({
        config: mockValidConfig as any,
        testSuite: mockValidTestSuite as any,
        basePath: '/test',
      });

      jest.mocked(loadApiProviders).mockResolvedValue([mockHttpProviderById]);
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

      await doValidate({ config: ['test-config.yaml'] }, defaultConfig, defaultConfigPath);

      // Should call HTTP-specific tests for providers with http:// id
      expect(testHTTPProviderConnectivity).toHaveBeenCalled();
      expect(testProviderSession).toHaveBeenCalled();
    });
  });

  describe('Testing without config file', () => {
    it('should test provider with -t flag when no config file is present', async () => {
      // No config paths provided
      jest.mocked(loadApiProvider).mockResolvedValue(mockEchoProvider);

      await doValidate({ target: 'echo' }, defaultConfig, undefined);

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

      jest.mocked(getProviderFromCloud).mockResolvedValue(mockProviderOptions);
      jest.mocked(loadApiProvider).mockResolvedValue(mockOpenAIProvider);

      await doValidate({ target: cloudUUID }, defaultConfig, undefined);

      expect(getProviderFromCloud).toHaveBeenCalledWith(cloudUUID);
      expect(loadApiProvider).toHaveBeenCalledWith('openai:gpt-4', {
        options: mockProviderOptions,
      });
      expect(logger.info).toHaveBeenCalledWith('Testing provider...');
      expect(process.exitCode).toBe(0);
    });

    it('should handle errors gracefully when testing without config', async () => {
      jest.mocked(loadApiProvider).mockRejectedValue(new Error('Provider not found'));

      await doValidate({ target: 'invalid-provider' }, defaultConfig, undefined);

      // The error is caught by runProviderTests which logs a warning
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Provider tests failed: Provider not found'),
      );
      // Warnings don't cause validation to fail
      expect(process.exitCode).toBe(0);
    });
  });

  describe('Command registration', () => {
    it('should register -t/--target option', () => {
      validateCommand(program, defaultConfig, defaultConfigPath);

      const validateCmd = program.commands.find((cmd) => cmd.name() === 'validate');
      const targetOption = validateCmd?.options.find((opt) => opt.long === '--target');

      expect(targetOption).toBeDefined();
      expect(targetOption?.short).toBe('-t');
      expect(targetOption?.description).toContain('Provider ID or cloud provider UUID to test');
    });
  });
});
