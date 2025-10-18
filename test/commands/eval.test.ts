import * as path from 'path';

import { Command } from 'commander';
import { disableCache } from '../../src/cache';
import {
  doEval,
  evalCommand,
  formatTokenUsage,
  generateEvalSummary,
  showRedteamProviderLabelMissingWarning,
} from '../../src/commands/eval';
import type { EvalSummaryParams } from '../../src/commands/eval';
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
import { checkCloudPermissions, ConfigPermissionError } from '../../src/util/cloud';
import { resolveConfigs } from '../../src/util/config/load';
import { TokenUsageTracker } from '../../src/util/tokenUsage';
import { stripAnsi } from '../util/utils';

import type { ApiProvider, TestSuite, UnifiedConfig } from '../../src/types/index';

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
    jest.mocked(promptForEmailUnverified).mockResolvedValue({ emailNeedsValidation: false });
    jest.mocked(checkEmailStatusAndMaybeExit).mockResolvedValue('ok');
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
    expect(checkEmailStatusAndMaybeExit).toHaveBeenCalledTimes(1);
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
    jest.mocked(promptForEmailUnverified).mockResolvedValue({ emailNeedsValidation: false });
    jest.mocked(checkEmailStatusAndMaybeExit).mockResolvedValue('ok');
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
    jest.mocked(promptForEmailUnverified).mockResolvedValue({ emailNeedsValidation: false });
    jest.mocked(checkEmailStatusAndMaybeExit).mockResolvedValue('ok');
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

describe('generateEvalSummary', () => {
  let mockTracker: jest.Mocked<TokenUsageTracker>;

  beforeEach(() => {
    mockTracker = {
      getProviderIds: jest.fn().mockReturnValue([]),
      getProviderUsage: jest.fn(),
      trackUsage: jest.fn(),
      resetAllUsage: jest.fn(),
      resetProviderUsage: jest.fn(),
      getTotalUsage: jest.fn(),
      cleanup: jest.fn(),
    } as any;
  });

  describe('completion message', () => {
    it('should show basic completion message when not writing to database', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-123',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 0 },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).toContain('✓ Eval complete');
      expect(output).not.toContain('eval-123');
    });

    it('should show eval ID when writing to database without shareable URL', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-456',
        isRedteam: false,
        writeToDatabase: true,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 0 },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).toContain('✓ Eval complete (ID: eval-456)');
    });

    it('should show shareable URL when available', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-789',
        isRedteam: false,
        writeToDatabase: true,
        shareableUrl: 'https://promptfoo.app/eval/abc123',
        wantsToShare: true,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 0 },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).toContain('✓ Eval complete: https://promptfoo.app/eval/abc123');
      expect(output).not.toContain('eval-789');
    });

    it('should say "Red team complete" for red team evals', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-rt-1',
        isRedteam: true,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 0 },
        successes: 10,
        failures: 2,
        errors: 0,
        duration: 8000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).toContain('✓ Red team complete');
      expect(output).not.toContain('Eval complete');
    });
  });

  describe('token usage', () => {
    it('should display eval tokens correctly', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-123',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: {
          total: 1000,
          prompt: 400,
          completion: 600,
          cached: 0,
        },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).toContain('Tokens:');
      expect(output).toContain('Eval: 1,000 (400 prompt, 600 completion)');
    });

    it('should display grading tokens only when no eval tokens (critical bug fix)', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-grading-only',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: {
          total: 0,
          assertions: {
            total: 500,
            prompt: 200,
            completion: 300,
            cached: 0,
          },
        },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).toContain('Tokens:');
      expect(output).toContain('Grading: 500 (200 prompt, 300 completion)');
      expect(output).not.toContain('Eval:');
    });

    it('should display both eval and grading tokens', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-both',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: {
          total: 1000,
          prompt: 400,
          completion: 600,
          assertions: {
            total: 500,
            prompt: 200,
            completion: 300,
          },
        },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).toContain('Tokens:');
      expect(output).toContain('Eval: 1,000 (400 prompt, 600 completion)');
      expect(output).toContain('Grading: 500 (200 prompt, 300 completion)');
    });

    it('should show 100% cached correctly', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-cached',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: {
          total: 1000,
          cached: 1000,
        },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).toContain('Tokens:');
      expect(output).toContain('Eval: 1,000 (cached)');
    });

    it('should show partial cached tokens', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-partial-cache',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: {
          total: 1000,
          prompt: 400,
          completion: 600,
          cached: 200,
        },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).toContain('Eval: 1,000 (400 prompt, 600 completion, 200 cached)');
    });

    it('should not show token section when no tokens', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-no-tokens',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 0 },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).not.toContain('Tokens:');
    });
  });

  describe('provider breakdown', () => {
    it('should show provider breakdown with request counts', () => {
      mockTracker.getProviderIds.mockReturnValue(['openai:gpt-4', 'anthropic:claude-3']);
      mockTracker.getProviderUsage.mockImplementation((id: string) => {
        if (id === 'openai:gpt-4') {
          return {
            total: 1500,
            prompt: 600,
            completion: 900,
            cached: 0,
            numRequests: 5,
          };
        }
        if (id === 'anthropic:claude-3') {
          return {
            total: 800,
            prompt: 300,
            completion: 500,
            cached: 0,
            numRequests: 3,
          };
        }
        return undefined;
      });

      const params: EvalSummaryParams = {
        evalId: 'eval-providers',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 2300 },
        successes: 8,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).toContain('Providers:');
      expect(output).toContain('openai:gpt-4');
      expect(output).toContain('1,500 (5 requests; 600 prompt, 900 completion)');
      expect(output).toContain('anthropic:claude-3');
      expect(output).toContain('800 (3 requests; 300 prompt, 500 completion)');
    });

    it('should always show request count even when 0', () => {
      mockTracker.getProviderIds.mockReturnValue(['openai:gpt-4', 'anthropic:claude-3']);
      mockTracker.getProviderUsage.mockImplementation((id: string) => {
        if (id === 'openai:gpt-4') {
          return {
            total: 1000,
            cached: 1000,
            numRequests: 0,
          };
        }
        if (id === 'anthropic:claude-3') {
          return {
            total: 500,
            prompt: 200,
            completion: 300,
            numRequests: 2,
          };
        }
        return undefined;
      });

      const params: EvalSummaryParams = {
        evalId: 'eval-zero-requests',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 1500 },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).toContain('Providers:');
      expect(output).toContain('openai:gpt-4: 1,000 (0 requests; cached)');
      expect(output).toContain('anthropic:claude-3: 500 (2 requests; 200 prompt, 300 completion)');
    });
  });

  describe('pass rate and results', () => {
    it('should show 100% pass rate in green', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-100',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 0 },
        successes: 10,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const plainOutput = stripAnsi(lines.join('\n'));

      expect(plainOutput).toContain('Results:');
      expect(plainOutput).toContain('10 passed');
      expect(plainOutput).toContain('0 failed');
      expect(plainOutput).toContain('0 errors');
      expect(plainOutput).toContain('(100%)');
    });

    it('should show 80%+ pass rate in yellow', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-85',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 0 },
        successes: 17,
        failures: 3,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const plainOutput = stripAnsi(lines.join('\n'));

      expect(plainOutput).toContain('Results:');
      expect(plainOutput).toContain('17 passed');
      expect(plainOutput).toContain('3 failed');
      expect(plainOutput).toContain('(85.00%)');
    });

    it('should show <80% pass rate in red', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-50',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 0 },
        successes: 5,
        failures: 5,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const plainOutput = stripAnsi(lines.join('\n'));

      expect(plainOutput).toContain('Results:');
      expect(plainOutput).toContain('5 passed');
      expect(plainOutput).toContain('5 failed');
      expect(plainOutput).toContain('(50.00%)');
    });

    it('should include errors in results', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-errors',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 0 },
        successes: 8,
        failures: 1,
        errors: 1,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const plainOutput = stripAnsi(lines.join('\n'));

      expect(plainOutput).toContain('Results:');
      expect(plainOutput).toContain('8 passed');
      expect(plainOutput).toContain('1 failed');
      expect(plainOutput).toContain('1 errors');
      expect(plainOutput).toContain('(80.00%)');
    });
  });

  describe('guidance messages', () => {
    it('should show guidance when writing to database without shareable URL', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-view',
        isRedteam: false,
        writeToDatabase: true,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 0 },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).toContain('» View results: promptfoo view');
      expect(output).toContain('» Share with your team: https://promptfoo.app');
      expect(output).toContain('» Feedback: https://promptfoo.dev/feedback');
    });

    it('should show share guidance with cloud enabled', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-share-cloud',
        isRedteam: false,
        writeToDatabase: true,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: true,
        tokenUsage: { total: 0 },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).toContain('» View results: promptfoo view');
      expect(output).toContain('» Create shareable URL: promptfoo share');
      expect(output).not.toContain('https://promptfoo.app');
    });

    it('should NOT show share guidance when explicitly disabled (--no-share)', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-no-share',
        isRedteam: false,
        writeToDatabase: true,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: true,
        cloudEnabled: false,
        tokenUsage: { total: 0 },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).toContain('» View results: promptfoo view');
      expect(output).not.toContain('» Share with your team');
      expect(output).not.toContain('» Create shareable URL');
    });

    it('should NOT show guidance when not writing to database', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-no-write',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 0 },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).not.toContain('» View results:');
      expect(output).not.toContain('» Share');
      expect(output).not.toContain('» Feedback:');
    });

    it('should NOT show guidance when shareable URL is present', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-with-url',
        isRedteam: false,
        writeToDatabase: true,
        shareableUrl: 'https://promptfoo.app/eval/abc123',
        wantsToShare: true,
        hasExplicitDisable: false,
        cloudEnabled: true,
        tokenUsage: { total: 0 },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).not.toContain('» View results:');
      expect(output).not.toContain('» Share');
      expect(output).not.toContain('» Feedback:');
    });
  });

  describe('performance metrics', () => {
    it('should show duration and concurrency', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-perf',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 0 },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 125, // 125 seconds = 2m 5s
        maxConcurrency: 8,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).toContain('Duration:');
      expect(output).toContain('(concurrency: 8)');
    });
  });
});
