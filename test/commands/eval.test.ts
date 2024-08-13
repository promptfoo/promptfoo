import { doEval } from '../../src/commands/eval';
import * as config from '../../src/config';
import * as evaluator from '../../src/evaluator';
import * as logger from '../../src/logger';
import * as telemetry from '../../src/telemetry';

// Mock dependencies
jest.mock('../../src/config');
jest.mock('../../src/evaluator');
jest.mock('../../src/logger');
jest.mock('../../src/telemetry');
jest.mock('../../src/share');
jest.mock('../../src/util');

// Mock process.exit to prevent tests from actually exiting
jest.spyOn(process, 'exit').mockImplementation((code?: number | string | null) => {
  throw new Error(`Process.exit called with code ${code}`);
});

describe('doEval function', () => {
  beforeEach(() => {
    jest.resetAllMocks();

    // Update mocks
    (jest.mocked(config.resolveConfigs)).mockResolvedValue({
      config: {
        prompts: ['Test prompt'],
        providers: ['Test provider'],
      },
      testSuite: { tests: [], providers: [], prompts: [] },
      basePath: '/test/path',
    });

    (jest.mocked(evaluator.evaluate)).mockResolvedValue({
      stats: {
        successes: 5,
        failures: 0,
        tokenUsage: { total: 100, prompt: 50, completion: 50, cached: 0 },
      },
      results: [],
      table: { body: [], head: [] },
      prompts: [{ raw: '', label: '', provider: '' }],
      vars: {},
    });

    (jest.mocked(telemetry.send)).mockResolvedValue(undefined);
  });

  it('should run evaluation with default settings', async () => {
    const mockCmdObj = {
      verbose: false,
      cache: true,
      progressBar: true,
      delay: '0',
      providers: [],
      maxConcurrency: '1',
      repeat: '1',
      output: [],
    } as const;
    const mockDefaultConfig = {};
    const mockEvaluateOptions = {};

    await doEval(mockCmdObj, mockDefaultConfig, undefined, mockEvaluateOptions);

    expect(config.resolveConfigs).toHaveBeenCalledWith(mockCmdObj, mockDefaultConfig);
    expect(evaluator.evaluate).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Evaluation complete'));
    expect(telemetry.send).toHaveBeenCalled();
  });

  it('should handle verbose mode', async () => {
    const mockCmdObj = {
      verbose: true,
      cache: true,
      progressBar: true,
      delay: '0',
      providers: [],
      maxConcurrency: '1',
      repeat: '1',
      output: [],
    } as const;

    await doEval(mockCmdObj, {}, undefined, {});

    expect(logger.setLogLevel).toHaveBeenCalledWith('debug');
  });

  it('should disable cache when specified', async () => {
    const mockCmdObj = {
      verbose: false,
      cache: false,
      progressBar: true,
      delay: '0',
      providers: [],
      maxConcurrency: '1',
      repeat: '1',
      output: [],
    } as const;

    await doEval(mockCmdObj, {}, undefined, {});

    expect(logger.info).toHaveBeenCalledWith('Cache is disabled.');
  });

  // Add more tests for different scenarios and edge cases
});

// Additional tests for helper functions and edge cases
