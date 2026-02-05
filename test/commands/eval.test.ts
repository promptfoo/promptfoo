import * as path from 'path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, Mocked, vi } from 'vitest';
import { disableCache } from '../../src/cache';
import {
  doEval,
  evalCommand,
  showRedteamProviderLabelMissingWarning,
} from '../../src/commands/eval';
import { evaluate } from '../../src/evaluator';
import {
  checkEmailStatusAndMaybeExit,
  promptForEmailUnverified,
} from '../../src/globalConfig/accounts';
import { cloudConfig } from '../../src/globalConfig/cloud';
import logger from '../../src/logger';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import { loadApiProvider } from '../../src/providers/index';
import { createShareableUrl, isSharingEnabled } from '../../src/share';
import { ConfigPermissionError, checkCloudPermissions } from '../../src/util/cloud';
import { resolveConfigs } from '../../src/util/config/load';
import { TokenUsageTracker } from '../../src/util/tokenUsage';

import type { ApiProvider, TestSuite, UnifiedConfig } from '../../src/types/index';

vi.mock('../../src/cache');
vi.mock('../../src/evaluator');
vi.mock('../../src/globalConfig/accounts');
vi.mock('../../src/globalConfig/cloud', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    cloudConfig: {
      isEnabled: vi.fn().mockReturnValue(false),
      getApiHost: vi.fn().mockReturnValue('https://api.promptfoo.app'),
    },
  };
});
vi.mock('../../src/migrate');
vi.mock('../../src/providers');
vi.mock('../../src/redteam/shared', async (importOriginal) => {
  return {
    ...(await importOriginal()),
  };
});
vi.mock('../../src/share');
vi.mock('../../src/table');
vi.mock('../../src/util/cloud', async () => ({
  ...(await vi.importActual('../../src/util/cloud')),
  getDefaultTeam: vi.fn().mockResolvedValue({ id: 'test-team-id', name: 'Test Team' }),
  checkCloudPermissions: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('fs');
vi.mock('path', async () => {
  const actualPath = await vi.importActual('path');
  return {
    ...actualPath,
  };
});
vi.mock('../../src/util/config/load');
vi.mock('../../src/util/tokenUsage');
vi.mock('../../src/database/index', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    getDb: vi.fn(() => ({
      transaction: vi.fn((fn) => fn()),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn(() => ({
            run: vi.fn(),
          })),
          run: vi.fn(),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            run: vi.fn(),
          })),
        })),
      })),
    })),
  };
});

describe('evalCommand', () => {
  let program: Command;
  const defaultConfig = {} as UnifiedConfig;
  const defaultConfigPath = 'config.yaml';

  beforeEach(() => {
    program = new Command();
    vi.clearAllMocks();
    vi.mocked(resolveConfigs).mockResolvedValue({
      config: defaultConfig,
      testSuite: {
        prompts: [],
        providers: [],
      },
      basePath: path.resolve('/'),
    });
    vi.mocked(promptForEmailUnverified).mockResolvedValue({ emailNeedsValidation: false });
    vi.mocked(checkEmailStatusAndMaybeExit).mockResolvedValue('ok');
  });

  it('should create eval command with correct options', () => {
    const cmd = evalCommand(program, defaultConfig, defaultConfigPath);
    expect(cmd.name()).toBe('eval');
    expect(cmd.description()).toBe('Evaluate prompts');
  });

  it('should have help option available', () => {
    const cmd = evalCommand(program, defaultConfig, defaultConfigPath);
    // The help option is automatically added by commander
    const helpText = cmd.helpInformation();
    expect(helpText).toContain('-h, --help');
    expect(helpText).toContain('display help for command');
  });

  it('should handle --no-cache option', async () => {
    const cmdObj = { cache: false };
    await doEval(cmdObj, defaultConfig, defaultConfigPath, {});
    expect(disableCache).toHaveBeenCalledTimes(1);
  });

  it('should handle --write option', async () => {
    const cmdObj = { write: true };
    const mockEvalRecord = new Eval(defaultConfig);
    vi.mocked(evaluate).mockResolvedValue(mockEvalRecord);

    await doEval(cmdObj, defaultConfig, defaultConfigPath, {});
    expect(runDbMigrations).toHaveBeenCalledTimes(1);
  });

  it('should handle redteam config', async () => {
    const cmdObj = {};
    const config = {
      redteam: { plugins: ['test-plugin'] as any },
      prompts: [],
    } as UnifiedConfig;

    vi.mocked(resolveConfigs).mockResolvedValue({
      config,
      testSuite: {
        prompts: [],
        providers: [],
        tests: [{ vars: { test: 'value' } }],
      },
      basePath: path.resolve('/'),
    });

    const mockEvalRecord = new Eval(config);
    vi.mocked(evaluate).mockResolvedValue(mockEvalRecord);

    await doEval(cmdObj, config, defaultConfigPath, {});

    expect(promptForEmailUnverified).toHaveBeenCalledTimes(1);
    expect(checkEmailStatusAndMaybeExit).toHaveBeenCalledTimes(1);
  });

  it('should handle share option when enabled', async () => {
    const cmdObj = { share: true };
    const config = { sharing: true } as UnifiedConfig;
    const evalRecord = new Eval(config);

    vi.mocked(resolveConfigs).mockResolvedValue({
      config,
      testSuite: {
        prompts: [],
        providers: [],
      },
      basePath: path.resolve('/'),
    });

    vi.mocked(evaluate).mockResolvedValue(evalRecord);
    vi.mocked(isSharingEnabled).mockImplementation(function () {
      return true;
    });
    vi.mocked(createShareableUrl).mockResolvedValue('http://share.url');

    await doEval(cmdObj, config, defaultConfigPath, {});

    expect(createShareableUrl).toHaveBeenCalledWith(expect.any(Eval), { silent: true });
  });

  it('should not share when share is explicitly set to false even if config has sharing enabled', async () => {
    const cmdObj = { share: false };
    const config = { sharing: true } as UnifiedConfig;
    const evalRecord = new Eval(config);

    vi.mocked(resolveConfigs).mockResolvedValue({
      config,
      testSuite: {
        prompts: [],
        providers: [],
      },
      basePath: path.resolve('/'),
    });

    vi.mocked(evaluate).mockResolvedValue(evalRecord);
    vi.mocked(isSharingEnabled).mockImplementation(function () {
      return true;
    });

    await doEval(cmdObj, config, defaultConfigPath, {});

    expect(createShareableUrl).not.toHaveBeenCalled();
  });

  it('should share when share is true even if config has no sharing enabled', async () => {
    const cmdObj = { share: true };
    const config = {} as UnifiedConfig;
    const evalRecord = new Eval(config);

    vi.mocked(resolveConfigs).mockResolvedValue({
      config,
      testSuite: {
        prompts: [],
        providers: [],
      },
      basePath: path.resolve('/'),
    });

    vi.mocked(evaluate).mockResolvedValue(evalRecord);
    vi.mocked(isSharingEnabled).mockImplementation(function () {
      return true;
    });
    vi.mocked(createShareableUrl).mockResolvedValue('http://share.url');

    await doEval(cmdObj, config, defaultConfigPath, {});

    expect(createShareableUrl).toHaveBeenCalledWith(expect.any(Eval), { silent: true });
  });

  it('should share when share is undefined and config has sharing enabled', async () => {
    const cmdObj = {};
    const config = { sharing: true } as UnifiedConfig;
    const evalRecord = new Eval(config);

    vi.mocked(resolveConfigs).mockResolvedValue({
      config,
      testSuite: {
        prompts: [],
        providers: [],
      },
      basePath: path.resolve('/'),
    });

    vi.mocked(evaluate).mockResolvedValue(evalRecord);
    vi.mocked(isSharingEnabled).mockImplementation(function () {
      return true;
    });
    vi.mocked(createShareableUrl).mockResolvedValue('http://share.url');

    await doEval(cmdObj, config, defaultConfigPath, {});

    expect(createShareableUrl).toHaveBeenCalledWith(expect.any(Eval), { silent: true });
  });

  it('should auto-share when connected to cloud even if sharing is not explicitly enabled', async () => {
    const cmdObj = {};
    const config = {} as UnifiedConfig; // No sharing config
    const evalRecord = new Eval(config);

    // Mock cloud config as enabled
    vi.mocked(cloudConfig.isEnabled).mockImplementation(function () {
      return true;
    });

    vi.mocked(resolveConfigs).mockResolvedValue({
      config,
      testSuite: {
        prompts: [],
        providers: [],
      },
      basePath: path.resolve('/'),
    });

    vi.mocked(evaluate).mockResolvedValue(evalRecord);
    vi.mocked(isSharingEnabled).mockImplementation(function () {
      return true;
    });
    vi.mocked(createShareableUrl).mockResolvedValue('http://share.url');

    await doEval(cmdObj, config, defaultConfigPath, {});

    expect(createShareableUrl).toHaveBeenCalledWith(expect.any(Eval), { silent: true });
  });

  it('should not auto-share when connected to cloud if share is explicitly set to false', async () => {
    const cmdObj = { share: false };
    const config = {} as UnifiedConfig;
    const evalRecord = new Eval(config);

    // Mock cloud config as enabled
    vi.mocked(cloudConfig.isEnabled).mockImplementationOnce(function () {
      return true;
    });

    vi.mocked(resolveConfigs).mockResolvedValue({
      config,
      testSuite: {
        prompts: [],
        providers: [],
      },
      basePath: path.resolve('/'),
    });

    vi.mocked(evaluate).mockResolvedValue(evalRecord);
    vi.mocked(isSharingEnabled).mockImplementationOnce(function () {
      return true;
    });

    await doEval(cmdObj, config, defaultConfigPath, {});

    expect(createShareableUrl).not.toHaveBeenCalled();
  });

  it('should handle grader option', async () => {
    const cmdObj = { grader: 'test-grader' };
    const mockProvider = {
      id: () => 'test-grader',
      callApi: async () => ({ output: 'test' }),
    } as ApiProvider;

    vi.mocked(loadApiProvider).mockResolvedValue(mockProvider);

    await doEval(cmdObj, defaultConfig, defaultConfigPath, {});

    expect(loadApiProvider).toHaveBeenCalledWith('test-grader', expect.objectContaining({}));
  });

  it('should handle repeat option', async () => {
    const cmdObj = { repeat: 3 };
    await doEval(cmdObj, defaultConfig, defaultConfigPath, {});
    expect(evaluate).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ repeat: 3 }),
    );
  });

  it('should handle delay option', async () => {
    const cmdObj = { delay: 1000 };
    await doEval(cmdObj, defaultConfig, defaultConfigPath, {});
    expect(evaluate).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ delay: 1000 }),
    );
  });

  it('should handle maxConcurrency option', async () => {
    const cmdObj = { maxConcurrency: 5 };
    await doEval(cmdObj, defaultConfig, defaultConfigPath, {});
    expect(evaluate).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ maxConcurrency: 5 }),
    );
  });

  it('should fallback to evaluateOptions.maxConcurrency when cmdObj.maxConcurrency is undefined', async () => {
    const cmdObj = {};
    const evaluateOptions = { maxConcurrency: 3 };

    await doEval(cmdObj, defaultConfig, defaultConfigPath, evaluateOptions);

    expect(evaluate).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ maxConcurrency: 3 }),
    );
  });

  it('should fallback to DEFAULT_MAX_CONCURRENCY when both cmdObj and evaluateOptions maxConcurrency are undefined', async () => {
    const cmdObj = {};
    const evaluateOptions = {};

    await doEval(cmdObj, defaultConfig, defaultConfigPath, evaluateOptions);

    expect(evaluate).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ maxConcurrency: 4 }),
    );
  });
});

describe('checkCloudPermissions', () => {
  const defaultConfigPath = 'config.yaml';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(promptForEmailUnverified).mockResolvedValue({ emailNeedsValidation: false });
    vi.mocked(checkEmailStatusAndMaybeExit).mockResolvedValue('ok');
  });

  it('should fail when checkCloudPermissions throws an error', async () => {
    // Mock cloudConfig to be enabled
    vi.mocked(cloudConfig.isEnabled).mockImplementation(function () {
      return true;
    });

    // Mock checkCloudPermissions to throw an error
    const permissionError = new ConfigPermissionError('Permission denied: insufficient access');
    vi.mocked(checkCloudPermissions).mockRejectedValueOnce(permissionError);

    // Setup the test configuration
    const config = {
      providers: ['openai:gpt-4'],
    } as UnifiedConfig;

    vi.mocked(resolveConfigs).mockResolvedValue({
      config,
      testSuite: {
        prompts: [],
        providers: [{ id: () => 'openai:gpt-4', callApi: async () => ({}) }] as ApiProvider[],
        tests: [],
      },
      basePath: path.resolve('/'),
    });

    const cmdObj = {};

    await expect(doEval(cmdObj, config, defaultConfigPath, {})).rejects.toThrow(
      'Permission denied: insufficient access',
    );

    // Verify checkCloudPermissions was called with the correct arguments
    expect(checkCloudPermissions).toHaveBeenCalledWith(config);

    // Verify that evaluate was not called
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('should call checkCloudPermissions and proceed when it succeeds', async () => {
    // Mock cloudConfig to be enabled
    vi.mocked(cloudConfig.isEnabled).mockImplementation(function () {
      return true;
    });

    // Mock checkCloudPermissions to succeed (resolve without throwing)
    vi.mocked(checkCloudPermissions).mockResolvedValueOnce(undefined);

    // Setup the test configuration
    const config = {
      providers: ['openai:gpt-4'],
    } as UnifiedConfig;

    vi.mocked(resolveConfigs).mockResolvedValue({
      config,
      testSuite: {
        prompts: [],
        providers: [{ id: () => 'openai:gpt-4', callApi: async () => ({}) }],
        tests: [],
      },
      basePath: path.resolve('/'),
    });

    const mockEvalRecord = new Eval(config);
    vi.mocked(evaluate).mockResolvedValue(mockEvalRecord);

    const cmdObj = {};

    const result = await doEval(cmdObj, config, defaultConfigPath, {});

    // Verify checkCloudPermissions was called
    expect(checkCloudPermissions).toHaveBeenCalledWith(config);

    // Verify that the function proceeded normally
    expect(result).not.toBeNull();

    // Verify that evaluate was called
    expect(evaluate).toHaveBeenCalled();
  });

  it('should call checkCloudPermissions but skip permission check when cloudConfig is disabled', async () => {
    // Mock cloudConfig to be disabled
    vi.mocked(cloudConfig.isEnabled).mockImplementation(function () {
      return false;
    });

    // Mock checkCloudPermissions to succeed (it should return early due to disabled cloud)
    vi.mocked(checkCloudPermissions).mockResolvedValueOnce(undefined);

    // Setup the test configuration
    const config = {
      providers: ['openai:gpt-4'],
    } as UnifiedConfig;

    vi.mocked(resolveConfigs).mockResolvedValue({
      config,
      testSuite: {
        prompts: [],
        providers: [{ id: () => 'openai:gpt-4', callApi: async () => ({}) }],
        tests: [],
      },
      basePath: path.resolve('/'),
    });

    const mockEvalRecord = new Eval(config);
    vi.mocked(evaluate).mockResolvedValue(mockEvalRecord);

    const cmdObj = {};

    await doEval(cmdObj, config, defaultConfigPath, {});

    // Verify checkCloudPermissions was called (but returns early due to disabled cloud)
    expect(checkCloudPermissions).toHaveBeenCalledWith(config);

    // Verify that evaluate was called
    expect(evaluate).toHaveBeenCalled();
  });
});

describe('showRedteamProviderLabelMissingWarning', () => {
  const mockWarn = vi.spyOn(logger, 'warn');

  beforeEach(() => {
    mockWarn.mockClear();
  });

  it('should show warning when provider has no label', () => {
    const testSuite = {
      prompts: [],
      providers: [
        {
          label: '',
          id: () => 'test-id',
          callApi: async () => ({ output: 'test' }),
        },
      ],
    } as unknown as TestSuite;

    showRedteamProviderLabelMissingWarning(testSuite);
    expect(mockWarn).toHaveBeenCalledTimes(1);
  });

  it('should not show warning when all providers have labels', () => {
    const testSuite = {
      prompts: [],
      providers: [
        {
          label: 'test-label',
          id: () => 'test-id',
          callApi: async () => ({ output: 'test' }),
        },
      ],
    } as unknown as TestSuite;

    showRedteamProviderLabelMissingWarning(testSuite);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('should handle empty providers array', () => {
    const testSuite = {
      prompts: [],
      providers: [],
    } as unknown as TestSuite;

    showRedteamProviderLabelMissingWarning(testSuite);
    expect(mockWarn).not.toHaveBeenCalled();
  });
});

describe('Provider Token Tracking', () => {
  let mockTokenUsageTracker: Mocked<TokenUsageTracker>;
  const mockLogger = vi.spyOn(logger, 'info');

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger.mockClear();

    mockTokenUsageTracker = {
      getProviderIds: vi.fn(),
      getProviderUsage: vi.fn(),
      trackUsage: vi.fn(),
      resetAllUsage: vi.fn(),
      resetProviderUsage: vi.fn(),
      getTotalUsage: vi.fn(),
      cleanup: vi.fn(),
    } as any;

    vi.mocked(TokenUsageTracker.getInstance).mockImplementation(function () {
      return mockTokenUsageTracker;
    });
  });

  it('should create and configure TokenUsageTracker correctly', () => {
    const tracker = TokenUsageTracker.getInstance();
    expect(tracker).toBeDefined();
    expect(tracker.getProviderIds).toBeDefined();
    expect(tracker.getProviderUsage).toBeDefined();
  });

  it('should handle provider token tracking when mocked properly', () => {
    const providerUsageData = {
      'openai:gpt-4': {
        total: 1500,
        prompt: 600,
        completion: 900,
        cached: 100,
        numRequests: 5,
        completionDetails: { reasoning: 200, acceptedPrediction: 0, rejectedPrediction: 0 },
      },
      'anthropic:claude-3': {
        total: 800,
        prompt: 300,
        completion: 500,
        cached: 50,
        numRequests: 3,
        completionDetails: { reasoning: 100, acceptedPrediction: 0, rejectedPrediction: 0 },
      },
    };

    mockTokenUsageTracker.getProviderIds.mockReturnValue(['openai:gpt-4', 'anthropic:claude-3']);
    mockTokenUsageTracker.getProviderUsage.mockImplementation(function (id: string) {
      return providerUsageData[id as keyof typeof providerUsageData];
    });

    const tracker = TokenUsageTracker.getInstance();
    const providerIds = tracker.getProviderIds();
    expect(providerIds).toEqual(['openai:gpt-4', 'anthropic:claude-3']);

    const openaiUsage = tracker.getProviderUsage('openai:gpt-4');
    expect(openaiUsage).toEqual(providerUsageData['openai:gpt-4']);

    const claudeUsage = tracker.getProviderUsage('anthropic:claude-3');
    expect(claudeUsage).toEqual(providerUsageData['anthropic:claude-3']);
  });
});

describe('doEval with external defaultTest', () => {
  const defaultConfig = {} as UnifiedConfig;
  const defaultConfigPath = 'config.yaml';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveConfigs).mockResolvedValue({
      config: defaultConfig,
      testSuite: {
        prompts: [],
        providers: [],
        defaultTest: undefined,
      },
      basePath: path.resolve('/'),
    });
    vi.mocked(promptForEmailUnverified).mockResolvedValue({ emailNeedsValidation: false });
    vi.mocked(checkEmailStatusAndMaybeExit).mockResolvedValue('ok');
  });

  it('should handle grader option with string defaultTest', async () => {
    const cmdObj = { grader: 'test-grader' };
    const mockProvider = {
      id: () => 'test-grader',
      callApi: async () => ({ output: 'test' }),
    } as ApiProvider;

    vi.mocked(loadApiProvider).mockResolvedValue(mockProvider);

    const testSuite = {
      prompts: [],
      providers: [],
      defaultTest: 'file://defaultTest.yaml',
    } as TestSuite;

    vi.mocked(resolveConfigs).mockResolvedValue({
      config: defaultConfig,
      testSuite,
      basePath: path.resolve('/'),
    });

    await doEval(cmdObj, defaultConfig, defaultConfigPath, {});

    expect(evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultTest: expect.objectContaining({
          options: expect.objectContaining({
            provider: mockProvider,
          }),
        }),
      }),
      expect.anything(),
      expect.anything(),
    );
  });

  it('should handle var option with string defaultTest', async () => {
    const cmdObj = { var: { key: 'value' } };

    const testSuite = {
      prompts: [],
      providers: [],
      defaultTest: 'file://defaultTest.yaml',
    } as TestSuite;

    vi.mocked(resolveConfigs).mockResolvedValue({
      config: defaultConfig,
      testSuite,
      basePath: path.resolve('/'),
    });

    await doEval(cmdObj, defaultConfig, defaultConfigPath, {});

    expect(evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultTest: expect.objectContaining({
          vars: expect.objectContaining({
            key: 'value',
          }),
        }),
      }),
      expect.anything(),
      expect.anything(),
    );
  });

  it('should handle both grader and var options with object defaultTest', async () => {
    const cmdObj = {
      grader: 'test-grader',
      var: { key: 'value' },
    };

    const mockProvider = {
      id: () => 'test-grader',
      callApi: async () => ({ output: 'test' }),
    } as ApiProvider;

    vi.mocked(loadApiProvider).mockResolvedValue(mockProvider);

    const testSuite = {
      prompts: [],
      providers: [],
      defaultTest: {
        options: {},
        assert: [{ type: 'equals' as const, value: 'test' }],
        vars: { existing: 'var' },
      },
    } as TestSuite;

    vi.mocked(resolveConfigs).mockResolvedValue({
      config: defaultConfig,
      testSuite,
      basePath: path.resolve('/'),
    });

    await doEval(cmdObj, defaultConfig, defaultConfigPath, {});

    expect(evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultTest: expect.objectContaining({
          assert: [{ type: 'equals', value: 'test' }],
          vars: { existing: 'var', key: 'value' },
          options: expect.objectContaining({
            provider: mockProvider,
          }),
        }),
      }),
      expect.anything(),
      expect.anything(),
    );
  });

  it('should not modify defaultTest when no grader or var options', async () => {
    const cmdObj = {};

    const originalDefaultTest = {
      options: {},
      assert: [{ type: 'equals' as const, value: 'test' }],
      vars: { foo: 'bar' },
    };

    const testSuite = {
      prompts: [],
      providers: [],
      defaultTest: originalDefaultTest,
    } as TestSuite;

    vi.mocked(resolveConfigs).mockResolvedValue({
      config: defaultConfig,
      testSuite,
      basePath: path.resolve('/'),
    });

    await doEval(cmdObj, defaultConfig, defaultConfigPath, {});

    expect(evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultTest: originalDefaultTest,
      }),
      expect.anything(),
      expect.anything(),
    );
  });
});

describe('Sharing Precedence - Comprehensive Test Coverage', () => {
  const defaultConfigPath = '/path/to/config.yaml';
  const defaultConfig = {
    prompts: [],
    providers: [],
  } as UnifiedConfig;

  let mockTokenUsageTracker: Mocked<TokenUsageTracker>;

  beforeEach(() => {
    vi.resetAllMocks();

    // Set up TokenUsageTracker mock - required by generateEvalSummary
    mockTokenUsageTracker = {
      getProviderIds: vi.fn().mockReturnValue([]),
      getProviderUsage: vi.fn(),
      trackUsage: vi.fn(),
      resetAllUsage: vi.fn(),
      resetProviderUsage: vi.fn(),
      getTotalUsage: vi.fn(),
      cleanup: vi.fn(),
    } as any;
    vi.mocked(TokenUsageTracker.getInstance).mockReturnValue(mockTokenUsageTracker);

    // Set up required account mocks
    vi.mocked(promptForEmailUnverified).mockResolvedValue({ emailNeedsValidation: false });
    vi.mocked(checkEmailStatusAndMaybeExit).mockResolvedValue('ok');

    // Set up cloud and sharing mocks
    vi.mocked(cloudConfig.isEnabled).mockReturnValue(false);
    vi.mocked(isSharingEnabled).mockReturnValue(true);
    vi.mocked(createShareableUrl).mockResolvedValue('https://example.com/share/123');

    // Set up config resolution
    vi.mocked(resolveConfigs).mockResolvedValue({
      config: defaultConfig,
      testSuite: {
        prompts: [],
        providers: [],
      },
      basePath: path.resolve('/'),
    });

    // Set up cloud permissions check
    vi.mocked(checkCloudPermissions).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Priority 1: Explicit disable (CLI --share=false, --no-share, or env var)', () => {
    it('should not share when cmdObj.share = false, regardless of other settings', async () => {
      const cmdObj = { share: false, table: false, write: false };
      const config = { sharing: true } as UnifiedConfig;
      const evalRecord = new Eval(config);

      vi.mocked(cloudConfig.isEnabled).mockImplementation(function () {
        return true;
      });
      vi.mocked(resolveConfigs).mockResolvedValue({
        config,
        testSuite: { prompts: [], providers: [] },
        basePath: path.resolve('/'),
        commandLineOptions: { share: true },
      });
      vi.mocked(evaluate).mockResolvedValue(evalRecord);

      await doEval(cmdObj, config, defaultConfigPath, {});

      expect(createShareableUrl).not.toHaveBeenCalled();
    });

    it('should not share when cmdObj.noShare = true, regardless of other settings', async () => {
      const cmdObj = { noShare: true, table: false, write: false };
      const config = { sharing: true } as UnifiedConfig;
      const evalRecord = new Eval(config);

      vi.mocked(cloudConfig.isEnabled).mockImplementation(function () {
        return true;
      });
      vi.mocked(resolveConfigs).mockResolvedValue({
        config,
        testSuite: { prompts: [], providers: [] },
        basePath: path.resolve('/'),
        commandLineOptions: { share: true },
      });
      vi.mocked(evaluate).mockResolvedValue(evalRecord);

      await doEval(cmdObj, config, defaultConfigPath, {});

      expect(createShareableUrl).not.toHaveBeenCalled();
    });
  });

  describe('Priority 2: Explicit enable via CLI --share=true', () => {
    it('should share when cmdObj.share = true, overriding config.sharing = false', async () => {
      const cmdObj = { share: true, table: false, write: false };
      const config = { sharing: false } as UnifiedConfig;
      const evalRecord = new Eval(config);

      vi.mocked(cloudConfig.isEnabled).mockImplementation(function () {
        return false;
      });
      vi.mocked(resolveConfigs).mockResolvedValue({
        config,
        testSuite: { prompts: [], providers: [] },
        basePath: path.resolve('/'),
      });
      vi.mocked(evaluate).mockResolvedValue(evalRecord);

      await doEval(cmdObj, config, defaultConfigPath, {});

      expect(createShareableUrl).toHaveBeenCalledWith(expect.any(Eval), { silent: true });
    });

    it('should share when cmdObj.share = true, overriding commandLineOptions.share = false', async () => {
      const cmdObj = { share: true, table: false, write: false };
      const config = {} as UnifiedConfig;
      const evalRecord = new Eval(config);

      vi.mocked(cloudConfig.isEnabled).mockImplementation(function () {
        return false;
      });
      vi.mocked(resolveConfigs).mockResolvedValue({
        config,
        testSuite: { prompts: [], providers: [] },
        basePath: path.resolve('/'),
        commandLineOptions: { share: false },
      });
      vi.mocked(evaluate).mockResolvedValue(evalRecord);

      await doEval(cmdObj, config, defaultConfigPath, {});

      expect(createShareableUrl).toHaveBeenCalledWith(expect.any(Eval), { silent: true });
    });
  });

  describe('Priority 3: commandLineOptions.share from config file', () => {
    it('should share when commandLineOptions.share = true, overriding config.sharing = false', async () => {
      const cmdObj = { table: false, write: false };
      const config = { sharing: false } as UnifiedConfig;
      const evalRecord = new Eval(config);

      vi.mocked(cloudConfig.isEnabled).mockImplementation(function () {
        return false;
      });
      vi.mocked(resolveConfigs).mockResolvedValue({
        config,
        testSuite: { prompts: [], providers: [] },
        basePath: path.resolve('/'),
        commandLineOptions: { share: true },
      });
      vi.mocked(evaluate).mockResolvedValue(evalRecord);

      await doEval(cmdObj, config, defaultConfigPath, {});

      expect(createShareableUrl).toHaveBeenCalledWith(expect.any(Eval), { silent: true });
    });

    it('should not share when commandLineOptions.share = false, overriding cloud enabled', async () => {
      const cmdObj = { table: false, write: false };
      const config = {} as UnifiedConfig;
      const evalRecord = new Eval(config);

      vi.mocked(cloudConfig.isEnabled).mockImplementation(function () {
        return true;
      });
      vi.mocked(resolveConfigs).mockResolvedValue({
        config,
        testSuite: { prompts: [], providers: [] },
        basePath: path.resolve('/'),
        commandLineOptions: { share: false },
      });
      vi.mocked(evaluate).mockResolvedValue(evalRecord);

      await doEval(cmdObj, config, defaultConfigPath, {});

      expect(createShareableUrl).not.toHaveBeenCalled();
    });
  });

  describe('Priority 4: config.sharing from config file', () => {
    it('should share when config.sharing = true', async () => {
      const cmdObj = { table: false, write: false };
      const config = { sharing: true } as UnifiedConfig;
      const evalRecord = new Eval(config);

      vi.mocked(cloudConfig.isEnabled).mockImplementation(function () {
        return false;
      });
      vi.mocked(resolveConfigs).mockResolvedValue({
        config,
        testSuite: { prompts: [], providers: [] },
        basePath: path.resolve('/'),
      });
      vi.mocked(evaluate).mockResolvedValue(evalRecord);

      await doEval(cmdObj, config, defaultConfigPath, {});

      expect(createShareableUrl).toHaveBeenCalledWith(expect.any(Eval), { silent: true });
    });

    it('should not share when config.sharing = false, overriding cloud enabled', async () => {
      const cmdObj = { table: false, write: false };
      const config = { sharing: false } as UnifiedConfig;
      const evalRecord = new Eval(config);

      vi.mocked(cloudConfig.isEnabled).mockImplementation(function () {
        return true;
      });
      vi.mocked(resolveConfigs).mockResolvedValue({
        config,
        testSuite: { prompts: [], providers: [] },
        basePath: path.resolve('/'),
      });
      vi.mocked(evaluate).mockResolvedValue(evalRecord);

      await doEval(cmdObj, config, defaultConfigPath, {});

      expect(createShareableUrl).not.toHaveBeenCalled();
    });

    it('should share when config.sharing is an object (custom API URL)', async () => {
      const cmdObj = { table: false, write: false };
      const config = { sharing: { apiBaseUrl: 'https://custom.api.url' } } as UnifiedConfig;
      const evalRecord = new Eval(config);

      vi.mocked(cloudConfig.isEnabled).mockImplementation(function () {
        return false;
      });
      vi.mocked(resolveConfigs).mockResolvedValue({
        config,
        testSuite: { prompts: [], providers: [] },
        basePath: path.resolve('/'),
      });
      vi.mocked(evaluate).mockResolvedValue(evalRecord);

      await doEval(cmdObj, config, defaultConfigPath, {});

      expect(createShareableUrl).toHaveBeenCalledWith(expect.any(Eval), { silent: true });
    });
  });

  describe('Priority 5: Default to cloud auto-share when nothing explicitly set', () => {
    it('should share when cloud is enabled and no other settings are specified', async () => {
      const cmdObj = { table: false, write: false };
      const config = {} as UnifiedConfig;
      const evalRecord = new Eval(config);

      vi.mocked(cloudConfig.isEnabled).mockImplementation(function () {
        return true;
      });
      vi.mocked(resolveConfigs).mockResolvedValue({
        config,
        testSuite: { prompts: [], providers: [] },
        basePath: path.resolve('/'),
      });
      vi.mocked(evaluate).mockResolvedValue(evalRecord);

      await doEval(cmdObj, config, defaultConfigPath, {});

      expect(createShareableUrl).toHaveBeenCalledWith(expect.any(Eval), { silent: true });
    });

    it('should not share when cloud is disabled and no other settings are specified', async () => {
      const cmdObj = { table: false, write: false };
      const config = {} as UnifiedConfig;
      const evalRecord = new Eval(config);

      vi.mocked(cloudConfig.isEnabled).mockImplementation(function () {
        return false;
      });
      vi.mocked(resolveConfigs).mockResolvedValue({
        config,
        testSuite: { prompts: [], providers: [] },
        basePath: path.resolve('/'),
      });
      vi.mocked(evaluate).mockResolvedValue(evalRecord);

      await doEval(cmdObj, config, defaultConfigPath, {});

      expect(createShareableUrl).not.toHaveBeenCalled();
    });
  });

  describe('Edge cases and complex scenarios', () => {
    it('should handle config.sharing = undefined explicitly (not just missing)', async () => {
      const cmdObj = { table: false, write: false };
      const config = { sharing: undefined } as UnifiedConfig;
      const evalRecord = new Eval(config);

      vi.mocked(cloudConfig.isEnabled).mockImplementation(function () {
        return true;
      });
      vi.mocked(resolveConfigs).mockResolvedValue({
        config,
        testSuite: { prompts: [], providers: [] },
        basePath: path.resolve('/'),
      });
      vi.mocked(evaluate).mockResolvedValue(evalRecord);

      await doEval(cmdObj, config, defaultConfigPath, {});

      expect(createShareableUrl).toHaveBeenCalledWith(expect.any(Eval), { silent: true });
    });

    it('should respect commandLineOptions.share = true even when config.sharing = false and cloud disabled', async () => {
      const cmdObj = { table: false, write: false };
      const config = { sharing: false } as UnifiedConfig;
      const evalRecord = new Eval(config);

      vi.mocked(cloudConfig.isEnabled).mockImplementation(function () {
        return false;
      });
      vi.mocked(resolveConfigs).mockResolvedValue({
        config,
        testSuite: { prompts: [], providers: [] },
        basePath: path.resolve('/'),
        commandLineOptions: { share: true },
      });
      vi.mocked(evaluate).mockResolvedValue(evalRecord);

      await doEval(cmdObj, config, defaultConfigPath, {});

      expect(createShareableUrl).toHaveBeenCalledWith(expect.any(Eval), { silent: true });
    });

    it('should not call createShareableUrl when isSharingEnabled returns false', async () => {
      const cmdObj = { share: true, table: false, write: false };
      const config = {} as UnifiedConfig;
      const evalRecord = new Eval(config);

      vi.mocked(isSharingEnabled).mockImplementation(function () {
        return false;
      });
      vi.mocked(resolveConfigs).mockResolvedValue({
        config,
        testSuite: { prompts: [], providers: [] },
        basePath: path.resolve('/'),
      });
      vi.mocked(evaluate).mockResolvedValue(evalRecord);

      await doEval(cmdObj, config, defaultConfigPath, {});

      expect(createShareableUrl).not.toHaveBeenCalled();
    });
  });

  describe('Full precedence verification matrix', () => {
    const testMatrix = [
      // [cmdObj.share, cmdObj.noShare, commandLineOptions.share, config.sharing, cloudEnabled, expectedToShare, description]
      [false, undefined, undefined, undefined, false, false, 'CLI --share=false blocks everything'],
      [false, undefined, true, true, true, false, 'CLI --share=false overrides all other enables'],
      [undefined, true, true, true, true, false, 'CLI --no-share overrides all other enables'],
      [true, undefined, false, false, false, true, 'CLI --share=true overrides all disables'],
      [
        undefined,
        undefined,
        true,
        false,
        false,
        true,
        'commandLineOptions.share=true overrides config.sharing=false',
      ],
      [
        undefined,
        undefined,
        false,
        true,
        true,
        false,
        'commandLineOptions.share=false overrides config and cloud',
      ],
      [undefined, undefined, undefined, true, false, true, 'config.sharing=true enables sharing'],
      [
        undefined,
        undefined,
        undefined,
        false,
        true,
        false,
        'config.sharing=false blocks cloud auto-share',
      ],
      [
        undefined,
        undefined,
        undefined,
        undefined,
        true,
        true,
        'cloud enabled auto-shares when nothing set',
      ],
      [
        undefined,
        undefined,
        undefined,
        undefined,
        false,
        false,
        'no sharing when nothing enables it',
      ],
    ] as const;

    testMatrix.forEach(
      ([cmdShare, cmdNoShare, cloShare, cfgShare, cloudEnabled, expectedToShare, description]) => {
        it(description, async () => {
          const cmdObj: any = { table: false, write: false };
          if (cmdShare !== undefined) {
            cmdObj.share = cmdShare;
          }
          if (cmdNoShare !== undefined) {
            cmdObj.noShare = cmdNoShare;
          }

          const config = (cfgShare !== undefined ? { sharing: cfgShare } : {}) as UnifiedConfig;
          const evalRecord = new Eval(config);

          // Use mockReturnValue for synchronous returns, mockResolvedValue for async
          vi.mocked(cloudConfig.isEnabled).mockReturnValue(cloudEnabled);
          vi.mocked(resolveConfigs).mockResolvedValue({
            config,
            testSuite: { prompts: [], providers: [] },
            basePath: path.resolve('/'),
            commandLineOptions: cloShare !== undefined ? { share: cloShare } : undefined,
          });
          vi.mocked(evaluate).mockResolvedValue(evalRecord);

          await doEval(cmdObj, config, defaultConfigPath, {});

          if (expectedToShare) {
            expect(createShareableUrl).toHaveBeenCalledWith(expect.any(Eval), { silent: true });
          } else {
            expect(createShareableUrl).not.toHaveBeenCalled();
          }
        });
      },
    );
  });
});
