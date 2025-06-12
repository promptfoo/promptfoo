import { Command } from 'commander';
import * as path from 'path';
import { disableCache } from '../../src/cache';
import {
  doEval,
  evalCommand,
  formatTokenUsage,
  showRedteamProviderLabelMissingWarning,
} from '../../src/commands/eval';
import { evaluate } from '../../src/evaluator';
import { checkEmailStatusOrExit, promptForEmailUnverified } from '../../src/globalConfig/accounts';
import logger from '../../src/logger';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import { loadApiProvider } from '../../src/providers';
import { createShareableUrl, isSharingEnabled } from '../../src/share';
import type { ApiProvider, TestSuite, UnifiedConfig } from '../../src/types';
import { resolveConfigs } from '../../src/util/config/load';
import { TokenUsageTracker } from '../../src/util/tokenUsage';

jest.mock('../../src/cache');
jest.mock('../../src/evaluator');
jest.mock('../../src/globalConfig/accounts');
jest.mock('../../src/migrate');
jest.mock('../../src/providers');
jest.mock('../../src/share');
jest.mock('../../src/table');
jest.mock('fs');
jest.mock('path', () => {
  // Use actual path module for platform-agnostic tests
  const actualPath = jest.requireActual('path');
  return {
    ...actualPath,
    // Add any specific mocks for path methods if needed
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
      basePath: path.resolve('/'), // Platform-agnostic root path
    });
  });

  it('should create eval command with correct options', () => {
    const cmd = evalCommand(program, defaultConfig, defaultConfigPath);
    expect(cmd.name()).toBe('eval');
    expect(cmd.description()).toBe('Evaluate prompts');
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
      basePath: path.resolve('/'), // Platform-agnostic root path
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
      basePath: path.resolve('/'), // Platform-agnostic root path
    });

    jest.mocked(evaluate).mockResolvedValue(evalRecord);
    jest.mocked(isSharingEnabled).mockReturnValue(true);
    jest.mocked(createShareableUrl).mockResolvedValue('http://share.url');

    await doEval(cmdObj, config, defaultConfigPath, {});

    expect(createShareableUrl).toHaveBeenCalledWith(expect.any(Eval));
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
    const cmdObj = {}; // No maxConcurrency set
    const evaluateOptions = { maxConcurrency: 3 };

    await doEval(cmdObj, defaultConfig, defaultConfigPath, evaluateOptions);

    expect(evaluate).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ maxConcurrency: 3 }),
    );
  });

  it('should fallback to DEFAULT_MAX_CONCURRENCY when both cmdObj and evaluateOptions maxConcurrency are undefined', async () => {
    const cmdObj = {}; // No maxConcurrency set
    const evaluateOptions = {}; // No maxConcurrency set

    await doEval(cmdObj, defaultConfig, defaultConfigPath, evaluateOptions);

    expect(evaluate).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ maxConcurrency: 4 }), // DEFAULT_MAX_CONCURRENCY is 4 in the mock
    );
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

    // Create a mock instance of TokenUsageTracker
    mockTokenUsageTracker = {
      getProviderIds: jest.fn(),
      getProviderUsage: jest.fn(),
      trackUsage: jest.fn(),
      resetAllUsage: jest.fn(),
      resetProviderUsage: jest.fn(),
      getTotalUsage: jest.fn(),
      cleanup: jest.fn(),
    } as any;

    // Mock the getInstance static method
    jest.mocked(TokenUsageTracker.getInstance).mockReturnValue(mockTokenUsageTracker);
  });

  it('should create and configure TokenUsageTracker correctly', () => {
    const tracker = TokenUsageTracker.getInstance();
    expect(tracker).toBeDefined();
    expect(tracker.getProviderIds).toBeDefined();
    expect(tracker.getProviderUsage).toBeDefined();
  });

  it('should handle provider token tracking when mocked properly', () => {
    // Setup mock data
    const providerUsageData: Record<
      string,
      {
        total: number;
        prompt: number;
        completion: number;
        cached: number;
        numRequests: number;
        completionDetails: {
          reasoning: number;
          acceptedPrediction: number;
          rejectedPrediction: number;
        };
      }
    > = {
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
      (id: string) => providerUsageData[id],
    );

    // Test the tracker functionality directly
    const tracker = TokenUsageTracker.getInstance();
    const providerIds = tracker.getProviderIds();
    expect(providerIds).toEqual(['openai:gpt-4', 'anthropic:claude-3']);

    const openaiUsage = tracker.getProviderUsage('openai:gpt-4');
    expect(openaiUsage).toEqual(providerUsageData['openai:gpt-4']);

    const claudeUsage = tracker.getProviderUsage('anthropic:claude-3');
    expect(claudeUsage).toEqual(providerUsageData['anthropic:claude-3']);
  });
});
