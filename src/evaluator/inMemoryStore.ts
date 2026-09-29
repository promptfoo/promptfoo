import type {
  CompletedPrompt,
  EvaluateResult,
  ResultFailureReason,
  UnifiedConfig,
} from '../types/index';
import type { EvaluationStore } from './runtime';

const ERROR_FAILURE_REASON: ResultFailureReason = 2;

export interface InMemoryEvaluation {
  id: string;
  config: Partial<UnifiedConfig>;
  persisted: boolean;
  prompts: CompletedPrompt[];
  results: EvaluateResult[];
  vars: string[];
  resultPersistenceFailed: boolean;
  finalResults: EvaluateResult[];
  failedResults: EvaluateResult[];
  durationMs?: number;
  generationDurationMs?: number;
  evaluationDurationMs?: number;
}

function getResultIndexKey(result: Pick<EvaluateResult, 'promptIdx' | 'testIdx'>): string {
  return `${result.testIdx}:${result.promptIdx}`;
}

function toResultMap(results: EvaluateResult[]): Map<string, EvaluateResult> {
  return new Map(results.map((result) => [getResultIndexKey(result), result]));
}

export class InMemoryEvaluationStore
  implements EvaluationStore<InMemoryEvaluation, EvaluateResult>
{
  private readonly failedResultsByIndex: Map<string, EvaluateResult>;
  private readonly finalResultsByIndex: Map<string, EvaluateResult>;

  constructor(readonly evaluation: InMemoryEvaluation) {
    this.failedResultsByIndex = toResultMap(evaluation.failedResults);
    this.finalResultsByIndex = toResultMap(evaluation.finalResults);
    if (this.failedResultsByIndex.size > 0) {
      evaluation.resultPersistenceFailed = true;
    }
    this.syncFailedResults();
    this.syncFinalResults();
  }

  get id(): string {
    return this.evaluation.id;
  }

  get config(): Partial<UnifiedConfig> {
    return this.evaluation.config;
  }

  get persisted(): boolean {
    return this.evaluation.persisted;
  }

  get prompts(): CompletedPrompt[] {
    return this.evaluation.prompts;
  }

  get results(): EvaluateResult[] {
    return this.evaluation.results;
  }

  get resultPersistenceFailed(): boolean {
    return this.evaluation.resultPersistenceFailed;
  }

  async appendResult(result: EvaluateResult): Promise<void> {
    this.evaluation.results.push(result);
  }

  async appendPrompts(prompts: CompletedPrompt[]): Promise<void> {
    this.evaluation.prompts = prompts;
  }

  hasResultPersistenceFailure(result: Pick<EvaluateResult, 'promptIdx' | 'testIdx'>): boolean {
    return this.failedResultsByIndex.has(getResultIndexKey(result));
  }

  async readCompletedIndexPairs(options?: { excludeErrors?: boolean }): Promise<Set<string>> {
    const completedPairs = new Set<string>();
    for (const result of this.evaluation.results) {
      if (options?.excludeErrors && result.failureReason === ERROR_FAILURE_REASON) {
        continue;
      }
      completedPairs.add(getResultIndexKey(result));
    }
    return completedPairs;
  }

  async readFailedResultsByTestIdx(testIdx: number): Promise<EvaluateResult[]> {
    return Array.from(this.failedResultsByIndex.values()).filter(
      (result) => result.testIdx === testIdx,
    );
  }

  async readResults(): Promise<EvaluateResult[]> {
    return this.evaluation.results;
  }

  async readResultsByTestIdx(testIdx: number): Promise<EvaluateResult[]> {
    return this.evaluation.results.filter((result) => result.testIdx === testIdx);
  }

  recordFinalResult(result: EvaluateResult): void {
    this.finalResultsByIndex.set(getResultIndexKey(result), result);
    this.syncFinalResults();
  }

  recordResultPersistenceFailure(result: EvaluateResult): void {
    this.evaluation.resultPersistenceFailed = true;
    this.failedResultsByIndex.set(getResultIndexKey(result), result);
    this.syncFailedResults();
  }

  async save(): Promise<void> {
    this.evaluation.persisted = true;
  }

  async saveResult(result: EvaluateResult): Promise<void> {
    const key = getResultIndexKey(result);
    const resultIndex = this.evaluation.results.findIndex(
      (candidate) => getResultIndexKey(candidate) === key,
    );
    if (resultIndex === -1) {
      this.evaluation.results.push(result);
    } else {
      this.evaluation.results[resultIndex] = result;
    }
  }

  setDurationMs(durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      return;
    }
    this.evaluation.evaluationDurationMs = durationMs;
    this.evaluation.durationMs = (this.evaluation.generationDurationMs ?? 0) + durationMs;
  }

  setVars(vars: string[]): void {
    this.evaluation.vars = vars;
  }

  toEvaluateResult(result: EvaluateResult): EvaluateResult {
    return result;
  }

  private syncFailedResults(): void {
    this.evaluation.failedResults = Array.from(this.failedResultsByIndex.values());
  }

  private syncFinalResults(): void {
    this.evaluation.finalResults = Array.from(this.finalResultsByIndex.values());
  }
}
