import { evaluate as evaluateWithRuntime } from '../evaluator/engine';
import { isCliEventSource } from '../types/eventSource';
import { nodeEvaluatorRuntime } from './evaluatorRuntime';

import type {
  EvaluationRecord,
  EvaluationStoreResult,
  EvaluatorRuntime,
} from '../evaluator/runtime';
import type Eval from '../models/eval';
import type { TestSuite } from '../types/index';
import type { InternalEvaluateOptions } from '../types/internal';

// Keep the three-argument source API for Eval records. Custom stores require a runtime.
export function evaluate<TEvaluation extends Eval>(
  testSuite: TestSuite,
  evalRecord: TEvaluation,
  options: InternalEvaluateOptions,
): Promise<TEvaluation>;
export function evaluate<
  TEvaluation extends EvaluationRecord,
  TResult extends EvaluationStoreResult = EvaluationStoreResult,
>(
  testSuite: TestSuite,
  evalRecord: TEvaluation,
  options: InternalEvaluateOptions,
  runtime: EvaluatorRuntime<TEvaluation, TResult>,
): Promise<TEvaluation>;
export function evaluate<
  TEvaluation extends EvaluationRecord,
  TResult extends EvaluationStoreResult = EvaluationStoreResult,
>(
  testSuite: TestSuite,
  evalRecord: TEvaluation,
  options: InternalEvaluateOptions,
  runtime?: EvaluatorRuntime<TEvaluation, TResult>,
): Promise<TEvaluation> {
  if (!runtime && isCliEventSource(options)) {
    return import('./evaluateForCli').then(({ evaluateForCli }) =>
      evaluateForCli(testSuite, evalRecord as unknown as Eval, options),
    ) as Promise<TEvaluation>;
  }
  return evaluateWithRuntime(
    testSuite,
    evalRecord,
    options,
    runtime ?? (nodeEvaluatorRuntime as unknown as EvaluatorRuntime<TEvaluation, TResult>),
  );
}
