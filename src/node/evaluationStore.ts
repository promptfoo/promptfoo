import { isDeepStrictEqual } from 'node:util';

import { getShareAuthorizedBlob } from '../blobs/index';
import EvalResult, { asEvaluateResult, PROMPTFOO_METADATA_KEY } from '../models/evalResult';
import { isApiProvider } from '../types/providers';
import { REDACTED, sanitizeObject } from '../util/sanitizer';

import type { EvaluationStore } from '../evaluator/runtime';
import type Eval from '../models/eval';
import type {
  Assertion,
  AtomicTestCase,
  CompletedPrompt,
  EvaluateResult,
  ProviderResponse,
} from '../types/index';

function preserveAssertionFunctions(assertion: Assertion): Assertion {
  return {
    ...assertion,
    ...(typeof assertion.value === 'function' && {
      value: `[Function] ${assertion.value.name}`,
    }),
    ...(typeof assertion.transform === 'function' && {
      transform: `[Function] ${assertion.transform.name}`,
    }),
    ...(typeof assertion.contextTransform === 'function' && {
      contextTransform: `[Function] ${assertion.contextTransform.name}`,
    }),
  };
}

// Persisted tests keep hook-modified values, but runtime functions and provider
// instances must come from the freshly loaded test rather than sanitizer placeholders.
function restoreRuntimeGradingValues(saved: unknown, current: unknown): unknown {
  if (saved === REDACTED) {
    if (current === undefined || current === REDACTED) {
      throw new Error(
        'Cannot resume assertion grading: a redacted input is missing from the current test configuration',
      );
    }
    return current;
  }
  if (typeof current === 'function' && saved === `[Function] ${current.name}`) {
    return current;
  }
  if (
    isApiProvider(current) &&
    (saved === `[${current.constructor?.name ?? 'Object'} Instance]` ||
      isDeepStrictEqual(saved, sanitizeObject(current, { maxDepth: Number.POSITIVE_INFINITY })))
  ) {
    return current;
  }
  if (Array.isArray(saved)) {
    return saved.map((value, index) =>
      restoreRuntimeGradingValues(value, Array.isArray(current) ? current[index] : undefined),
    );
  }
  if (saved && typeof saved === 'object') {
    const runtime =
      current && typeof current === 'object' ? (current as Record<string, unknown>) : {};
    return Object.fromEntries(
      Object.entries(saved).map(([key, value]) => [
        key,
        restoreRuntimeGradingValues(value, runtime[key]),
      ]),
    );
  }
  return saved;
}

export class EvalEvaluationStore implements EvaluationStore<Eval, EvalResult> {
  constructor(readonly evaluation: Eval) {}

  get id() {
    return this.evaluation.id;
  }

  get config() {
    return this.evaluation.config;
  }

  get persisted() {
    return this.evaluation.persisted;
  }

  get prompts() {
    return this.evaluation.prompts;
  }

  get results() {
    return this.evaluation.results;
  }

  get resultPersistenceFailed() {
    return this.evaluation.resultPersistenceFailed;
  }

  appendResult(result: EvaluateResult): Promise<void> {
    if (result.gradingResult?.metadata?.[PROMPTFOO_METADATA_KEY]?.assertionGradingInterrupted) {
      // Preserve callback presence before JSON serialization drops functions. Never
      // restore a callable that a hook deliberately removed from the saved test.
      const test = result.testCase;
      result = {
        ...result,
        testCase: {
          ...test,
          ...(typeof test.assertScoringFunction === 'function' && {
            assertScoringFunction: `[Function] ${test.assertScoringFunction.name}`,
          }),
          assert: test.assert?.map((assertion) =>
            assertion.type === 'assert-set'
              ? { ...assertion, assert: assertion.assert.map(preserveAssertionFunctions) }
              : preserveAssertionFunctions(assertion),
          ),
        },
      };
    }
    return this.evaluation.addResult(result);
  }

  appendPrompts(prompts: CompletedPrompt[]): Promise<void> {
    return this.evaluation.addPrompts(prompts);
  }

  hasResultPersistenceFailure(result: Pick<EvaluateResult, 'promptIdx' | 'testIdx'>): boolean {
    return this.evaluation.hasResultPersistenceFailure(result);
  }

  readCompletedIndexPairs(options?: {
    excludeErrors?: boolean;
    interruptedGradingOnly?: boolean;
  }): Promise<Set<string>> {
    return EvalResult.getCompletedIndexPairs(this.id, options);
  }

  readFailedResultsByTestIdx(testIdx: number): Promise<EvalResult[]> {
    return this.evaluation.getFailedResultsByTestIdx(testIdx);
  }

  readResults(): Promise<Array<EvalResult | EvaluateResult>> {
    return this.evaluation.getResults();
  }

  readResultsByTestIdx(testIdx: number): Promise<EvalResult[]> {
    return this.evaluation.fetchResultsByTestIdx(testIdx);
  }

  async resolveGradingInputs(
    response: ProviderResponse,
    savedTest: AtomicTestCase,
    currentTest: AtomicTestCase,
  ): Promise<{ providerResponse: ProviderResponse; test: AtomicTestCase }> {
    const test = restoreRuntimeGradingValues(savedTest, currentTest) as AtomicTestCase;
    if (!response.audio?.blobRef) {
      return { providerResponse: response, test };
    }
    const blob = await getShareAuthorizedBlob(response.audio.blobRef.hash, this.id);
    if (!blob) {
      throw new Error('Stored audio is not available for this evaluation');
    }
    return {
      providerResponse: {
        ...response,
        audio: { ...response.audio, data: blob.data.toString('base64'), blobRef: undefined },
      },
      test,
    };
  }

  recordFinalResult(result: EvaluateResult): void {
    this.evaluation.recordFinalJsonlResult(result);
  }

  recordResultPersistenceFailure(result: EvaluateResult): void {
    this.evaluation.recordResultPersistenceFailure(result);
  }

  save(): Promise<void> {
    return this.evaluation.save();
  }

  saveResult(result: EvalResult): Promise<void> {
    return result.save();
  }

  setDurationMs(durationMs: number): void {
    this.evaluation.setDurationMs(durationMs);
  }

  setVars(vars: string[]): void {
    this.evaluation.setVars(vars);
  }

  toEvaluateResult(result: EvalResult | EvaluateResult): EvaluateResult {
    return asEvaluateResult(result);
  }
}
