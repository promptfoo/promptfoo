import type { CompletedPrompt, EvaluateResult, UnifiedConfig } from '../types/index';

export type EvaluationStoreResult = Pick<
  EvaluateResult,
  | 'cost'
  | 'error'
  | 'failureReason'
  | 'gradingResult'
  | 'latencyMs'
  | 'metadata'
  | 'namedScores'
  | 'prompt'
  | 'promptIdx'
  | 'provider'
  | 'response'
  | 'score'
  | 'success'
  | 'testCase'
  | 'testIdx'
>;

export interface EvaluationRecord {
  readonly id: string;
  readonly config: Partial<UnifiedConfig>;
  readonly persisted: boolean;
  readonly prompts: CompletedPrompt[];
  readonly results: EvaluationStoreResult[];
  resultPersistenceFailed: boolean;
}

export interface EvaluationStore<
  TEvaluation extends EvaluationRecord = EvaluationRecord,
  TResult extends EvaluationStoreResult = EvaluationStoreResult,
> {
  readonly evaluation: TEvaluation;
  readonly id: string;
  readonly config: Partial<UnifiedConfig>;
  readonly persisted: boolean;
  readonly prompts: CompletedPrompt[];
  readonly results: TResult[];
  readonly resultPersistenceFailed: boolean;

  appendResult(result: EvaluateResult): Promise<void>;
  appendPrompts(prompts: CompletedPrompt[]): Promise<void>;
  hasResultPersistenceFailure(result: Pick<EvaluateResult, 'promptIdx' | 'testIdx'>): boolean;
  readCompletedIndexPairs(options?: { excludeErrors?: boolean }): Promise<Set<string>>;
  readFailedResultsByTestIdx(testIdx: number): Promise<TResult[]>;
  readResults(): Promise<Array<TResult | EvaluateResult>>;
  readResultsByTestIdx(testIdx: number): Promise<TResult[]>;
  recordFinalResult(result: EvaluateResult): void;
  recordResultPersistenceFailure(result: EvaluateResult): void;
  save(): Promise<void>;
  saveResult(result: TResult): Promise<void>;
  setDurationMs(durationMs: number): void;
  setVars(vars: string[]): void;
  toEvaluateResult(result: TResult | EvaluateResult): EvaluateResult;
}

export interface EvaluatorResultWriter {
  write(data: unknown): Promise<void>;
  close(): Promise<void>;
}

export interface EvaluatorResultWriterOptions {
  append: boolean;
  /**
   * Reports a non-fatal writer error that arrived after the final flush (the data is
   * already on disk). Writers must not depend on the logger directly, so the caller
   * injects its own reporting.
   */
  onPostFlushError?: (message: string) => void;
}

export interface EvaluatorRuntime<
  TEvaluation extends EvaluationRecord = EvaluationRecord,
  TResult extends EvaluationStoreResult = EvaluationStoreResult,
> {
  createEvaluationStore(evaluation: TEvaluation): EvaluationStore<TEvaluation, TResult>;
  createResultWriters(
    outputPath: string | string[] | undefined,
    options: EvaluatorResultWriterOptions,
  ): EvaluatorResultWriter[];
}
