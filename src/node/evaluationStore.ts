import EvalResult, { asEvaluateResult } from '../models/evalResult';
import { recalculatePromptMetrics } from './retry';

import type { EvaluationStore } from '../evaluator/runtime';
import type Eval from '../models/eval';
import type { CompletedPrompt, EvaluateResult } from '../types/index';

export class EvalEvaluationStore implements EvaluationStore<Eval, EvalResult> {
  private promptsPrepared = false;

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

  appendResult(result: EvaluateResult, options?: { replace?: EvalResult }): Promise<void> {
    return options?.replace
      ? this.evaluation.addResult(result, { replaceId: options.replace.id })
      : this.evaluation.addResult(result);
  }

  async appendPrompts(prompts: CompletedPrompt[]): Promise<void> {
    if (!this.promptsPrepared && this.persisted && (await EvalResult.hasSavedResults(this.id))) {
      // Result commits can outlive an aggregate flush, including the last checkpoint
      // replacement. Reconcile an existing eval once from its durable rows.
      this.evaluation.prompts = prompts;
      await recalculatePromptMetrics(this.evaluation, { preserveDerivedMetrics: true });
    } else {
      await this.evaluation.addPrompts(prompts);
    }
    this.promptsPrepared = true;
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
