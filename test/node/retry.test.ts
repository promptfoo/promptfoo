import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { evaluate } from '../../src/evaluator';
import logger from '../../src/logger';
import Eval from '../../src/models/eval';
import { notifyEvaluationChanged } from '../../src/models/evalMutation';
import {
  deleteErrorResults,
  getErrorResultIds,
  recalculatePromptMetrics,
  retryCommand,
} from '../../src/node/retry';
import { createShareableUrl, isSharingEnabled } from '../../src/share';
import { ResultFailureReason } from '../../src/types/index';
import { resolveConfigs } from '../../src/util/config/load';
import { writeMultipleOutputs } from '../../src/util/output';
import { shouldShareResults } from '../../src/util/sharing';

import type { TestSuite, UnifiedConfig } from '../../src/types/index';

const dbMocks = vi.hoisted(() => {
  const errorRows: Array<{ id: string }> = [];
  const affectedEvalRows: Array<{ evalId: string }> = [];
  const errorRowsAll = vi.fn(async () => errorRows);
  const affectedEvalRowsAll = vi.fn(async () => affectedEvalRows);
  const deleteRun = vi.fn(async () => undefined);
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: errorRowsAll,
        })),
      })),
    })),
    selectDistinct: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: affectedEvalRowsAll,
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => ({
        run: deleteRun,
      })),
    })),
  };

  return {
    affectedEvalRows,
    db,
    deleteRun,
    errorRows,
  };
});

vi.mock('../../src/database/index', () => ({
  getDb: vi.fn(async () => dbMocks.db),
}));
vi.mock('../../src/evaluator');
vi.mock('../../src/logger');
vi.mock('../../src/models/eval');
vi.mock('../../src/models/evalMutation');
vi.mock('../../src/share');
vi.mock('../../src/util/config/load', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/util/config/load')>()),
  resolveConfigs: vi.fn(),
}));
vi.mock('../../src/util/output');
vi.mock('../../src/util/sharing');

const testSuite = {
  prompts: [],
  providers: [],
  tests: [],
} as unknown as TestSuite;

function createEval(overrides: Partial<Eval> = {}): Eval {
  return {
    id: 'eval-123',
    config: {},
    persisted: false,
    prompts: [],
    addPrompts: vi.fn().mockResolvedValue(undefined),
    fetchResultsBatched: vi.fn(async function* () {}),
    getProvidersFromResults: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as Eval;
}

function mockResolvedConfig({
  commandLineOptions,
  config,
}: {
  commandLineOptions?: Record<string, unknown>;
  config?: Record<string, unknown>;
} = {}) {
  vi.mocked(resolveConfigs).mockResolvedValue({
    basePath: '/workspace',
    commandLineOptions,
    config: (config ?? {}) as UnifiedConfig,
    testSuite,
  });
}

describe('retryCommand', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    dbMocks.errorRows.splice(0);
    dbMocks.affectedEvalRows.splice(0);
    cliState.resume = false;
    cliState.retryMode = false;
    cliState.maxConcurrency = undefined;
    vi.mocked(shouldShareResults).mockReturnValue(false);
    vi.mocked(isSharingEnabled).mockReturnValue(false);
  });

  afterEach(() => {
    vi.resetAllMocks();
    dbMocks.errorRows.splice(0);
    dbMocks.affectedEvalRows.splice(0);
    cliState.resume = false;
    cliState.retryMode = false;
    cliState.maxConcurrency = undefined;
  });

  it('rejects a retry for an evaluation that does not exist', async () => {
    vi.mocked(Eval.findById).mockResolvedValue(undefined);

    await expect(retryCommand('missing-eval', {})).rejects.toThrow(
      'Evaluation with ID missing-eval not found',
    );

    expect(resolveConfigs).not.toHaveBeenCalled();
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('returns the original evaluation when there are no error results', async () => {
    const originalEval = createEval();
    vi.mocked(Eval.findById).mockResolvedValue(originalEval);

    await expect(retryCommand(originalEval.id, {})).resolves.toBe(originalEval);

    expect(resolveConfigs).not.toHaveBeenCalled();
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('reads and deletes error result ids while notifying affected evaluations', async () => {
    dbMocks.errorRows.push({ id: 'error-result-1' }, { id: 'error-result-2' });
    dbMocks.affectedEvalRows.push({ evalId: 'eval-123' }, { evalId: 'eval-456' });

    await expect(getErrorResultIds('eval-123')).resolves.toEqual([
      'error-result-1',
      'error-result-2',
    ]);
    await deleteErrorResults(['error-result-1', 'error-result-2']);

    expect(dbMocks.deleteRun).toHaveBeenCalledTimes(1);
    expect(notifyEvaluationChanged).toHaveBeenCalledWith('eval-123');
    expect(notifyEvaluationChanged).toHaveBeenCalledWith('eval-456');
  });

  it('skips database work when there are no error result ids to delete', async () => {
    await deleteErrorResults([]);

    expect(dbMocks.db.selectDistinct).not.toHaveBeenCalled();
    expect(dbMocks.db.delete).not.toHaveBeenCalled();
  });

  it('recalculates prompt metrics from batched results and persists them', async () => {
    const prompts = [{}, {}] as any[];
    const evalRecord = createEval({
      persisted: true,
      prompts,
      fetchResultsBatched: vi.fn(async function* () {
        yield [
          {
            id: 'pass-result',
            promptIdx: 0,
            success: true,
            failureReason: ResultFailureReason.NONE,
            score: 1,
            latencyMs: 20,
            cost: 0.25,
            namedScores: { quality: 0.8 },
            testCase: { vars: { topic: 'security' } },
            response: {
              tokenUsage: { total: 10, prompt: 6, completion: 4 },
            },
            gradingResult: {
              pass: true,
              score: 1,
              reason: 'passed',
              componentResults: [{ pass: true }, { pass: false }],
              tokensUsed: { total: 3, prompt: 2, completion: 1 },
            },
          },
          {
            id: 'error-result',
            promptIdx: 0,
            success: false,
            failureReason: ResultFailureReason.ERROR,
            score: 0,
            latencyMs: 0,
            namedScores: {},
          },
          {
            id: 'failed-result',
            promptIdx: 1,
            success: false,
            failureReason: ResultFailureReason.ASSERT,
            score: 0.5,
            latencyMs: 5,
            cost: 0.1,
            namedScores: {},
          },
          {
            id: 'invalid-prompt-result',
            promptIdx: 99,
            success: true,
            failureReason: ResultFailureReason.NONE,
            score: 1,
            namedScores: {},
          },
        ] as any[];
      }),
    });

    await recalculatePromptMetrics(evalRecord);

    expect(prompts[0].metrics).toMatchObject({
      score: 1,
      testPassCount: 1,
      testErrorCount: 1,
      testFailCount: 0,
      assertPassCount: 1,
      assertFailCount: 1,
      totalLatencyMs: 20,
      cost: 0.25,
    });
    expect(prompts[0].metrics.tokenUsage).toMatchObject({
      total: 10,
      prompt: 6,
      completion: 4,
      assertions: { total: 3, prompt: 2, completion: 1 },
    });
    expect(prompts[1].metrics).toMatchObject({
      score: 0.5,
      testPassCount: 0,
      testErrorCount: 0,
      testFailCount: 1,
      totalLatencyMs: 5,
      cost: 0.1,
    });
    expect(evalRecord.addPrompts).toHaveBeenCalledWith(prompts);
    expect(logger.debug).toHaveBeenCalledWith(
      'Skipping result with invalid promptIdx: 99',
      expect.objectContaining({ resultId: 'invalid-prompt-result' }),
    );
  });

  it('logs and rethrows metric recalculation and persistence failures', async () => {
    const calculationError = new Error('batch unavailable');
    const calculationEval = createEval({
      prompts: [{}] as any[],
      fetchResultsBatched: vi.fn(async function* () {
        throw calculationError;
      }),
    });

    await expect(recalculatePromptMetrics(calculationEval)).rejects.toThrow('batch unavailable');
    expect(logger.error).toHaveBeenCalledWith(
      'Error during batched metrics recalculation',
      expect.objectContaining({ error: calculationError }),
    );

    const persistenceError = new Error('prompt save unavailable');
    const persistenceEval = createEval({
      persisted: true,
      prompts: [{}] as any[],
      addPrompts: vi.fn().mockRejectedValue(persistenceError),
    });

    await expect(recalculatePromptMetrics(persistenceEval)).rejects.toThrow(
      'prompt save unavailable',
    );
    expect(logger.error).toHaveBeenCalledWith(
      'Error saving recalculated prompt metrics',
      expect.objectContaining({ error: persistenceError }),
    );
  });

  it('retries from the saved config, cleans up old errors, and shares the result', async () => {
    const originalEval = createEval({
      config: {
        providers: [{ label: 'Echo target', delay: 0 }] as any,
        sharing: false,
      } as UnifiedConfig,
      getProvidersFromResults: vi.fn().mockResolvedValue([{ id: 'echo', label: 'Echo target' }]),
    });
    const retriedEval = createEval();
    vi.mocked(Eval.findById).mockResolvedValue(originalEval);
    dbMocks.errorRows.push({ id: 'error-result-1' });
    dbMocks.affectedEvalRows.push({ evalId: originalEval.id });
    mockResolvedConfig({
      commandLineOptions: { delay: 0, maxConcurrency: 4, share: true },
      config: { sharing: true },
    });
    vi.mocked(evaluate).mockImplementation(async (receivedSuite, receivedEval, options) => {
      expect(cliState.resume).toBe(true);
      expect(cliState.retryMode).toBe(true);
      expect(cliState.maxConcurrency).toBe(4);
      expect(receivedSuite).toBe(testSuite);
      expect(receivedEval).toBe(originalEval);
      expect(options).toEqual({
        delay: 0,
        eventSource: 'cli',
        maxConcurrency: 4,
        showProgressBar: true,
      });
      return retriedEval;
    });
    vi.mocked(shouldShareResults).mockReturnValue(true);
    vi.mocked(isSharingEnabled).mockReturnValue(true);
    vi.mocked(createShareableUrl).mockResolvedValue('https://example.com/eval/eval-123');

    await expect(retryCommand(originalEval.id, {})).resolves.toBe(retriedEval);

    expect(resolveConfigs).toHaveBeenCalledWith(
      {},
      {
        providers: [{ id: 'echo', label: 'Echo target', delay: 0 }],
        sharing: false,
      },
    );
    expect(dbMocks.deleteRun).toHaveBeenCalledTimes(1);
    expect(notifyEvaluationChanged).toHaveBeenCalledWith(originalEval.id);
    expect(shouldShareResults).toHaveBeenCalledWith({
      cliShare: undefined,
      configShare: true,
      configSharing: true,
    });
    expect(createShareableUrl).toHaveBeenCalledWith(retriedEval, { silent: false });
    expect(cliState.resume).toBe(false);
    expect(cliState.retryMode).toBe(false);
    expect(cliState.maxConcurrency).toBeUndefined();
  });

  it('uses an explicit config and forces concurrency to one when delay is requested', async () => {
    const originalEval = createEval();
    const retriedEval = createEval();
    vi.mocked(Eval.findById).mockResolvedValue(originalEval);
    dbMocks.errorRows.push({ id: 'error-result-1' });
    mockResolvedConfig({
      commandLineOptions: { delay: 5, maxConcurrency: 2 },
    });
    vi.mocked(evaluate).mockImplementation(async (_suite, _eval, options) => {
      expect(cliState.maxConcurrency).toBe(1);
      expect(options).toEqual({
        delay: 25,
        eventSource: 'cli',
        maxConcurrency: 1,
        showProgressBar: false,
      });
      return retriedEval;
    });

    await expect(
      retryCommand(originalEval.id, {
        config: 'retry.yaml',
        delay: 25,
        maxConcurrency: 8,
        verbose: true,
      }),
    ).resolves.toBe(retriedEval);

    expect(resolveConfigs).toHaveBeenCalledWith({ config: ['retry.yaml'] }, {});
    expect(logger.info).toHaveBeenCalledWith(
      'Running at concurrency=1 because 25ms delay was requested between API calls',
    );
  });

  it('preserves error results and clears retry state when evaluation fails', async () => {
    const originalEval = createEval();
    vi.mocked(Eval.findById).mockResolvedValue(originalEval);
    dbMocks.errorRows.push({ id: 'error-result-1' });
    mockResolvedConfig();
    vi.mocked(evaluate).mockRejectedValue(new Error('provider unavailable'));

    await expect(retryCommand(originalEval.id, {})).rejects.toThrow('provider unavailable');

    expect(dbMocks.deleteRun).not.toHaveBeenCalled();
    expect(cliState.resume).toBe(false);
    expect(cliState.retryMode).toBe(false);
    expect(cliState.maxConcurrency).toBeUndefined();
  });

  it('restores JSONL output and preserves error rows when retry persistence fails', async () => {
    const originalEval = createEval({
      config: { outputPath: ['results.jsonl', 'results.json'] } as UnifiedConfig,
    });
    const retriedEval = createEval({ resultPersistenceFailed: true });
    vi.mocked(Eval.findById).mockResolvedValue(originalEval);
    dbMocks.errorRows.push({ id: 'error-result-1' });
    mockResolvedConfig();
    vi.mocked(evaluate).mockResolvedValue(retriedEval);

    await expect(retryCommand(originalEval.id, {})).rejects.toThrow(
      'Retry results failed to persist. Existing ERROR rows were preserved.',
    );

    expect(writeMultipleOutputs).toHaveBeenCalledWith(['results.jsonl'], retriedEval, null);
    expect(retriedEval.resultPersistenceFailed).toBe(true);
    expect(dbMocks.deleteRun).not.toHaveBeenCalled();
  });

  it('warns when JSONL restoration and post-retry rewriting fail', async () => {
    const originalEval = createEval({
      config: { outputPath: 'results.jsonl' } as UnifiedConfig,
    });
    const failedPersistenceEval = createEval({ resultPersistenceFailed: true });
    vi.mocked(Eval.findById).mockResolvedValue(originalEval);
    dbMocks.errorRows.push({ id: 'error-result-1' });
    mockResolvedConfig();
    vi.mocked(evaluate).mockResolvedValueOnce(failedPersistenceEval);
    vi.mocked(writeMultipleOutputs).mockRejectedValueOnce(new Error('restore unavailable'));

    await expect(retryCommand(originalEval.id, {})).rejects.toThrow(
      'Retry results failed to persist. Existing ERROR rows were preserved.',
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'Retry results failed to persist, and restoring JSONL output failed.',
      expect.objectContaining({ jsonlOutputPaths: ['results.jsonl'] }),
    );

    const successfulEval = createEval();
    vi.mocked(evaluate).mockResolvedValueOnce(successfulEval);
    vi.mocked(writeMultipleOutputs).mockRejectedValueOnce(new Error('rewrite unavailable'));

    await expect(retryCommand(originalEval.id, {})).resolves.toBe(successfulEval);
    expect(logger.warn).toHaveBeenCalledWith(
      'Retry succeeded and the database is up to date, but rewriting JSONL output failed.',
      expect.objectContaining({ outputPaths: ['results.jsonl'] }),
    );
  });

  it('keeps a successful retry when post-retry cleanup fails', async () => {
    const originalEval = createEval();
    const retriedEval = createEval();
    vi.mocked(Eval.findById).mockResolvedValue(originalEval);
    dbMocks.errorRows.push({ id: 'error-result-1' });
    mockResolvedConfig();
    vi.mocked(evaluate).mockResolvedValue(retriedEval);
    dbMocks.deleteRun.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(retryCommand(originalEval.id, {})).resolves.toBe(retriedEval);

    expect(logger.warn).toHaveBeenCalledWith(
      'Post-retry cleanup had issues. Retry results are saved.',
      {
        error: expect.any(Error),
      },
    );
  });

  it('keeps a successful retry when cloud sync throws', async () => {
    const originalEval = createEval();
    const retriedEval = createEval();
    vi.mocked(Eval.findById).mockResolvedValue(originalEval);
    dbMocks.errorRows.push({ id: 'error-result-1' });
    mockResolvedConfig();
    vi.mocked(evaluate).mockResolvedValue(retriedEval);
    vi.mocked(shouldShareResults).mockReturnValue(true);
    vi.mocked(isSharingEnabled).mockReturnValue(true);
    vi.mocked(createShareableUrl).mockRejectedValue(new Error('cloud unavailable'));

    await expect(retryCommand(originalEval.id, { share: true })).resolves.toBe(retriedEval);

    expect(logger.warn).toHaveBeenCalledWith(
      'Cloud sync failed. Run promptfoo share eval-123 to retry manually.',
    );
  });

  it('warns when cloud sync returns no URL', async () => {
    const originalEval = createEval();
    const retriedEval = createEval();
    vi.mocked(Eval.findById).mockResolvedValue(originalEval);
    dbMocks.errorRows.push({ id: 'error-result-1' });
    mockResolvedConfig();
    vi.mocked(evaluate).mockResolvedValue(retriedEval);
    vi.mocked(shouldShareResults).mockReturnValue(true);
    vi.mocked(isSharingEnabled).mockReturnValue(true);
    vi.mocked(createShareableUrl).mockResolvedValue(null);

    await expect(retryCommand(originalEval.id, { share: true })).resolves.toBe(retriedEval);

    expect(logger.warn).toHaveBeenCalledWith(
      'Cloud sync failed. Run promptfoo share eval-123 to retry manually.',
    );
  });
});
