import fs from 'fs/promises';

import async from 'async';
import { getEnvInt } from '../envars';
import { handleConversationRelevance } from '../external/assertions/deepeval';
import { matchesConversationRelevance } from '../external/matchers/deepeval';
import logger from '../logger';
import { matchesClassification } from '../matchers/classification';
import { matchesSelectBest } from '../matchers/comparison';
import { matchesClosedQa, matchesFactuality, matchesLlmRubric } from '../matchers/llmGrading';
import { matchesModeration } from '../matchers/moderation';
import {
  matchesAnswerRelevance,
  matchesContextFaithfulness,
  matchesContextRecall,
  matchesContextRelevance,
} from '../matchers/rag';
import { matchesSimilarity } from '../matchers/similarity';
import {
  getProviderCallExecutionContext,
  getProviderCallTracingContext,
} from '../scheduler/providerCallExecutionContext';
import { generateSpanId, generateTraceparent } from '../tracing/evaluatorTracing';
import { getTraceStore } from '../tracing/store';
import {
  type ApiProvider,
  type Assertion,
  type AssertionType,
  type AtomicTestCase,
  type CallApiContextParams,
  type GradingResult,
  type TraceData,
  type VarValue,
} from '../types/index';
import invariant from '../util/invariant';
import { getNunjucksEngine } from '../util/templates';
import { sleep } from '../util/time';
import { transform } from '../util/transform';
import { loadYaml } from '../util/yamlLoad';
import { handleAgentRubric } from './agentRubric';
import { handleAnswerRelevance } from './answerRelevance';
import { AssertionsResult } from './assertionsResult';
import { handleBleuScore } from './bleu';
import { handleClassifier } from './classifier';
import {
  handleContains,
  handleContainsAll,
  handleContainsAny,
  handleIContains,
  handleIContainsAll,
  handleIContainsAny,
} from './contains';
import { handleContextFaithfulness } from './contextFaithfulness';
import { handleContextRecall } from './contextRecall';
import { handleContextRelevance } from './contextRelevance';
import { handleCost } from './cost';
import { handleEquals } from './equals';
import { handleFactuality } from './factuality';
import { handleFinishReason } from './finishReason';
import { handleIsValidFunctionCall } from './functionToolCall';
import { handleGEval } from './geval';
import { handleGleuScore } from './gleu';
import { handleGuardrails } from './guardrails';
import { handleContainsHtml, handleIsHtml } from './html';
import { handleJavascript } from './javascript';
import { handleContainsJson, handleIsJson } from './json';
import { handleLatency } from './latency';
import { handleLevenshtein } from './levenshtein';
import { handleLlmRubric } from './llmRubric';
import { handleModelGradedClosedQa } from './modelGradedClosedQa';
import { handleModeration } from './moderation';
import { handleIsValidOpenAiToolsCall } from './openai';
import { handlePerplexity, handlePerplexityScore } from './perplexity';
import { handlePiScorer } from './pi';
import { handlePython } from './python';
import { getRecordedTargetMetadata, handleRedteam } from './redteam';
import { handleIsRefusal } from './refusal';
import { handleRegex } from './regex';
import { handleRougeScore } from './rouge';
import { handleRuby } from './ruby';
import { handleSearchRubric } from './searchRubric';
import { handleSimilar } from './similar';
import { handleSkillUsed } from './skill';
import { handleContainsSql, handleIsSql } from './sql';
import { handleStartsWith } from './startsWith';
import { handleToolCallF1 } from './toolCallF1';
import { handleTraceErrorSpans } from './traceErrorSpans';
import { handleTraceSpanCount } from './traceSpanCount';
import { handleTraceSpanDuration } from './traceSpanDuration';
import {
  handleTrajectoryGoalSuccess,
  handleTrajectoryStepCount,
  handleTrajectoryToolArgsMatch,
  handleTrajectoryToolSequence,
  handleTrajectoryToolUsed,
} from './trajectory';
import {
  coerceString,
  getAssertionLeaves,
  getFinalTest,
  isExternalAssertionValue,
  isNumericFinancialAssertion,
  processFileReference,
  resolveExternalAssertionValue,
  validateNumericReferenceMode,
} from './utils';
import { handleWebhook } from './webhook';
import { handleWordCount } from './wordCount';
import { handleIsXml } from './xml';

import type {
  AssertionOrSet,
  AssertionParams,
  AssertionValueFunctionContext,
  BaseAssertionTypes,
  ProviderResponse,
  ScoringFunction,
} from '../types/index';

const DEFAULT_ASSERTIONS_MAX_CONCURRENCY = 3;
const DEFAULT_TRACE_FETCH_MAX_ATTEMPTS = 6;
const DEFAULT_TRACE_FETCH_RETRY_DELAY_MS = 250;
const DEFAULT_TRACE_FETCH_STABLE_POLLS = 2;
const MAX_TRACE_FETCH_MAX_ATTEMPTS = 30;
const MAX_TRACE_FETCH_RETRY_DELAY_MS = 5000;
const MAX_TRACE_FETCH_STABLE_POLLS = 10;

export const MODEL_GRADED_ASSERTION_TYPES = new Set<AssertionType>([
  'agent-rubric',
  'answer-relevance',
  'context-faithfulness',
  'context-recall',
  'context-relevance',
  'factuality',
  'llm-rubric',
  'model-graded-closedqa',
  'model-graded-factuality',
  'search-rubric',
  'trajectory:goal-success',
]);

const TRACE_AWARE_ASSERTION_TYPES = new Set<AssertionType>([
  'javascript',
  'python',
  'ruby',
  'trace-error-spans',
  'trace-span-count',
  'trace-span-duration',
  'trajectory:goal-success',
  'trajectory:step-count',
  'trajectory:tool-args-match',
  'trajectory:tool-sequence',
  'trajectory:tool-used',
]);

export function assertionUsesTrace(assertion: AssertionOrSet): boolean {
  if (assertion.type === 'assert-set') {
    return assertion.assert.some(assertionUsesTrace);
  }

  return TRACE_AWARE_ASSERTION_TYPES.has(getAssertionBaseType(assertion));
}

function assertionMayNeedTraceContext(assertion: AssertionOrSet): boolean {
  if (assertionUsesTrace(assertion)) {
    return true;
  }

  if (assertion.type === 'assert-set') {
    return assertion.assert.some(assertionMayNeedTraceContext);
  }

  if (assertion.type.startsWith('promptfoo:redteam:coding-agent:')) {
    return true;
  }

  return isExternalAssertionValue(assertion.value);
}

export function hasTraceAwareAssertions(assertions?: AssertionOrSet[]): boolean {
  return Boolean(assertions?.some(assertionMayNeedTraceContext));
}

export async function loadTraceData(traceId: string): Promise<TraceData | null> {
  const traceStore = getTraceStore();
  const maxAttempts = Math.min(
    MAX_TRACE_FETCH_MAX_ATTEMPTS,
    Math.max(1, getEnvInt('PROMPTFOO_TRACE_FETCH_MAX_ATTEMPTS', DEFAULT_TRACE_FETCH_MAX_ATTEMPTS)),
  );
  const retryDelayMs = Math.min(
    MAX_TRACE_FETCH_RETRY_DELAY_MS,
    Math.max(
      0,
      getEnvInt('PROMPTFOO_TRACE_FETCH_RETRY_DELAY_MS', DEFAULT_TRACE_FETCH_RETRY_DELAY_MS),
    ),
  );
  const stablePolls = Math.min(
    MAX_TRACE_FETCH_STABLE_POLLS,
    Math.max(1, getEnvInt('PROMPTFOO_TRACE_FETCH_STABLE_POLLS', DEFAULT_TRACE_FETCH_STABLE_POLLS)),
  );

  let lastSpanCount = -1;
  let stableObservations = 0;
  let latestTrace: TraceData | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    latestTrace = await traceStore.getTrace(traceId, { sanitizeAttributes: false });

    const spanCount = latestTrace?.spans?.length ?? 0;
    if (spanCount > 0) {
      stableObservations = spanCount === lastSpanCount ? stableObservations + 1 : 1;
      lastSpanCount = spanCount;

      if (stableObservations >= stablePolls || attempt === maxAttempts - 1) {
        return latestTrace;
      }
    } else {
      stableObservations = 0;
      lastSpanCount = spanCount;
    }

    if (attempt < maxAttempts - 1) {
      await sleep(retryDelayMs);
    }
  }

  return latestTrace;
}

const ASSERTION_HANDLERS: Record<
  BaseAssertionTypes,
  (params: AssertionParams) => GradingResult | Promise<GradingResult>
> = {
  'agent-rubric': handleAgentRubric,
  'answer-relevance': handleAnswerRelevance,
  bleu: handleBleuScore,
  classifier: handleClassifier,
  contains: handleContains,
  'contains-all': handleContainsAll,
  'contains-any': handleContainsAny,
  'contains-html': handleContainsHtml,
  'contains-json': handleContainsJson,
  'contains-sql': handleContainsSql,
  'contains-xml': handleIsXml,
  'context-faithfulness': handleContextFaithfulness,
  'context-recall': handleContextRecall,
  'context-relevance': handleContextRelevance,
  'conversation-relevance': handleConversationRelevance,
  cost: handleCost,
  equals: handleEquals,
  factuality: handleFactuality,
  'finish-reason': handleFinishReason,
  'g-eval': handleGEval,
  gleu: handleGleuScore,
  guardrails: handleGuardrails,
  icontains: handleIContains,
  'icontains-all': handleIContainsAll,
  'icontains-any': handleIContainsAny,
  'is-html': handleIsHtml,
  'is-json': handleIsJson,
  'is-refusal': handleIsRefusal,
  'is-sql': handleIsSql,
  'is-valid-function-call': handleIsValidFunctionCall,
  'is-valid-openai-function-call': handleIsValidFunctionCall,
  'is-valid-openai-tools-call': handleIsValidOpenAiToolsCall,
  'is-xml': handleIsXml,
  javascript: handleJavascript,
  latency: handleLatency,
  levenshtein: handleLevenshtein,
  'llm-rubric': handleLlmRubric,
  meteor: async (params: AssertionParams) => {
    try {
      const { handleMeteorAssertion } = await import('./meteor.js');
      // Await so missing-dependency rejections reach the catch below.
      return await handleMeteorAssertion(params);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('Cannot find module') ||
          error.message.includes('natural" package is required'))
      ) {
        return {
          pass: false,
          score: 0,
          reason:
            'METEOR assertion requires the natural package. Please install it using: npm install natural@^8.1.0',
          assertion: params.assertion,
        };
      }
      throw error;
    }
  },
  'model-graded-closedqa': handleModelGradedClosedQa,
  'model-graded-factuality': handleFactuality,
  moderation: handleModeration,
  perplexity: handlePerplexity,
  'perplexity-score': handlePerplexityScore,
  pi: handlePiScorer,
  python: handlePython,
  regex: handleRegex,
  ruby: handleRuby,
  'rouge-n': handleRougeScore,
  'search-rubric': handleSearchRubric,
  'skill-used': handleSkillUsed,
  similar: handleSimilar,
  'similar:cosine': handleSimilar,
  'similar:dot': handleSimilar,
  'similar:euclidean': handleSimilar,
  'starts-with': handleStartsWith,
  'tool-call-f1': handleToolCallF1,
  'trajectory:goal-success': handleTrajectoryGoalSuccess,
  'trajectory:tool-args-match': handleTrajectoryToolArgsMatch,
  'trajectory:step-count': handleTrajectoryStepCount,
  'trajectory:tool-sequence': handleTrajectoryToolSequence,
  'trajectory:tool-used': handleTrajectoryToolUsed,
  'trace-error-spans': handleTraceErrorSpans,
  'trace-span-count': handleTraceSpanCount,
  'trace-span-duration': handleTraceSpanDuration,
  webhook: handleWebhook,
  'word-count': handleWordCount,
};

const nunjucks = getNunjucksEngine();

/**
 * Renders a metric name template with test variables.
 * @param metric - The metric name, possibly containing Nunjucks template syntax
 * @param vars - The test variables to use for rendering
 * @returns The rendered metric name, or the original if rendering fails
 */
export function renderMetricName(
  metric: string | undefined,
  vars: Record<string, unknown>,
): string | undefined {
  if (!metric) {
    return metric;
  }
  try {
    const rendered = nunjucks.renderString(metric, vars);
    if (rendered === '' && metric !== '') {
      logger.debug(`Metric template "${metric}" rendered to empty string`);
    }
    return rendered;
  } catch (error) {
    logger.warn(
      `Failed to render metric template "${metric}": ${error instanceof Error ? error.message : error}`,
    );
    return metric;
  }
}

/**
 * Tests whether an assertion is inverse e.g. "not-equals" is inverse of "equals"
 * or "not-contains" is inverse of "contains".
 * @param assertion - The assertion to test
 * @returns true if the assertion is inverse, false otherwise
 */
export function isAssertionInverse(assertion: Assertion): boolean {
  return assertion.type.startsWith('not-');
}

/**
 * Returns the base type of an assertion i.e. "not-equals" returns "equals"
 * and "equals" returns "equals".
 * @param assertion - The assertion to get the base type.
 * @returns The base type of the assertion.
 */
export function getAssertionBaseType(assertion: Assertion): AssertionType {
  const inverse = isAssertionInverse(assertion);
  return inverse ? (assertion.type.slice(4) as AssertionType) : (assertion.type as AssertionType);
}

export function hasNumericFinancialAssertions(assertions: AssertionOrSet[] | undefined): boolean {
  return getAssertionLeaves(assertions).some(isNumericFinancialAssertion);
}

/** Numeric preparation reads target data separately from trusted strategy bookkeeping. */
export function getNumericPreparationMetadata(
  assertions: AssertionOrSet[] | undefined,
  test: AtomicTestCase,
  provider: ApiProvider | undefined,
  response: ProviderResponse,
): ProviderResponse['metadata'] {
  const usesNumericReference = hasNumericFinancialAssertions(assertions);
  if (!usesNumericReference && !hasNumericFinancialAssertions(test.assert)) {
    return response.metadata;
  }
  const targetMetadata = getRecordedTargetMetadata(test, provider, response);
  if (usesNumericReference || targetMetadata === response.metadata) {
    return targetMetadata;
  }
  // Sibling callbacks retain target data and executor fields, with executor values winning.
  // This view is only for assertion context; framework grading still uses the original response.
  return { ...targetMetadata, ...response.metadata };
}

/**
 * Execute a single assertion against provider output.
 *
 * This is a core API for programmatic assertion execution. Use this when:
 * - Running assertions independently outside of the main evaluate() flow
 * - Implementing custom evaluation pipelines
 * - Testing specific provider outputs
 * - Building custom grading systems
 *
 * @param params Configuration for assertion execution
 * @param params.prompt The prompt that was sent to the provider (optional, for context)
 * @param params.provider The API provider instance (optional, for context in assertions)
 * @param params.assertion The assertion to run (e.g., `{ type: 'contains', value: 'expected' }`)
 * @param params.test The test case context containing variables and configuration
 * @param params.vars Template variables from the test (overrides test.vars if provided)
 * @param params.providerResponse The provider's response to evaluate
 * @param params.latencyMs Provider response latency in milliseconds (optional)
 * @param params.traceId Distributed trace ID for debugging (optional)
 * @param params.traceData Trace spans with timing information (optional)
 *
 * @returns GradingResult with pass/fail status, score, and reason
 *
 * @example Basic usage
 * ```typescript
 * import { assertions } from 'promptfoo';
 *
 * const result = await assertions.runAssertion({
 *   assertion: { type: 'contains', value: '4' },
 *   test: { vars: { question: 'What is 2+2?' } },
 *   providerResponse: { output: 'The answer is 4' }
 * });
 *
 * console.log(`Pass: ${result.pass}, Score: ${result.score}`);
 * ```
 *
 * @see runAssertions for batch assertion execution
 * @see evaluate for full evaluation pipeline
 */
async function runAssertionInternal({
  prompt,
  provider,
  assertion,
  test,
  vars,
  latencyMs,
  providerResponse,
  outputIsText,
  traceId,
  traceData,
  claimStoredGradingUsage,
}: {
  prompt?: string;
  provider?: ApiProvider;
  assertion: Assertion;
  test: AtomicTestCase;
  vars?: Record<string, VarValue>;
  providerResponse: ProviderResponse;
  outputIsText?: boolean;
  latencyMs?: number;
  assertIndex?: number;
  traceId?: string;
  traceData?: TraceData | null;
  claimStoredGradingUsage?: () => boolean;
}): Promise<GradingResult> {
  // Use resolved vars if provided, otherwise fall back to test.vars
  const resolvedVars = vars || test.vars || {};

  const { cost, logProbs, output: originalOutput } = providerResponse;
  let output = originalOutput;
  const assertionMetadata = getNumericPreparationMetadata(
    [assertion],
    test,
    provider,
    providerResponse,
  );
  const valueProviderResponse =
    assertionMetadata === providerResponse.metadata
      ? providerResponse
      : { ...providerResponse, metadata: assertionMetadata };

  invariant(assertion.type, `Assertion must have a type: ${JSON.stringify(assertion)}`);

  validateNumericReferenceMode(assertion);
  if (assertion.transform) {
    output = await transform(assertion.transform, output, {
      vars: resolvedVars,
      prompt: { label: prompt },
      ...(assertionMetadata && { metadata: assertionMetadata }),
    });
  }

  const context: AssertionValueFunctionContext = {
    prompt,
    vars: resolvedVars,
    test,
    logProbs,
    provider,
    providerResponse: valueProviderResponse,
    ...(assertion.config ? { config: structuredClone(assertion.config) } : {}),
    ...(assertionMetadata && { metadata: assertionMetadata }),
  };

  // Add trace data if traceId is available
  if (traceId && assertionMayNeedTraceContext(assertion)) {
    try {
      const resolvedTraceData = traceData === undefined ? await loadTraceData(traceId) : traceData;
      if (resolvedTraceData) {
        context.trace = {
          traceId: resolvedTraceData.traceId,
          evaluationId: resolvedTraceData.evaluationId,
          testCaseId: resolvedTraceData.testCaseId,
          metadata: resolvedTraceData.metadata,
          spans: resolvedTraceData.spans || [],
        };
      }
    } catch (error) {
      logger.debug(`Failed to fetch trace data for assertion: ${error}`);
    }
  }

  // Render assertion values after transforms and trace context are available.
  let renderedValue = assertion.value;
  let valueFromScript: AssertionParams['valueFromScript'];
  if (isExternalAssertionValue(renderedValue)) {
    const resolved = await resolveExternalAssertionValue(
      assertion,
      output,
      context,
      getAssertionBaseType(assertion),
    );
    if (resolved.errorResult) {
      if (isNumericFinancialAssertion(assertion)) {
        throw new Error(resolved.errorResult.reason);
      }
      return resolved.errorResult;
    }
    ({ renderedValue, valueFromScript } = resolved);
  } else if (typeof renderedValue === 'string') {
    renderedValue = nunjucks.renderString(renderedValue, resolvedVars);
  } else if (renderedValue && Array.isArray(renderedValue)) {
    renderedValue = renderedValue.map((value) => {
      if (typeof value === 'string') {
        return value.startsWith('file://')
          ? processFileReference(value)
          : nunjucks.renderString(value, resolvedVars);
      }
      return value;
    });
  }

  // Construct CallApiContextParams for model-graded assertions that need originalProvider
  // Generate traceparent for grader calls to link them to the main trace
  const activeTraceparent = getProviderCallTracingContext()?.getActiveTraceparent();
  const graderTraceparent = traceId
    ? activeTraceparent?.split('-')[1] === traceId
      ? activeTraceparent
      : generateTraceparent(traceId, generateSpanId())
    : undefined;
  const providerCallContext: CallApiContextParams | undefined = provider
    ? {
        originalProvider: provider,
        prompt: { raw: prompt || '', label: '' },
        vars: resolvedVars,
        ...(graderTraceparent && { traceparent: graderTraceparent }),
      }
    : undefined;

  const finalTest = getFinalTest(
    vars === undefined ? test : { ...test, vars: resolvedVars },
    assertion,
  );

  const assertionParams: AssertionParams = {
    assertion,
    baseType: getAssertionBaseType(assertion),
    providerCallContext,
    assertionValueContext: context,
    cost,
    inverse: isAssertionInverse(assertion),
    latencyMs,
    logProbs,
    output,
    outputIsText,
    outputString: coerceString(output),
    prompt,
    provider,
    providerResponse,
    renderedValue,
    test: finalTest,
    valueFromScript,
  };

  // Check for redteam assertions first
  if (assertionParams.baseType.startsWith('promptfoo:redteam:')) {
    return handleRedteam(assertionParams, claimStoredGradingUsage);
  }

  const handler = ASSERTION_HANDLERS[assertionParams.baseType as keyof typeof ASSERTION_HANDLERS];
  if (handler) {
    const result = await handler(assertionParams);

    // Store rendered assertion value in metadata if it differs from the original template
    // This allows the UI to display substituted variable values instead of raw templates
    if (
      renderedValue !== undefined &&
      renderedValue !== assertion.value &&
      typeof renderedValue === 'string'
    ) {
      result.metadata = result.metadata || {};
      result.metadata.renderedAssertionValue = renderedValue;
    }

    // If weight is 0, treat this as a metric-only assertion that can't fail
    if (assertion.weight === 0) {
      return {
        ...result,
        pass: true, // Force pass for weight=0 assertions
      };
    }

    return result;
  }

  throw new Error(`Unknown assertion type: ${assertion.type}`);
}

export async function runAssertion(
  options: Parameters<typeof runAssertionInternal>[0],
): Promise<GradingResult> {
  if (!options.traceId) {
    return runAssertionInternal(options);
  }

  const tracingContext = getProviderCallTracingContext();
  if (!tracingContext) {
    return runAssertionInternal(options);
  }

  return tracingContext.withGraderSpan(
    {
      graderId: options.assertion.type,
      evalId: options.test.metadata?.evaluationId as string | undefined,
      testIndex: tracingContext.testIndex,
    },
    () => runAssertionInternal(options),
  );
}

/**
 * Execute multiple assertions in batch against provider output.
 *
 * This function runs all assertions defined in a test case and returns aggregated results.
 * It handles:
 * - Multiple assertion types (contains, regex, LLM-graded, etc.)
 * - Nested assertion-sets with logical operators
 * - Custom scoring functions
 * - Combined pass/fail and scoring logic
 *
 * @param params Configuration for batch assertion execution
 * @param params.assertScoringFunction Custom scoring function (optional)
 * @param params.latencyMs Provider response latency in milliseconds
 * @param params.prompt The prompt that was sent to the provider (optional)
 * @param params.provider The API provider instance (optional)
 * @param params.providerResponse The provider's response to evaluate
 * @param params.test The test case with assertions to run
 * @param params.vars Template variables (overrides test.vars if provided)
 * @param params.traceId Distributed trace ID (optional)
 *
 * @returns GradingResult aggregating all assertion results. The returned result
 *          includes `componentResults` and `namedScores` rather than a nested
 *          `results` array.
 *
 * @example Basic usage
 * ```typescript
 * import { assertions } from 'promptfoo';
 *
 * const result = await assertions.runAssertions({
 *   assertions: [
 *     { type: 'contains', value: '4' },
 *     { type: 'regex', value: '^The answer is' }
 *   ],
 *   test: { vars: { question: 'What is 2+2?' } },
 *   providerResponse: { output: 'The answer is 4' }
 * });
 *
 * console.log(`All passed: ${result.pass}`);
 * console.log(`Average score: ${result.score}`);
 * result.componentResults.forEach((r) => {
 *   console.log(`  ${r.assertion?.type}: ${r.pass ? '✓' : '✗'} (${r.score})`);
 * });
 * ```
 *
 * @see runAssertion for single assertion execution
 * @see evaluate for full evaluation pipeline
 */
export async function runAssertions({
  assertScoringFunction,
  latencyMs,
  prompt,
  provider,
  providerResponse,
  numericGradingInput,
  outputIsText,
  test,
  vars,
  traceId,
}: {
  assertScoringFunction?: ScoringFunction;
  latencyMs?: number;
  prompt?: string;
  provider?: ApiProvider;
  providerResponse: ProviderResponse;
  /** Evaluator-owned pre-media view for numeric leaves only; never persisted. */
  numericGradingInput?: { providerResponse: ProviderResponse; outputIsText: boolean };
  outputIsText?: boolean;
  test: AtomicTestCase;
  vars?: Record<string, VarValue>;
  traceId?: string;
}): Promise<GradingResult> {
  if (!test.assert || test.assert.length < 1) {
    return AssertionsResult.noAssertsResult();
  }

  const mainAssertResult = new AssertionsResult({
    threshold: test.threshold,
  });
  const subAssertResults: AssertionsResult[] = [];
  const asserts: {
    assertion: Assertion;
    assertResult: AssertionsResult;
    index: number;
  }[] = test.assert
    .map((assertion, i) => {
      if (assertion.type === 'assert-set') {
        const subAssertResult = new AssertionsResult({
          threshold: assertion.threshold,
          parentAssertionSet: {
            assertionSet: assertion,
            index: i,
          },
        });

        subAssertResults.push(subAssertResult);

        return assertion.assert.map((subAssert, j) => {
          return {
            assertion: subAssert,
            assertResult: subAssertResult,
            index: j,
          };
        });
      }

      return { assertion, assertResult: mainAssertResult, index: i };
    })
    .flat();

  const shouldPreloadTrace =
    !!traceId && hasTraceAwareAssertions(asserts.map(({ assertion }) => assertion));
  let preloadedTraceData: TraceData | null | undefined;
  if (shouldPreloadTrace && traceId) {
    try {
      preloadedTraceData = await loadTraceData(traceId);
    } catch (error) {
      logger.debug(`Failed to preload trace data for assertions: ${error}`);
      preloadedTraceData = null;
    }
  }

  // Serialize when the grouping queue is active: concurrent dispatch can
  // reorder provider enqueues and split same-judge groups.
  // Read at call time: --env-file and the config's `env:` block are applied after this module is imported.
  // async rejects a limit below 1, which would fail every assertion.
  const concurrency = getProviderCallExecutionContext()?.providerCallQueue
    ? 1
    : Math.max(
        1,
        getEnvInt('PROMPTFOO_ASSERTIONS_MAX_CONCURRENCY', DEFAULT_ASSERTIONS_MAX_CONCURRENCY),
      );

  // All assertions (including assertion sets) share one historical strategy cost.
  // Keep ownership local to this run so replaying a saved response starts fresh.
  let storedGradingUsageClaimed = false;
  const claimStoredGradingUsage = () => {
    if (storedGradingUsageClaimed) {
      return false;
    }
    storedGradingUsageClaimed = true;
    return true;
  };

  const runAndRecordAssertion = async ({
    assertion,
    assertResult,
    index,
  }: (typeof asserts)[number]) => {
    if (assertion.type.startsWith('select-') || assertion.type === 'max-score') {
      // Select-type and max-score assertions are handled separately because they depend on multiple outputs.
      return;
    }

    const numericInput = isNumericFinancialAssertion(assertion) ? numericGradingInput : undefined;
    const result = await runAssertion({
      prompt,
      provider,
      providerResponse: numericInput?.providerResponse ?? providerResponse,
      outputIsText: numericInput?.outputIsText ?? outputIsText,
      assertion,
      test,
      vars,
      latencyMs,
      assertIndex: index,
      traceId,
      traceData: preloadedTraceData,
      claimStoredGradingUsage,
    });

    assertResult.addResult({
      index,
      result,
      metric: renderMetricName(assertion.metric, vars || test.vars || {}),
      weight: assertion.weight,
    });
  };

  const activeAssertions = new Set<Promise<void>>();
  try {
    await async.forEachOfLimit(asserts, concurrency, async (entry) => {
      const pending = runAndRecordAssertion(entry);
      activeAssertions.add(pending);
      try {
        await pending;
      } finally {
        activeAssertions.delete(pending);
      }
    });
  } finally {
    // async stops scheduling on the first error, but active graders still need their workspace.
    await Promise.allSettled(activeAssertions);
  }

  await async.forEach(subAssertResults, async (subAssertResult) => {
    const result = await subAssertResult.testResult();
    const {
      index,
      assertionSet: { metric, weight },
    } = subAssertResult.parentAssertionSet!;

    mainAssertResult.addResult({
      index,
      result,
      metric: renderMetricName(metric, vars || test.vars || {}),
      weight,
    });
  });

  return mainAssertResult.testResult(assertScoringFunction);
}

export async function runCompareAssertion(
  test: AtomicTestCase,
  assertion: Assertion,
  outputs: string[],
  context?: CallApiContextParams,
): Promise<GradingResult[]> {
  invariant(typeof assertion.value === 'string', 'select-best must have a string value');
  // The matcher needs options and vars, not the assertion list. A runtime assertion can
  // contain a provider with a circular SDK client, which getFinalTest cannot deep-clone.
  test = getFinalTest({ ...test, assert: undefined }, assertion);
  const comparisonResults = await matchesSelectBest(
    assertion.value,
    outputs,
    test.options,
    test.vars,
    context,
  );
  // The runtime assertion may contain a live grader and secrets. Results only need
  // the comparison criteria and scoring labels, so keep provider config out of memory.
  const safeAssertion: Assertion = {
    type: assertion.type,
    value: assertion.value,
    metric: assertion.metric,
    weight: assertion.weight,
  };
  return comparisonResults.map((result) => ({
    ...result,
    assertion: safeAssertion,
  }));
}

export async function readAssertions(filePath: string): Promise<Assertion[]> {
  try {
    const assertions = loadYaml(await fs.readFile(filePath, 'utf-8')) as Assertion[];
    if (!Array.isArray(assertions) || assertions[0]?.type === undefined) {
      throw new Error('Assertions file must be an array of assertion objects');
    }
    return assertions;
  } catch (err) {
    throw new Error(`Failed to read assertions from ${filePath}:\n${err}`);
  }
}

// These exports are used by the node.js package (index.ts)
export default {
  runAssertion,
  runAssertions,
  matchesSimilarity,
  matchesClassification,
  matchesLlmRubric,
  matchesFactuality,
  matchesClosedQa,
  matchesAnswerRelevance,
  matchesContextRecall,
  matchesContextRelevance,
  matchesContextFaithfulness,
  matchesComparisonBoolean: matchesSelectBest,
  matchesModeration,
  matchesConversationRelevance,
};
