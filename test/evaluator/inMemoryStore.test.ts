import { describe, expect, it } from 'vitest';
import {
  type InMemoryEvaluation,
  InMemoryEvaluationStore,
} from '../../src/evaluator/inMemoryStore';
import { ResultFailureReason } from '../../src/types/index';
import { createCompletedPrompt, createEvaluateResult } from '../factories/eval';

function createEvaluation(overrides: Partial<InMemoryEvaluation> = {}): InMemoryEvaluation {
  return {
    id: 'in-memory-eval',
    config: { description: 'In-memory evaluation' },
    persisted: false,
    prompts: [],
    results: [],
    vars: [],
    resultPersistenceFailed: false,
    finalResults: [],
    failedResults: [],
    ...overrides,
  };
}

describe('InMemoryEvaluationStore', () => {
  it('exposes the evaluation record and its core properties', () => {
    const evaluation = createEvaluation({
      persisted: true,
      prompts: [createCompletedPrompt('Initial prompt')],
      results: [createEvaluateResult()],
    });
    const store = new InMemoryEvaluationStore(evaluation);

    expect(store.evaluation).toBe(evaluation);
    expect(store.id).toBe(evaluation.id);
    expect(store.config).toBe(evaluation.config);
    expect(store.persisted).toBe(true);
    expect(store.prompts).toBe(evaluation.prompts);
    expect(store.results).toBe(evaluation.results);
    expect(store.resultPersistenceFailed).toBe(false);
  });

  it('appends results, replaces prompts, and reads results by test index', async () => {
    const evaluation = createEvaluation();
    const store = new InMemoryEvaluationStore(evaluation);
    const first = createEvaluateResult({ testIdx: 1, promptIdx: 0 });
    const second = createEvaluateResult({ testIdx: 2, promptIdx: 0 });
    const third = createEvaluateResult({ testIdx: 1, promptIdx: 1 });
    const prompts = [createCompletedPrompt('First'), createCompletedPrompt('Second')];

    await store.appendResult(first);
    await store.appendResult(second);
    await store.appendResult(third);
    await store.appendPrompts(prompts);

    expect(await store.readResults()).toBe(evaluation.results);
    expect(await store.readResults()).toEqual([first, second, third]);
    expect(await store.readResultsByTestIdx(1)).toEqual([first, third]);
    expect(evaluation.prompts).toBe(prompts);
  });

  it('uses deterministic testIdx:promptIdx pairs for resume filtering', async () => {
    const evaluation = createEvaluation({
      results: [
        createEvaluateResult({
          testIdx: 3,
          promptIdx: 4,
          failureReason: ResultFailureReason.NONE,
        }),
        createEvaluateResult({
          testIdx: 3,
          promptIdx: 5,
          failureReason: ResultFailureReason.ERROR,
        }),
        createEvaluateResult({
          testIdx: 3,
          promptIdx: 4,
          failureReason: ResultFailureReason.ASSERT,
        }),
      ],
    });
    const store = new InMemoryEvaluationStore(evaluation);

    expect(await store.readCompletedIndexPairs()).toEqual(new Set(['3:4', '3:5']));
    expect(await store.readCompletedIndexPairs({ excludeErrors: false })).toEqual(
      new Set(['3:4', '3:5']),
    );
    expect(await store.readCompletedIndexPairs({ excludeErrors: true })).toEqual(new Set(['3:4']));
  });

  it('records final results with last-write-wins index semantics', () => {
    const initial = createEvaluateResult({ testIdx: 0, promptIdx: 1, score: 0 });
    const replacement = createEvaluateResult({ testIdx: 0, promptIdx: 1, score: 1 });
    const other = createEvaluateResult({ testIdx: 1, promptIdx: 0 });
    const evaluation = createEvaluation({ finalResults: [initial] });
    const store = new InMemoryEvaluationStore(evaluation);

    store.recordFinalResult(other);
    store.recordFinalResult(replacement);

    expect(evaluation.finalResults).toEqual([replacement, other]);
  });

  it('tracks persistence failures by index and preserves result mutations across reads', async () => {
    const first = createEvaluateResult({ testIdx: 2, promptIdx: 0, score: 1 });
    const otherTest = createEvaluateResult({ testIdx: 3, promptIdx: 0 });
    const evaluation = createEvaluation();
    const store = new InMemoryEvaluationStore(evaluation);

    store.recordResultPersistenceFailure(first);
    store.recordResultPersistenceFailure(otherTest);

    expect(store.resultPersistenceFailed).toBe(true);
    expect(store.hasResultPersistenceFailure({ testIdx: 2, promptIdx: 0 })).toBe(true);
    expect(store.hasResultPersistenceFailure({ testIdx: 2, promptIdx: 1 })).toBe(false);
    expect(await store.readFailedResults()).toEqual([first, otherTest]);

    const [failed] = await store.readFailedResultsByTestIdx(2);
    failed.score = 0;
    expect((await store.readFailedResultsByTestIdx(2))[0]).toBe(failed);
    expect((await store.readFailedResultsByTestIdx(2))[0].score).toBe(0);
  });

  it('replaces a re-recorded persistence failure for the same index', async () => {
    const first = createEvaluateResult({ testIdx: 2, promptIdx: 0, score: 0 });
    const replacement = createEvaluateResult({ testIdx: 2, promptIdx: 0, score: 1 });
    const evaluation = createEvaluation({ failedResults: [first] });
    const store = new InMemoryEvaluationStore(evaluation);

    expect(store.resultPersistenceFailed).toBe(true);
    store.recordResultPersistenceFailure(replacement);

    expect(await store.readFailedResultsByTestIdx(2)).toEqual([replacement]);
    expect(evaluation.failedResults).toEqual([replacement]);
  });

  it('saves the evaluation and upserts saved results by index', async () => {
    const original = createEvaluateResult({ testIdx: 0, promptIdx: 0, score: 0 });
    const replacement = createEvaluateResult({ testIdx: 0, promptIdx: 0, score: 1 });
    const additional = createEvaluateResult({ testIdx: 0, promptIdx: 1 });
    const evaluation = createEvaluation({ results: [original] });
    const store = new InMemoryEvaluationStore(evaluation);

    await store.saveResult(replacement);
    await store.saveResult(additional);
    await store.save();

    expect(evaluation.persisted).toBe(true);
    expect(evaluation.results).toEqual([replacement, additional]);
  });

  it('updates vars and valid durations while retaining generation duration', () => {
    const evaluation = createEvaluation({
      generationDurationMs: 25,
      durationMs: 25,
    });
    const store = new InMemoryEvaluationStore(evaluation);

    store.setVars(['topic', 'language']);
    store.setDurationMs(75);

    expect(evaluation.vars).toEqual(['topic', 'language']);
    expect(evaluation.evaluationDurationMs).toBe(75);
    expect(evaluation.durationMs).toBe(100);

    store.setDurationMs(-1);
    store.setDurationMs(Number.NaN);
    store.setDurationMs(Number.POSITIVE_INFINITY);
    expect(evaluation.evaluationDurationMs).toBe(75);
    expect(evaluation.durationMs).toBe(100);
  });

  it('streams result batches, filters by ids, and stores run statistics', async () => {
    const results = [
      createEvaluateResult({ id: 'result-1' }),
      createEvaluateResult({ id: 'result-2' }),
      createEvaluateResult({ id: 'result-3' }),
    ];
    const evaluation = createEvaluation({ results });
    const store = new InMemoryEvaluationStore(evaluation);

    const batches = [];
    for await (const batch of store.readResultBatches(2)) {
      batches.push(batch.map((result) => result.id));
    }
    const selected = [];
    for await (const batch of store.readResultsByIdsBatched(['result-3', 'result-1'], 1)) {
      selected.push(...batch.map((result) => result.id));
    }
    store.setRunStats({
      latency: { avgMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0 },
      cache: { hits: 0, misses: 0, hitRate: null },
      errors: {
        total: 0,
        types: [],
        breakdown: { timeout: 0, rate_limit: 0, auth: 0, server_error: 0, network: 0, other: 0 },
      },
      providers: [],
      assertions: {
        total: 0,
        passed: 0,
        passRate: 0,
        modelGraded: 0,
        breakdown: [],
        tokenUsage: {
          totalTokens: 0,
          promptTokens: 0,
          completionTokens: 0,
          cachedTokens: 0,
          numRequests: 0,
          reasoningTokens: 0,
        },
      },
      models: { ids: [], isComparison: false, hasCustom: false },
    });

    expect(batches).toEqual([['result-1', 'result-2'], ['result-3']]);
    expect(selected).toEqual(['result-1', 'result-3']);
    expect(evaluation.runStats?.errors.total).toBe(0);
  });

  it('returns EvaluateResult values unchanged', () => {
    const store = new InMemoryEvaluationStore(createEvaluation());
    const result = createEvaluateResult();

    expect(store.toEvaluateResult(result)).toBe(result);
  });
});
