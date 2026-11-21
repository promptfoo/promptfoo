import EvalResult, { asEvaluateResult } from '../models/evalResult';

import type { EvaluationStore } from '../evaluator/runtime';
import type Eval from '../models/eval';
import type { CompletedPrompt, EvaluateResult } from '../types/index';

export interface RetryStage {
  originalIds: ReadonlySet<string>;
  rows: EvalResult[];
}

export class EvalEvaluationStore implements EvaluationStore<Eval, EvalResult> {
  constructor(
    readonly evaluation: Eval,
    private readonly retryStage?: RetryStage,
  ) {}

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

  async appendResult(result: EvaluateResult): Promise<void> {
    if (this.retryStage) {
      this.retryStage.rows.push(
        await EvalResult.createFromEvaluateResult(this.id, result, {
          persist: false,
          deferMedia: true,
        }),
      );
      return;
    }
    await this.evaluation.addResult(result);
  }

  async appendPrompts(prompts: CompletedPrompt[]): Promise<void> {
    if (this.retryStage) {
      this.evaluation.prompts = prompts;
      return;
    }
    await this.evaluation.addPrompts(prompts);
  }

  hasResultPersistenceFailure(result: Pick<EvaluateResult, 'promptIdx' | 'testIdx'>): boolean {
    return this.evaluation.hasResultPersistenceFailure(result);
  }

  readCompletedIndexPairs(options?: {
    excludeErrors?: boolean;
    excludeResultIds?: string[];
  }): Promise<Set<string>> {
    return EvalResult.getCompletedIndexPairs(this.id, options);
  }

  readFailedResultsByTestIdx(testIdx: number): Promise<EvalResult[]> {
    return this.evaluation.getFailedResultsByTestIdx(testIdx);
  }

  async readResults(): Promise<Array<EvalResult | EvaluateResult>> {
    const rows = await this.evaluation.getResults();
    const stage = this.retryStage;
    if (!stage) {
      return rows;
    }
    return [...rows.filter((row) => !row.id || !stage.originalIds.has(row.id)), ...stage.rows];
  }

  async readResultsByTestIdx(testIdx: number): Promise<EvalResult[]> {
    return this.retryStage
      ? this.retryStage.rows.filter((row) => row.testIdx === testIdx)
      : this.evaluation.fetchResultsByTestIdx(testIdx);
  }

  recordFinalResult(result: EvaluateResult): void {
    this.evaluation.recordFinalJsonlResult(result);
  }

  recordResultPersistenceFailure(result: EvaluateResult): void {
    this.evaluation.recordResultPersistenceFailure(result);
  }

  async save(): Promise<void> {
    if (!this.retryStage) {
      await this.evaluation.save();
    }
  }

  async saveResult(result: EvalResult): Promise<void> {
    if (!this.retryStage) {
      await result.save();
    }
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
