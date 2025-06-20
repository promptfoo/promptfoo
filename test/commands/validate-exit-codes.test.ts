import { Command } from 'commander';
import { doValidate, validateCommand } from '../../src/commands/validate';
import logger from '../../src/logger';
import type { UnifiedConfig } from '../../src/types';
import { resolveConfigs } from '../../src/util/config/load';

jest.mock('../../src/logger');
jest.mock('../../src/util/config/load');
jest.mock('../../src/telemetry', () => ({
  record: jest.fn(),
  send: jest.fn(),
}));

describe('Validate Command Exit Codes', () => {
  let program: Command;
  const defaultConfig = {} as UnifiedConfig;
  const defaultConfigPath = 'config.yaml';

  beforeEach(() => {
    program = new Command();
    jest.clearAllMocks();

    // Reset exit code before each test
    process.exitCode = 0;
  });

  describe('Success scenarios - should set exit code 0', () => {
    it('should set exit code 0 when configuration is valid', async () => {
      // Mock successful config resolution and validation
      const mockValidConfig = {
        prompts: ['test prompt'],
        providers: ['test-provider'],
        tests: [{ vars: { test: 'value' } }],
      };

      const mockValidTestSuite = {
        prompts: [{ raw: 'test prompt', label: 'test' }],
        providers: [{ id: () => 'test-provider' }],
        tests: [{ vars: { test: 'value' } }],
      };

      jest.mocked(resolveConfigs).mockResolvedValue({
        config: mockValidConfig as any,
        testSuite: mockValidTestSuite as any,
        basePath: '/test',
      });

      await doValidate({ config: ['test-config.yaml'] }, defaultConfig, defaultConfigPath);

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Configuration is valid'));
      expect(process.exitCode).toBe(0);
    });

    it('should set exit code 0 when validating with default config path', async () => {
      const mockValidConfig = {
        prompts: ['test prompt'],
        providers: ['test-provider'],
      };

      const mockValidTestSuite = {
        prompts: [{ raw: 'test prompt', label: 'test' }],
        providers: [{ id: () => 'test-provider' }],
      };

      jest.mocked(resolveConfigs).mockResolvedValue({
        config: mockValidConfig as any,
        testSuite: mockValidTestSuite as any,
        basePath: '/test',
      });

      await doValidate({}, defaultConfig, defaultConfigPath);

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Configuration is valid'));
      expect(process.exitCode).toBe(0);
    });
  });

  describe('Failure scenarios - should set exit code 1', () => {
    it('should set exit code 1 when configuration validation fails', async () => {
      // Mock invalid config that fails schema validation
      const mockInvalidConfig = {
        // Missing required fields to trigger validation error
        invalidField: 'invalid value',
      };

      const mockValidTestSuite = {
        prompts: [{ raw: 'test prompt', label: 'test' }],
        providers: [{ id: () => 'test-provider' }],
      };

      jest.mocked(resolveConfigs).mockResolvedValue({
        config: mockInvalidConfig as any,
        testSuite: mockValidTestSuite as any,
        basePath: '/test',
      });

      await doValidate({ config: ['invalid-config.yaml'] }, defaultConfig, defaultConfigPath);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Configuration validation error'),
      );
      expect(process.exitCode).toBe(1);
    });

    it('should set exit code 1 when test suite validation fails', async () => {
      // Mock valid config but invalid test suite
      const mockValidConfig = {
        prompts: ['test prompt'],
        providers: ['test-provider'],
      };

      const mockInvalidTestSuite = {
        // Invalid test suite structure to trigger validation error
        prompts: 'invalid prompts format', // Should be an array
        providers: [{ id: () => 'test-provider' }],
      };

      jest.mocked(resolveConfigs).mockResolvedValue({
        config: mockValidConfig as any,
        testSuite: mockInvalidTestSuite as any,
        basePath: '/test',
      });

      await doValidate({ config: ['test-config.yaml'] }, defaultConfig, defaultConfigPath);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Test suite validation error'),
      );
      expect(process.exitCode).toBe(1);
    });

    it('should set exit code 1 when config resolution throws an error', async () => {
      // Mock resolveConfigs to throw an error
      jest.mocked(resolveConfigs).mockRejectedValue(new Error('Failed to load configuration'));

      await doValidate({ config: ['non-existent-config.yaml'] }, defaultConfig, defaultConfigPath);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to validate configuration: Failed to load configuration'),
      );
      expect(process.exitCode).toBe(1);
    });
  });

  describe('Command registration', () => {
    it('should register validate command correctly', () => {
      validateCommand(program, defaultConfig, defaultConfigPath);

      const validateCmd = program.commands.find((cmd) => cmd.name() === 'validate');

      expect(validateCmd).toBeDefined();
      expect(validateCmd?.name()).toBe('validate');
      expect(validateCmd?.description()).toBe('Validate a promptfoo configuration file');

      // Check that the config option is registered
      const configOption = validateCmd?.options.find((opt) => opt.long === '--config');
      expect(configOption).toBeDefined();
    });
  });
});
