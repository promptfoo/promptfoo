import { beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { evaluate } from '../../src/evaluator';
import logger from '../../src/logger';
import Eval from '../../src/models/eval';
import { notifyEvaluationChanged } from '../../src/models/evalMutation';
import { retryCommand } from '../../src/node/retry';
import { createShareableUrl, isSharingEnabled } from '../../src/share';
import { resolveConfigs } from '../../src/util/config/load';
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

  it('retries from the saved config, cleans up old errors, and shares the result', async () => {
    const originalEval = createEval({ config: { sharing: false } as UnifiedConfig });
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

    expect(resolveConfigs).toHaveBeenCalledWith({}, originalEval.config);
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
