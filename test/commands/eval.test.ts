import * as path from 'path';

import { Command } from 'commander';
import { disableCache } from '../../src/cache';
import {
  doEval,
  evalCommand,
  formatTokenUsage,
  showRedteamProviderLabelMissingWarning,
} from '../../src/commands/eval';
import { evaluate } from '../../src/evaluator';
import { checkEmailStatusOrExit, promptForEmailUnverified } from '../../src/globalConfig/accounts';
import { cloudConfig } from '../../src/globalConfig/cloud';
import logger from '../../src/logger';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import { loadApiProvider } from '../../src/providers';
import { createShareableUrl, isSharingEnabled } from '../../src/share';
import { checkCloudPermissions, ConfigPermissionError } from '../../src/util/cloud';
import { resolveConfigs } from '../../src/util/config/load';
import { TokenUsageTracker } from '../../src/util/tokenUsage';

import type { ApiProvider, TestSuite, UnifiedConfig } from '../../src/types';

jest.mock('../../src/cache');
jest.mock('../../src/evaluator');
jest.mock('../../src/globalConfig/accounts');
jest.mock('../../src/globalConfig/cloud', () => ({
  cloudConfig: {
    isEnabled: jest.fn().mockReturnValue(false),
    getApiHost: jest.fn().mockReturnValue('https://api.promptfoo.app'),
  },
}));
jest.mock('../../src/migrate');
jest.mock('../../src/providers');
jest.mock('../../src/redteam/shared', () => ({}));
jest.mock('../../src/share');
jest.mock('../../src/table');
jest.mock('../../src/util/cloud', () => ({
  ...jest.requireActual('../../src/util/cloud'),
  getDefaultTeam: jest.fn().mockResolvedValue({ id: 'test-team-id', name: 'Test Team' }),
  checkCloudPermissions: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('fs');
jest.mock('path', () => {
  const actualPath = jest.requireActual('path');
  return {
    ...actualPath,
  };
});
jest.mock('../../src/util/config/load');
jest.mock('../../src/util/tokenUsage');
jest.mock('../../src/database/index', () => ({
  getDb: jest.fn(() => ({
    transaction: jest.fn((fn) => fn()),
    insert: jest.fn(() => ({
      values: jest.fn(() => ({
        onConflictDoNothing: jest.fn(() => ({
          run: jest.fn(),
        })),
        run: jest.fn(),
      })),
    })),
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => ({
          run: jest.fn(),
        })),
      })),
    })),
  })),
}));

describe('evalCommand', () => {
  let program: Command;
  const defaultConfig = {} as UnifiedConfig;
  const defaultConfigPath = 'config.yaml';

  beforeEach(() => {
    program = new Command();
    jest.clearAllMocks();
    jest.mocked(resolveConfigs).mockResolvedValue({
      config: defaultConfig,
      testSuite: {
        prompts: [],
        providers: [],
      },
      basePath: path.resolve('/'),
    });
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
    jest.mocked(evaluate).mockResolvedValue(mockEvalRecord);

    await doEval(cmdObj, defaultConfig, defaultConfigPath, {});
    expect(runDbMigrations).toHaveBeenCalledTimes(1);
  });

  it('should handle redteam config', async () => {
    const cmdObj = {};
    const config = {
      redteam: { plugins: ['test-plugin'] as any },
      prompts: [],
    } as UnifiedConfig;

    jest.mocked(resolveConfigs).mockResolvedValue({
      config,
      testSuite: {
        prompts: [],
        providers: [],
        tests: [{ vars: { test: 'value' } }],
      },
      basePath: path.resolve('/'),
    });

    const mockEvalRecord = new Eval(config);
    jest.mocked(evaluate).mockResolvedValue(mockEvalRecord);

    await doEval(cmdObj, config, defaultConfigPath, {});

    expect(promptForEmailUnverified).toHaveBeenCalledTimes(1);
    expect(checkEmailStatusOrExit).toHaveBeenCalledTimes(1);
  });

  it('should handle share option when enabled', async () => {
    const cmdObj = { share: true };
    const config = { sharing: true } as UnifiedConfig;
    const evalRecord = new Eval(config);

    jest.mocked(resolveConfigs).mockResolvedValue({
      config,
      testSuite: {
        prompts: [],
        providers: [],
      },
      basePath: path.resolve('/'),
    });

    jest.mocked(evaluate).mockResolvedValue(evalRecord);
    jest.mocked(isSharingEnabled).mockReturnValue(true);
    jest.mocked(createShareableUrl).mockResolvedValue('http://share.url');

    await doEval(cmdObj, config, defaultConfigPath, {});

    expect(createShareableUrl).toHaveBeenCalledWith(expect.any(Eval));
  });

  it('should not share when share is explicitly set to false even if config has sharing enabled', async () => {
    const cmdObj = { share: false };
    const config = { sharing: true } as UnifiedConfig;
    const evalRecord = new Eval(config);

    jest.mocked(resolveConfigs).mockResolvedValue({
      config,
      testSuite: {
        prompts: [],
        providers: [],
      },
      basePath: path.resolve('/'),
    });

    jest.mocked(evaluate).mockResolvedValue(evalRecord);
    jest.mocked(isSharingEnabled).mockReturnValue(true);

    await doEval(cmdObj, config, defaultConfigPath, {});

    expect(createShareableUrl).not.toHaveBeenCalled();
  });

  it('should share when share is true even if config has no sharing enabled', async () => {
    const cmdObj = { share: true };
    const config = {} as UnifiedConfig;
    const evalRecord = new Eval(config);

    jest.mocked(resolveConfigs).mockResolvedValue({
      config,
      testSuite: {
        prompts: [],
        providers: [],
      },
      basePath: path.resolve('/'),
    });

    jest.mocked(evaluate).mockResolvedValue(evalRecord);
    jest.mocked(isSharingEnabled).mockReturnValue(true);
    jest.mocked(createShareableUrl).mockResolvedValue('http://share.url');

    await doEval(cmdObj, config, defaultConfigPath, {});

    expect(createShareableUrl).toHaveBeenCalledWith(expect.any(Eval));
  });

  it('should share when share is undefined and config has sharing enabled', async () => {
    const cmdObj = {};
    const config = { sharing: true } as UnifiedConfig;
    const evalRecord = new Eval(config);

    jest.mocked(resolveConfigs).mockResolvedValue({
      config,
      testSuite: {
        prompts: [],
        providers: [],
      },
      basePath: path.resolve('/'),
    });

    jest.mocked(evaluate).mockResolvedValue(evalRecord);
    jest.mocked(isSharingEnabled).mockReturnValue(true);
    jest.mocked(createShareableUrl).mockResolvedValue('http://share.url');

    await doEval(cmdObj, config, defaultConfigPath, {});

    expect(createShareableUrl).toHaveBeenCalledWith(expect.any(Eval));
  });

  it('should auto-share when connected to cloud even if sharing is not explicitly enabled', async () => {
    const cmdObj = {};
    const config = {} as UnifiedConfig; // No sharing config
    const evalRecord = new Eval(config);

    // Mock cloud config as enabled
    jest.mocked(cloudConfig.isEnabled).mockReturnValue(true);

    jest.mocked(resolveConfigs).mockResolvedValue({
      config,
      testSuite: {
        prompts: [],
        providers: [],
      },
      basePath: path.resolve('/'),
    });

    jest.mocked(evaluate).mockResolvedValue(evalRecord);
    jest.mocked(isSharingEnabled).mockReturnValue(true);
    jest.mocked(createShareableUrl).mockResolvedValue('http://share.url');

    await doEval(cmdObj, config, defaultConfigPath, {});

    expect(createShareableUrl).toHaveBeenCalledWith(expect.any(Eval));
  });

  it('should not auto-share when connected to cloud if share is explicitly set to false', async () => {
    const cmdObj = { share: false };
    const config = {} as UnifiedConfig;
    const evalRecord = new Eval(config);

    // Mock cloud config as enabled
    jest.mocked(cloudConfig.isEnabled).mockReturnValueOnce(true);

    jest.mocked(resolveConfigs).mockResolvedValue({
      config,
      testSuite: {
        prompts: [],
        providers: [],
      },
      basePath: path.resolve('/'),
    });

    jest.mocked(evaluate).mockResolvedValue(evalRecord);
    jest.mocked(isSharingEnabled).mockReturnValueOnce(true);

    await doEval(cmdObj, config, defaultConfigPath, {});

    expect(createShareableUrl).not.toHaveBeenCalled();
  });

  it('should handle grader option', async () => {
    const cmdObj = { grader: 'test-grader' };
    const mockProvider = {
      id: () => 'test-grader',
      callApi: async () => ({ output: 'test' }),
    } as ApiProvider;

    jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);

    await doEval(cmdObj, defaultConfig, defaultConfigPath, {});

    expect(loadApiProvider).toHaveBeenCalledWith('test-grader');
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
    jest.clearAllMocks();
  });

  it('should fail when checkCloudPermissions throws an error', async () => {
    // Mock cloudConfig to be enabled
    jest.mocked(cloudConfig.isEnabled).mockReturnValue(true);

    // Mock checkCloudPermissions to throw an error
    const permissionError = new ConfigPermissionError('Permission denied: insufficient access');
    jest.mocked(checkCloudPermissions).mockRejectedValueOnce(permissionError);

    // Setup the test configuration
    const config = {
      providers: ['openai:gpt-4'],
    } as UnifiedConfig;

    jest.mocked(resolveConfigs).mockResolvedValue({
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
    jest.mocked(cloudConfig.isEnabled).mockReturnValue(true);

    // Mock checkCloudPermissions to succeed (resolve without throwing)
    jest.mocked(checkCloudPermissions).mockResolvedValueOnce(undefined);

    // Setup the test configuration
    const config = {
      providers: ['openai:gpt-4'],
    } as UnifiedConfig;

    jest.mocked(resolveConfigs).mockResolvedValue({
      config,
      testSuite: {
        prompts: [],
        providers: [{ id: () => 'openai:gpt-4', callApi: async () => ({}) }],
        tests: [],
      },
      basePath: path.resolve('/'),
    });

    const mockEvalRecord = new Eval(config);
    jest.mocked(evaluate).mockResolvedValue(mockEvalRecord);

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
    jest.mocked(cloudConfig.isEnabled).mockReturnValue(false);

    // Mock checkCloudPermissions to succeed (it should return early due to disabled cloud)
    jest.mocked(checkCloudPermissions).mockResolvedValueOnce(undefined);

    // Setup the test configuration
    const config = {
      providers: ['openai:gpt-4'],
    } as UnifiedConfig;

    jest.mocked(resolveConfigs).mockResolvedValue({
      config,
      testSuite: {
        prompts: [],
        providers: [{ id: () => 'openai:gpt-4', callApi: async () => ({}) }],
        tests: [],
      },
      basePath: path.resolve('/'),
    });

    const mockEvalRecord = new Eval(config);
    jest.mocked(evaluate).mockResolvedValue(mockEvalRecord);

    const cmdObj = {};

    await doEval(cmdObj, config, defaultConfigPath, {});

    // Verify checkCloudPermissions was called (but returns early due to disabled cloud)
    expect(checkCloudPermissions).toHaveBeenCalledWith(config);

    // Verify that evaluate was called
    expect(evaluate).toHaveBeenCalled();
  });
});

describe('formatTokenUsage', () => {
  it('should format complete token usage data', () => {
    const usage = {
      total: 1000,
      prompt: 400,
      completion: 600,
      cached: 200,
      completionDetails: {
        reasoning: 300,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
    };

    const result = formatTokenUsage(usage);
    expect(result).toBe('1,000 total / 400 prompt / 600 completion / 200 cached / 300 reasoning');
  });

  it('should handle partial token usage data', () => {
    const usage = {
      total: 1000,
    };

    const result = formatTokenUsage(usage);
    expect(result).toBe('1,000 total');
  });

  it('should handle empty token usage', () => {
    const usage = {};

    const result = formatTokenUsage(usage);
    expect(result).toBe('');
  });
});

describe('showRedteamProviderLabelMissingWarning', () => {
  const mockWarn = jest.spyOn(logger, 'warn');

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
  let mockTokenUsageTracker: jest.Mocked<TokenUsageTracker>;
  const mockLogger = jest.spyOn(logger, 'info');

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger.mockClear();

    mockTokenUsageTracker = {
      getProviderIds: jest.fn(),
      getProviderUsage: jest.fn(),
      trackUsage: jest.fn(),
      resetAllUsage: jest.fn(),
      resetProviderUsage: jest.fn(),
      getTotalUsage: jest.fn(),
      cleanup: jest.fn(),
    } as any;

    jest.mocked(TokenUsageTracker.getInstance).mockReturnValue(mockTokenUsageTracker);
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
    mockTokenUsageTracker.getProviderUsage.mockImplementation(
      (id: string) => providerUsageData[id as keyof typeof providerUsageData],
    );

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
    jest.clearAllMocks();
    jest.mocked(resolveConfigs).mockResolvedValue({
      config: defaultConfig,
      testSuite: {
        prompts: [],
        providers: [],
        defaultTest: undefined,
      },
      basePath: path.resolve('/'),
    });
  });

  it('should handle grader option with string defaultTest', async () => {
    const cmdObj = { grader: 'test-grader' };
    const mockProvider = {
      id: () => 'test-grader',
      callApi: async () => ({ output: 'test' }),
    } as ApiProvider;

    jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);

    const testSuite = {
      prompts: [],
      providers: [],
      defaultTest: 'file://defaultTest.yaml',
    } as TestSuite;

    jest.mocked(resolveConfigs).mockResolvedValue({
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

    jest.mocked(resolveConfigs).mockResolvedValue({
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

    jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);

    const testSuite = {
      prompts: [],
      providers: [],
      defaultTest: {
        options: {},
        assert: [{ type: 'equals' as const, value: 'test' }],
        vars: { existing: 'var' },
      },
    } as TestSuite;

    jest.mocked(resolveConfigs).mockResolvedValue({
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

    jest.mocked(resolveConfigs).mockResolvedValue({
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
