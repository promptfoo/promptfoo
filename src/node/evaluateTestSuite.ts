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
import type { RetryStage } from './evaluationStore';

export type NodeEvaluateOptions = InternalEvaluateOptions & { retryStage?: RetryStage };

// Keep the three-argument source API for Eval records. Custom stores require a runtime.
export function evaluate<TEvaluation extends Eval>(
  testSuite: TestSuite,
  evalRecord: TEvaluation,
  options: NodeEvaluateOptions,
): Promise<TEvaluation>;
export function evaluate<
  TEvaluation extends EvaluationRecord,
  TResult extends EvaluationStoreResult = EvaluationStoreResult,
>(
  testSuite: TestSuite,
  evalRecord: TEvaluation,
  options: NodeEvaluateOptions,
  runtime: EvaluatorRuntime<TEvaluation, TResult>,
): Promise<TEvaluation>;
export function evaluate<
  TEvaluation extends EvaluationRecord,
  TResult extends EvaluationStoreResult = EvaluationStoreResult,
>(
  testSuite: TestSuite,
  evalRecord: TEvaluation,
  options: NodeEvaluateOptions,
  runtime?: EvaluatorRuntime<TEvaluation, TResult>,
): Promise<TEvaluation> {
  const retryStage = options.retryStage;
  const defaultRuntime = retryStage
    ? {
        ...nodeEvaluatorRuntime,
        createEvaluationStore: (evaluation: Eval) =>
          new EvalEvaluationStore(evaluation, retryStage),
        createResultWriters: () => [],
      }
    : nodeEvaluatorRuntime;
  return evaluateWithRuntime(
    testSuite,
    evalRecord,
    options,
    runtime ?? (defaultRuntime as unknown as EvaluatorRuntime<TEvaluation, TResult>),
  );
}
