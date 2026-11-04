import type {
  CompletedPrompt,
  EvaluateResult,
  PromptMetrics,
  RunEvalOptions,
  TestSuite,
  UnifiedConfig,
} from '../types/index';

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
}

/** Optional progress sinks; the runtime decides whether a terminal or CI reporter is appropriate. */
export interface EvaluatorProgressBar {
  initialize(rows: RunEvalOptions[], concurrency: number, compareRowsCount: number): Promise<void>;
  installLogInterceptor(): void;
  removeLogInterceptor(): void;
  updateProgress(
    index: number,
    row: RunEvalOptions | undefined,
    phase?: 'serial' | 'concurrent',
    metrics?: PromptMetrics,
  ): void;
  updateComparisonProgress(prompt: string): void;
  updateTotalCount(additionalCount: number): void;
  complete(): void;
  stop(): void;
}

export interface EvaluatorCiProgressReporter {
  start(): void;
  update(completed: number): void;
  updateTotalTests(total: number): void;
  error(message: string): void;
  finish(): void;
}

export interface EvaluatorRuntime<
  TEvaluation extends EvaluationRecord = EvaluationRecord,
  TResult extends EvaluationStoreResult = EvaluationStoreResult,
> {
  resolveRuntimeTestSuite?(testSuite: TestSuite): TestSuite;
  /** Approves generated variants. Required when generateSuggestions is enabled. */
  selectPrompt?(prompt: string): Promise<boolean>;
  createProgressReporters?(
    total: number,
  ):
    | { progressBarManager?: EvaluatorProgressBar | null; ciProgressReporter?: never }
    | { progressBarManager?: never; ciProgressReporter?: EvaluatorCiProgressReporter | null };
  createEvaluationStore(evaluation: TEvaluation): EvaluationStore<TEvaluation, TResult>;
  createResultWriters(
    outputPath: string | string[] | undefined,
    options: EvaluatorResultWriterOptions,
  ): EvaluatorResultWriter[];
}
