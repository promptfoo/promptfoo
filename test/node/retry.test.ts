import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { evaluate } from '../../src/evaluator';
import logger from '../../src/logger';
import Eval from '../../src/models/eval';
import { notifyEvaluationChanged } from '../../src/models/evalMutation';
import {
  createNamedMetricsPreservationGuard,
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
  const affectedEvalRows: Array<{
    evalId: string;
    hasNamedScores?: number;
  }> = [];
  const errorRowsAll = vi.fn(async () => errorRows);
  const deleteReturning = vi.fn(async () => affectedEvalRows);
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: errorRowsAll,
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: deleteReturning,
      })),
    })),
  };

  return {
    affectedEvalRows,
    db,
    deleteReturning,
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
  providers: [
    {
      id: () => 'echo',
      label: 'selected-target',
      callApi: vi.fn(),
    },
  ],
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
    ...overrides,
  } as unknown as Eval;
}

function mockResolvedConfig({
  commandLineOptions,
  config,
  providers,
}: {
  commandLineOptions?: Record<string, unknown>;
  config?: Record<string, unknown>;
  providers?: TestSuite['providers'];
} = {}) {
  vi.mocked(resolveConfigs).mockResolvedValue({
    basePath: '/workspace',
    commandLineOptions,
    config: (config ?? {}) as UnifiedConfig,
    testSuite: providers ? { ...testSuite, providers } : testSuite,
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
    await expect(deleteErrorResults(['error-result-1', 'error-result-2'])).resolves.toBeUndefined();

    expect(dbMocks.deleteReturning).toHaveBeenCalledTimes(1);
    expect(notifyEvaluationChanged).toHaveBeenCalledWith('eval-123');
    expect(notifyEvaluationChanged).toHaveBeenCalledWith('eval-456');
  });

  it('reports whether deleted ERROR rows contained named scores', async () => {
    dbMocks.affectedEvalRows.push({ evalId: 'eval-123', hasNamedScores: 1 });

    await expect(
      deleteErrorResults(['error-result-1'], { reportNamedScores: true }),
    ).resolves.toEqual({ allRequestedDeleted: true, hadNamedScores: true });
    expect(notifyEvaluationChanged).toHaveBeenCalledWith('eval-123');
  });

  it('does not authorize preservation when a requested ERROR row was not deleted', async () => {
    await expect(
      deleteErrorResults(['missing-result'], { reportNamedScores: true }),
    ).resolves.toEqual({ allRequestedDeleted: false, hadNamedScores: false });
  });

  it('preserves named metrics only for complete reused prompt metrics without derived metrics', () => {
    const metrics = {
      namedScores: { quality: 3 },
      namedScoresCount: { quality: 2 },
      namedScoreWeights: { quality: 4 },
    } as any;
    const originalEval = createEval({ prompts: [{ metrics }] as any[] });
    const canPreserve = createNamedMetricsPreservationGuard(originalEval);

    expect(canPreserve(createEval({ prompts: [{ metrics }] as any[] }), undefined)).toBe(true);
    expect(
      canPreserve(createEval({ prompts: [{ metrics: { ...metrics } }] as any[] }), undefined),
    ).toBe(false);
    expect(
      canPreserve(createEval({ prompts: [{ metrics }] as any[] }), [
        { name: 'average', value: 'quality / __count' },
      ]),
    ).toBe(false);

    const derivedEval = createEval({
      config: { derivedMetrics: [{ name: 'average', value: 'quality / __count' }] },
      prompts: [{ metrics }] as any[],
    });
    expect(
      createNamedMetricsPreservationGuard(derivedEval)(
        createEval({ prompts: [{ metrics }] as any[] }),
        undefined,
      ),
    ).toBe(false);

    const incompleteMetrics = { namedScores: {}, namedScoresCount: {} } as any;
    const incompleteEval = createEval({ prompts: [{ metrics: incompleteMetrics }] as any[] });
    const incompleteGuard = createNamedMetricsPreservationGuard(incompleteEval);
    incompleteMetrics.namedScoreWeights = {};
    expect(incompleteGuard(incompleteEval, undefined)).toBe(false);

    const mismatchedMetrics = {
      namedScores: { quality: 3 },
      namedScoresCount: {},
      namedScoreWeights: {},
    } as any;
    const mismatchedEval = createEval({ prompts: [{ metrics: mismatchedMetrics }] as any[] });
    expect(createNamedMetricsPreservationGuard(mismatchedEval)(mismatchedEval, undefined)).toBe(
      false,
    );

    const orphanCountMetrics = {
      namedScores: {},
      namedScoresCount: { quality: 2 },
      namedScoreWeights: { quality: 4 },
    } as any;
    const orphanCountEval = createEval({ prompts: [{ metrics: orphanCountMetrics }] as any[] });
    expect(createNamedMetricsPreservationGuard(orphanCountEval)(orphanCountEval, undefined)).toBe(
      false,
    );
  });

  it('skips database work when there are no error result ids to delete', async () => {
    await deleteErrorResults([]);

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

  it('preserves live rendered named metrics while rebuilding other prompt metrics', async () => {
    const prompts = [
      {
        metrics: {
          namedScores: { 'quality:ALPHA': 3 },
          namedScoresCount: { 'quality:ALPHA': 2 },
          namedScoreWeights: { 'quality:ALPHA': 4 },
        },
      },
    ] as any[];
    const evalRecord = createEval({
      prompts,
      fetchResultsBatched: vi.fn(async function* () {
        yield [
          {
            id: 'retried-result',
            promptIdx: 0,
            success: true,
            failureReason: ResultFailureReason.NONE,
            score: 0.75,
            namedScores: { 'quality:ALPHA': 0.75 },
            testCase: { vars: { category: { name: 'alpha' } } },
            gradingResult: {
              componentResults: [
                { assertion: { metric: 'quality:{{ category.name | upper }}' } },
                { assertion: { metric: 'quality:{{ category.name | upper }}' } },
              ],
            },
          },
        ] as any[];
      }),
    });

    await recalculatePromptMetrics(evalRecord, { preserveNamedMetrics: true });

    expect(prompts[0].metrics).toMatchObject({
      score: 0.75,
      testPassCount: 1,
      namedScores: { 'quality:ALPHA': 3 },
      namedScoresCount: { 'quality:ALPHA': 2 },
      namedScoreWeights: { 'quality:ALPHA': 4 },
    });
  });

  it('retries from the saved config, cleans up old errors, and shares the result', async () => {
    const originalEval = createEval({
      config: { sharing: false } as UnifiedConfig,
      runtimeOptions: { providerFilter: 'selected-target' },
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
      { filterProviders: 'selected-target' },
      originalEval.config,
    );
    expect(dbMocks.deleteReturning).toHaveBeenCalledTimes(1);
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
    const originalEval = createEval({
      runtimeOptions: { providerFilter: 'selected-target' },
    });
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

    expect(resolveConfigs).toHaveBeenCalledWith(
      { config: ['retry.yaml'], filterProviders: 'selected-target' },
      {},
    );
    expect(logger.info).toHaveBeenCalledWith(
      'Running at concurrency=1 because 25ms delay was requested between API calls',
    );
  });

  it('preserves error results when an explicit config no longer matches the stored filter', async () => {
    const originalEval = createEval({
      runtimeOptions: { providerFilter: 'selected-target' },
    });
    vi.mocked(Eval.findById).mockResolvedValue(originalEval);
    dbMocks.errorRows.push({ id: 'error-result-1' });
    mockResolvedConfig({ providers: [] });

    await expect(retryCommand(originalEval.id, { config: 'retry.yaml' })).rejects.toThrow(
      'Stored provider filter "selected-target" matched no providers in the retry config "retry.yaml"',
    );

    expect(evaluate).not.toHaveBeenCalled();
    expect(dbMocks.deleteReturning).not.toHaveBeenCalled();
  });

  it('preserves error results when the stored filter cannot be applied to the config', async () => {
    const originalEval = createEval({
      runtimeOptions: { providerFilter: '[' },
    });
    vi.mocked(Eval.findById).mockResolvedValue(originalEval);
    dbMocks.errorRows.push({ id: 'error-result-1' });

    await expect(retryCommand(originalEval.id, { config: 'retry.yaml' })).rejects.toThrow(
      'Could not resolve the retry config "retry.yaml" using stored provider filter "[": Invalid regular expression',
    );

    // The pattern is validated before any config resolution happens.
    expect(resolveConfigs).not.toHaveBeenCalled();
    expect(evaluate).not.toHaveBeenCalled();
    expect(dbMocks.deleteReturning).not.toHaveBeenCalled();
    expect(cliState.resume).toBe(false);
    expect(cliState.retryMode).toBe(false);
  });

  it('fails closed when the persisted provider filter is not a string', async () => {
    const originalEval = createEval({
      runtimeOptions: { providerFilter: ['selected-target'] as unknown as string },
    });
    vi.mocked(Eval.findById).mockResolvedValue(originalEval);
    dbMocks.errorRows.push({ id: 'error-result-1' });

    await expect(retryCommand(originalEval.id, {})).rejects.toThrow(
      'Stored provider filter is invalid',
    );

    expect(resolveConfigs).not.toHaveBeenCalled();
    expect(evaluate).not.toHaveBeenCalled();
    expect(dbMocks.deleteReturning).not.toHaveBeenCalled();
  });

  it('preserves error results and clears retry state when evaluation fails', async () => {
    const originalEval = createEval();
    vi.mocked(Eval.findById).mockResolvedValue(originalEval);
    dbMocks.errorRows.push({ id: 'error-result-1' });
    mockResolvedConfig();
    vi.mocked(evaluate).mockRejectedValue(new Error('provider unavailable'));

    await expect(retryCommand(originalEval.id, {})).rejects.toThrow('provider unavailable');

    expect(dbMocks.deleteReturning).not.toHaveBeenCalled();
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
    expect(dbMocks.deleteReturning).not.toHaveBeenCalled();
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
    dbMocks.deleteReturning.mockRejectedValueOnce(new Error('database unavailable'));

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
