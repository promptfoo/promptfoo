import type { EvaluateResult } from '../types/index';

export interface EvalResultPersistence {
  addResult(result: EvaluateResult): Promise<void>;
}

export interface EvaluatorResultWriter {
  write(data: unknown): Promise<void>;
  close(): Promise<void>;
}

export interface EvaluatorResultWriterOptions {
  append: boolean;
}

export interface EvaluatorRuntime {
  createResultWriters(
    outputPath: string | string[] | undefined,
    options: EvaluatorResultWriterOptions,
  ): EvaluatorResultWriter[];
  persistResult(evalRecord: EvalResultPersistence, result: EvaluateResult): Promise<void>;
}
