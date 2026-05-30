import type { EvaluateResult } from '../types/index';

export interface EvalResultPersistence {
  addResult(result: EvaluateResult): Promise<void>;
}

export interface EvaluatorResultWriter {
  write(data: unknown): Promise<void>;
  close(): Promise<void>;
}

export interface EvaluatorRuntime {
  createResultWriters(outputPath: string | string[] | undefined): EvaluatorResultWriter[];
  persistResult(evalRecord: EvalResultPersistence, result: EvaluateResult): Promise<void>;
  updateResumeSignal(evalId: string): void;
}
