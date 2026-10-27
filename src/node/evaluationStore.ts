import { isDeepStrictEqual } from 'node:util';

import EvalResult, { asEvaluateResult, getStripFlags } from '../models/evalResult';
import { sanitizeRuntimeOptions } from '../util/sanitizer';

import type { EvaluationStore } from '../evaluator/runtime';
import type Eval from '../models/eval';
import type { CompletedPrompt, EvaluateResult, ExactHistoricalReplayPlan } from '../types/index';

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

  readExactHistoricalReplay(): unknown {
    return this.evaluation.runtimeOptions?.exactHistoricalReplay;
  }

  async saveExactHistoricalReplay(plan: ExactHistoricalReplayPlan): Promise<void> {
    const original = this.evaluation.runtimeOptions;
    const next = { ...original, exactHistoricalReplay: plan };
    if (
      !isDeepStrictEqual(
        sanitizeRuntimeOptions(next, getStripFlags(this.evaluation.config.env))
          ?.exactHistoricalReplay,
        plan,
      )
    ) {
      throw new Error('Could not safely save the prepared exact historical selection');
    }
    this.evaluation.runtimeOptions = next;
    try {
      await this.evaluation.save();
    } catch (error) {
      this.evaluation.runtimeOptions = original;
      throw error;
    }
  }

  appendResult(result: EvaluateResult): Promise<void> {
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

  readFailedResultsByTestIdx(testIdx: number): Promise<EvalResult[]> {
    return this.evaluation.getFailedResultsByTestIdx(testIdx);
  }

  readResults(): Promise<Array<EvalResult | EvaluateResult>> {
    return this.evaluation.getResults();
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

  setVars(vars: string[]): void {
    this.evaluation.setVars(vars);
  }

  toEvaluateResult(result: EvalResult | EvaluateResult): EvaluateResult {
    return asEvaluateResult(result);
  }
}
