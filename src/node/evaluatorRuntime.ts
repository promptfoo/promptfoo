import { updateSignalFile } from '../database/signal';
import { JsonlFileWriter } from '../util/exportToFile/writeToFile';

import type {
  EvalResultPersistence,
  EvaluatorResultWriter,
  EvaluatorRuntime,
} from '../evaluator/runtime';
import type { EvaluateResult } from '../types/index';

function getJsonlOutputPaths(outputPath: string | string[] | undefined): string[] {
  if (Array.isArray(outputPath)) {
    return outputPath.filter((path) => path.endsWith('.jsonl'));
  }
  return outputPath?.endsWith('.jsonl') ? [outputPath] : [];
}

export const nodeEvaluatorRuntime: EvaluatorRuntime = {
  createResultWriters(outputPath): EvaluatorResultWriter[] {
    return getJsonlOutputPaths(outputPath).map((path) => new JsonlFileWriter(path));
  },

  persistResult(evalRecord: EvalResultPersistence, result: EvaluateResult): Promise<void> {
    return evalRecord.addResult(result);
  },

  updateResumeSignal(evalId: string): void {
    updateSignalFile(evalId);
  },
};
