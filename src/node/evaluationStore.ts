import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import { getShareAuthorizedBlob } from '../blobs/index';
import { toSerializableProviderRef } from '../evaluator/resultProcessing';
import EvalResult, { asEvaluateResult, PROMPTFOO_METADATA_KEY } from '../models/evalResult';
import { isApiProvider } from '../types/providers';
import { GRADING_PROVIDER_TYPE_KEYS, isProviderTypeMap } from '../util/gradingProvider';
import { REDACTED, sanitizeObject } from '../util/sanitizer';

import type { EvaluationStore, GradingProviderResolver } from '../evaluator/runtime';
import type Eval from '../models/eval';
import type {
  Assertion,
  AssertionSet,
  AtomicTestCase,
  CompletedPrompt,
  EvaluateResult,
  ProviderResponse,
} from '../types/index';

// A function name or source text cannot identify a closure. Only the same live
// function may be reused. Across processes, require a declarative/file assertion.
const callbacks = new WeakMap<object, string>();

function callbackRef(callback: object): string {
  let id = callbacks.get(callback);
  if (!id) {
    id = `[Function] ${randomUUID()}`;
    callbacks.set(callback, id);
  }
  return id;
}

function project(value: unknown): unknown {
  return value == null
    ? value
    : JSON.parse(
        JSON.stringify(
          sanitizeObject(toSerializableProviderRef(value), {
            sanitizeUrls: true,
            maxDepth: Number.POSITIVE_INFINITY,
            throwOnError: true,
          }),
        ),
      );
}

function matchesStoredProvider(saved: unknown, current: unknown): boolean {
  return isApiProvider(current) && isDeepStrictEqual(saved, project(current));
}

function requireRuntimeGradingFunction(saved: unknown, current: unknown, field: string): void {
  if (
    typeof saved === 'string' &&
    saved.startsWith('[Function] ') &&
    saved !== current &&
    (typeof current !== 'function' || callbacks.get(current) !== saved)
  ) {
    throw new Error(
      `Cannot resume assertion grading: runtime function '${field}' is unavailable. ` +
        'Rerun the test to recreate the original callback.',
    );
  }
}

// A secret from today's config must never be replayed against a saved recipient
// or destination that has changed. A numeric sampling temperature does not route requests.
function checkSecretRecipient(saved: unknown, current: unknown) {
  if (!JSON.stringify(saved)?.includes(REDACTED)) {
    return;
  }
  const comparable = (value: unknown) => {
    const descriptor = project(value) as { config?: { temperature?: number } } | undefined;
    if (typeof descriptor?.config?.temperature === 'number') {
      delete descriptor.config.temperature;
    }
    return descriptor;
  };
  if (!isDeepStrictEqual(comparable(saved), comparable(current))) {
    throw new Error(
      'Cannot resume assertion grading: a redacted input is missing or its recipient changed. Rerun the test.',
    );
  }
}

// The public API resolves graders eagerly, while CLI resume leaves declarations
// lazy. Load only a candidate for a saved instance, then require an exact match.
async function resolveStoredGradingProvider(
  saved: unknown,
  current: unknown,
  resolveGradingProvider: GradingProviderResolver,
): Promise<unknown> {
  if (
    !saved ||
    typeof saved !== 'object' ||
    Array.isArray(saved) ||
    isApiProvider(current) ||
    current == null
  ) {
    return current;
  }
  if (isProviderTypeMap(current)) {
    const resolved: Record<string, unknown> = { ...current };
    for (const type of GRADING_PROVIDER_TYPE_KEYS) {
      if (current[type] !== undefined) {
        resolved[type] = await resolveStoredGradingProvider(
          (saved as Record<string, unknown>)[type],
          current[type],
          resolveGradingProvider,
        );
      }
    }
    return resolved;
  }
  // A loaded file grader may expose an ID different from its import path.
  // Re-load only a currently configured path, never one supplied by a saved row.
  const currentId = typeof current === 'string' ? current : (current as { id?: string }).id;
  if (
    !('id' in saved) ||
    typeof saved.id !== 'string' ||
    saved.id.startsWith('file://') ||
    !currentId?.startsWith('file://')
  ) {
    return current;
  }
  const resolved = await resolveGradingProvider(current);
  if (!matchesStoredProvider(saved, resolved)) {
    throw new Error(
      'Cannot resume assertion grading: the configured provider changed. Rerun the test.',
    );
  }
  return resolved;
}

async function restoreGradingAssertion(
  saved: Assertion,
  current: Assertion | undefined,
  resolveGradingProvider: GradingProviderResolver,
): Promise<Assertion> {
  for (const field of ['value', 'transform', 'contextTransform'] as const) {
    requireRuntimeGradingFunction(saved[field], current?.[field], field);
  }
  return restoreRuntimeGradingValues(saved, {
    ...current,
    provider: await resolveStoredGradingProvider(
      saved.provider,
      current?.provider,
      resolveGradingProvider,
    ),
  }) as Assertion;
}

function preserveAssertionFunctions(assertion: Assertion): Assertion {
  return {
    ...assertion,
    ...(typeof assertion.value === 'function' && {
      value: callbackRef(assertion.value),
    }),
    ...(typeof assertion.transform === 'function' && {
      transform: callbackRef(assertion.transform),
    }),
    ...(typeof assertion.contextTransform === 'function' && {
      contextTransform: callbackRef(assertion.contextTransform),
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
  if (
    typeof current === 'function' &&
    typeof saved === 'string' &&
    callbacks.get(current) === saved
  ) {
    return current;
  }
  if (isApiProvider(current) && typeof saved === 'string' && saved.endsWith(' Instance]')) {
    throw new Error('Cannot resume assertion grading: the saved provider identity is unavailable.');
  }
  if (matchesStoredProvider(saved, current)) {
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
    // Validate the whole credential-bearing provider before recursing into keys.
    if ('id' in saved || ('config' in saved && !('type' in saved))) {
      checkSecretRecipient(saved, current);
    }
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
            assertScoringFunction: callbackRef(test.assertScoringFunction),
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
    resolveGradingProvider: GradingProviderResolver,
    result?: Pick<EvaluateResult, 'testIdx' | 'promptIdx'>,
  ): Promise<{ providerResponse: ProviderResponse; test: AtomicTestCase }> {
    requireRuntimeGradingFunction(
      savedTest.assertScoringFunction,
      currentTest.assertScoringFunction,
      'assertScoringFunction',
    );
    const { assert, options, ...savedValues } = savedTest;
    const test = restoreRuntimeGradingValues(savedValues, currentTest) as AtomicTestCase;
    if (options) {
      test.options = restoreRuntimeGradingValues(options, {
        ...currentTest.options,
        provider: await resolveStoredGradingProvider(
          options.provider,
          currentTest.options?.provider,
          resolveGradingProvider,
        ),
      }) as AtomicTestCase['options'];
    }
    if (assert) {
      test.assert = await Promise.all(
        assert.map(async (assertion, index) => {
          const current = currentTest.assert?.[index];
          if (assertion.type === 'assert-set') {
            const { assert: children, ...values } = assertion;
            return {
              ...(restoreRuntimeGradingValues(values, current) as Omit<AssertionSet, 'assert'>),
              assert: await Promise.all(
                children.map((child, childIndex) =>
                  restoreGradingAssertion(
                    child,
                    current?.type === 'assert-set' ? current.assert[childIndex] : undefined,
                    resolveGradingProvider,
                  ),
                ),
              ),
            };
          }
          return restoreGradingAssertion(
            assertion,
            current?.type === 'assert-set' ? undefined : current,
            resolveGradingProvider,
          );
        }),
      );
    }
    if (!response.audio?.blobRef) {
      return { providerResponse: response, test };
    }
    if (
      !result ||
      !Number.isSafeInteger(result.testIdx) ||
      !Number.isSafeInteger(result.promptIdx)
    ) {
      throw new Error('Cannot grade stored audio without a test and prompt index.');
    }
    const { hash } = response.audio.blobRef;
    const blob = await getShareAuthorizedBlob(hash, this.id, result);
    if (
      !blob ||
      !blob.metadata.mimeType?.startsWith('audio/') ||
      createHash('sha256').update(blob.data).digest('hex') !== hash
    ) {
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

  toEvaluateResult(result: EvalResult | EvaluateResult, forGrading = false): EvaluateResult {
    return asEvaluateResult(
      result,
      forGrading
        ? {
            shouldStripGradingResult: false,
            shouldStripMetadata: false,
            shouldStripPromptText: false,
            shouldStripResponseOutput: false,
            shouldStripTestVars: false,
          }
        : undefined,
    );
  }
}
