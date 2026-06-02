import { JsonlFileWriter } from '../util/exportToFile/writeToFile';
import { getOutputFileFormat } from '../util/outputFormats';

import type {
  EvalResultPersistence,
  EvaluatorResultWriter,
  EvaluatorResultWriterOptions,
  EvaluatorRuntime,
} from '../evaluator/runtime';
import type { EvaluateResult } from '../types/index';

function getJsonlOutputPaths(outputPath: string | string[] | undefined): string[] {
  if (Array.isArray(outputPath)) {
    return outputPath.filter((path) => getOutputFileFormat(path) === 'jsonl');
  }
  return outputPath && getOutputFileFormat(outputPath) === 'jsonl' ? [outputPath] : [];
}

export const nodeEvaluatorRuntime: EvaluatorRuntime = {
  createResultWriters(outputPath, options: EvaluatorResultWriterOptions): EvaluatorResultWriter[] {
    return getJsonlOutputPaths(outputPath).map((path) => new JsonlFileWriter(path, options));
  },

  persistResult(evalRecord: EvalResultPersistence, result: EvaluateResult): Promise<void> {
    return evalRecord.addResult(result);
  },
};
