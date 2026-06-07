import type { EvalRunStats } from '../runStats/types';
import type { CompletedPrompt, EvaluateResult, UnifiedConfig } from '../types/index';

export type EvaluationStoreResult = Pick<
  EvaluateResult,
  | 'id'
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
  runStats?: EvalRunStats;
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

  appendResult(result: EvaluateResult): Promise<TResult | undefined>;
  appendPrompts(prompts: CompletedPrompt[]): Promise<void>;
  hasResultPersistenceFailure(result: Pick<EvaluateResult, 'promptIdx' | 'testIdx'>): boolean;
  readCompletedIndexPairs(options?: { excludeErrors?: boolean }): Promise<Set<string>>;
  readFailedResults(): Promise<TResult[]>;
  readFailedResultsByTestIdx(testIdx: number): Promise<TResult[]>;
  readResultBatches(batchSize?: number): AsyncGenerator<TResult[]>;
  readResults(): Promise<Array<TResult | EvaluateResult>>;
  readResultsByIdsBatched(
    resultIds: readonly string[],
    batchSize?: number,
  ): AsyncGenerator<TResult[]>;
  readResultsByTestIdx(testIdx: number): Promise<TResult[]>;
  recordFinalResult(result: EvaluateResult): void;
  recordResultPersistenceFailure(result: EvaluateResult): void;
  save(): Promise<void>;
  saveResult(result: TResult): Promise<void>;
  setDurationMs(durationMs: number): void;
  setRunStats(runStats: EvalRunStats): void;
  setVars(vars: string[]): void;
  toEvaluateResult(result: TResult | EvaluateResult): EvaluateResult;
}

export interface EvaluatorResultWriter {
  write(data: unknown): Promise<void>;
  close(): Promise<void>;
}

export interface EvaluatorResultWriterOptions {
  append: boolean;
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
