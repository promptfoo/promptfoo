import { afterEach, describe, expect, it, vi } from 'vitest';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { EvalEvaluationStore } from '../../src/node/evaluationStore';
import { createCompletedPrompt, createEvaluateResult } from '../factories/eval';

describe('EvalEvaluationStore', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes the underlying evaluation state', () => {
    const evaluation = new Eval({ description: 'adapter test' });
    const store = new EvalEvaluationStore(evaluation);

    expect(store.evaluation).toBe(evaluation);
    expect(store.id).toBe(evaluation.id);
    expect(store.config).toBe(evaluation.config);
    expect(store.persisted).toBe(false);
    expect(store.prompts).toBe(evaluation.prompts);
    expect(store.results).toBe(evaluation.results);
    expect(store.resultPersistenceFailed).toBe(false);
  });

  it('delegates result, prompt, resume, and read operations', async () => {
    const evaluation = new Eval({});
    const store = new EvalEvaluationStore(evaluation);
    const result = createEvaluateResult();
    const prompts = [createCompletedPrompt('Prompt')];
    const modelResult = { testIdx: 0 } as EvalResult;
    const completed = new Set(['0:0']);

    const addResult = vi.spyOn(evaluation, 'addResult').mockResolvedValue(undefined);
    const addPrompts = vi.spyOn(evaluation, 'addPrompts').mockResolvedValue(undefined);
    const getCompletedIndexPairs = vi
      .spyOn(EvalResult, 'getCompletedIndexPairs')
      .mockResolvedValue(completed);
    const getFailedResultsByTestIdx = vi
      .spyOn(evaluation, 'getFailedResultsByTestIdx')
      .mockResolvedValue([modelResult]);
    const getResults = vi.spyOn(evaluation, 'getResults').mockResolvedValue([modelResult]);
    const fetchResultsByTestIdx = vi
      .spyOn(evaluation, 'fetchResultsByTestIdx')
      .mockResolvedValue([modelResult]);

    await store.appendResult(result);
    await store.appendPrompts(prompts);

    expect(await store.readCompletedIndexPairs({ excludeErrors: true })).toBe(completed);
    expect(await store.readFailedResultsByTestIdx(0)).toEqual([modelResult]);
    expect(await store.readResults()).toEqual([modelResult]);
    expect(await store.readResultsByTestIdx(0)).toEqual([modelResult]);
    expect(addResult).toHaveBeenCalledWith(result);
    expect(addPrompts).toHaveBeenCalledWith(prompts);
    expect(getCompletedIndexPairs).toHaveBeenCalledWith(evaluation.id, { excludeErrors: true });
    expect(getFailedResultsByTestIdx).toHaveBeenCalledWith(0);
    expect(getResults).toHaveBeenCalledOnce();
    expect(fetchResultsByTestIdx).toHaveBeenCalledWith(0);
  });

  it('delegates persistence failure, final result, and save operations', async () => {
    const evaluation = new Eval({});
    const store = new EvalEvaluationStore(evaluation);
    const result = createEvaluateResult();
    const modelResult = { save: vi.fn().mockResolvedValue(undefined) } as unknown as EvalResult;

    const recordFinalJsonlResult = vi.spyOn(evaluation, 'recordFinalJsonlResult');
    const recordResultPersistenceFailure = vi.spyOn(evaluation, 'recordResultPersistenceFailure');
    const hasResultPersistenceFailure = vi
      .spyOn(evaluation, 'hasResultPersistenceFailure')
      .mockReturnValue(true);
    const save = vi.spyOn(evaluation, 'save').mockResolvedValue(undefined);
    const setDurationMs = vi.spyOn(evaluation, 'setDurationMs');
    const setVars = vi.spyOn(evaluation, 'setVars');

    store.recordFinalResult(result);
    store.recordResultPersistenceFailure(result);
    expect(store.hasResultPersistenceFailure(result)).toBe(true);
    await store.saveResult(modelResult);
    store.setDurationMs(100);
    store.setVars(['topic']);
    await store.save();

    expect(recordFinalJsonlResult).toHaveBeenCalledWith(result);
    expect(recordResultPersistenceFailure).toHaveBeenCalledWith(result);
    expect(hasResultPersistenceFailure).toHaveBeenCalledWith(result);
    expect(modelResult.save).toHaveBeenCalledOnce();
    expect(setDurationMs).toHaveBeenCalledWith(100);
    expect(setVars).toHaveBeenCalledWith(['topic']);
    expect(save).toHaveBeenCalledOnce();
  });

  it('normalizes model results while preserving plain EvaluateResult values', () => {
    const store = new EvalEvaluationStore(new Eval({}));
    const plainResult = createEvaluateResult();
    const normalizedResult = createEvaluateResult({ score: 0.5 });
    const modelResult = {
      toEvaluateResult: vi.fn().mockReturnValue(normalizedResult),
    } as unknown as EvalResult;

    expect(store.toEvaluateResult(plainResult)).toBe(plainResult);
    expect(store.toEvaluateResult(modelResult)).toBe(normalizedResult);
    expect(modelResult.toEvaluateResult).toHaveBeenCalledOnce();
  });
});
