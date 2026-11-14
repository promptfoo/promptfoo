import { evaluate as evaluateWithRuntime } from '../evaluator/engine';
import { EvalEvaluationStore } from './evaluationStore';
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
  const retryReplacementIds = options.retryReplacementIds;
  const defaultRuntime = retryReplacementIds
    ? {
        ...nodeEvaluatorRuntime,
        createEvaluationStore: (evaluation: Eval) =>
          new EvalEvaluationStore(evaluation, retryReplacementIds),
      }
    : nodeEvaluatorRuntime;
  return evaluateWithRuntime(
    testSuite,
    evalRecord,
    options,
    runtime ?? (defaultRuntime as unknown as EvaluatorRuntime<TEvaluation, TResult>),
  );
}
