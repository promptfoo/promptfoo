import { JsonlFileWriter } from '../util/exportToFile/writeToFile';
import { getOutputFileFormat } from '../util/outputFormats';
import { renderEnvOnlyInObject } from '../util/render';
import { preserveTracingCredentialReferences } from '../util/sanitizer';
import { EvalEvaluationStore } from './evaluationStore';

import type {
  EvaluatorResultWriter,
  EvaluatorResultWriterOptions,
  EvaluatorRuntime,
} from '../evaluator/runtime';
import type Eval from '../models/eval';
import type EvalResult from '../models/evalResult';

function getJsonlOutputPaths(outputPath: string | string[] | undefined): string[] {
  if (Array.isArray(outputPath)) {
    return outputPath.filter((path) => getOutputFileFormat(path) === 'jsonl');
  }
  return outputPath && getOutputFileFormat(outputPath) === 'jsonl' ? [outputPath] : [];
}

export const nodeEvaluatorRuntime: EvaluatorRuntime<Eval, EvalResult> = {
  resolveRuntimeTestSuite(testSuite) {
    if (!testSuite.tracing?.provider) {
      return testSuite;
    }

    const renderedEnv = testSuite.env ? renderEnvOnlyInObject(testSuite.env) : undefined;
    const runtimeTestSuite = {
      ...testSuite,
      ...(renderedEnv && { env: renderedEnv }),
      tracing: renderEnvOnlyInObject(testSuite.tracing, renderedEnv),
    };
    preserveTracingCredentialReferences(
      {
        env: testSuite.env,
        tracing: { enabled: testSuite.tracing.enabled, provider: testSuite.tracing.provider },
      },
      {
        env: runtimeTestSuite.env,
        tracing: {
          enabled: runtimeTestSuite.tracing.enabled,
          provider: runtimeTestSuite.tracing.provider,
        },
      },
    );
    return runtimeTestSuite;
  },

  createEvaluationStore(evaluation) {
    return new EvalEvaluationStore(evaluation);
  },

  createResultWriters(outputPath, options: EvaluatorResultWriterOptions): EvaluatorResultWriter[] {
    return getJsonlOutputPaths(outputPath).map((path) => new JsonlFileWriter(path, options));
  },
};
