import EvalResult, { asEvaluateResult } from '../models/evalResult';

import type { EvaluationStore } from '../evaluator/runtime';
import type Eval from '../models/eval';
import type { EvalRunStats } from '../runStats/types';
import type { CompletedPrompt, EvaluateResult } from '../types/index';

export class EvalEvaluationStore implements EvaluationStore<Eval, EvalResult> {
  constructor(readonly evaluation: Eval) {}

  get id() {
    return this.evaluation.id;
  }

  get config() {
    return this.evaluation.config;
  }

  get persisted() {
    return this.evaluation.persisted;
  }

  get prompts() {
    return this.evaluation.prompts;
  }

  get results() {
    return this.evaluation.results;
  }

  get resultPersistenceFailed() {
    return this.evaluation.resultPersistenceFailed;
  }

  appendResult(result: EvaluateResult): Promise<EvalResult | undefined> {
    return this.evaluation.addResult(result);
  }

  appendPrompts(prompts: CompletedPrompt[]): Promise<void> {
    return this.evaluation.addPrompts(prompts);
  }

  hasResultPersistenceFailure(result: Pick<EvaluateResult, 'promptIdx' | 'testIdx'>): boolean {
    return this.evaluation.hasResultPersistenceFailure(result);
  }

  readCompletedIndexPairs(options?: { excludeErrors?: boolean }): Promise<Set<string>> {
    return EvalResult.getCompletedIndexPairs(this.id, options);
  }

  readFailedResults(): Promise<EvalResult[]> {
    return this.evaluation.getFailedResults();
  }

  readFailedResultsByTestIdx(testIdx: number): Promise<EvalResult[]> {
    return this.evaluation.getFailedResultsByTestIdx(testIdx);
  }

  readResultBatches(batchSize?: number): AsyncGenerator<EvalResult[]> {
    return this.evaluation.fetchResultsBatched(batchSize);
  }

  readResults(): Promise<Array<EvalResult | EvaluateResult>> {
    return this.evaluation.getResults();
  }

  readResultsByIdsBatched(
    resultIds: readonly string[],
    batchSize?: number,
  ): AsyncGenerator<EvalResult[]> {
    return this.evaluation.fetchResultsByIdsBatched(resultIds, batchSize);
  }

  readResultsByTestIdx(testIdx: number): Promise<EvalResult[]> {
    return this.evaluation.fetchResultsByTestIdx(testIdx);
  }

  recordFinalResult(result: EvaluateResult): void {
    this.evaluation.recordFinalJsonlResult(result);
  }

  recordResultPersistenceFailure(result: EvaluateResult): void {
    this.evaluation.recordResultPersistenceFailure(result);
  }

  save(): Promise<void> {
    return this.evaluation.save();
  }

  saveResult(result: EvalResult): Promise<void> {
    return result.save();
  }

  setDurationMs(durationMs: number): void {
    this.evaluation.setDurationMs(durationMs);
  }

  setRunStats(runStats: EvalRunStats): void {
    this.evaluation.runStats = runStats;
  }

  setVars(vars: string[]): void {
    this.evaluation.setVars(vars);
  }

  toEvaluateResult(result: EvalResult | EvaluateResult): EvaluateResult {
    return asEvaluateResult(result);
  }
}
