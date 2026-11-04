import cliState from '../cliState';
import { isCI } from '../envars';
import { evaluate } from '../evaluator/engine';
import { PromptSuggestionsRejectedError } from '../evaluator/errors';
import { CIProgressReporter } from '../progress/ciProgressReporter';
import { promptYesNo } from '../util/readline';
import { ProgressBarManager } from './evaluatorProgress';
import { nodeEvaluatorRuntime } from './evaluatorRuntime';

import type { EvaluatorRuntime } from '../evaluator/runtime';
import type Eval from '../models/eval';
import type EvalResult from '../models/evalResult';
import type { TestSuite } from '../types/index';
import type { InternalEvaluateOptions } from '../types/internal';

/** CLI-only interaction, terminal reporting, and rejected-selection exit policy. */
export async function evaluateForCli(
  testSuite: TestSuite,
  evaluation: Eval,
  options: InternalEvaluateOptions,
): Promise<Eval> {
  const runtime: EvaluatorRuntime<Eval, EvalResult> = {
    ...nodeEvaluatorRuntime,
    selectPrompt: () => promptYesNo('Do you want to test this prompt?', false),
    createProgressReporters(total) {
      const isWebUI = Boolean(cliState.webUI);
      if (isCI() && !isWebUI) {
        return { ciProgressReporter: new CIProgressReporter(total) };
      }
      if (options.showProgressBar && process.stderr.isTTY) {
        return { progressBarManager: new ProgressBarManager(isWebUI) };
      }
      return {};
    },
  };

  try {
    return await evaluate(testSuite, evaluation, options, runtime);
  } catch (error) {
    if (error instanceof PromptSuggestionsRejectedError) {
      process.exitCode = 1;
      return evaluation;
    }
    throw error;
  }
}
