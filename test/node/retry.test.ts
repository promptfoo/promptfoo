import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { getDb } from '../../src/database/index';
import { evaluate } from '../../src/evaluator';
import logger from '../../src/logger';
import Eval from '../../src/models/eval';
import { notifyEvaluationChanged } from '../../src/models/evalMutation';
import {
  assertErrorResultsReplaced,
  deleteErrorResults,
  getErrorResultIds,
  recalculatePromptMetrics,
  retryCommand,
} from '../../src/node/retry';
import { createShareableUrl, isSharingEnabled } from '../../src/share';
import { ResultFailureReason } from '../../src/types/index';
import { resolveConfigs } from '../../src/util/config/load';
import { setupEnv } from '../../src/util/env';
import { createProviderSelection } from '../../src/util/eval/providerSelection';
import { writeMultipleOutputs } from '../../src/util/output';
import { shouldShareResults } from '../../src/util/sharing';

import type { TestSuite, UnifiedConfig } from '../../src/types/index';

const dbMocks = vi.hoisted(() => {
  const errorRows: Array<{ id: string }> = [];
  const affectedEvalRows: Array<{ evalId: string }> = [];
  const errorRowsAll = vi.fn(async () => errorRows);
  const detailedSelectState = { callCount: 0, includeReplacements: true };
  const detailedRowsAll = vi.fn(async () => {
    const staleRows = errorRows.map((row, index) => ({
      ...row,
      evalId: 'eval-123',
      promptIdx: index,
      testIdx: index,
    }));
    const isCandidateQuery = detailedSelectState.callCount++ % 2 === 1;
    if (!isCandidateQuery || !detailedSelectState.includeReplacements) {
      return staleRows;
    }
    return [...staleRows, ...staleRows.map((row) => ({ ...row, id: `replacement-${row.id}` }))];
  });
  const affectedEvalRowsAll = vi.fn(async () => affectedEvalRows);
  const deleteRun = vi.fn(async () => undefined);
  const db = {
    select: vi.fn((fields: Record<string, unknown>) => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: Object.keys(fields).includes('evalId') ? detailedRowsAll : errorRowsAll,
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
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(db)),
  };

  return {
    affectedEvalRows,
    db,
    deleteRun,
    detailedSelectState,
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
vi.mock('../../src/util/env');
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
  selectedProviderConfigs,
}: {
  commandLineOptions?: Record<string, unknown>;
  config?: Record<string, unknown>;
  providers?: TestSuite['providers'];
  selectedProviderConfigs?: UnifiedConfig['providers'];
} = {}) {
  vi.mocked(resolveConfigs).mockResolvedValue({
    basePath: '/workspace',
    commandLineOptions,
    config: (config ?? {}) as UnifiedConfig,
    testSuite: providers ? { ...testSuite, providers } : testSuite,
    selectedProviderConfigs,
  });
}

describe('retryCommand', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    dbMocks.errorRows.splice(0);
    dbMocks.affectedEvalRows.splice(0);
    dbMocks.detailedSelectState.callCount = 0;
    dbMocks.detailedSelectState.includeReplacements = true;
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
    dbMocks.detailedSelectState.callCount = 0;
    dbMocks.detailedSelectState.includeReplacements = true;
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

  it('batches large result deletion within the SQLite parameter limit', async () => {
    dbMocks.affectedEvalRows.push({ evalId: 'eval-123' });
    const resultIds = Array.from({ length: 1_000 }, (_, index) => `error-result-${index}`);

    await deleteErrorResults(resultIds);

    expect(dbMocks.db.selectDistinct).toHaveBeenCalledTimes(2);
    expect(dbMocks.db.transaction).toHaveBeenCalledTimes(1);
    expect(dbMocks.deleteRun).toHaveBeenCalledTimes(2);
    expect(notifyEvaluationChanged).toHaveBeenCalledTimes(1);
    expect(notifyEvaluationChanged).toHaveBeenCalledWith('eval-123');
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
        repeat: 1,
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
      undefined,
      { allowConfigFilterSample: true, loadEnvFiles: true },
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

  it('preserves old errors when retry produces no persisted replacement row', async () => {
    const originalEval = createEval();
    vi.mocked(Eval.findById).mockResolvedValue(originalEval);
    dbMocks.errorRows.push({ id: 'error-result-1' });
    dbMocks.detailedSelectState.includeReplacements = false;
    mockResolvedConfig();
    vi.mocked(evaluate).mockResolvedValue(createEval());

    await expect(retryCommand(originalEval.id, {})).rejects.toThrow(
      'Retry produced no persisted replacement for 1 ERROR result',
    );

    expect(dbMocks.deleteRun).not.toHaveBeenCalled();
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
        repeat: 1,
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
      undefined,
      { allowConfigFilterSample: true, loadEnvFiles: true },
    );
    expect(logger.info).toHaveBeenCalledWith(
      'Running at concurrency=1 because 25ms delay was requested between API calls',
    );
  });

  it('lets an explicit retry env file override persisted and config env files', async () => {
    const originalEval = createEval({
      runtimeOptions: { configEnvPaths: '/workspace/original.env' },
    });
    const retriedEval = createEval();
    vi.mocked(Eval.findById).mockResolvedValue(originalEval);
    dbMocks.errorRows.push({ id: 'error-result-1' });
    mockResolvedConfig();
    vi.mocked(evaluate).mockResolvedValue(retriedEval);

    await expect(
      retryCommand(originalEval.id, {
        config: 'retry.yaml',
        envPath: ['/workspace/override.env'],
      }),
    ).resolves.toBe(retriedEval);

    expect(setupEnv).toHaveBeenCalledWith('/workspace/override.env');
    expect(setupEnv).not.toHaveBeenCalledWith('/workspace/original.env');
    expect(resolveConfigs).toHaveBeenCalledWith({ config: ['retry.yaml'] }, {}, undefined, {
      allowConfigFilterSample: true,
      loadEnvFiles: false,
    });
  });

  it('lets an explicit retry config override persisted concurrency and delay', async () => {
    const originalEval = createEval({
      runtimeOptions: { delay: 25, maxConcurrency: 8 },
    });
    const retriedEval = createEval();
    vi.mocked(Eval.findById).mockResolvedValue(originalEval);
    dbMocks.errorRows.push({ id: 'error-result-1' });
    mockResolvedConfig({ commandLineOptions: { delay: 0, maxConcurrency: 2 } });
    vi.mocked(evaluate).mockImplementation(async (_suite, _eval, options) => {
      expect(cliState.maxConcurrency).toBe(2);
      expect(options).toMatchObject({ delay: 0, maxConcurrency: 2, repeat: 1 });
      return retriedEval;
    });

    await expect(retryCommand(originalEval.id, { config: 'retry.yaml' })).resolves.toBe(
      retriedEval,
    );
  });

  it('preserves original CLI env precedence over a saved config env during retry', async () => {
    const originalEval = createEval({
      runtimeOptions: {
        configEnvPaths: '/workspace/original-cli.env',
        configEnvSource: 'cli',
      },
    });
    const retriedEval = createEval();
    vi.mocked(Eval.findById).mockResolvedValue(originalEval);
    dbMocks.errorRows.push({ id: 'error-result-1' });
    mockResolvedConfig();
    vi.mocked(evaluate).mockResolvedValue(retriedEval);

    await expect(retryCommand(originalEval.id, {})).resolves.toBe(retriedEval);

    expect(setupEnv).toHaveBeenCalledWith('/workspace/original-cli.env');
    expect(resolveConfigs).toHaveBeenCalledWith({}, originalEval.config, undefined, {
      allowConfigFilterSample: true,
      loadEnvFiles: false,
    });
  });

  it('restores a persisted filter range for standalone retry', async () => {
    const originalEval = createEval({
      runtimeOptions: { filterRange: '1:2' },
    });
    const retriedEval = createEval();
    vi.mocked(Eval.findById).mockResolvedValue(originalEval);
    dbMocks.errorRows.push({ id: 'error-result-1' });
    mockResolvedConfig();
    vi.mocked(evaluate).mockImplementation(async (_suite, _eval, options) => {
      expect(options.filterRange).toBe('1:2');
      return retriedEval;
    });

    await expect(retryCommand(originalEval.id, {})).resolves.toBe(retriedEval);
  });

  it('replays the persisted provider, test, repeat, delay, and prompt selection', async () => {
    const excludedProvider = {
      id: () => 'echo',
      label: 'excluded-target',
      callApi: vi.fn(),
    } as TestSuite['providers'][number];
    const selectedProvider = {
      id: () => 'http',
      label: 'selected-target',
      callApi: vi.fn(),
    } as TestSuite['providers'][number];
    const providerConfigs = [
      { id: 'echo', label: 'excluded-target' },
      { id: 'http', label: 'selected-target' },
    ];
    const providerSelection = createProviderSelection(
      [excludedProvider, selectedProvider],
      providerConfigs,
      [selectedProvider],
    );
    const originalEval = createEval({
      config: { providers: providerConfigs } as UnifiedConfig,
      prompts: [
        {
          id: 'prompt-1',
          raw: 'Hello',
          label: 'Greeting',
          provider: 'echo',
          config: { prefix: 'prefix' },
        },
        {
          id: 'prompt-1',
          raw: 'Hello',
          label: 'Greeting',
          provider: 'http',
          config: { prefix: 'prefix' },
        },
      ] as any,
      runtimeOptions: {
        configBasePath: '/workspace/config',
        delay: 4,
        maxConcurrency: 7,
        repeat: 3,
        testCaseIndices: [2, 0],
        testCaseSelection: {
          tests: [{ index: 2, fingerprint: 'selected-test-fingerprint' }],
        },
        providerSelection,
      },
    });
    const retriedEval = createEval();
    vi.mocked(Eval.findById).mockResolvedValue(originalEval);
    dbMocks.errorRows.push({ id: 'error-result-1' });
    mockResolvedConfig({
      config: { providers: providerConfigs },
      providers: [excludedProvider, selectedProvider],
      selectedProviderConfigs: providerConfigs,
    });
    vi.mocked(evaluate).mockImplementation(async (receivedSuite, _eval, options) => {
      expect(receivedSuite.providers).toEqual([selectedProvider]);
      expect(receivedSuite.prompts).toEqual([
        {
          raw: 'Hello',
          label: 'Greeting',
          config: { prefix: 'prefix' },
        },
      ]);
      expect(cliState.selectedProviderConfigs).toEqual([providerConfigs[1]]);
      expect(options).toEqual({
        delay: 4,
        eventSource: 'cli',
        maxConcurrency: 1,
        providerSelection: originalEval.runtimeOptions?.providerSelection,
        repeat: 3,
        showProgressBar: true,
        testCaseIndices: [2, 0],
        testCaseSelection: originalEval.runtimeOptions?.testCaseSelection,
      });
      return retriedEval;
    });
    vi.mocked(shouldShareResults).mockReturnValue(true);
    vi.mocked(isSharingEnabled).mockReturnValue(true);
    vi.mocked(createShareableUrl).mockResolvedValue('https://example.com/eval/eval-123');

    await expect(retryCommand(originalEval.id, { share: true })).resolves.toBe(retriedEval);

    expect(resolveConfigs).toHaveBeenCalledWith({}, originalEval.config, undefined, {
      allowConfigFilterSample: false,
      configBasePath: '/workspace/config',
      loadEnvFiles: true,
    });
    expect(createShareableUrl).toHaveBeenCalledWith(retriedEval, {
      silent: false,
    });
    expect(retriedEval.shared).toBe(true);
    expect(retriedEval.shareableUrl).toBe('https://example.com/eval/eval-123');
    expect(dbMocks.deleteRun).toHaveBeenCalledTimes(1);
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
    expect(dbMocks.deleteRun).not.toHaveBeenCalled();
  });

  it('preserves error results when persisted provider identity has drifted', async () => {
    const originalEval = createEval({
      runtimeOptions: {
        providerSelection: {
          providers: [
            {
              index: 0,
              id: 'http',
              label: 'selected-target',
              fingerprint: '0'.repeat(64),
            },
          ],
        },
      },
    });
    vi.mocked(Eval.findById).mockResolvedValue(originalEval);
    dbMocks.errorRows.push({ id: 'error-result-1' });
    mockResolvedConfig({
      providers: [
        {
          id: () => 'echo',
          label: 'different-target',
          callApi: vi.fn(),
        } as TestSuite['providers'][number],
      ],
      selectedProviderConfigs: [{ id: 'echo', label: 'different-target' }],
    });

    await expect(retryCommand(originalEval.id, {})).rejects.toThrow(
      'Could not restore provider selection for evaluation eval-123',
    );

    expect(evaluate).not.toHaveBeenCalled();
    expect(dbMocks.deleteRun).not.toHaveBeenCalled();
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
    expect(dbMocks.deleteRun).not.toHaveBeenCalled();
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
    expect(dbMocks.deleteRun).not.toHaveBeenCalled();
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

// Fix 4 (thread 3481053693): a pre-existing duplicate success at the same
// (evalId, testIdx, promptIdx) key must not be miscounted as this retry's
// replacement. A retry that resume skips (persisting no new row) must fail closed
// so the stale ERROR row is preserved.
describe('assertErrorResultsReplaced replacement accounting', () => {
  function sequencedDb(results: Array<Array<Record<string, unknown>>>) {
    let call = 0;
    return {
      select: () => ({
        from: () => ({
          where: () => ({
            all: async () => results[call++] ?? [],
          }),
        }),
      }),
    };
  }

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('fails closed when only a pre-existing duplicate success shares the retry key', async () => {
    const staleError = { evalId: 'e', id: 'err', testIdx: 0, promptIdx: 1 };
    const oldDuplicateSuccess = { evalId: 'e', id: 'old-success', testIdx: 0, promptIdx: 1 };
    vi.mocked(getDb).mockResolvedValue(
      sequencedDb([[staleError], [staleError, oldDuplicateSuccess]]) as any,
    );

    await expect(
      // The pre-retry snapshot contains both the stale error and the old success.
      assertErrorResultsReplaced(['err'], ['err', 'old-success']),
    ).rejects.toThrow('Retry produced no persisted replacement');
  });

  it('passes when this retry persists a genuinely new replacement row', async () => {
    const staleError = { evalId: 'e', id: 'err', testIdx: 0, promptIdx: 1 };
    const oldDuplicateSuccess = { evalId: 'e', id: 'old-success', testIdx: 0, promptIdx: 1 };
    const newlyPersisted = { evalId: 'e', id: 'new-row', testIdx: 0, promptIdx: 1 };
    vi.mocked(getDb).mockResolvedValue(
      sequencedDb([[staleError], [staleError, oldDuplicateSuccess, newlyPersisted]]) as any,
    );

    await expect(
      assertErrorResultsReplaced(['err'], ['err', 'old-success']),
    ).resolves.toBeUndefined();
  });
});
