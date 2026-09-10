import { getEnvBool } from '../envars';
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

    const processEnvironmentDisabled = getEnvBool(
      'PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS',
      getEnvBool('PROMPTFOO_SELF_HOSTED', false),
    );
    const processEnvironment = processEnvironmentDisabled ? {} : process.env;
    let renderedEnv = testSuite.env;
    if (renderedEnv) {
      const maxPasses = Object.keys(renderedEnv).length;
      for (let pass = 0; pass < maxPasses; pass++) {
        const previousEnv: NonNullable<typeof testSuite.env> = renderedEnv;
        const nextEnv: NonNullable<typeof testSuite.env> = renderEnvOnlyInObject(
          previousEnv,
          { ...processEnvironment, ...previousEnv },
          true,
        );
        if (
          Object.entries(nextEnv).every(
            ([name, value]) => previousEnv[name as keyof typeof previousEnv] === value,
          )
        ) {
          renderedEnv = nextEnv;
          break;
        }
        renderedEnv = nextEnv;
      }
    }
    const runtimeTestSuite = {
      ...testSuite,
      ...(renderedEnv && { env: renderedEnv }),
      tracing: renderEnvOnlyInObject(
        testSuite.tracing,
        { ...processEnvironment, ...renderedEnv },
        true,
      ),
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
