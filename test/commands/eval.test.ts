import { Command } from 'commander';
import { disableCache } from '../../src/cache';
import { doEval, evalCommand } from '../../src/commands/eval';
import { evaluate } from '../../src/evaluator';
import { checkEmailStatusOrExit, promptForEmailUnverified } from '../../src/globalConfig/accounts';
import { runDbMigrations } from '../../src/migrate';
import type Eval from '../../src/models/eval';
import { resolveConfigs } from '../../src/util/config/load';

jest.mock('../../src/evaluator');
jest.mock('../../src/globalConfig/accounts');
jest.mock('../../src/logger');
jest.mock('../../src/migrate');
jest.mock('../../src/providers');
jest.mock('../../src/share');
jest.mock('../../src/util');
jest.mock('../../src/util/config/load');
jest.mock('../../src/cache');

describe('doEval', () => {
  const mockEvalRecord = {
    id: 'test-eval-id',
    prompts: [
      {
        metrics: {
          testPassCount: 1,
          testFailCount: 0,
          testErrorCount: 0,
          tokenUsage: {
            total: 100,
            prompt: 50,
            completion: 50,
            cached: 0,
            numRequests: 1,
          },
        },
      },
    ],
    getTable: jest.fn().mockResolvedValue({
      head: [],
      body: [],
    }),
  } as unknown as Eval;

  const mockConfig = {
    prompts: ['test prompt'],
    providers: ['test-provider'],
    tests: [
      {
        description: 'test case',
        assert: [
          {
            type: 'equals' as const,
            value: 'test assertion',
          },
        ],
      },
    ],
  };

  const mockTestSuite = {
    prompts: [
      {
        raw: 'test prompt',
        label: 'test',
      },
    ],
    providers: [
      {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({ output: 'test output' }),
      },
    ],
    tests: [
      {
        description: 'test case',
        assert: [
          {
            type: 'equals' as const,
            value: 'test assertion',
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(resolveConfigs).mockResolvedValue({
      config: mockConfig,
      testSuite: mockTestSuite,
      basePath: '/test/path',
    });
    jest.mocked(evaluate).mockResolvedValue(mockEvalRecord);
    jest.mocked(runDbMigrations).mockResolvedValue();
  });

  it('should apply config evaluateOptions', async () => {
    const cmdObj = {};
    const defaultConfig = {
      evaluateOptions: {
        generateSuggestions: true,
        maxConcurrency: 2,
      },
    };
    const evaluateOptions = {};

    jest.mocked(resolveConfigs).mockResolvedValue({
      config: {
        ...mockConfig,
        evaluateOptions: defaultConfig.evaluateOptions,
      },
      testSuite: mockTestSuite,
      basePath: '/test/path',
    });

    await doEval(cmdObj, defaultConfig, undefined, evaluateOptions);

    expect(evaluate).toHaveBeenCalledWith(
      mockTestSuite,
      expect.any(Object),
      expect.objectContaining({
        generateSuggestions: true,
        maxConcurrency: 2,
      }),
    );
  });

  it('should handle redteam config', async () => {
    const cmdObj = {};
    const defaultConfig = {};
    const evaluateOptions = {};

    jest.mocked(resolveConfigs).mockResolvedValue({
      config: {
        ...mockConfig,
        redteam: {
          plugins: [{ id: 'test-plugin' }],
        },
      },
      testSuite: mockTestSuite,
      basePath: '/test/path',
    });

    await doEval(cmdObj, defaultConfig, undefined, evaluateOptions);

    expect(promptForEmailUnverified).toHaveBeenCalledWith();
    expect(checkEmailStatusOrExit).toHaveBeenCalledWith();
  });

  it('should disable cache when repeat > 1', async () => {
    const cmdObj = {
      repeat: 2,
    };
    const defaultConfig = {};
    const evaluateOptions = {};

    await doEval(cmdObj, defaultConfig, undefined, evaluateOptions);

    expect(disableCache).toHaveBeenCalledWith();
  });

  it('should handle delay option', async () => {
    const cmdObj = {
      delay: 1000,
    };
    const defaultConfig = {};
    const evaluateOptions = {};

    await doEval(cmdObj, defaultConfig, undefined, evaluateOptions);

    expect(evaluate).toHaveBeenCalledWith(
      mockTestSuite,
      expect.any(Object),
      expect.objectContaining({
        maxConcurrency: 1,
        delay: 1000,
      }),
    );
  });
});

describe('evalCommand', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
  });

  it('should set up command with correct options', () => {
    const defaultConfig = {};

    const cmd = evalCommand(program, defaultConfig, undefined);

    expect(cmd.name()).toBe('eval');
    expect(cmd.description()).toBe('Evaluate prompts');

    const options = cmd.opts();
    expect(options).toEqual(expect.any(Object));
  });

  it('should set up command with default config options', () => {
    const defaultConfig = {
      evaluateOptions: {
        maxConcurrency: 2,
        generateSuggestions: true,
      },
    };

    const cmd = evalCommand(program, defaultConfig, undefined);

    expect(cmd.name()).toBe('eval');
    const options = cmd.opts();
    expect(options).toEqual(expect.any(Object));
  });
});
