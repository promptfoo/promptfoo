import { isDeepStrictEqual } from 'util';

import async from 'async';
import chalk from 'chalk';
import { globSync } from 'glob';
import Clone from 'rfdc';
import {
  getAssertionBaseType,
  MODEL_GRADED_ASSERTION_TYPES,
  runCompareAssertion,
} from '../assertions/index';
import { getCache, isCacheEnabled, withCacheEnabled, withCacheNamespace } from '../cache';
import cliState from '../cliState';
import { DEFAULT_MAX_CONCURRENCY } from '../constants';
import { getEnvBool, getEvalTimeoutMs, getMaxEvalTimeMs, isCI } from '../envars';
import { runExtensionHook } from '../evaluatorHelpers';
import logger, { isDebugEnabled } from '../logger';
import { selectMaxScore } from '../matchers/comparison';
import { CIProgressReporter } from '../progress/ciProgressReporter';
import {
  cleanupProgressAfterError,
  cleanupProgressReporters,
  formatVarsForDisplay,
  logWebUiEvalStepStart,
  ProgressBarManager,
  updateComparisonReporterProgress,
  updateComparisonReporterTotals,
} from '../progress/evaluationProgress';
import { generateIdFromPrompt } from '../prompts/id';
import { maybeEmitAzureOpenAiWarning } from '../providers/azure/warnings';
import { providerRegistry } from '../providers/providerRegistry';
import { isPromptfooSampleTarget } from '../providers/shared';
import { redteamProviderManager } from '../redteam/providers/shared';
import { RateLimitRegistry } from '../scheduler';
import { withProviderCallExecutionContext } from '../scheduler/providerCallExecutionContext';
import { type ProviderCallQueue, ProviderGroupedCallQueue } from '../scheduler/providerCallQueue';
import { generatePrompts } from '../suggestions';
import telemetry from '../telemetry';
import {
  isOtlpReceiverStarted,
  startOtlpReceiverIfNeeded,
  stopOtlpReceiverIfNeeded,
} from '../tracing/evaluatorTracing';
import { getDefaultOtelConfig } from '../tracing/otelConfig';
import { flushOtel, initializeOtel, shutdownOtel } from '../tracing/otelSdk';
import { isCliEventSource } from '../types/eventSource';
import {
  type Assertion,
  type AssertionOrSet,
  type AssertionType,
  type AtomicTestCase,
  type CompletedPrompt,
  type EnvOverrides,
  type EvaluateResult,
  type EvaluateStats,
  type GradingConfig,
  type GradingResult,
  MAX_SUGGESTIONS_COUNT,
  type Prompt,
  ResultFailureReason,
  type RunEvalOptions,
  type TestSuite,
  TestSuiteConfigSchema,
} from '../types/index';
import { type ApiProvider, isApiProvider } from '../types/providers';
import { createDefaultPromptMetrics, updatePromptResultCounts } from '../util/eval/promptMetrics';
import { isNonTransientHttpStatus } from '../util/fetch/errors';
import { filterByRange } from '../util/filterRange';
import { warnEmptyFilterRange } from '../util/filterRangeWarn';
import { loadFunction, parseFileUrl } from '../util/functions/loadFunction';
import {
  buildConfiguredProviderMap,
  isProviderTypeMap,
  normalizeGraderProvider,
  resolveConfiguredProviderReference,
} from '../util/gradingProvider';
import invariant from '../util/invariant';
import { safeJsonStringify, summarizeEvaluateResultForLogging } from '../util/json';
import { accumulateNamedMetric, backfillNamedScoreWeights } from '../util/namedMetrics';
import { filterFiniteScores } from '../util/numeric';
import { getProviderPromptOverride, isPromptAllowed } from '../util/promptMatching';
import {
  getProviderIdentifier,
  isAnthropicProvider,
  isGoogleProvider,
  isOpenAiProvider,
  isProviderAllowed,
  providerToIdentifier,
  sanitizeProviderIdForLog,
} from '../util/provider';
import { promptYesNo } from '../util/readline';
import {
  isNonCredentialHeader,
  isSecretEnvVarName,
  isSecretField,
  REDACTED,
  sanitizeObject,
  sanitizeUrl,
} from '../util/sanitizer';
import { sleep } from '../util/time';
import {
  accumulateAssertionTokenUsage,
  accumulateGradingRequest,
  accumulateGradingTokenUsage,
  accumulateResponseTokenUsage,
  cloneTokenUsageBreakdown,
  createEmptyAssertions,
  createEmptyTokenUsage,
} from '../util/tokenUsageUtils';
import { TransformInputType, transform } from '../util/transform';
import { compileDerivedMetricFormula } from './derivedMetricFormula';
import { PromptSuggestionsRejectedError } from './errors';
import { getResultIndexKey } from './resultIndex';
import { PROMPTFOO_METADATA_KEY, sanitizeResultForJsonlArtifact } from './resultProcessing';
import {
  ABORTED_GRADING_PREFIX,
  applyGradingError,
  CONVERSATION_VAR_NAME,
  deferredGradingPromises,
  getRepeatCacheNamespace,
  isGradingAbort,
  promptUsesConversationVariable,
  runEvalInternal,
} from './runEval';

import type {
  EvalConversations,
  EvalRegisters,
  PromptMetrics,
  ProviderOptions,
  RateLimitRegistryRef,
  ScoringFunction,
  TokenUsage,
  Vars,
  VarValue,
} from '../types/index';
import type { InternalEvaluateOptions } from '../types/internal';
import type { CallApiContextParams } from '../types/providers';
import type {
  EvaluationRecord,
  EvaluationStore,
  EvaluationStoreResult,
  EvaluatorResultWriter,
  EvaluatorRuntime,
} from './runtime';

export {
  __resetPromptConversationCacheForTests,
  getTraceId,
  getTraceLinkage,
  runEval,
} from './runEval';

const PROMPTS_FLUSH_INTERVAL_MS = 1000;

/**
 * Update token usage metrics with assertion token usage
 */
function updateAssertionMetrics(
  metrics: { tokenUsage: Partial<TokenUsage> },
  assertionTokens: Partial<TokenUsage>,
  options?: { cached?: boolean },
): void {
  if (metrics.tokenUsage && assertionTokens) {
    const reportedTotal =
      assertionTokens.total ?? (assertionTokens.prompt ?? 0) + (assertionTokens.completion ?? 0);
    const cachedTokens = assertionTokens.cached ?? 0;
    const cachedResponse =
      options?.cached === true ||
      (options?.cached === undefined &&
        assertionTokens.numRequests === 0 &&
        cachedTokens > 0 &&
        reportedTotal <= cachedTokens);

    if (cachedResponse && !metrics.tokenUsage.incurredTokenUsage) {
      metrics.tokenUsage.incurredTokenUsage = cloneTokenUsageBreakdown(metrics.tokenUsage);
    }

    if (!metrics.tokenUsage.assertions) {
      metrics.tokenUsage.assertions = createEmptyAssertions();
    }

    // Accumulate assertion tokens using the specialized assertion function
    accumulateAssertionTokenUsage(metrics.tokenUsage.assertions, assertionTokens);

    if (metrics.tokenUsage.incurredTokenUsage && !cachedResponse) {
      metrics.tokenUsage.incurredTokenUsage.assertions ??= createEmptyAssertions();
      accumulateAssertionTokenUsage(
        metrics.tokenUsage.incurredTokenUsage.assertions,
        assertionTokens.incurredTokenUsage ?? assertionTokens,
      );
    }
  }
}

/**
 * Validates if a given prompt is allowed based on the provided list of allowed
 * prompt references. Providers and tests can be configured with a `prompts` attribute,
 * which corresponds to an array of prompt labels or IDs. References can either match
 * exactly or use wildcard patterns. Examples:
 *
 * - `prompts: ['examplePrompt']` matches prompt with label OR id 'examplePrompt'
 * - `prompts: ['exampleGroup:*']` matches any prompt with label/id starting with 'exampleGroup:'
 * - `prompts: ['exampleGroup']` matches 'exampleGroup' exactly OR any label/id starting with 'exampleGroup:'
 *
 * If no `prompts` attribute is present, all prompts are allowed by default.
 *
 * @param prompt - The prompt object to check.
 * @param allowedPrompts - The list of allowed prompt labels or IDs.
 * @returns Returns true if the prompt is allowed, false otherwise.
 */
export function isAllowedPrompt(prompt: Prompt, allowedPrompts: string[] | undefined): boolean {
  return isPromptAllowed(prompt, allowedPrompts);
}

function normalizeRepeatCount(repeat: number | undefined, fallback = 1): number {
  return typeof repeat === 'number' && Number.isSafeInteger(repeat) && repeat > 0
    ? repeat
    : fallback;
}

const PROVIDER_GROUPED_ASSERTION_TYPES = new Set<AssertionType>([
  ...MODEL_GRADED_ASSERTION_TYPES,
  'conversation-relevance',
  'g-eval',
]);

function hasProviderGroupedAssertion(assertion: AssertionOrSet): boolean {
  if (assertion.type === 'assert-set') {
    return assertion.assert.some(hasProviderGroupedAssertion);
  }

  return PROVIDER_GROUPED_ASSERTION_TYPES.has(getAssertionBaseType(assertion));
}

function shouldDeferGradingForTest(test: AtomicTestCase): boolean {
  return Boolean(test.assert?.some(hasProviderGroupedAssertion));
}

function logGroupedGradingStatus({
  concurrency,
  hasEvalStepTimeout,
  runEvalOptions,
  shouldGroupGradingByProvider,
  usesConversationVar,
}: {
  concurrency: number;
  hasEvalStepTimeout: boolean;
  runEvalOptions: RunEvalOptions[];
  shouldGroupGradingByProvider: boolean;
  usesConversationVar: boolean;
}) {
  const hasModelGradedAssertion = runEvalOptions.some(({ test }) =>
    shouldDeferGradingForTest(test),
  );
  if (!hasModelGradedAssertion) {
    return;
  }
  if (shouldGroupGradingByProvider) {
    logger.info(
      'Grouping model-graded assertions by provider to minimize local-model reload overhead.',
    );
    return;
  }
  if (concurrency !== 1) {
    return;
  }
  const reasons: string[] = [];
  if (hasEvalStepTimeout) {
    reasons.push('per-eval-step timeout is configured');
  }
  if (usesConversationVar) {
    reasons.push('conversation variables require per-row ordering');
  }
  if (reasons.length > 0) {
    logger.info(
      `Serial grading grouping disabled because ${reasons.join(' and ')}; model-graded judges may reload between rows.`,
    );
  }
}

// When an afterEach hook replaces response.metadata, a legacy top-level metadata.headers that
// was copied from the OLD transport headers becomes stale — and would persist as stale (and
// possibly sensitive) headers. Only re-sync when the original top-level headers provably came
// from the original transport (deep-equal) and the hook left that top-level copy unchanged;
// otherwise the hook owns metadata.headers and we leave it alone.
function synchronizeLegacyTransportHeaders(
  originalMetadata: Record<string, unknown> | undefined,
  originalResponseMetadata: Record<string, unknown> | undefined,
  hookMetadata: Record<string, unknown> | undefined,
  hookResponseMetadata: Record<string, unknown> | undefined,
) {
  const originalHeaders = originalMetadata?.headers;
  if (
    originalHeaders === undefined ||
    !isDeepStrictEqual(originalHeaders, originalResponseMetadata?.headers) ||
    !isDeepStrictEqual(hookMetadata?.headers, originalHeaders)
  ) {
    return hookMetadata;
  }

  const { headers: _staleHeaders, ...metadataWithoutHeaders } = hookMetadata ?? {};
  if (hookResponseMetadata?.headers === undefined) {
    return metadataWithoutHeaders;
  }
  return { ...metadataWithoutHeaders, headers: hookResponseMetadata.headers };
}

function getNonTransientTargetStatus(row: EvaluateResult): number | undefined {
  const httpStatus = row.response?.metadata?.http?.status;
  return typeof httpStatus === 'number' && isNonTransientHttpStatus(httpStatus)
    ? httpStatus
    : undefined;
}

export function generateVarCombinations(
  vars: Record<string, string | string[] | unknown>,
): Record<string, VarValue>[] {
  const keys = Object.keys(vars);
  const combinations: Record<string, VarValue>[] = [{}];

  for (const key of keys) {
    let values: Array<string | object> = [];

    if (typeof vars[key] === 'string' && vars[key].startsWith('file://')) {
      const filePath = vars[key].slice('file://'.length);

      // For glob patterns, we need to resolve the base directory and use relative patterns
      const basePath = cliState.basePath || '';
      const filePaths =
        globSync(filePath, {
          cwd: basePath || process.cwd(),
          windowsPathsNoEscape: true,
        }) || [];

      values = filePaths.map((path: string) => `file://${path}`);
      if (values.length === 0) {
        throw new Error(
          `No files found for variable ${key} at path ${filePath} in directory ${basePath || process.cwd()}`,
        );
      }
    } else {
      values = Array.isArray(vars[key]) ? vars[key] : [vars[key]];
    }

    // Check if it's an array but not a string array
    if (Array.isArray(vars[key]) && typeof vars[key][0] !== 'string') {
      values = [vars[key]];
    }

    const newCombinations: Record<string, VarValue>[] = [];

    for (const combination of combinations) {
      for (const value of values) {
        newCombinations.push({ ...combination, [key]: value });
      }
    }

    combinations.length = 0;
    combinations.push(...newCombinations);
  }

  return combinations;
}

function prepareDerivedMetrics(metrics: TestSuite['derivedMetrics']) {
  return metrics?.map(({ name, value }) => ({
    name,
    value: typeof value === 'function' ? value : compileDerivedMetricFormula(name, value),
  }));
}

type PreparedDerivedMetrics = ReturnType<typeof prepareDerivedMetrics>;

function updateDerivedMetrics(
  metrics: PromptMetrics,
  derivedMetrics: NonNullable<PreparedDerivedMetrics>,
  evalStep: RunEvalOptions,
  promptEvalCount: number,
) {
  if (Object.prototype.hasOwnProperty.call(metrics.namedScores, '__count')) {
    logger.warn("Metric name '__count' is reserved for derived metrics and will be overridden.");
  }

  const evalContext: Record<string, number> = {
    ...metrics.namedScores,
    __count: promptEvalCount,
  };
  for (const metric of derivedMetrics) {
    metrics.namedScores[metric.name] ??= 0;
    try {
      metrics.namedScores[metric.name] = metric.value(evalContext, evalStep);
      evalContext[metric.name] = metrics.namedScores[metric.name];
    } catch (error) {
      logger.debug(
        `Could not evaluate derived metric '${metric.name}': ${(error as Error).message}`,
      );
    }
  }
}

function resultHasModelGradedAssertion(result: EvaluationStoreResult) {
  return result.testCase?.assert?.some((assertion) =>
    MODEL_GRADED_ASSERTION_TYPES.has(assertion.type as AssertionType),
  );
}

function mergeComparisonTokenUsage(
  result: EvaluationStoreResult,
  gradingResult: GradingResult,
  evalTokenUsage: TokenUsage,
) {
  if (!result.gradingResult || !gradingResult.tokensUsed) {
    return;
  }

  result.gradingResult.tokensUsed ||= {
    total: 0,
    prompt: 0,
    completion: 0,
  };
  const rowTokensUsed = result.gradingResult.tokensUsed;
  const rowMetrics = {
    tokenUsage: {
      assertions: rowTokensUsed,
      ...(rowTokensUsed.incurredTokenUsage && {
        incurredTokenUsage: { assertions: rowTokensUsed.incurredTokenUsage },
      }),
    },
  };
  updateAssertionMetrics(rowMetrics, gradingResult.tokensUsed, {
    cached: gradingResult.metadata?.cachedResponse,
  });
  if (rowMetrics.tokenUsage.incurredTokenUsage?.assertions) {
    rowTokensUsed.incurredTokenUsage = rowMetrics.tokenUsage.incurredTokenUsage.assertions;
  }

  if (resultHasModelGradedAssertion(result)) {
    updateAssertionMetrics({ tokenUsage: evalTokenUsage }, gradingResult.tokensUsed, {
      cached: gradingResult.metadata?.cachedResponse,
    });
  }
}

function mergeSelectBestGradingResult(
  result: EvaluationStoreResult,
  gradingResult: GradingResult,
  evalTokenUsage: TokenUsage,
) {
  mergeComparisonTokenUsage(result, gradingResult, evalTokenUsage);

  if (result.gradingResult) {
    if (
      result.gradingResult.metadata?.cachedResponse === true &&
      gradingResult.metadata?.cachedResponse !== true
    ) {
      const { cachedResponse: _cachedResponse, ...metadata } = result.gradingResult.metadata;
      result.gradingResult.metadata = Object.keys(metadata).length > 0 ? metadata : undefined;
    }

    result.success = result.gradingResult.pass = result.gradingResult.pass && gradingResult.pass;
    if (!gradingResult.pass) {
      result.gradingResult.reason = gradingResult.reason;
      result.score = result.gradingResult.score = gradingResult.score;
    }
    result.gradingResult.componentResults ||= [];
    result.gradingResult.componentResults.push(gradingResult);
    return;
  }

  const newPass = result.success && gradingResult.pass;
  result.gradingResult = {
    ...gradingResult,
    pass: newPass,
  };
  result.success = newPass;
  if (!gradingResult.pass) {
    result.score = result.gradingResult.score = gradingResult.score;
  }
}

function mergeMaxScoreGradingResult(result: EvaluationStoreResult, gradingResult: GradingResult) {
  const existingComponentResults = result.gradingResult?.componentResults || [];
  const existingGradingResult = result.gradingResult;
  const comparisonPassed = gradingResult.pass;
  const previousPass = existingGradingResult?.pass ?? result.success;
  const nextPass = previousPass && comparisonPassed;
  const newScore = comparisonPassed
    ? (existingGradingResult?.score ?? result.score)
    : gradingResult.score;

  result.gradingResult = {
    ...(existingGradingResult || {}),
    pass: nextPass,
    score: newScore,
    reason:
      !comparisonPassed && previousPass
        ? gradingResult.reason
        : (existingGradingResult?.reason ?? ''),
    componentResults: [...existingComponentResults, gradingResult],
    namedScores: {
      ...(existingGradingResult?.namedScores || {}),
      ...gradingResult.namedScores,
    },
    tokensUsed: existingGradingResult?.tokensUsed || gradingResult.tokensUsed,
    assertion: gradingResult.assertion,
  };

  result.success = nextPass;
  if (!comparisonPassed) {
    result.score = newScore;
  }
}

async function runBeforeAllExtensions(testSuite: TestSuite): Promise<TestSuite> {
  if (!testSuite.extensions?.length) {
    return testSuite;
  }
  if (!testSuite.defaultTest) {
    testSuite.defaultTest = {};
  }
  if (typeof testSuite.defaultTest !== 'string' && !testSuite.defaultTest.assert) {
    testSuite.defaultTest.assert = [];
  }

  let seededMap: TestSuite['providerPromptMap'];
  let seededEntries: [string, string[], string[]][] = [];
  if (!testSuite.providerPromptMap) {
    const map: NonNullable<TestSuite['providerPromptMap']> = Object.create(null);
    for (const provider of testSuite.providers) {
      const selectors = [...(provider.prompts ?? testSuite.prompts.map((prompt) => prompt.label))];
      map[provider.id()] = selectors;
      if (provider.label) {
        map[provider.label] = selectors;
      }
    }
    seededMap = map;
    seededEntries = Object.entries(map).map(([key, selectors]) => [key, selectors, [...selectors]]);
    testSuite = { ...testSuite, providerPromptMap: map };
  }

  const { suite } = await runExtensionHook(testSuite.extensions, 'beforeAll', { suite: testSuite });
  if (seededMap) {
    // Hooks may mutate legacy map arrays. Only changed entries override instance filters;
    // untouched seeds must not merge duplicate providers or exclude newly added prompts.
    const overrides: NonNullable<TestSuite['providerPromptMap']> = Object.assign(
      Object.create(null),
      suite.providerPromptMap,
    );
    for (const [key, reference, selectors] of seededEntries) {
      if (!Object.hasOwn(overrides, key)) {
        overrides[key] = ['*'];
      } else if (
        // Same-map entry replacements are explicit, even with equal values. An
        // unchanged serialized roundtrip cannot retain map or array identity.
        (suite.providerPromptMap !== seededMap || overrides[key] === reference) &&
        isDeepStrictEqual(overrides[key], selectors)
      ) {
        delete overrides[key];
      }
    }
    suite.providerPromptMap = overrides;
  }
  return suite;
}

async function maybeAddGeneratedPrompts(
  testSuite: TestSuite,
  options: InternalEvaluateOptions,
  abortSignal?: AbortSignal,
) {
  if (!options.generateSuggestions) {
    return true;
  }

  // Library callers bypass CLI/config schema validation, so re-clamp here.
  const rawCount = options.suggestionsCount ?? 1;
  let requestedCount = Number.isInteger(rawCount) && rawCount >= 1 ? rawCount : 1;
  if (requestedCount > MAX_SUGGESTIONS_COUNT) {
    logger.warn(
      `suggestionsCount=${rawCount} exceeds max of ${MAX_SUGGESTIONS_COUNT}; clamping to ${MAX_SUGGESTIONS_COUNT}.`,
    );
    requestedCount = MAX_SUGGESTIONS_COUNT;
  }
  logger.info(`Generating prompt variations...`);
  const { prompts: newPrompts, error } = await generatePrompts(
    testSuite.prompts[0].raw,
    requestedCount,
    abortSignal,
  );
  abortSignal?.throwIfAborted();
  if (error || !newPrompts) {
    throw new Error(`Failed to generate prompts: ${error}`);
  }
  if (newPrompts.length < requestedCount) {
    logger.warn(
      chalk.yellow(
        `Only ${newPrompts.length} of ${requestedCount} requested prompt variants were generated. See warnings above for details.`,
      ),
    );
  }

  logger.info(chalk.blue('Generated prompts:'));
  let numAdded = 0;
  for (const prompt of newPrompts) {
    abortSignal?.throwIfAborted();
    logger.info('--------------------------------------------------------');
    logger.info(`${prompt}`);
    logger.info('--------------------------------------------------------');

    const selected = await promptYesNo('Do you want to test this prompt?', false);
    abortSignal?.throwIfAborted();
    if (selected) {
      testSuite.prompts.push({ raw: prompt, label: prompt });
      numAdded++;
    } else {
      logger.info('Skipping this prompt.');
    }
  }

  if (numAdded > 0) {
    return true;
  }
  logger.info(chalk.red('No prompts selected. Aborting.'));
  if (isCliEventSource(options)) {
    process.exitCode = 1;
    return false;
  }
  throw new PromptSuggestionsRejectedError();
}

/**
 * The results-table columns owned by one provider, in table order. `promptIdx` is the
 * column's position in the table, which is how results are addressed everywhere else.
 */
type ProviderColumns = {
  provider: ApiProvider;
  columns: { promptIdx: number; prompt: Prompt }[];
};

/**
 * Builds the results-table columns, one per (provider, prompt) pair, and returns them
 * both flattened (for the table header) and grouped by provider (for scheduling work).
 *
 * Callers must derive a result's column from `columns` rather than looking one up by
 * `providerKey:promptId`, because neither component is unique: two providers can share
 * a label (or resolve to the same id), and two prompts can share a label, which is what
 * `generateIdFromPrompt` hashes. Resolving by identity collapses duplicates into a
 * single column and silently drops the other columns' results.
 */
function buildLivePromptColumns(testSuite: TestSuite): {
  prompts: CompletedPrompt[];
  columnsByProvider: ProviderColumns[];
} {
  const prompts: CompletedPrompt[] = [];
  const columnsByProvider: ProviderColumns[] = [];

  for (const provider of testSuite.providers) {
    const providerKey = getProviderIdentifier(provider);
    const allowedPrompts =
      getProviderPromptOverride(provider, testSuite.providerPromptMap) ?? provider.prompts;
    const columns: ProviderColumns['columns'] = [];

    for (const prompt of testSuite.prompts) {
      if (!isAllowedPrompt(prompt, allowedPrompts)) {
        continue;
      }

      const promptId = generateIdFromPrompt(prompt);
      columns.push({ promptIdx: prompts.length, prompt });
      prompts.push({
        ...prompt,
        id: promptId,
        provider: providerKey,
        label: prompt.label,
        metrics: createDefaultPromptMetrics(),
      });
    }

    columnsByProvider.push({ provider, columns });
  }

  return { prompts, columnsByProvider };
}

function matchesSavedPromptLayout(
  prompts: CompletedPrompt[],
  savedPrompts: CompletedPrompt[],
  allowTemplateDifference: boolean,
): boolean {
  return (
    prompts.length === savedPrompts.length &&
    prompts.every((prompt, index) => {
      const saved = savedPrompts[index];
      return (
        prompt.provider === saved.provider &&
        prompt.label === saved.label &&
        prompt.raw === saved.raw &&
        (prompt.template === saved.template || allowTemplateDifference) &&
        isDeepStrictEqual(prompt.config, saved.config)
      );
    })
  );
}

function canRestoreSavedText(prompts: Prompt[], savedPrompts: CompletedPrompt[]): boolean {
  if (!prompts.some((prompt) => prompt.function)) {
    return true;
  }
  // An excluded callable must not prevent replaying proven text snapshots. Unknown
  // snapshots or anything overlapping a callable require the exact live layout.
  const textRaw = new Set<string>();
  const callableRaw = new Set<string>();
  const callableLabels = new Set<string>();
  for (const prompt of prompts) {
    if (prompt.function) {
      callableRaw.add(prompt.raw);
      callableLabels.add(prompt.label);
    } else {
      textRaw.add(prompt.raw);
    }
  }
  return savedPrompts.every(
    (saved) =>
      !callableRaw.has(saved.raw) && !callableLabels.has(saved.label) && textRaw.has(saved.raw),
  );
}

function promptIdentityCandidates(prompts: Prompt[]): Map<string, Set<string | undefined>> {
  const identities = new Map<string, Set<string | undefined>>();
  for (const prompt of prompts) {
    const key = JSON.stringify([generateIdFromPrompt(prompt), prompt.raw, prompt.label]);
    const ids = identities.get(key) ?? new Set<string | undefined>();
    ids.add(prompt.id);
    identities.set(key, ids);
  }
  return identities;
}

type PreparedPromptRecovery = {
  mode: 'live' | 'snapshot';
  hookPrompts: Prompt[];
  definitions: Prompt[];
  identities: Map<string, Set<string | undefined>>;
  canRestoreText: boolean;
  // Only needed when an exact live slot has different saved definitions per provider.
  exactProviders?: ApiProvider[];
  providerOrdinals?: number[];
};

const clonePromptConfig = Clone({ circles: true });

function copyPromptDefinition(prompt: Prompt): Prompt {
  return {
    id: prompt.id,
    raw: prompt.raw,
    label: prompt.label,
    display: prompt.display,
    template: prompt.template,
    config: clonePromptConfig(prompt.config),
    ...(prompt.function && { function: prompt.function }),
  };
}

/** Prepares hook-visible definitions without committing columns or checking hook-owned filters. */
function preparePromptRecovery(
  testSuite: TestSuite,
  store: EvaluationStore,
): PreparedPromptRecovery {
  const canRestoreText = canRestoreSavedText(testSuite.prompts, store.prompts);
  const identities = promptIdentityCandidates(testSuite.prompts);
  const live = buildLivePromptColumns(testSuite);
  const exact = matchesSavedPromptLayout(live.prompts, store.prompts, canRestoreText);
  let mode: PreparedPromptRecovery['mode'] = canRestoreText ? 'snapshot' : 'live';
  let hookPrompts = testSuite.prompts;

  if (exact) {
    const templates = new Map<Prompt, string | undefined>();
    let consistent = true;
    for (const { columns } of live.columnsByProvider) {
      for (const { prompt, promptIdx } of columns) {
        const template = store.prompts[promptIdx].template;
        if (templates.has(prompt) && templates.get(prompt) !== template) {
          consistent = false;
        }
        templates.set(prompt, template);
      }
    }
    if (consistent) {
      mode = 'live';
      hookPrompts = testSuite.prompts.map((prompt) =>
        templates.has(prompt) ? { ...prompt, template: templates.get(prompt) } : prompt,
      );
    }
  }
  if (mode === 'snapshot') {
    hookPrompts = store.prompts.map((saved) => {
      const ids = identities.get(JSON.stringify([saved.id, saved.raw, saved.label]));
      return { ...saved, id: ids?.size === 1 ? ids.values().next().value : undefined };
    });
  }
  hookPrompts = hookPrompts.map(copyPromptDefinition);
  return {
    mode,
    hookPrompts,
    definitions: hookPrompts.map(copyPromptDefinition),
    identities,
    canRestoreText,
    ...(mode === 'snapshot' &&
      exact && {
        exactProviders: [...testSuite.providers],
        providerOrdinals: live.columnsByProvider.flatMap(({ columns }, providerIndex) =>
          columns.map(() => providerIndex),
        ),
      }),
  };
}

function buildCompletedPrompts(
  testSuite: TestSuite,
  store: EvaluationStore,
  restorePromptColumns: boolean,
  tests: AtomicTestCase[],
  recovery?: PreparedPromptRecovery,
): { prompts: CompletedPrompt[]; columnsByProvider: ProviderColumns[] } {
  const providerIndices = new Map(
    testSuite.providers.map((provider, index) => [getProviderIdentifier(provider), index]),
  );
  if (recovery) {
    invariant(
      testSuite.prompts.length === recovery.definitions.length &&
        testSuite.prompts.every((prompt, index) =>
          isDeepStrictEqual(copyPromptDefinition(prompt), recovery.definitions[index]),
        ),
      'Cannot resume evaluation because beforeAll changed saved prompt definitions. Start a new evaluation instead.',
    );
  }
  const canRestoreText =
    recovery?.canRestoreText ??
    (!restorePromptColumns || canRestoreSavedText(testSuite.prompts, store.prompts));
  const { prompts, columnsByProvider } =
    recovery?.mode === 'snapshot'
      ? { prompts: [], columnsByProvider: [] }
      : buildLivePromptColumns(testSuite);
  const matchesSavedLayout = matchesSavedPromptLayout(
    prompts,
    store.prompts,
    restorePromptColumns && canRestoreText,
  );

  const restoredPrompts = restorePromptColumns
    ? store.prompts.map((saved) => {
        const metrics = saved.metrics
          ? structuredClone(saved.metrics)
          : createDefaultPromptMetrics();
        backfillNamedScoreWeights(metrics);
        return { ...saved, metrics };
      })
    : [];
  if (restorePromptColumns && matchesSavedLayout) {
    // Preserve positional authored IDs and each saved column's own metrics, even when
    // provider or prompt identifiers are duplicated.
    for (const { columns } of columnsByProvider) {
      for (const column of columns) {
        column.prompt = { ...column.prompt, template: store.prompts[column.promptIdx].template };
      }
    }
    return { prompts: restoredPrompts, columnsByProvider };
  }

  if (
    restorePromptColumns &&
    canRestoreText &&
    (providerIndices.size === testSuite.providers.length || recovery?.exactProviders)
  ) {
    // Otherwise, recover only identities with an unambiguous saved snapshot match.
    const identities = recovery?.identities ?? promptIdentityCandidates(testSuite.prompts);
    const allIds = new Set([...identities.values()].flatMap((ids) => [...ids]));
    const defaultTest = getDefaultTest(testSuite);
    const filters = tests.map((test) => ({
      prompts: test.prompts ?? defaultTest?.prompts,
      providers: test.providers ?? defaultTest?.providers,
    }));
    // Use the ID in both matching fields to isolate identity-based matches. Resolve
    // this once per bucket, not once per saved column.
    const identityFilters = (ids: Set<string | undefined>) =>
      filters.filter((filter) =>
        [...ids].some((id) => id && isAllowedPrompt({ raw: '', label: id, id }, filter.prompts)),
      );
    const ambiguousFilters = new Map(
      [...identities].map(([key, ids]) => [key, ids.size > 1 ? identityFilters(ids) : []]),
    );
    const unknownFilters = identityFilters(allIds);
    const restoredColumns: ProviderColumns[] = testSuite.providers.map((provider) => ({
      provider,
      columns: [],
    }));
    if (recovery?.exactProviders) {
      invariant(
        recovery.exactProviders.length === testSuite.providers.length &&
          recovery.exactProviders.every(
            (provider, index) => provider === testSuite.providers[index],
          ),
        'Cannot resume evaluation because saved providers are missing or reordered. Start a new evaluation instead.',
      );
    }
    let previousProviderIndex = -1;
    restoredPrompts.forEach((prompt, promptIdx) => {
      const providerIndex =
        recovery?.providerOrdinals?.[promptIdx] ?? providerIndices.get(prompt.provider) ?? -1;
      invariant(
        providerIndex >= 0 &&
          providerIndex >= previousProviderIndex &&
          getProviderIdentifier(testSuite.providers[providerIndex]) === prompt.provider,
        'Cannot resume evaluation because saved providers are missing or reordered. Start a new evaluation instead.',
      );
      previousProviderIndex = providerIndex;
      const key = JSON.stringify([prompt.id, prompt.raw, prompt.label]);
      const ids = identities.get(key);
      const runtimePrompt =
        recovery?.mode === 'snapshot'
          ? testSuite.prompts[promptIdx]
          : { ...prompt, id: ids?.size === 1 ? ids.values().next().value : undefined };
      invariant(
        isAllowedPrompt(
          runtimePrompt,
          getProviderPromptOverride(
            testSuite.providers[providerIndex],
            testSuite.providerPromptMap,
          ) ?? testSuite.providers[providerIndex].prompts,
        ),
        'Cannot resume evaluation because provider prompt selectors exclude saved columns. Start a new evaluation instead.',
      );
      invariant(
        (ambiguousFilters.get(key) ?? unknownFilters).every(
          (filter) =>
            !isProviderAllowed(testSuite.providers[providerIndex], filter.providers) ||
            isAllowedPrompt(runtimePrompt, filter.prompts),
        ),
        'Cannot resume evaluation because saved prompt IDs cannot be matched to test filters. Start a new evaluation instead.',
      );
      restoredColumns[providerIndex].columns.push({ promptIdx, prompt: runtimePrompt });
    });
    return { prompts: restoredPrompts, columnsByProvider: restoredColumns };
  }

  if (cliState.resume && store.persisted && store.prompts.length > 0) {
    // Resume completion uses column indices. Compare definitions, not generated IDs.
    invariant(
      matchesSavedLayout,
      'Cannot resume evaluation because the saved provider/prompt columns differ. Start a new evaluation instead.',
    );
    // Explicit retry configs retain their current definitions, but metrics belong to
    // saved column positions, not potentially duplicated provider/prompt identities.
    prompts.forEach((prompt, index) => {
      const metrics = store.prompts[index].metrics;
      if (metrics) {
        prompt.metrics = structuredClone(metrics);
        backfillNamedScoreWeights(prompt.metrics);
      }
    });
  }

  return { prompts, columnsByProvider };
}

function resolveAssertionProviderReferences(
  assertion: AssertionOrSet,
  providerMap: Record<string, ApiProvider>,
): AssertionOrSet {
  if (assertion.type === 'assert-set') {
    const resolvedAssertions = assertion.assert.map(
      (child) => resolveAssertionProviderReferences(child, providerMap) as Assertion,
    );
    if (resolvedAssertions.every((child, index) => child === assertion.assert[index])) {
      return assertion;
    }
    return { ...assertion, assert: resolvedAssertions };
  }

  const provider = resolveConfiguredProviderReference(assertion.provider, providerMap);
  return provider === assertion.provider ? assertion : { ...assertion, provider };
}

function resolveRuntimeGradingProviderReferences(
  testCase: AtomicTestCase,
  providerMap: Record<string, ApiProvider>,
): void {
  if (testCase.options?.provider) {
    const provider = resolveConfiguredProviderReference(testCase.options.provider, providerMap);
    if (provider !== testCase.options.provider) {
      testCase.options = { ...testCase.options, provider };
    }
  }

  if (testCase.assert) {
    const assertions = testCase.assert.map((assertion) =>
      resolveAssertionProviderReferences(assertion, providerMap),
    );
    if (assertions.some((assertion, index) => assertion !== testCase.assert?.[index])) {
      testCase.assert = assertions;
    }
  }
}

function getDefaultTest(testSuite: TestSuite) {
  return typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest : undefined;
}

function buildTestsFromSuite(testSuite: TestSuite): AtomicTestCase[] {
  const tests = getInitialTests(testSuite);
  if (!testSuite.scenarios?.length) {
    return tests;
  }

  telemetry.record('feature_used', { feature: 'scenarios' });
  let scenarioIndex = 0;
  for (const scenario of testSuite.scenarios) {
    for (const data of scenario.config) {
      tests.push(...buildScenarioTests(testSuite, scenario, data, scenarioIndex));
      scenarioIndex++;
    }
  }
  return tests;
}

function getInitialTests(testSuite: TestSuite): AtomicTestCase[] {
  if (testSuite.tests && testSuite.tests.length > 0) {
    return testSuite.tests as AtomicTestCase[];
  }
  return testSuite.scenarios ? [] : [{} as AtomicTestCase];
}

function buildScenarioTests(
  testSuite: TestSuite,
  scenario: NonNullable<TestSuite['scenarios']>[number],
  data: NonNullable<TestSuite['scenarios']>[number]['config'][number],
  scenarioIndex: number,
): AtomicTestCase[] {
  const scenarioTests = scenario.tests || [{}];
  return scenarioTests.map((test) => mergeScenarioTest(testSuite, data, test, scenarioIndex));
}

function mergeScenarioTest(
  testSuite: TestSuite,
  data: NonNullable<TestSuite['scenarios']>[number]['config'][number],
  test: NonNullable<TestSuite['scenarios']>[number]['tests'][number],
  scenarioIndex: number,
): AtomicTestCase {
  const defaultTest = getDefaultTest(testSuite);
  const mergedMetadata = {
    ...(defaultTest?.metadata || {}),
    ...data.metadata,
    ...test.metadata,
  };
  mergedMetadata.conversationId ??= `__scenario_${scenarioIndex}__`;

  return {
    ...(defaultTest || {}),
    ...data,
    ...test,
    vars: {
      ...(defaultTest?.vars || {}),
      ...data.vars,
      ...test.vars,
    },
    options: {
      ...normalizeGraderProvider(defaultTest?.options, 'defaultTest.options'),
      ...normalizeGraderProvider(data.options, 'scenario.config.options'),
      ...normalizeGraderProvider(test.options, 'scenario.tests.options'),
    },
    assert: [...(data.assert || []), ...(test.assert || [])],
    metadata: mergedMetadata,
  } as AtomicTestCase;
}

async function prepareTestVariables(
  tests: AtomicTestCase[],
  testSuite: TestSuite,
): Promise<Set<string>> {
  const varNames = new Set<string>();
  const inputTransformDefault = getDefaultTest(testSuite)?.options?.transformVars;

  for (const testCase of tests) {
    testCase.vars = {
      ...(getDefaultTest(testSuite)?.vars || {}),
      ...testCase?.vars,
    };
    if (!testCase.vars) {
      continue;
    }

    await applyInputTransform(testCase, inputTransformDefault);
    for (const varName of Object.keys(testCase.vars)) {
      varNames.add(varName);
    }
  }

  return varNames;
}

async function applyInputTransform(
  testCase: AtomicTestCase,
  inputTransformDefault: NonNullable<AtomicTestCase['options']>['transformVars'] | undefined,
) {
  const inputTransform = testCase.options?.transformVars || inputTransformDefault;
  if (!inputTransform) {
    return;
  }

  const transformedVars = await transform(
    inputTransform,
    testCase.vars,
    {
      prompt: {},
      uuid: crypto.randomUUID(),
    },
    true,
    TransformInputType.VARS,
  );
  invariant(
    typeof transformedVars === 'object',
    'Transform function did not return a valid object',
  );
  testCase.vars = { ...testCase.vars, ...transformedVars };
}

async function buildRunEvalOptions({
  concurrency,
  conversations,
  evalId,
  options,
  columnsByProvider,
  providerAbortSignal,
  rateLimitRegistry,
  registers,
  testSuite,
  tests,
}: {
  concurrency: number;
  conversations: EvalConversations;
  evalId: string;
  options: InternalEvaluateOptions;
  columnsByProvider: ProviderColumns[];
  providerAbortSignal?: AbortSignal;
  rateLimitRegistry?: RateLimitRegistryRef;
  registers: EvalRegisters;
  testSuite: TestSuite;
  tests: AtomicTestCase[];
}): Promise<RunEvalOptions[]> {
  const runEvalOptions: RunEvalOptions[] = [];
  const configuredProviderMap = buildConfiguredProviderMap(testSuite.providers);

  let testIdx = 0;
  for (let index = 0; index < tests.length; index++) {
    const testCase = tests[index];
    await prepareTestCaseForEval(testSuite, testCase, index);
    resolveRuntimeGradingProviderReferences(testCase, configuredProviderMap);
    testIdx = appendRunEvalOptionsForTestCase({
      concurrency,
      conversations,
      evalId,
      nextTestIdx: testIdx,
      options,
      columnsByProvider,
      providerAbortSignal,
      rateLimitRegistry,
      registers,
      runEvalOptions,
      testCase,
      testCaseIndex: index,
      testSuite,
    });
  }

  return runEvalOptions;
}

async function prepareTestCaseForEval(
  testSuite: TestSuite,
  testCase: AtomicTestCase,
  index: number,
) {
  const defaultTest = getDefaultTest(testSuite);
  invariant(
    !defaultTest || Array.isArray(defaultTest.assert || []),
    `defaultTest.assert is not an array in test case #${index + 1}`,
  );
  invariant(
    Array.isArray(testCase.assert || []),
    `testCase.assert is not an array in test case #${index + 1}`,
  );

  const disableDefaultAsserts = testCase.options?.disableDefaultAsserts === true;
  testCase.assert = [
    ...(disableDefaultAsserts ? [] : defaultTest?.assert || []),
    ...(testCase.assert || []),
  ];
  testCase.threshold = testCase.threshold ?? defaultTest?.threshold;
  testCase.options = {
    ...normalizeGraderProvider(defaultTest?.options, 'defaultTest.options'),
    ...normalizeGraderProvider(testCase.options, 'test.options'),
  };
  testCase.metadata = {
    ...(defaultTest?.metadata || {}),
    ...testCase.metadata,
  };
  testCase.prompts = testCase.prompts ?? defaultTest?.prompts;
  testCase.provider = await resolveDefaultTestProvider(defaultTest, testCase);
  testCase.assertScoringFunction =
    testCase.assertScoringFunction || defaultTest?.assertScoringFunction;
  testCase.providers = testCase.providers ?? defaultTest?.providers;

  if (typeof testCase.assertScoringFunction === 'string') {
    const { filePath: resolvedPath, functionName } = parseFileUrl(testCase.assertScoringFunction);
    testCase.assertScoringFunction = await loadFunction<ScoringFunction>({
      filePath: resolvedPath,
      functionName,
    });
  }
}

async function resolveDefaultTestProvider(
  defaultTest: ReturnType<typeof getDefaultTest>,
  testCase: AtomicTestCase,
) {
  if (testCase.provider || !defaultTest?.provider) {
    return testCase.provider;
  }

  const defaultProvider = defaultTest.provider;
  if (isApiProvider(defaultProvider)) {
    return defaultProvider;
  }
  if (typeof defaultProvider === 'object' && defaultProvider.id) {
    const { loadApiProvider } = await import('../providers');
    const providerId =
      typeof defaultProvider.id === 'function' ? defaultProvider.id() : defaultProvider.id;
    return loadApiProvider(providerId, {
      options: defaultProvider as ProviderOptions,
    });
  }
  return defaultProvider;
}

function appendRunEvalOptionsForTestCase({
  concurrency,
  conversations,
  evalId,
  nextTestIdx,
  options,
  columnsByProvider,
  providerAbortSignal,
  rateLimitRegistry,
  registers,
  runEvalOptions,
  testCase,
  testCaseIndex,
  testSuite,
}: {
  concurrency: number;
  conversations: EvalConversations;
  evalId: string;
  nextTestIdx: number;
  options: InternalEvaluateOptions;
  columnsByProvider: ProviderColumns[];
  providerAbortSignal?: AbortSignal;
  rateLimitRegistry?: RateLimitRegistryRef;
  registers: EvalRegisters;
  runEvalOptions: RunEvalOptions[];
  testCase: AtomicTestCase;
  testCaseIndex: number;
  testSuite: TestSuite;
}) {
  const promptPrefix = testCase.options?.prefix || getDefaultTest(testSuite)?.options?.prefix || '';
  const promptSuffix = testCase.options?.suffix || getDefaultTest(testSuite)?.options?.suffix || '';
  const varCombinations =
    getEnvBool('PROMPTFOO_DISABLE_VAR_EXPANSION') || testCase.options?.disableVarExpansion
      ? [testCase.vars]
      : generateVarCombinations(testCase.vars || {});

  const globalRepeat = normalizeRepeatCount(options.repeat);
  const testRepeat = normalizeRepeatCount(testCase.options?.repeat, globalRepeat);
  const effectiveOptions = {
    ...options,
    repeat: testRepeat,
  };
  for (let repeatIndex = 0; repeatIndex < testRepeat; repeatIndex++) {
    for (const [varCombinationIndex, vars] of varCombinations.entries()) {
      appendRunEvalOptionsForVars({
        concurrency,
        conversations,
        evalId,
        options: effectiveOptions,
        columnsByProvider,
        promptPrefix,
        promptSuffix,
        providerAbortSignal,
        rateLimitRegistry,
        registers,
        repeatGroupId:
          testRepeat > 1 ? `test-${testCaseIndex}-vars-${varCombinationIndex}` : undefined,
        repeatIndex,
        runEvalOptions,
        testCase,
        testIdx: nextTestIdx,
        testSuite,
        vars,
      });
      nextTestIdx++;
    }
  }

  return nextTestIdx;
}

function appendRunEvalOptionsForVars({
  concurrency,
  conversations,
  evalId,
  options,
  columnsByProvider,
  promptPrefix,
  promptSuffix,
  providerAbortSignal,
  rateLimitRegistry,
  registers,
  repeatGroupId,
  repeatIndex,
  runEvalOptions,
  testCase,
  testIdx,
  testSuite,
  vars,
}: {
  concurrency: number;
  conversations: EvalConversations;
  evalId: string;
  options: InternalEvaluateOptions;
  columnsByProvider: ProviderColumns[];
  promptPrefix: string;
  promptSuffix: string;
  providerAbortSignal?: AbortSignal;
  rateLimitRegistry?: RateLimitRegistryRef;
  registers: EvalRegisters;
  repeatGroupId?: string;
  repeatIndex: number;
  runEvalOptions: RunEvalOptions[];
  testCase: AtomicTestCase;
  testIdx: number;
  testSuite: TestSuite;
  vars: Vars | undefined;
}) {
  for (const { provider, columns } of columnsByProvider) {
    if (!isProviderAllowed(provider, testCase.providers)) {
      continue;
    }
    appendRunEvalOptionsForProvider({
      columns,
      concurrency,
      conversations,
      evalId,
      options,
      promptPrefix,
      promptSuffix,
      provider,
      providerAbortSignal,
      rateLimitRegistry,
      registers,
      repeatGroupId,
      repeatIndex,
      runEvalOptions,
      testCase,
      testIdx,
      testSuite,
      vars,
    });
  }
}

function appendRunEvalOptionsForProvider({
  columns,
  concurrency,
  conversations,
  evalId,
  options,
  promptPrefix,
  promptSuffix,
  provider,
  providerAbortSignal,
  rateLimitRegistry,
  registers,
  repeatGroupId,
  repeatIndex,
  runEvalOptions,
  testCase,
  testIdx,
  testSuite,
  vars,
}: {
  columns: ProviderColumns['columns'];
  concurrency: number;
  conversations: EvalConversations;
  evalId: string;
  options: InternalEvaluateOptions;
  promptPrefix: string;
  promptSuffix: string;
  provider: ApiProvider;
  providerAbortSignal?: AbortSignal;
  rateLimitRegistry?: RateLimitRegistryRef;
  registers: EvalRegisters;
  repeatGroupId?: string;
  repeatIndex: number;
  runEvalOptions: RunEvalOptions[];
  testCase: AtomicTestCase;
  testIdx: number;
  testSuite: TestSuite;
  vars: Vars | undefined;
}) {
  for (const { promptIdx, prompt } of columns) {
    if (!isAllowedPrompt(prompt, testCase.prompts)) {
      continue;
    }

    runEvalOptions.push(
      createRunEvalOption({
        concurrency,
        conversations,
        evalId,
        options,
        prompt,
        promptIdx,
        promptPrefix,
        promptSuffix,
        provider,
        providerAbortSignal,
        rateLimitRegistry,
        registers,
        repeatGroupId,
        repeatIndex,
        testCase,
        testIdx,
        testSuite,
        vars,
      }),
    );
  }
}

function createRunEvalOption({
  concurrency,
  conversations,
  evalId,
  options,
  prompt,
  promptIdx,
  promptPrefix,
  promptSuffix,
  provider,
  providerAbortSignal,
  rateLimitRegistry,
  registers,
  repeatGroupId,
  repeatIndex,
  testCase,
  testIdx,
  testSuite,
  vars,
}: {
  concurrency: number;
  conversations: EvalConversations;
  evalId: string;
  options: InternalEvaluateOptions;
  prompt: Prompt;
  promptIdx: number;
  promptPrefix: string;
  promptSuffix: string;
  provider: ApiProvider;
  providerAbortSignal?: AbortSignal;
  rateLimitRegistry?: RateLimitRegistryRef;
  registers: EvalRegisters;
  repeatGroupId?: string;
  repeatIndex: number;
  testCase: AtomicTestCase;
  testIdx: number;
  testSuite: TestSuite;
  vars: Vars | undefined;
}): RunEvalOptions {
  return {
    delay: options.delay || 0,
    provider,
    prompt: {
      ...prompt,
      raw: promptPrefix + prompt.raw + promptSuffix,
      template: prompt.template ?? prompt.raw,
    },
    testSuite,
    test: createRunEvalTest(testSuite, testCase, vars, evalId),
    nunjucksFilters: testSuite.nunjucksFilters,
    testIdx,
    promptIdx,
    repeatGroupId,
    repeatIndex,
    evaluateOptions: options,
    conversations,
    registers,
    isRedteam: testSuite.redteam != null,
    concurrency,
    abortSignal: providerAbortSignal,
    evalId,
    rateLimitRegistry,
  };
}

function createRunEvalTest(
  testSuite: TestSuite,
  testCase: AtomicTestCase,
  vars: Vars | undefined,
  evalId: string,
): AtomicTestCase {
  const globalGraderExamples = testSuite.redteam?.graderExamples;
  const testOptions = globalGraderExamples
    ? { ...testCase.options, redteamGraderExamples: globalGraderExamples }
    : testCase.options;
  const baseTest = {
    ...testCase,
    vars,
    options: testOptions,
  };

  if (!isTracingEnabledForTest(testSuite, testCase)) {
    return baseTest;
  }
  return {
    ...baseTest,
    metadata: {
      ...testCase.metadata,
      tracingEnabled: true,
      evaluationId: evalId,
    },
  };
}

function isTracingEnabledForTest(testSuite: TestSuite, testCase: AtomicTestCase) {
  const tracingEnvEnabled = getEnvBool('PROMPTFOO_TRACING_ENABLED', false);
  const tracingEnabled =
    tracingEnvEnabled ||
    testCase.metadata?.tracingEnabled === true ||
    testSuite.tracing?.enabled === true;

  logger.debug(
    `[Evaluator] Tracing check: env=${tracingEnvEnabled}, testCase.metadata?.tracingEnabled=${testCase.metadata?.tracingEnabled}, testSuite.tracing?.enabled=${testSuite.tracing?.enabled}, tracingEnabled=${tracingEnabled}`,
  );

  return tracingEnabled;
}

function markComparisonRows(
  runEvalOptions: RunEvalOptions[],
  rowsWithSelectBestAssertion: Set<number>,
  rowsWithMaxScoreAssertion: Set<number>,
) {
  for (const evalOption of runEvalOptions) {
    if (evalOption.test.assert?.some((a) => a.type === 'select-best')) {
      rowsWithSelectBestAssertion.add(evalOption.testIdx);
    }
    if (evalOption.test.assert?.some((a) => a.type === 'max-score')) {
      rowsWithMaxScoreAssertion.add(evalOption.testIdx);
    }
  }
}

function hasCompletedComparison(
  result: EvaluationStoreResult,
  type: 'select-best' | 'max-score',
): boolean {
  // Target failures have no comparison component and cannot be regraded by resume.
  if (result.failureReason === ResultFailureReason.ERROR && !getComparisonError(result)) {
    return true;
  }
  return (
    result.gradingResult?.assertion?.type === type ||
    result.gradingResult?.componentResults?.some(
      (component) => component.assertion?.type === type,
    ) === true
  );
}

type ComparisonErrorState = Pick<
  EvaluationStoreResult,
  'success' | 'score' | 'failureReason' | 'error'
>;

function getComparisonError(result: EvaluationStoreResult): ComparisonErrorState | undefined {
  const state = result.metadata?.[PROMPTFOO_METADATA_KEY]?.comparisonError;
  return typeof state?.success === 'boolean' &&
    typeof state.score === 'number' &&
    (state.failureReason === ResultFailureReason.NONE ||
      state.failureReason === ResultFailureReason.ASSERT)
    ? state
    : undefined;
}

function setComparisonError(result: EvaluationStoreResult, state?: ComparisonErrorState) {
  const internal = result.metadata?.[PROMPTFOO_METADATA_KEY];
  if (!state && !internal?.comparisonError) {
    return;
  }
  const fields =
    internal && typeof internal === 'object' && !Array.isArray(internal) ? { ...internal } : {};
  if (state) {
    fields.comparisonError = state;
  } else {
    delete fields.comparisonError;
  }
  result.metadata = { ...result.metadata, [PROMPTFOO_METADATA_KEY]: fields };
  if (Object.keys(fields).length === 0) {
    delete result.metadata[PROMPTFOO_METADATA_KEY];
  }
}

const COMPARISON_ERROR_PREFIX = 'Error grading select-best';
const COMPARISON_RESUME_ERROR =
  'Cannot resume select-best with this grader configuration. Supply a grader configuration matching the saved result, or rerun the evaluation.';

function hasComparisonRedactions(
  value: unknown,
  field?: string,
  parentField?: string,
  seen = new WeakSet<object>(),
): boolean {
  if (typeof value === 'string') {
    const masked =
      value.includes(REDACTED) ||
      /%(?:25)*5BREDACTED%(?:25)*5D/i.test(value) ||
      value.includes('***:***@');
    return (
      masked &&
      ((field === undefined && /^(?:[a-z][a-z0-9+.-]*:\/\/|\/[^?#]*[?#])/i.test(value)) ||
        field === 'id' ||
        (field !== undefined &&
          (isSecretField(field) ||
            /(?:url|uri|host|endpoint|proxy)$/i.test(field) ||
            (parentField === 'env' && isSecretEnvVarName(field)) ||
            (parentField?.toLowerCase() === 'headers' && !isNonCredentialHeader(field)))))
    );
  }
  if (!value || typeof value !== 'object' || seen.has(value)) {
    return false;
  }
  seen.add(value);
  return Object.entries(value).some(
    ([key, entry]) =>
      hasComparisonRedactions(key, undefined, undefined, seen) ||
      hasComparisonRedactions(entry, key, field, seen),
  );
}

function comparisonProviderOptions(provider: GradingConfig['provider']) {
  if (isApiProvider(provider)) {
    return {
      id: provider.id(),
      label: provider.label,
      config: provider.config,
      env: (provider as ApiProvider & { env?: EnvOverrides }).env,
    };
  }
  return provider;
}

function comparisonProviderId(provider: GradingConfig['provider']): string | undefined {
  const id =
    typeof provider === 'string'
      ? provider
      : isApiProvider(provider)
        ? provider.id()
        : provider?.id;
  if (typeof id !== 'string') {
    return undefined;
  }
  const canonicalId = providerToIdentifier(id) ?? id;
  return canonicalId.includes('://') || canonicalId.startsWith('/')
    ? sanitizeUrl(canonicalId)
    : canonicalId;
}

function comparisonProviderSettings(provider: GradingConfig['provider']) {
  const persisted = persistComparisonProvider(provider);
  const options = typeof persisted === 'string' ? { id: persisted } : persisted;
  // Compare every nonsecret option, including endpoint/account settings and env overrides.
  // Strip functions and undefined fields exactly as persistence does.
  return JSON.parse(
    safeJsonStringify({ ...options, id: comparisonProviderId(provider), label: undefined })!,
  );
}

function restoreComparisonProvider(
  saved: GradingConfig['provider'],
  configured: GradingConfig['provider'],
  currentResult: boolean,
): GradingConfig['provider'] {
  if (!saved || isApiProvider(saved)) {
    return saved;
  }
  const configuredText = isProviderTypeMap(configured) ? configured.text : configured;
  if (isProviderTypeMap(saved)) {
    return { ...saved, text: restoreComparisonProvider(saved.text, configuredText, currentResult) };
  }
  const savedId = comparisonProviderId(saved);
  invariant(
    savedId &&
      savedId !== REDACTED &&
      !savedId.startsWith('[Function] ') &&
      !/^\[.+ Instance\]$/.test(savedId),
    'Cannot resume select-best because the saved runtime grader has no provider ID. Rerun the evaluation.',
  );
  const sameId = savedId === comparisonProviderId(configuredText);
  const canRestore =
    sameId &&
    (currentResult ||
      isDeepStrictEqual(
        comparisonProviderSettings(saved),
        comparisonProviderSettings(configuredText),
      ));
  if (canRestore) {
    invariant(
      !hasComparisonRedactions(comparisonProviderOptions(configuredText)),
      COMPARISON_RESUME_ERROR,
    );
    // Use the actual descriptor or handle, including credentials embedded in URLs.
    return configuredText;
  }
  invariant(
    !hasComparisonRedactions(saved) && !(sameId && isApiProvider(configuredText)),
    COMPARISON_RESUME_ERROR,
  );
  return saved;
}

function snapshotComparisonProvider(
  provider: GradingConfig['provider'],
  seen = new WeakMap<object, GradingConfig['provider']>(),
): GradingConfig['provider'] {
  if (!provider || typeof provider !== 'object' || isApiProvider(provider)) {
    return provider;
  }
  const prototype = Object.getPrototypeOf(provider);
  if (!Array.isArray(provider) && prototype !== Object.prototype && prototype !== null) {
    return provider;
  }
  if (seen.has(provider)) {
    return seen.get(provider);
  }
  const snapshot = Array.isArray(provider) ? new Array(provider.length) : {};
  seen.set(provider, snapshot);
  for (const [key, value] of Object.entries(provider)) {
    Object.defineProperty(snapshot, key, {
      value: snapshotComparisonProvider(value, seen),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return snapshot;
}

function persistComparisonProvider(provider: GradingConfig['provider']): GradingConfig['provider'] {
  const options = isProviderTypeMap(provider)
    ? { ...provider, text: persistComparisonProvider(provider.text) }
    : comparisonProviderOptions(provider);
  return sanitizeObject(options, {
    sanitizeUrls: true,
    maxDepth: Number.POSITIVE_INFINITY,
    throwOnError: true,
  });
}

function getComparisonProviders(test: AtomicTestCase, currentResult = false) {
  const assertion = test.assert?.find((a): a is Assertion => a.type === 'select-best');
  return {
    provider: snapshotComparisonProvider(assertion?.provider || test.options?.provider),
    currentResult,
  };
}

type ComparisonProviders = ReturnType<typeof getComparisonProviders>;

type RepeatCacheContext = Pick<RunEvalOptions, 'evaluateOptions' | 'repeatIndex'>;

function buildRepeatCacheContextByTestIdx(runEvalOptions: RunEvalOptions[]) {
  const repeatCacheContextByTestIdx = new Map<number, RepeatCacheContext>();
  for (const evalOption of runEvalOptions) {
    repeatCacheContextByTestIdx.set(evalOption.testIdx, {
      evaluateOptions: evalOption.evaluateOptions,
      repeatIndex: evalOption.repeatIndex,
    });
  }
  return repeatCacheContextByTestIdx;
}

async function filterCompletedResumeSteps(
  runEvalOptions: RunEvalOptions[],
  store: EvaluationStore,
) {
  if (!cliState.resume || !store.persisted) {
    return runEvalOptions;
  }

  let pending = runEvalOptions;
  try {
    const completedPairs = await store.readCompletedIndexPairs({
      excludeErrors: cliState.retryMode,
    });
    if (completedPairs.size === 0) {
      return runEvalOptions;
    }
    pending = runEvalOptions.filter((step) => !completedPairs.has(getResultIndexKey(step)));
    const skipped = runEvalOptions.length - pending.length;
    if (skipped > 0) {
      logger.info(`Resuming: skipping ${skipped} previously completed cases`);
    }
  } catch (err) {
    logger.warn(
      `Resume: failed to load completed results. Running full evaluation. ${String(err)}`,
    );
  }
  return pending;
}

function adjustConcurrencyForSerialFeatures({
  concurrency,
  prompts,
  providers,
  tests,
}: {
  concurrency: number;
  prompts: CompletedPrompt[];
  providers: ApiProvider[];
  tests: AtomicTestCase[];
}) {
  const usesConversationVar = prompts.some(promptUsesConversationVariable);
  if (concurrency <= 1) {
    return { concurrency, usesConversationVar };
  }

  const usesStoreOutputAs = tests.some((t) => t.options?.storeOutputAs);
  const usesPersistentBrowserSession = providers.some(
    (provider) => provider.id() === 'browser-provider' && provider.config?.persistSession === true,
  );
  if (usesConversationVar) {
    logger.info(
      `Setting concurrency to 1 because the ${chalk.cyan(CONVERSATION_VAR_NAME)} variable is used.`,
    );
    return { concurrency: 1, usesConversationVar };
  }
  if (usesStoreOutputAs) {
    logger.info(`Setting concurrency to 1 because storeOutputAs is used.`);
    return { concurrency: 1, usesConversationVar };
  }
  if (usesPersistentBrowserSession) {
    logger.info(`Setting concurrency to 1 because browser persistSession is enabled.`);
    return { concurrency: 1, usesConversationVar };
  }
  return { concurrency, usesConversationVar };
}

interface ProcessEvalStepOptions {
  deferGrading?: boolean;
  onRowsReady?: () => void;
  precomputedRows?: EvaluateResult[];
  providerCallQueue?: ProviderCallQueue;
  shouldSkipStaleRows?: () => boolean;
}

interface GroupedRows {
  evalStep: RunEvalOptions;
  index: number;
  rows: EvaluateResult[];
}

interface EvalProcessingContext {
  assertionTypes: Set<string>;
  concurrency: number;
  deferredGradingAbortSignal?: AbortSignal;
  derivedMetrics: PreparedDerivedMetrics;
  numComplete: number;
  options: InternalEvaluateOptions;
  promptEvalCounts: number[];
  prompts: CompletedPrompt[];
  rowsWithMaxScoreAssertion: Set<number>;
  rowsWithSelectBestAssertion: Set<number>;
  runEvalOptionsLength: number;
  targetErrorAbortController: AbortController;
  targetErrorStatus?: number;
  targetUnavailable: boolean;
  testSuite: TestSuite;
  vars: Set<string>;
}

async function runGroupedGradingForRows(
  entries: GroupedRows[],
  providerCallQueue: ProviderGroupedCallQueue,
  onRowsGraded: (entry: GroupedRows) => Promise<void>,
) {
  const gradingPromises: Promise<void>[] = [];
  for (const { rows } of entries) {
    for (const row of rows) {
      const gradingPromise = deferredGradingPromises.get(row);
      if (gradingPromise) {
        gradingPromises.push(
          gradingPromise.finally(() => {
            deferredGradingPromises.delete(row);
            if (--pendingCount === 0) {
              resolveAllDone();
            }
          }),
        );
      }
    }
  }

  let pendingCount = gradingPromises.length;
  if (pendingCount === 0) {
    return;
  }
  let resolveAllDone: () => void;
  const allDone = new Promise<void>((resolve) => {
    resolveAllDone = resolve;
  });
  let nextEntryIndex = 0;

  const processReadyEntries = async () => {
    while (nextEntryIndex < entries.length) {
      const entry = entries[nextEntryIndex];
      if (!entry.rows.every((row) => !deferredGradingPromises.has(row))) {
        break;
      }
      nextEntryIndex++;
      await onRowsGraded(entry);
    }
  };

  let currentProviderId: string | undefined;
  while (pendingCount > 0 || providerCallQueue.hasJobs()) {
    if (!providerCallQueue.hasJobs()) {
      await Promise.race([providerCallQueue.waitForJob(), allDone]);
      await processReadyEntries();
    }

    for (const job of providerCallQueue.takeNextGroup(currentProviderId)) {
      currentProviderId = job.providerId;
      await providerCallQueue.run(job);
      await Promise.resolve();
      await processReadyEntries();
    }
  }

  await Promise.all(gradingPromises);
  await processReadyEntries();
}

function trackComparisonRowsForEvalStep(
  evalStep: RunEvalOptions,
  row: EvaluateResult,
  rowsWithSelectBestAssertion: Set<number>,
  rowsWithMaxScoreAssertion: Set<number>,
) {
  if (evalStep.test.assert?.some((a) => a.type === 'select-best')) {
    rowsWithSelectBestAssertion.add(row.testIdx);
  }
  if (evalStep.test.assert?.some((a) => a.type === 'max-score')) {
    rowsWithMaxScoreAssertion.add(row.testIdx);
  }
}

function createPromptEvalCounts(prompts: CompletedPrompt[]) {
  return prompts.map((prompt) => {
    const metrics = prompt.metrics;
    return metrics ? metrics.testPassCount + metrics.testFailCount + metrics.testErrorCount : 0;
  });
}

function reservePromptEvalCount(context: EvalProcessingContext, promptIdx: number) {
  context.promptEvalCounts[promptIdx] = (context.promptEvalCounts[promptIdx] ?? 0) + 1;
  return context.promptEvalCounts[promptIdx];
}

function createEvalStepTimeoutResult(
  evalStep: RunEvalOptions,
  sanitizedTestCase: AtomicTestCase,
  timeoutMs: number,
  error: unknown,
): EvaluateResult {
  return {
    provider: {
      id: evalStep.provider.id(),
      label: evalStep.provider.label,
      config: evalStep.provider.config,
    } as EvaluateResult['provider'],
    prompt: {
      raw: evalStep.prompt.raw,
      label: evalStep.prompt.label,
      config: evalStep.prompt.config,
    },
    vars: evalStep.test.vars || {},
    error: `Evaluation timed out after ${timeoutMs}ms: ${String(error)}`,
    success: false,
    failureReason: ResultFailureReason.ERROR,
    score: 0,
    namedScores: {},
    latencyMs: timeoutMs,
    promptIdx: evalStep.promptIdx,
    ...(evalStep.repeatGroupId !== undefined && {
      repeatGroupId: evalStep.repeatGroupId,
      repeatIndex: evalStep.repeatIndex,
    }),
    testIdx: evalStep.testIdx,
    testCase: sanitizedTestCase,
    promptId: evalStep.prompt.id || '',
  };
}

function createTimeoutMetrics(timeoutMs: number): PromptMetrics {
  return {
    score: 0,
    testPassCount: 0,
    testFailCount: 0,
    testErrorCount: 1,
    assertPassCount: 0,
    assertFailCount: 0,
    totalLatencyMs: timeoutMs,
    tokenUsage: {
      total: 0,
      prompt: 0,
      completion: 0,
      cached: 0,
      numRequests: 0,
    },
    namedScores: {},
    namedScoresCount: {},
    namedScoreWeights: {},
    cost: 0,
  };
}

function createMaxDurationTimeoutResult(
  evalStep: RunEvalOptions,
  maxEvalTimeMs: number,
  startTime: number,
): EvaluateResult {
  return {
    provider: {
      id: evalStep.provider.id(),
      label: evalStep.provider.label,
      config: evalStep.provider.config,
    } as EvaluateResult['provider'],
    prompt: {
      raw: evalStep.prompt.raw,
      label: evalStep.prompt.label,
      config: evalStep.prompt.config,
    },
    vars: evalStep.test.vars || {},
    error: `Evaluation exceeded max duration of ${maxEvalTimeMs}ms`,
    success: false,
    failureReason: ResultFailureReason.ERROR,
    score: 0,
    namedScores: {},
    latencyMs: Date.now() - startTime,
    promptIdx: evalStep.promptIdx,
    ...(evalStep.repeatGroupId !== undefined && {
      repeatGroupId: evalStep.repeatGroupId,
      repeatIndex: evalStep.repeatIndex,
    }),
    testIdx: evalStep.testIdx,
    testCase: evalStep.test,
    promptId: evalStep.prompt.id || '',
  };
}

function getAssertionTelemetryStats(prompts: CompletedPrompt[], assertionTypes: Set<string>) {
  const totalAssertions = prompts.reduce(
    (acc, p) => acc + (p.metrics?.assertPassCount || 0) + (p.metrics?.assertFailCount || 0),
    0,
  );
  const passedAssertions = prompts.reduce((acc, p) => acc + (p.metrics?.assertPassCount || 0), 0);
  const modelGradedAssertions = Array.from(assertionTypes).filter((type) =>
    MODEL_GRADED_ASSERTION_TYPES.has(type as AssertionType),
  ).length;

  return {
    numAssertions: totalAssertions,
    passedAssertions,
    modelGradedAssertions,
    assertionPassRate: totalAssertions > 0 ? passedAssertions / totalAssertions : 0,
  };
}

function getAverageLatencyMs(results: EvaluationStoreResult[]) {
  const totalLatencyMs = results.reduce((sum, result) => sum + (result.latencyMs || 0), 0);
  return results.length > 0 ? totalLatencyMs / results.length : 0;
}

function getProviderPrefixes(testSuite: TestSuite) {
  return Array.from(
    new Set(
      testSuite.providers.map((p) => {
        const idParts = p.id().split(':');
        return idParts.length > 1 ? idParts[0] : 'unknown';
      }),
    ),
  );
}

function usesTransforms(testSuite: TestSuite, tests: AtomicTestCase[]) {
  return Boolean(
    tests.some((t) => t.options?.transform || t.options?.postprocess) ||
      testSuite.providers.some((p) => Boolean(p.transform)),
  );
}

function usesExampleProvider(testSuite: TestSuite) {
  return testSuite.providers.some((provider) => {
    const url = typeof provider.config?.url === 'string' ? provider.config.url : '';
    const label = provider.label || '';
    return url.includes('promptfoo.app') || label.toLowerCase().includes('example');
  });
}

interface EvaluationDeadline {
  startTime: number;
  maxEvalTimeMs: number;
  providerAbortSignal?: AbortSignal;
  deferredGradingAbortSignal?: AbortSignal;
  globalTimeout?: NodeJS.Timeout;
  isTimedOut: () => boolean;
}

class Evaluator<TEvaluation extends EvaluationRecord, TResult extends EvaluationStoreResult> {
  store: EvaluationStore<TEvaluation, TResult>;
  testSuite: TestSuite;
  options: InternalEvaluateOptions;
  stats: EvaluateStats;
  conversations: EvalConversations;
  registers: EvalRegisters;
  fileWriters: EvaluatorResultWriter[];
  rateLimitRegistry: RateLimitRegistry | undefined;
  private readonly comparisonProviders = new Map<string, ComparisonProviders>();
  private readonly currentResultKeys = new Set<string>();
  private readonly retryErrorResultIds = new Set(
    cliState.retryMode ? cliState._retryErrorResultIds : [],
  );
  constructor(
    testSuite: TestSuite,
    store: EvaluationStore<TEvaluation, TResult>,
    options: InternalEvaluateOptions,
    runtime: EvaluatorRuntime<TEvaluation, TResult>,
  ) {
    this.testSuite = testSuite;
    this.store = store;
    this.options = options;
    this.stats = {
      successes: 0,
      failures: 0,
      errors: 0,
      tokenUsage: createEmptyTokenUsage(),
    };
    this.conversations = {};
    this.registers = {};

    this.fileWriters = runtime.createResultWriters(store.config.outputPath, {
      append: Boolean(cliState.resume),
    });

    // Create rate limit registry for adaptive concurrency control
    this.rateLimitRegistry = new RateLimitRegistry({
      maxConcurrency: options.maxConcurrency || DEFAULT_MAX_CONCURRENCY,
    });

    // Add debug logging for rate limit events
    this.rateLimitRegistry.on('ratelimit:hit', (data) => {
      logger.debug(`[Scheduler] Rate limit hit for ${data.rateLimitKey}`, {
        retryAfterMs: data.retryAfterMs,
        resetAt: data.resetAt,
        concurrencyChange: data.concurrencyChange,
      });
    });
    this.rateLimitRegistry.on('ratelimit:learned', (data) => {
      logger.debug(`[Scheduler] Learned rate limits for ${data.rateLimitKey}`, {
        requestLimit: data.requestLimit,
        tokenLimit: data.tokenLimit,
      });
    });
    this.rateLimitRegistry.on('concurrency:decreased', (data) => {
      logger.debug(`[Scheduler] Concurrency decreased for ${data.rateLimitKey}`, {
        previous: data.previous,
        current: data.current,
      });
    });
    this.rateLimitRegistry.on('concurrency:increased', (data) => {
      logger.debug(`[Scheduler] Concurrency increased for ${data.rateLimitKey}`, {
        previous: data.previous,
        current: data.current,
      });
    });

    // Share rate limit registry with redteam provider manager
    // This ensures redteam internal providers also benefit from rate limiting
    redteamProviderManager.setRateLimitRegistry(this.rateLimitRegistry);
  }

  /**
   * Updates metrics and stats after a comparison assertion (select-best or max-score).
   */
  private updateComparisonStats(
    result: TResult,
    passed: boolean,
    reason: string,
    tokensUsed: TokenUsage | undefined,
    wasSuccess: boolean,
    wasScore: number,
    metrics: CompletedPrompt['metrics'] | undefined,
    gradingCached?: boolean,
  ): void {
    if (metrics) {
      metrics.assertPassCount += passed ? 1 : 0;
      metrics.assertFailCount += passed ? 0 : 1;
      if (tokensUsed) {
        updateAssertionMetrics(metrics, tokensUsed, { cached: gradingCached });
      }
      if (!passed && result.score !== wasScore) {
        metrics.score += result.score - wasScore;
      }
    }
    if (wasSuccess && !result.success) {
      result.failureReason = ResultFailureReason.ASSERT;
      result.error = reason;
      if (metrics) {
        metrics.testPassCount -= 1;
        metrics.testFailCount += 1;
      }
      if (this.currentResultKeys.has(getResultIndexKey(result))) {
        this.stats.successes -= 1;
        this.stats.failures += 1;
      }
    }
  }

  private updateComparisonResultCounts(
    result: TResult,
    previous: Pick<TResult, 'success' | 'score' | 'failureReason'>,
    metrics: CompletedPrompt['metrics'] | undefined,
  ) {
    const outcome = (row: typeof previous) =>
      row.success
        ? 'successes'
        : row.failureReason === ResultFailureReason.ERROR
          ? 'errors'
          : 'failures';
    const before = outcome(previous);
    const after = outcome(result);
    if (before !== after) {
      if (this.currentResultKeys.has(getResultIndexKey(result))) {
        this.stats[before]--;
        this.stats[after]++;
      }
      if (metrics) {
        const counts = {
          successes: 'testPassCount',
          failures: 'testFailCount',
          errors: 'testErrorCount',
        } as const;
        metrics[counts[before]]--;
        metrics[counts[after]]++;
      }
    }
    if (metrics) {
      metrics.score += result.score - previous.score;
    }
  }

  private trackRowStats(row: EvaluateResult): void {
    if (row.success) {
      this.stats.successes++;
    } else if (row.failureReason === ResultFailureReason.ERROR) {
      this.stats.errors++;
    } else {
      this.stats.failures++;
    }

    if (row.tokenUsage) {
      accumulateResponseTokenUsage(this.stats.tokenUsage, { tokenUsage: row.tokenUsage });
    }
  }

  // Buffer the authoritative copy of a row only once a DB persistence failure has been
  // observed. Before any failure, rows are recoverable from the streamed JSONL file and
  // the database during finalization; after a failure we can no longer trust the DB, so
  // we keep the in-memory copy of every subsequent row (timeout / deferred-grading rows
  // that never stream) to override stale entries in the recovery merge.
  private trackFinalJsonlResult(row: TResult | EvaluateResult): void {
    if (this.fileWriters.length > 0 && this.store.resultPersistenceFailed) {
      this.store.recordFinalResult(this.store.toEvaluateResult(row));
    }
  }

  private async persistEvalRow(row: EvaluateResult): Promise<void> {
    this.currentResultKeys.add(getResultIndexKey(row));
    setComparisonError(row);
    if (row.testCase.assert?.some((assertion) => assertion.type === 'select-best')) {
      // Capture grader references before a later hook can replace shared nested test fields.
      this.comparisonProviders.set(
        getResultIndexKey(row),
        getComparisonProviders(row.testCase, true),
      );
      row.testCase = {
        ...row.testCase,
        ...(row.testCase.options && {
          options: {
            ...row.testCase.options,
            provider: persistComparisonProvider(row.testCase.options.provider),
          },
        }),
        assert: row.testCase.assert?.map((assertion) =>
          assertion.type === 'select-best'
            ? {
                ...assertion,
                provider: persistComparisonProvider((assertion as Assertion).provider),
              }
            : assertion,
        ),
      };
    }
    try {
      await this.store.appendResult(row);
    } catch (error) {
      this.store.recordResultPersistenceFailure(row);
      const resultSummary = summarizeEvaluateResultForLogging(row);
      logger.error('[Evaluator] Error saving result', {
        error,
        resultSummary,
      });
    }

    for (const writer of this.fileWriters) {
      await writer.write(sanitizeResultForJsonlArtifact(row));
    }
  }

  private updatePromptMetricsForRow({
    derivedMetrics,
    evalStep,
    metrics,
    promptEvalCount,
    row,
  }: {
    derivedMetrics: PreparedDerivedMetrics;
    evalStep: RunEvalOptions;
    metrics: PromptMetrics;
    promptEvalCount: number;
    row: EvaluateResult;
  }): void {
    metrics.score += row.score;
    for (const [key, value] of Object.entries(row.namedScores)) {
      accumulateNamedMetric(metrics, {
        metricName: key,
        metricValue: value,
        gradingResult: row.gradingResult,
        testVars: row.testCase?.vars || {},
      });
    }

    if (derivedMetrics) {
      updateDerivedMetrics(metrics, derivedMetrics, evalStep, promptEvalCount);
    }

    updatePromptResultCounts(metrics, row);
    metrics.assertPassCount +=
      row.gradingResult?.componentResults?.filter((r) => r.pass).length || 0;
    metrics.assertFailCount +=
      row.gradingResult?.componentResults?.filter((r) => !r.pass).length || 0;
    metrics.totalLatencyMs += row.latencyMs || 0;
    accumulateResponseTokenUsage(metrics.tokenUsage, row.response, {
      countCachedAsRequest: (row.tokenUsage?.numRequests ?? 0) > 0,
    });

    if (row.gradingResult?.tokensUsed) {
      accumulateGradingTokenUsage(metrics.tokenUsage, row.gradingResult.tokensUsed, {
        cached: row.gradingResult.metadata?.cachedResponse,
      });
    }

    if (row.incurredCost !== undefined || metrics.incurredCost !== undefined) {
      metrics.incurredCost =
        (metrics.incurredCost ?? metrics.cost) + (row.incurredCost ?? row.cost ?? 0);
    }
    metrics.cost += row.cost || 0;
  }

  private async processEvalStep(
    evalStep: RunEvalOptions,
    index: number,
    {
      deferGrading = false,
      onRowsReady,
      precomputedRows,
      providerCallQueue,
      shouldSkipStaleRows,
    }: ProcessEvalStepOptions,
    context: EvalProcessingContext,
  ) {
    return await withCacheNamespace(
      getRepeatCacheNamespace(evalStep.repeatIndex, evalStep.evaluateOptions),
      async () => {
        const rows =
          precomputedRows ||
          (await this.runEvalStepAfterBeforeEach(evalStep, {
            deferGrading,
            deferredGradingAbortSignal: context.deferredGradingAbortSignal,
            onRowsReady,
            providerCallQueue,
            testSuite: context.testSuite,
          }));

        if (!deferGrading) {
          await this.processEvalRows(evalStep, index, rows, shouldSkipStaleRows, context);
        }
        return rows;
      },
    );
  }

  private async runEvalStepAfterBeforeEach(
    evalStep: RunEvalOptions,
    {
      deferGrading,
      deferredGradingAbortSignal,
      onRowsReady,
      providerCallQueue,
      testSuite,
    }: {
      deferGrading: boolean;
      deferredGradingAbortSignal?: AbortSignal;
      onRowsReady?: () => void;
      providerCallQueue?: ProviderCallQueue;
      testSuite: TestSuite;
    },
  ) {
    const beforeEachOut = await runExtensionHook(testSuite.extensions, 'beforeEach', {
      test: evalStep.test,
    });
    evalStep.test = beforeEachOut.test;

    const rows = await runEvalInternal(
      {
        ...evalStep,
        deferGrading,
        providerCallQueue: deferGrading ? providerCallQueue : undefined,
      },
      { abortSignal: deferredGradingAbortSignal, pauseSignal: this.options.pauseSignal },
    );
    onRowsReady?.();
    return rows;
  }

  private async processEvalRows(
    evalStep: RunEvalOptions,
    index: number,
    rows: EvaluateResult[],
    shouldSkipStaleRows: (() => boolean) | undefined,
    context: EvalProcessingContext,
  ) {
    for (const row of rows) {
      if (shouldSkipStaleRows?.()) {
        return;
      }

      // NOTE: trackCompletedRow runs before afterEach hooks intentionally. It only
      // reads success/failureReason/tokenUsage — not namedScores or metadata — so
      // the hook's mutations don't need to be applied first. If future changes add
      // namedScores tracking here, move afterEach above this call.
      this.trackCompletedRow(evalStep, row, context);
      context.numComplete++;

      // Apply afterEach hook mutations before persisting. Pass a shallow copy
      // so in-place mutations don't corrupt the row on hook failure.
      if (context.testSuite.extensions?.length) {
        try {
          const originalMetadata = row.metadata;
          const originalResponseMetadata = row.response?.metadata;
          const afterEachOut = await runExtensionHook(context.testSuite.extensions, 'afterEach', {
            test: evalStep.test,
            result: {
              ...row,
              namedScores: { ...row.namedScores },
              metadata: { ...row.metadata },
              response: row.response
                ? { ...row.response, metadata: { ...row.response.metadata } }
                : row.response,
            },
          });
          // runExtensionHook sanitizes namedScores via filterFiniteScores;
          // re-sanitize here to also catch in-place mutations that bypass the merge.
          row.namedScores = filterFiniteScores(afterEachOut.result.namedScores);
          // If a hook replaced response.metadata, a legacy top-level metadata.headers copied
          // from the old transport would otherwise persist as stale credentials. Re-sync it.
          row.metadata = synchronizeLegacyTransportHeaders(
            originalMetadata,
            originalResponseMetadata,
            afterEachOut.result.metadata,
            afterEachOut.result.response?.metadata,
          );
          if (row.response && afterEachOut.result.response) {
            row.response.metadata = afterEachOut.result.response.metadata;
          }
        } catch (error) {
          logger.error(
            `afterEach extension hook failed, persisting row without hook modifications`,
            { error },
          );
        }
      }

      await this.persistEvalRow(row);

      const metrics = context.prompts[row.promptIdx].metrics;
      invariant(metrics, 'Expected prompt.metrics to be set');
      this.updatePromptMetricsForRow({
        derivedMetrics: context.derivedMetrics,
        evalStep,
        metrics,
        promptEvalCount: reservePromptEvalCount(context, row.promptIdx),
        row,
      });

      // The row that stops the eval is counted first, like any other error. Otherwise the
      // summary and the exit code would report only the rows that passed before it.
      if (this.abortIfTargetUnavailable(row, context)) {
        break;
      }

      context.options.progressCallback?.(
        context.numComplete,
        context.runEvalOptionsLength,
        index,
        evalStep,
        metrics,
      );
    }
  }

  private trackCompletedRow(
    evalStep: RunEvalOptions,
    row: EvaluateResult,
    context: EvalProcessingContext,
  ) {
    for (const varName of Object.keys(row.vars)) {
      context.vars.add(varName);
    }
    this.trackRowStats(row);
    trackComparisonRowsForEvalStep(
      evalStep,
      row,
      context.rowsWithSelectBestAssertion,
      context.rowsWithMaxScoreAssertion,
    );
    for (const assert of evalStep.test.assert || []) {
      if (assert.type) {
        context.assertionTypes.add(assert.type);
      }
    }
  }

  private abortIfTargetUnavailable(row: EvaluateResult, context: EvalProcessingContext) {
    const httpStatus = getNonTransientTargetStatus(row);
    if (httpStatus === undefined) {
      return false;
    }

    context.targetUnavailable = true;
    context.targetErrorStatus = httpStatus;
    logger.error(
      `Target returned HTTP ${httpStatus}. Aborting scan - this error will not resolve on retry.`,
    );
    context.targetErrorAbortController.abort();
    return true;
  }

  private async processEvalStepWithTimeout(
    evalStep: RunEvalOptions,
    index: number,
    processOptions: Pick<ProcessEvalStepOptions, 'deferGrading' | 'providerCallQueue'>,
    context: EvalProcessingContext,
  ) {
    const { deferGrading = false, providerCallQueue } = processOptions;
    const timeoutMs = context.options.timeoutMs || getEvalTimeoutMs();

    if (timeoutMs <= 0) {
      return await this.processEvalStep(
        evalStep,
        index,
        { deferGrading, providerCallQueue },
        context,
      );
    }

    const abortController = new AbortController();
    const evalStepWithSignal = {
      ...evalStep,
      abortSignal: evalStep.abortSignal
        ? AbortSignal.any([evalStep.abortSignal, abortController.signal])
        : abortController.signal,
    };

    let timeoutId: NodeJS.Timeout | undefined;
    let didTimeout = false;
    const clearEvalStepTimeout = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    };

    try {
      return await Promise.race([
        this.processEvalStep(
          evalStepWithSignal,
          index,
          {
            deferGrading,
            onRowsReady: clearEvalStepTimeout,
            providerCallQueue,
            shouldSkipStaleRows: () => didTimeout,
          },
          context,
        ),
        new Promise<void>((_, reject) => {
          timeoutId = setTimeout(() => {
            didTimeout = true;
            abortController.abort();
            reject(new Error(`Evaluation timed out after ${timeoutMs}ms`));
          }, timeoutMs);
        }),
      ]);
    } catch (error) {
      if (!didTimeout) {
        throw error;
      }
      await this.addEvalStepTimeoutResult(evalStep, index, timeoutMs, error, context);
    } finally {
      evalStep.test = evalStepWithSignal.test;
      clearEvalStepTimeout();
    }
  }

  private async addEvalStepTimeoutResult(
    evalStep: RunEvalOptions,
    index: number,
    timeoutMs: number,
    error: unknown,
    context: EvalProcessingContext,
  ) {
    const sanitizedTestCase = { ...evalStep.test };
    delete (sanitizedTestCase as Partial<AtomicTestCase>).provider;

    const timeoutResult = createEvalStepTimeoutResult(
      evalStep,
      sanitizedTestCase,
      timeoutMs,
      error,
    );
    this.trackFinalJsonlResult(timeoutResult);
    await this.store.appendResult(timeoutResult);
    this.stats.errors++;

    const { metrics } = context.prompts[evalStep.promptIdx];
    if (metrics) {
      metrics.testErrorCount += 1;
      metrics.totalLatencyMs += timeoutMs;
    }

    context.numComplete++;
    context.options.progressCallback?.(
      context.numComplete,
      context.runEvalOptionsLength,
      index,
      evalStep,
      metrics || createTimeoutMetrics(timeoutMs),
    );
  }

  private async executeEvalSteps({
    checkAbort,
    ciProgressReporter,
    combinedAbortSignal,
    concurrentRunEvalOptions,
    evalStepIndexMap,
    globalTimeout,
    groupedRunEvalOptions,
    isEvalTimedOut,
    isWebUI,
    maxEvalTimeMs,
    processingContext,
    processedIndices,
    progressBarManager,
    prompts,
    serialRunEvalOptions,
    shouldGroupGradingByProvider,
  }: {
    checkAbort: () => void;
    ciProgressReporter: CIProgressReporter | null;
    combinedAbortSignal: AbortSignal;
    concurrentRunEvalOptions: RunEvalOptions[];
    evalStepIndexMap: Map<RunEvalOptions, number>;
    globalTimeout?: NodeJS.Timeout;
    groupedRunEvalOptions: RunEvalOptions[];
    isEvalTimedOut: () => boolean;
    isWebUI: boolean;
    maxEvalTimeMs: number;
    processingContext: EvalProcessingContext;
    processedIndices: Set<number>;
    progressBarManager: ProgressBarManager | null;
    prompts: CompletedPrompt[];
    serialRunEvalOptions: RunEvalOptions[];
    shouldGroupGradingByProvider: boolean;
  }): Promise<TEvaluation | undefined> {
    try {
      if (shouldGroupGradingByProvider) {
        await this.runGroupedEvalSteps({
          checkAbort,
          evalStepIndexMap,
          groupedRunEvalOptions,
          isWebUI,
          processingContext,
          processedIndices,
          prompts,
        });
      } else {
        await this.runSerialEvalSteps({
          checkAbort,
          evalStepIndexMap,
          isWebUI,
          processingContext,
          processedIndices,
          prompts,
          serialRunEvalOptions,
        });
        await this.runConcurrentEvalSteps({
          checkAbort,
          concurrentRunEvalOptions,
          evalStepIndexMap,
          processingContext,
          processedIndices,
          prompts,
        });
      }
      checkAbort();
    } catch (err) {
      if (!combinedAbortSignal.aborted) {
        cleanupProgressAfterError(progressBarManager, ciProgressReporter, err);
        throw err;
      }

      if (isEvalTimedOut()) {
        logger.warn(`Evaluation stopped after reaching max duration (${maxEvalTimeMs}ms)`);
      } else if (!processingContext.targetUnavailable) {
        return this.saveInterruptedEval({
          ciProgressReporter,
          globalTimeout,
          processingContext,
          progressBarManager,
          prompts,
        });
      }
    }

    return this.saveTargetUnavailableEvalIfNeeded({
      ciProgressReporter,
      globalTimeout,
      processingContext,
      progressBarManager,
      prompts,
    });
  }

  private async runGroupedEvalSteps({
    checkAbort,
    evalStepIndexMap,
    groupedRunEvalOptions,
    isWebUI,
    processingContext,
    processedIndices,
    prompts,
  }: {
    checkAbort: () => void;
    evalStepIndexMap: Map<RunEvalOptions, number>;
    groupedRunEvalOptions: RunEvalOptions[];
    isWebUI: boolean;
    processingContext: EvalProcessingContext;
    processedIndices: Set<number>;
    prompts: CompletedPrompt[];
  }): Promise<void> {
    const providerCallQueue = new ProviderGroupedCallQueue();
    const groupedRows: GroupedRows[] = [];
    let lastPromptsFlush = 0;
    const flushPromptMetrics = async () => {
      const now = Date.now();
      if (now - lastPromptsFlush < PROMPTS_FLUSH_INTERVAL_MS) {
        return;
      }

      lastPromptsFlush = now;
      await this.store.appendPrompts(prompts);
    };
    const processGroupedRows = async ({ evalStep, index, rows }: GroupedRows) => {
      await this.processEvalStep(evalStep, index, { precomputedRows: rows }, processingContext);
      processedIndices.add(index);
      await flushPromptMetrics();
    };
    const flushGroupedRows = async () => {
      await runGroupedGradingForRows(groupedRows, providerCallQueue, processGroupedRows);
      groupedRows.length = 0;
    };

    try {
      for (const evalStep of groupedRunEvalOptions) {
        checkAbort();
        logWebUiEvalStepStart(isWebUI, processingContext, evalStep);
        const idx = evalStepIndexMap.get(evalStep)!;
        const shouldDeferEvalStepGrading = shouldDeferGradingForTest(evalStep.test);
        const rows =
          (await this.processEvalStepWithTimeout(
            evalStep,
            idx,
            {
              deferGrading: shouldDeferEvalStepGrading,
              providerCallQueue,
            },
            processingContext,
          )) || [];

        if (
          await this.handleGroupedRowsAfterRun({
            evalStep,
            groupedRows,
            idx,
            processGroupedRows,
            processedIndices,
            flushPromptMetrics,
            rows,
            shouldDeferEvalStepGrading,
            processingContext,
          })
        ) {
          break;
        }

        // Release clips and workspaces before collecting another target response.
        if (
          rows.some(
            (row) =>
              (row.response?.audio || row.response?.metadata?.workingDir) &&
              deferredGradingPromises.has(row),
          )
        ) {
          await flushGroupedRows();
        }
      }
    } catch (error) {
      // Best-effort: flush any rows whose target calls completed but whose
      // deferred grading hadn't started/completed yet, so a mid-eval interrupt
      // doesn't lose the already-computed target outputs. Failures here must
      // not shadow the original error, so we log and rethrow the outer error.
      const pendingRowCount = groupedRows.reduce((sum, entry) => sum + entry.rows.length, 0);
      try {
        await flushGroupedRows();
      } catch (flushError) {
        logger.warn('Failed to flush grouped rows after error; target outputs may be lost', {
          error: flushError instanceof Error ? flushError.message : String(flushError),
          pendingRowCount,
        });
      }
      throw error;
    }

    await flushGroupedRows();
  }

  private async handleGroupedRowsAfterRun({
    evalStep,
    groupedRows,
    idx,
    processGroupedRows,
    processedIndices,
    flushPromptMetrics,
    rows,
    shouldDeferEvalStepGrading,
    processingContext,
  }: {
    evalStep: RunEvalOptions;
    groupedRows: GroupedRows[];
    idx: number;
    processGroupedRows: (entry: GroupedRows) => Promise<void>;
    processedIndices: Set<number>;
    flushPromptMetrics: () => Promise<void>;
    rows: EvaluateResult[];
    shouldDeferEvalStepGrading: boolean;
    processingContext: EvalProcessingContext;
  }) {
    if (!shouldDeferEvalStepGrading) {
      processedIndices.add(idx);
      await flushPromptMetrics();
      return processingContext.targetUnavailable;
    }
    if (rows.length === 0) {
      processedIndices.add(idx);
      return false;
    }
    if (rows.some((row) => deferredGradingPromises.has(row))) {
      groupedRows.push({ evalStep, index: idx, rows });
      return rows.some((row) => getNonTransientTargetStatus(row) !== undefined);
    }

    await processGroupedRows({ evalStep, index: idx, rows });
    return processingContext.targetUnavailable;
  }

  private async runSerialEvalSteps({
    checkAbort,
    evalStepIndexMap,
    isWebUI,
    processingContext,
    processedIndices,
    prompts,
    serialRunEvalOptions,
  }: {
    checkAbort: () => void;
    evalStepIndexMap: Map<RunEvalOptions, number>;
    isWebUI: boolean;
    processingContext: EvalProcessingContext;
    processedIndices: Set<number>;
    prompts: CompletedPrompt[];
    serialRunEvalOptions: RunEvalOptions[];
  }) {
    let lastPromptsFlush = 0;
    for (const evalStep of serialRunEvalOptions) {
      checkAbort();
      logWebUiEvalStepStart(isWebUI, processingContext, evalStep);
      const idx = evalStepIndexMap.get(evalStep)!;
      await this.processEvalStepWithTimeout(evalStep, idx, {}, processingContext);
      processedIndices.add(idx);
      const now = Date.now();
      if (now - lastPromptsFlush >= PROMPTS_FLUSH_INTERVAL_MS) {
        lastPromptsFlush = now;
        await this.store.appendPrompts(prompts);
      }
    }
  }

  private async runConcurrentEvalSteps({
    checkAbort,
    concurrentRunEvalOptions,
    evalStepIndexMap,
    processingContext,
    processedIndices,
    prompts,
  }: {
    checkAbort: () => void;
    concurrentRunEvalOptions: RunEvalOptions[];
    evalStepIndexMap: Map<RunEvalOptions, number>;
    processingContext: EvalProcessingContext;
    processedIndices: Set<number>;
    prompts: CompletedPrompt[];
  }) {
    let lastPromptsFlush = 0;
    await async.forEachOfLimit(
      concurrentRunEvalOptions,
      processingContext.concurrency,
      async (evalStep) => {
        checkAbort();
        const idx = evalStepIndexMap.get(evalStep)!;
        await this.processEvalStepWithTimeout(evalStep, idx, {}, processingContext);
        processedIndices.add(idx);
        const now = Date.now();
        if (now - lastPromptsFlush >= PROMPTS_FLUSH_INTERVAL_MS) {
          lastPromptsFlush = now;
          await this.store.appendPrompts(prompts);
        }
      },
    );
  }

  private async saveInterruptedEval({
    ciProgressReporter,
    globalTimeout,
    processingContext,
    progressBarManager,
    prompts,
  }: {
    ciProgressReporter: CIProgressReporter | null;
    globalTimeout?: NodeJS.Timeout;
    processingContext: EvalProcessingContext;
    progressBarManager: ProgressBarManager | null;
    prompts: CompletedPrompt[];
  }) {
    logger.info('Evaluation interrupted, saving progress...');
    if (globalTimeout) {
      clearTimeout(globalTimeout);
    }
    progressBarManager?.removeLogInterceptor();
    progressBarManager?.stop();
    ciProgressReporter?.finish();
    this.store.setVars(Array.from(processingContext.vars));
    await this.store.appendPrompts(prompts);
    return this.store.evaluation;
  }

  private async saveTargetUnavailableEvalIfNeeded({
    ciProgressReporter,
    globalTimeout,
    processingContext,
    progressBarManager,
    prompts,
  }: {
    ciProgressReporter: CIProgressReporter | null;
    globalTimeout?: NodeJS.Timeout;
    processingContext: EvalProcessingContext;
    progressBarManager: ProgressBarManager | null;
    prompts: CompletedPrompt[];
  }) {
    if (!processingContext.targetUnavailable) {
      return undefined;
    }
    if (globalTimeout) {
      clearTimeout(globalTimeout);
    }
    progressBarManager?.stop();
    ciProgressReporter?.error(`Target unavailable (HTTP ${processingContext.targetErrorStatus})`);
    this.store.setVars(Array.from(processingContext.vars));
    await this.store.appendPrompts(prompts);
    return this.store.evaluation;
  }

  private async processComparisonAssertions({
    ciProgressReporter,
    isEvalTimedOut,
    isWebUI,
    progressBarManager,
    prompts,
    providerAbortSignal,
    repeatCacheContextByTestIdx,
    rowsWithMaxScoreAssertion,
    rowsWithSelectBestAssertion,
    runEvalOptions,
  }: {
    ciProgressReporter: CIProgressReporter | null;
    isEvalTimedOut: () => boolean;
    isWebUI: boolean;
    progressBarManager: ProgressBarManager | null;
    prompts: CompletedPrompt[];
    providerAbortSignal?: AbortSignal;
    repeatCacheContextByTestIdx: Map<number, RepeatCacheContext>;
    rowsWithMaxScoreAssertion: Set<number>;
    rowsWithSelectBestAssertion: Set<number>;
    runEvalOptions: RunEvalOptions[];
  }) {
    const compareRowsCount = rowsWithSelectBestAssertion.size + rowsWithMaxScoreAssertion.size;
    updateComparisonReporterTotals({
      ciProgressReporter,
      compareRowsCount,
      progressBarManager,
      runEvalOptions,
    });

    const pendingSelectBest = new Set(rowsWithSelectBestAssertion);
    const pendingMaxScore = new Set(rowsWithMaxScoreAssertion);
    try {
      const compareCount = await this.processSelectBestAssertions({
        ciProgressReporter,
        compareRowsCount,
        isWebUI,
        progressBarManager,
        prompts,
        providerAbortSignal,
        repeatCacheContextByTestIdx,
        rowsWithSelectBestAssertion: pendingSelectBest,
        runEvalOptions,
      });

      await this.processMaxScoreAssertions({
        ciProgressReporter,
        compareCount,
        isWebUI,
        progressBarManager,
        prompts,
        providerAbortSignal,
        rowsWithMaxScoreAssertion: pendingMaxScore,
        runEvalOptions,
      });
      providerAbortSignal?.throwIfAborted();
    } catch (error) {
      if (!isGradingAbort(error, providerAbortSignal)) {
        throw error;
      }
      await this.markComparisonRowsAborted(
        new Set([...pendingSelectBest, ...pendingMaxScore]),
        prompts,
        error,
        providerAbortSignal,
      );
      if (!isEvalTimedOut()) {
        return false;
      }
      logger.debug('Comparison grading stopped at the evaluation deadline');
    }
    return true;
  }

  private async markComparisonRowsAborted(
    testIndexes: Set<number>,
    prompts: CompletedPrompt[],
    error: unknown,
    abortSignal?: AbortSignal,
  ) {
    for (const testIdx of testIndexes) {
      const results = await this.getResultsToCompare(testIdx);
      for (const result of results) {
        if (result.failureReason === ResultFailureReason.ERROR) {
          continue;
        }
        const metrics = prompts[result.promptIdx]?.metrics;
        const previous = {
          success: result.success,
          score: result.score,
          failureReason: result.failureReason,
          error: result.error,
        };
        setComparisonError(result, previous);
        const completedNamedScores = result.namedScores;
        applyGradingError(result, error, abortSignal);
        // Earlier per-row assertions finished before the comparison was interrupted.
        result.namedScores = completedNamedScores;
        this.updateComparisonResultCounts(result, previous, metrics);
        this.trackFinalJsonlResult(result);
        if (this.store.persisted && !this.store.hasResultPersistenceFailure(result)) {
          await this.store.saveResult(result);
        }
      }
    }
  }

  private async processSelectBestAssertions({
    ciProgressReporter,
    compareRowsCount,
    isWebUI,
    progressBarManager,
    prompts,
    providerAbortSignal,
    repeatCacheContextByTestIdx,
    rowsWithSelectBestAssertion,
    runEvalOptions,
  }: {
    ciProgressReporter: CIProgressReporter | null;
    compareRowsCount: number;
    isWebUI: boolean;
    progressBarManager: ProgressBarManager | null;
    prompts: CompletedPrompt[];
    providerAbortSignal?: AbortSignal;
    repeatCacheContextByTestIdx: Map<number, RepeatCacheContext>;
    rowsWithSelectBestAssertion: Set<number>;
    runEvalOptions: RunEvalOptions[];
  }) {
    let compareCount = 0;
    for (const testIdx of rowsWithSelectBestAssertion) {
      providerAbortSignal?.throwIfAborted();
      compareCount++;
      await this.processSelectBestAssertionForTest({
        ciProgressReporter,
        compareCount,
        compareRowsCount,
        isWebUI,
        progressBarManager,
        prompts,
        providerAbortSignal,
        repeatCacheContextByTestIdx,
        runEvalOptions,
        testIdx,
      });
      rowsWithSelectBestAssertion.delete(testIdx);
    }
    return compareCount;
  }

  private async processSelectBestAssertionForTest({
    ciProgressReporter,
    compareCount,
    compareRowsCount,
    isWebUI,
    progressBarManager,
    prompts,
    providerAbortSignal,
    repeatCacheContextByTestIdx,
    runEvalOptions,
    testIdx,
  }: {
    ciProgressReporter: CIProgressReporter | null;
    compareCount: number;
    compareRowsCount: number;
    isWebUI: boolean;
    progressBarManager: ProgressBarManager | null;
    prompts: CompletedPrompt[];
    providerAbortSignal?: AbortSignal;
    repeatCacheContextByTestIdx: Map<number, RepeatCacheContext>;
    runEvalOptions: RunEvalOptions[];
    testIdx: number;
  }) {
    if (isWebUI) {
      logger.info(`Running model-graded comparison ${compareCount} of ${compareRowsCount}...`);
    }

    const resultsToCompare = await this.getResultsToCompare(testIdx);
    if (resultsToCompare.length === 0) {
      logger.warn(`Expected results to be found for test index ${testIdx}`);
      return;
    }

    if (
      cliState.resume &&
      resultsToCompare.every((result) => hasCompletedComparison(result, 'select-best'))
    ) {
      return;
    }

    const firstResult = resultsToCompare[0];
    const savedTest = firstResult.testCase;
    const assertion = savedTest.assert?.find((a): a is Assertion => a.type === 'select-best');
    if (!assertion) {
      return;
    }
    let gradingResults: GradingResult[];
    try {
      const providers = this.comparisonProviders.get(getResultIndexKey(firstResult));
      // Persisted rows retain each column's hook-adjusted criteria and vars. Only grader
      // references and redacted credentials need to come from the current configuration.
      const comparisonTestCase = {
        ...savedTest,
        options: {
          ...savedTest.options,
          provider: undefined,
        },
      };
      const compareAssertion = {
        ...assertion,
        provider: restoreComparisonProvider(
          assertion.provider || savedTest.options?.provider,
          providers?.provider,
          providers?.currentResult ?? false,
        ),
      };

      const repeatCacheContext = repeatCacheContextByTestIdx.get(testIdx);
      const outputs = resultsToCompare.map((r) => r.response?.output || '');
      gradingResults = await withCacheNamespace(
        repeatCacheContext
          ? getRepeatCacheNamespace(
              repeatCacheContext.repeatIndex,
              repeatCacheContext.evaluateOptions,
            )
          : undefined,
        () =>
          withProviderCallExecutionContext(
            { abortSignal: providerAbortSignal, rateLimitRegistry: this.rateLimitRegistry },
            () =>
              runCompareAssertion(
                comparisonTestCase,
                compareAssertion,
                outputs,
                this.getComparisonCallApiContext(resultsToCompare[0], repeatCacheContext),
              ),
          ),
      );
    } catch (error) {
      if (isGradingAbort(error, providerAbortSignal)) {
        throw error;
      }
      const graderId = comparisonProviderId(assertion.provider ?? savedTest.options?.provider);
      // Provider errors can contain credentials or config source snippets, so saved results get
      // a generic reason. The run's log file records debug messages even without --verbose, so
      // the cause is logged only when debug output was asked for.
      if (isDebugEnabled()) {
        logger.debug('[Evaluator] select-best grading failed', {
          error: error instanceof Error ? (error.stack ?? error.message) : String(error),
          graderId,
          testIdx,
        });
      }
      const message =
        'Check the grader configuration and credentials. Supply a grader configuration matching the saved result to resume, or rerun the evaluation. Run with --verbose to log the underlying error.';
      const reason = `${COMPARISON_ERROR_PREFIX}${graderId ? ` (${graderId})` : ''}: ${message}`;
      gradingResults = [];
      for (const result of resultsToCompare) {
        if (result.failureReason === ResultFailureReason.ERROR && !getComparisonError(result)) {
          continue;
        }
        const previous = {
          success: result.success,
          score: result.score,
          failureReason: result.failureReason,
        };
        // Keep the existing assertion verdict and outcome for a successful retry.
        if (!getComparisonError(result)) {
          setComparisonError(result, { ...previous, error: result.error });
        }
        result.error = reason;
        result.failureReason = ResultFailureReason.ERROR;
        result.success = false;
        result.score = 0;
        this.updateComparisonResultCounts(result, previous, prompts[result.promptIdx]?.metrics);
        this.trackFinalJsonlResult(result);
        if (this.store.persisted && !this.store.hasResultPersistenceFailure(result)) {
          await this.store.saveResult(result);
        }
      }
    }

    for (let index = 0; index < gradingResults.length; index++) {
      await this.applySelectBestGradingResult({
        gradingResult: gradingResults[index],
        metrics: prompts[resultsToCompare[index].promptIdx]?.metrics,
        result: resultsToCompare[index],
      });
    }

    updateComparisonReporterProgress({
      ciProgressReporter,
      compareCount,
      isWebUI,
      label: `Model-graded comparison #${compareCount} of ${compareRowsCount}`,
      progressBarManager,
      promptRaw: resultsToCompare[0].prompt.raw,
      runEvalOptions,
    });
  }

  private async processMaxScoreAssertions({
    ciProgressReporter,
    compareCount,
    isWebUI,
    progressBarManager,
    prompts,
    providerAbortSignal,
    rowsWithMaxScoreAssertion,
    runEvalOptions,
  }: {
    ciProgressReporter: CIProgressReporter | null;
    compareCount: number;
    isWebUI: boolean;
    progressBarManager: ProgressBarManager | null;
    prompts: CompletedPrompt[];
    providerAbortSignal?: AbortSignal;
    rowsWithMaxScoreAssertion: Set<number>;
    runEvalOptions: RunEvalOptions[];
  }) {
    if (rowsWithMaxScoreAssertion.size > 0) {
      logger.info(`Processing ${rowsWithMaxScoreAssertion.size} max-score assertions...`);
    }

    let currentCompareCount = compareCount;
    for (const testIdx of rowsWithMaxScoreAssertion) {
      providerAbortSignal?.throwIfAborted();
      currentCompareCount++;
      await this.processMaxScoreAssertionForTest({
        ciProgressReporter,
        compareCount: currentCompareCount,
        isWebUI,
        progressBarManager,
        prompts,
        runEvalOptions,
        testIdx,
      });
      rowsWithMaxScoreAssertion.delete(testIdx);
    }
  }

  private async processMaxScoreAssertionForTest({
    ciProgressReporter,
    compareCount,
    isWebUI,
    progressBarManager,
    prompts,
    runEvalOptions,
    testIdx,
  }: {
    ciProgressReporter: CIProgressReporter | null;
    compareCount: number;
    isWebUI: boolean;
    progressBarManager: ProgressBarManager | null;
    prompts: CompletedPrompt[];
    runEvalOptions: RunEvalOptions[];
    testIdx: number;
  }) {
    const resultsToCompare = await this.getResultsToCompare(testIdx);
    if (resultsToCompare.length === 0) {
      logger.warn(`Expected results to be found for test index ${testIdx}`);
      return;
    }

    if (
      cliState.resume &&
      resultsToCompare.every((result) => hasCompletedComparison(result, 'max-score'))
    ) {
      return;
    }

    const maxScoreAssertion = resultsToCompare[0].testCase.assert?.find(
      (a) => a.type === 'max-score',
    ) as Assertion;
    if (!maxScoreAssertion) {
      return;
    }

    const outputs = resultsToCompare.map((r) => r.response?.output || '');
    const maxScoreGradingResults = await selectMaxScore(
      outputs,
      resultsToCompare.map((result) => ({
        gradingResult: result.gradingResult,
        unavailable:
          result.failureReason === ResultFailureReason.ERROR && !getComparisonError(result),
      })),
      maxScoreAssertion,
    );

    updateComparisonReporterProgress({
      ciProgressReporter,
      compareCount,
      isWebUI,
      label: `Max-score assertion for test #${testIdx}`,
      progressBarManager,
      promptRaw: resultsToCompare[0].prompt.raw,
      runEvalOptions,
    });

    for (let index = 0; index < resultsToCompare.length; index++) {
      await this.applyMaxScoreGradingResult({
        gradingResult: {
          ...maxScoreGradingResults[index],
          assertion: maxScoreAssertion,
        },
        metrics: prompts[resultsToCompare[index].promptIdx]?.metrics,
        result: resultsToCompare[index],
      });
    }
  }

  private async getResultsToCompare(testIdx: number): Promise<TResult[]> {
    let base = this.store.persisted
      ? await this.store.readResultsByTestIdx(testIdx)
      : this.store.results.filter((r) => r.testIdx === testIdx);
    // Retry keeps old errors until new results are saved. Compare only their replacements.
    if (this.retryErrorResultIds.size > 0) {
      base = base.filter(
        (result) =>
          !(
            'id' in result &&
            typeof result.id === 'string' &&
            this.retryErrorResultIds.has(result.id)
          ),
      );
    }
    if (!this.store.resultPersistenceFailed) {
      return base;
    }
    // A row that failed to persist is absent from the database (and from `results`), so it
    // would otherwise be excluded from the comparison — skewing the winner for its siblings
    // and leaving the failed row with stale, pre-comparison grading. Merge it back in.
    const failed = await this.store.readFailedResultsByTestIdx(testIdx);
    if (failed.length === 0) {
      return base;
    }
    const seen = new Set(base.map(getResultIndexKey));
    return [...base, ...failed.filter((r) => !seen.has(getResultIndexKey(r)))].sort(
      (a, b) => a.promptIdx - b.promptIdx,
    );
  }

  private getComparisonCallApiContext(
    firstResult: TResult,
    repeatCacheContext?: RepeatCacheContext,
  ): CallApiContextParams {
    const providerId = firstResult.provider.id;
    const originalProvider = this.testSuite.providers.find((p) => p.id() === providerId);
    return {
      getCache,
      ...(originalProvider && { originalProvider }),
      prompt: firstResult.prompt,
      promptIdx: firstResult.promptIdx,
      repeatIndex: repeatCacheContext?.repeatIndex,
      testIdx: firstResult.testIdx,
      vars: firstResult.testCase.vars || {},
    };
  }

  // Shared tail for the comparison graders: record the pass/score transition, capture the
  // canonical row for JSONL finalization, and persist (unless this row already failed to
  // persist, in which case re-saving would just re-throw). Capture the previous outcome
  // before merging so retries can update error counts in both directions.
  private async finalizeComparisonGrading({
    gradingResult,
    metrics,
    result,
    wasSuccess,
    wasScore,
  }: {
    gradingResult: GradingResult;
    metrics: CompletedPrompt['metrics'] | undefined;
    result: TResult;
    wasSuccess: boolean;
    wasScore: number;
  }) {
    this.updateComparisonStats(
      result,
      gradingResult.pass,
      gradingResult.reason || '',
      gradingResult.tokensUsed,
      wasSuccess,
      wasScore,
      metrics,
      gradingResult.metadata?.cachedResponse,
    );
    if (
      result.response?.cached &&
      result.response.tokenUsage &&
      (result.response.tokenUsage.numRequests ?? 0) === 0 &&
      gradingResult.tokensUsed
    ) {
      const comparisonUsage = createEmptyAssertions();
      accumulateGradingRequest(comparisonUsage, gradingResult.tokensUsed, {
        cached: gradingResult.metadata?.cachedResponse,
      });
      if ((comparisonUsage.numRequests ?? 0) > 0) {
        result.response.tokenUsage.numRequests = 1;
        const evaluatedResult = this.store.toEvaluateResult(result);
        if (evaluatedResult.tokenUsage) {
          evaluatedResult.tokenUsage.numRequests = Math.max(
            evaluatedResult.tokenUsage.numRequests ?? 0,
            1,
          );
        }
        this.stats.tokenUsage.numRequests = (this.stats.tokenUsage.numRequests ?? 0) + 1;
        if (metrics) {
          metrics.tokenUsage.numRequests = (metrics.tokenUsage.numRequests ?? 0) + 1;
        }
      }
    }
    this.trackFinalJsonlResult(result);
    if (this.store.persisted && !this.store.hasResultPersistenceFailure(result)) {
      await this.store.saveResult(result);
    }
  }

  private restoreComparisonResult(
    result: TResult,
    metrics: CompletedPrompt['metrics'] | undefined,
  ) {
    if (result.failureReason === ResultFailureReason.ERROR) {
      const saved = getComparisonError(result);
      if (!saved) {
        return false;
      }
      const previous = {
        success: result.success,
        score: result.score,
        failureReason: result.failureReason,
      };
      result.success = saved.success;
      result.score = saved.score;
      result.failureReason = saved.failureReason;
      result.error = saved.error;
      setComparisonError(result);
      this.updateComparisonResultCounts(result, previous, metrics);
    }
    return true;
  }

  private async applySelectBestGradingResult({
    gradingResult,
    metrics,
    result,
  }: {
    gradingResult: GradingResult;
    metrics: CompletedPrompt['metrics'] | undefined;
    result: TResult;
  }) {
    if (!this.restoreComparisonResult(result, metrics)) {
      return;
    }
    const wasSuccess = result.success;
    const wasScore = result.score;
    mergeSelectBestGradingResult(result, gradingResult, this.stats.tokenUsage);
    await this.finalizeComparisonGrading({ gradingResult, metrics, result, wasSuccess, wasScore });
  }

  private async applyMaxScoreGradingResult({
    gradingResult,
    metrics,
    result,
  }: {
    gradingResult: GradingResult;
    metrics: CompletedPrompt['metrics'] | undefined;
    result: TResult;
  }) {
    // A failed select-best grader must remain an error until that grader succeeds.
    if (
      result.failureReason === ResultFailureReason.ERROR &&
      !result.error?.startsWith(ABORTED_GRADING_PREFIX)
    ) {
      return;
    }
    if (!this.restoreComparisonResult(result, metrics)) {
      return;
    }
    const wasSuccess = result.success;
    const wasScore = result.score;
    mergeMaxScoreGradingResult(result, gradingResult);
    await this.finalizeComparisonGrading({ gradingResult, metrics, result, wasSuccess, wasScore });
  }

  private async finalizeEvaluation({
    assertionTypes,
    ciProgressReporter,
    concurrency,
    evalTimedOut,
    globalTimeout,
    maxEvalTimeMs,
    options,
    processedIndices,
    progressBarManager,
    prompts,
    runEvalOptions,
    startTime,
    testSuite,
    tests,
    usesConversationVar,
    varNames,
    vars,
  }: {
    assertionTypes: Set<string>;
    ciProgressReporter: CIProgressReporter | null;
    concurrency: number;
    evalTimedOut: boolean;
    globalTimeout?: NodeJS.Timeout;
    maxEvalTimeMs: number;
    options: InternalEvaluateOptions;
    processedIndices: Set<number>;
    progressBarManager: ProgressBarManager | null;
    prompts: CompletedPrompt[];
    runEvalOptions: RunEvalOptions[];
    startTime: number;
    testSuite: TestSuite;
    tests: AtomicTestCase[];
    usesConversationVar: boolean;
    varNames: Set<string>;
    vars: Set<string>;
  }) {
    await this.store.appendPrompts(prompts);
    cleanupProgressReporters(progressBarManager, ciProgressReporter);

    if (globalTimeout) {
      clearTimeout(globalTimeout);
    }
    if (evalTimedOut) {
      await this.addMaxDurationTimeoutResults({
        maxEvalTimeMs,
        processedIndices,
        prompts,
        runEvalOptions,
        startTime,
      });
    }

    this.store.setVars(Array.from(vars));
    await this.runAfterAllExtensions(testSuite);
    this.recordEvalTelemetry({
      assertionTypes,
      concurrency,
      evalTimedOut,
      options,
      prompts,
      startTime,
      testSuite,
      tests,
      usesConversationVar,
      varNames,
    });

    if (this.store.persisted) {
      await this.store.save();
    }
  }

  private async addMaxDurationTimeoutResults({
    maxEvalTimeMs,
    processedIndices,
    prompts,
    runEvalOptions,
    startTime,
  }: {
    maxEvalTimeMs: number;
    processedIndices: Set<number>;
    prompts: CompletedPrompt[];
    runEvalOptions: RunEvalOptions[];
    startTime: number;
  }) {
    for (let i = 0; i < runEvalOptions.length; i++) {
      if (processedIndices.has(i)) {
        continue;
      }
      const evalStep = runEvalOptions[i];
      const timeoutResult = createMaxDurationTimeoutResult(evalStep, maxEvalTimeMs, startTime);
      this.trackFinalJsonlResult(timeoutResult);
      await this.store.appendResult(timeoutResult);
      this.stats.errors++;
      const { metrics } = prompts[evalStep.promptIdx];
      if (metrics) {
        metrics.testErrorCount += 1;
        metrics.totalLatencyMs += timeoutResult.latencyMs;
      }
    }
  }

  private async runAfterAllExtensions(testSuite: TestSuite) {
    if (!testSuite.extensions?.length) {
      return;
    }

    const allResults = await this.store.readResults();
    const resultsForExtension = allResults.map((result) => this.store.toEvaluateResult(result));

    await runExtensionHook(testSuite.extensions, 'afterAll', {
      prompts: this.store.prompts,
      results: resultsForExtension,
      suite: testSuite,
      evalId: this.store.id,
      config: this.store.config,
    });
  }

  private recordEvalTelemetry({
    assertionTypes,
    concurrency,
    evalTimedOut,
    options,
    prompts,
    startTime,
    testSuite,
    tests,
    usesConversationVar,
    varNames,
  }: {
    assertionTypes: Set<string>;
    concurrency: number;
    evalTimedOut: boolean;
    options: InternalEvaluateOptions;
    prompts: CompletedPrompt[];
    startTime: number;
    testSuite: TestSuite;
    tests: AtomicTestCase[];
    usesConversationVar: boolean;
    varNames: Set<string>;
  }) {
    const totalEvalTimeMs = Date.now() - startTime;
    this.store.setDurationMs(totalEvalTimeMs);

    const assertionStats = getAssertionTelemetryStats(prompts, assertionTypes);
    const avgLatencyMs = getAverageLatencyMs(this.store.results);
    const timeoutOccurred =
      evalTimedOut ||
      this.store.results.some(
        (r) => r.failureReason === ResultFailureReason.ERROR && r.error?.includes('timed out'),
      );

    telemetry.record('eval_ran', {
      numPrompts: prompts.length,
      numTests: this.stats.successes + this.stats.failures + this.stats.errors,
      numRequests: this.stats.tokenUsage.numRequests || 0,
      numResults: this.store.results.length,
      numVars: varNames.size,
      numProviders: testSuite.providers.length,
      numRepeat: options.repeat || 1,
      providerPrefixes: getProviderPrefixes(testSuite).sort(),
      assertionTypes: Array.from(assertionTypes).sort(),
      eventSource: options.eventSource || 'default',
      ci: isCI(),
      hasAnyPass: this.stats.successes > 0,
      numPasses: this.stats.successes,
      numFails: this.stats.failures,
      numErrors: this.stats.errors,
      totalEvalTimeMs,
      avgLatencyMs: Math.round(avgLatencyMs),
      concurrencyUsed: concurrency,
      timeoutOccurred,
      totalTokens: this.stats.tokenUsage.total,
      promptTokens: this.stats.tokenUsage.prompt,
      completionTokens: this.stats.tokenUsage.completion,
      cachedTokens: this.stats.tokenUsage.cached,
      totalCost: prompts.reduce((acc, p) => acc + (p.metrics?.cost || 0), 0),
      totalRequests: this.stats.tokenUsage.numRequests,
      ...assertionStats,
      usesConversationVar,
      usesTransforms: usesTransforms(testSuite, tests),
      usesScenarios: Boolean(testSuite.scenarios?.length),
      usesExampleProvider: usesExampleProvider(testSuite),
      isPromptfooSampleTarget: testSuite.providers.some(isPromptfooSampleTarget),
      isRedteam: Boolean(options.isRedteam),
      hasOpenAiProviders: testSuite.providers.some((p) => isOpenAiProvider(p.id())),
      hasAnthropicProviders: testSuite.providers.some((p) => isAnthropicProvider(p.id())),
      hasGoogleProviders: testSuite.providers.some((p) => isGoogleProvider(p.id())),
    });
  }

  private async _runEvaluation({
    startTime,
    maxEvalTimeMs,
    providerAbortSignal,
    deferredGradingAbortSignal,
    globalTimeout,
    isTimedOut,
  }: EvaluationDeadline): Promise<TEvaluation> {
    const { options } = this;
    let { testSuite } = this;

    const processedIndices = new Set<number>();

    const targetErrorAbortController = new AbortController();

    // Progress reporters declared here for cleanup in finally block
    let ciProgressReporter: CIProgressReporter | null = null;
    let progressBarManager: ProgressBarManager | null = null;

    // Target errors stop the evaluator loop; only caller cancellation and the timeout reach providers.
    const combinedAbortSignal = providerAbortSignal
      ? AbortSignal.any([providerAbortSignal, targetErrorAbortController.signal])
      : targetErrorAbortController.signal;

    const vars = new Set<string>();
    const checkAbort = () => {
      if (combinedAbortSignal.aborted) {
        throw new Error('Operation cancelled');
      }
    };

    if (!options.silent) {
      logger.info(`Starting evaluation ${this.store.id}`);
    }

    // Add abort checks at key points
    checkAbort();

    const assertionTypes = new Set<string>();
    const rowsWithSelectBestAssertion = new Set<number>();
    const rowsWithMaxScoreAssertion = new Set<number>();

    const restorePromptColumns = Boolean(
      options.restorePromptColumns &&
        cliState.resume &&
        this.store.persisted &&
        this.store.prompts.length > 0,
    );
    const recovery =
      restorePromptColumns && testSuite.extensions?.length
        ? preparePromptRecovery(testSuite, this.store)
        : undefined;
    if (recovery) {
      testSuite = { ...testSuite, prompts: recovery.hookPrompts };
    }
    testSuite = await runBeforeAllExtensions(testSuite);
    const derivedMetrics = prepareDerivedMetrics(testSuite.derivedMetrics);
    if (
      !restorePromptColumns &&
      !(await maybeAddGeneratedPrompts(testSuite, options, providerAbortSignal))
    ) {
      return this.store.evaluation;
    }

    let tests = buildTestsFromSuite(testSuite);
    tests = filterByRange(tests, options.filterRange, warnEmptyFilterRange);
    const { prompts, columnsByProvider } = buildCompletedPrompts(
      testSuite,
      this.store,
      restorePromptColumns,
      tests,
      recovery,
    );
    await this.store.appendPrompts(prompts);
    maybeEmitAzureOpenAiWarning(testSuite, tests);

    const varNames = await prepareTestVariables(tests, testSuite);
    // Preserve configured/transformed variable order before concurrent rows finish.
    // Result-only variables discovered at runtime are appended as they appear.
    for (const varName of varNames) {
      vars.add(varName);
    }
    let concurrency = options.maxConcurrency || DEFAULT_MAX_CONCURRENCY;
    let runEvalOptions = await buildRunEvalOptions({
      concurrency,
      conversations: this.conversations,
      evalId: this.store.id,
      options,
      columnsByProvider,
      providerAbortSignal,
      rateLimitRegistry: this.rateLimitRegistry,
      registers: this.registers,
      testSuite,
      tests,
    });
    markComparisonRows(runEvalOptions, rowsWithSelectBestAssertion, rowsWithMaxScoreAssertion);
    if (cliState.resume && this.store.persisted) {
      for (const step of runEvalOptions) {
        if (rowsWithSelectBestAssertion.has(step.testIdx)) {
          this.comparisonProviders.set(getResultIndexKey(step), getComparisonProviders(step.test));
        }
      }
    }
    const repeatCacheContextByTestIdx = buildRepeatCacheContextByTestIdx(runEvalOptions);
    runEvalOptions = await filterCompletedResumeSteps(runEvalOptions, this.store);

    const concurrencySettings = adjustConcurrencyForSerialFeatures({
      concurrency,
      prompts,
      providers: runEvalOptions.map((evalOption) => evalOption.provider),
      tests,
    });
    concurrency = concurrencySettings.concurrency;
    const { usesConversationVar } = concurrencySettings;

    const processingContext: EvalProcessingContext = {
      assertionTypes,
      concurrency,
      deferredGradingAbortSignal,
      derivedMetrics,
      numComplete: 0,
      options,
      promptEvalCounts: createPromptEvalCounts(prompts),
      prompts,
      rowsWithMaxScoreAssertion,
      rowsWithSelectBestAssertion,
      runEvalOptionsLength: runEvalOptions.length,
      targetErrorAbortController,
      targetErrorStatus: undefined,
      targetUnavailable: false,
      testSuite,
      vars,
    };

    // Set up progress tracking
    const originalProgressCallback = this.options.progressCallback;
    const isWebUI = Boolean(cliState.webUI);

    // Choose appropriate progress reporter
    logger.debug(
      `Progress bar settings: showProgressBar=${this.options.showProgressBar}, isWebUI=${isWebUI}`,
    );

    if (isCI() && !isWebUI) {
      // Use CI-friendly progress reporter
      ciProgressReporter = new CIProgressReporter(runEvalOptions.length);
      ciProgressReporter.start();
    } else if (this.options.showProgressBar && process.stderr.isTTY) {
      // Use visual progress bars
      progressBarManager = new ProgressBarManager(isWebUI);
    }

    this.options.progressCallback = (completed, total, index, evalStep, metrics) => {
      if (originalProgressCallback) {
        originalProgressCallback(completed, total, index, evalStep, metrics);
      }

      if (isWebUI) {
        const provider = evalStep.provider.label || evalStep.provider.id();
        const vars = formatVarsForDisplay(evalStep.test.vars, 50);
        logger.info(
          `[${processingContext.numComplete}/${total}] Running ${provider} with vars: ${vars}`,
        );
      } else if (progressBarManager) {
        // Progress bar update is handled by the manager
        const phase = evalStep.test.options?.runSerially ? 'serial' : 'concurrent';
        progressBarManager.updateProgress(index, evalStep, phase, metrics);
      } else if (ciProgressReporter) {
        // CI progress reporter update
        ciProgressReporter.update(processingContext.numComplete);
      } else {
        logger.debug(
          `Eval #${index + 1} complete (${processingContext.numComplete} of ${runEvalOptions.length})`,
        );
      }
    };

    // Separate serial and concurrent eval options
    const serialRunEvalOptions: RunEvalOptions[] = [];
    const concurrentRunEvalOptions: RunEvalOptions[] = [];
    // O(1) lookup for the original index of each eval step (avoids O(n) indexOf in hot loop)
    const evalStepIndexMap = new Map<RunEvalOptions, number>();

    for (let i = 0; i < runEvalOptions.length; i++) {
      const evalOption = runEvalOptions[i];
      evalStepIndexMap.set(evalOption, i);
      if (evalOption.test.options?.runSerially) {
        serialRunEvalOptions.push(evalOption);
      } else {
        concurrentRunEvalOptions.push(evalOption);
      }
    }
    const hasEvalStepTimeout = (options.timeoutMs || getEvalTimeoutMs()) > 0;
    const shouldGroupGradingByProvider =
      concurrency === 1 && !hasEvalStepTimeout && !usesConversationVar;

    // Print info messages before starting progress bar
    if (!this.options.silent) {
      if (serialRunEvalOptions.length > 0) {
        logger.info(`Running ${serialRunEvalOptions.length} test cases serially...`);
      }
      if (concurrentRunEvalOptions.length > 0) {
        logger.info(
          `Running ${concurrentRunEvalOptions.length} test cases (up to ${concurrency} at a time)...`,
        );
      }

      logGroupedGradingStatus({
        concurrency,
        hasEvalStepTimeout,
        runEvalOptions,
        shouldGroupGradingByProvider,
        usesConversationVar,
      });
    }

    // Now start the progress bar after info messages
    if (this.options.showProgressBar && progressBarManager) {
      await progressBarManager.initialize(runEvalOptions, concurrency, 0);
      progressBarManager.installLogInterceptor();
    }

    const interruptedEval = await this.executeEvalSteps({
      checkAbort,
      ciProgressReporter,
      combinedAbortSignal,
      concurrentRunEvalOptions,
      evalStepIndexMap,
      globalTimeout,
      groupedRunEvalOptions: [...serialRunEvalOptions, ...concurrentRunEvalOptions],
      isEvalTimedOut: isTimedOut,
      isWebUI,
      maxEvalTimeMs,
      processingContext,
      processedIndices,
      progressBarManager,
      prompts,
      serialRunEvalOptions,
      shouldGroupGradingByProvider,
    });
    if (interruptedEval) {
      return interruptedEval;
    }

    if (
      !(await this.processComparisonAssertions({
        ciProgressReporter,
        isEvalTimedOut: isTimedOut,
        isWebUI,
        progressBarManager,
        prompts,
        providerAbortSignal,
        repeatCacheContextByTestIdx,
        rowsWithMaxScoreAssertion,
        rowsWithSelectBestAssertion,
        runEvalOptions,
      }))
    ) {
      return this.saveInterruptedEval({
        ciProgressReporter,
        globalTimeout,
        processingContext,
        progressBarManager,
        prompts,
      });
    }

    await this.finalizeEvaluation({
      assertionTypes,
      ciProgressReporter,
      concurrency,
      evalTimedOut: isTimedOut(),
      globalTimeout,
      maxEvalTimeMs,
      options,
      processedIndices,
      progressBarManager,
      prompts,
      runEvalOptions,
      startTime,
      testSuite,
      tests,
      usesConversationVar,
      varNames,
      vars,
    });
    return this.store.evaluation;
  }

  async evaluate(): Promise<TEvaluation> {
    return providerRegistry.withEvaluation(async () => {
      const startTime = Date.now();
      const maxEvalTimeMs = this.options.maxEvalTimeMs ?? getMaxEvalTimeMs();
      const timeoutController = maxEvalTimeMs > 0 ? new AbortController() : undefined;
      let providerAbortSignal = this.options.abortSignal;
      if (timeoutController) {
        providerAbortSignal = providerAbortSignal
          ? AbortSignal.any([providerAbortSignal, timeoutController.signal])
          : timeoutController.signal;
      }
      // Completed targets can finish grading during a CLI pause. The deadline still
      // bounds preparation and resource acquisition before any provider runs.
      const deferredGradingAbortSignal = providerAbortSignal;
      if (this.options.pauseSignal) {
        providerAbortSignal = providerAbortSignal
          ? AbortSignal.any([providerAbortSignal, this.options.pauseSignal])
          : this.options.pauseSignal;
      }
      let timedOut = false;
      const globalTimeout = timeoutController
        ? setTimeout(() => {
            // Preserve the first cause if the caller cancelled while rows were being saved.
            timedOut = !providerAbortSignal?.aborted;
            timeoutController.abort();
          }, maxEvalTimeMs)
        : undefined;
      try {
        return await this.evaluateWithResources({
          startTime,
          maxEvalTimeMs,
          providerAbortSignal,
          deferredGradingAbortSignal,
          globalTimeout,
          isTimedOut: () => timedOut,
        });
      } finally {
        if (globalTimeout) {
          clearTimeout(globalTimeout);
        }
      }
    });
  }

  private async acquireOtlpReceiver(signal?: AbortSignal): Promise<boolean> {
    signal?.throwIfAborted();
    const startup = startOtlpReceiverIfNeeded(this.testSuite, this.store.id);
    if (!signal) {
      return startup;
    }
    return new Promise<boolean>((resolve, reject) => {
      const onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
      startup.then(
        (acquired) => {
          signal.removeEventListener('abort', onAbort);
          if (signal.aborted) {
            // The shared startup can finish after this evaluation has returned. Release only
            // its reservation without delaying cancellation or closing another evaluation's receiver.
            void stopOtlpReceiverIfNeeded(acquired, this.store.id).catch((error) => {
              logger.warn('Failed to release tracing receiver after evaluation cancellation', {
                error,
              });
            });
            reject(signal.reason);
          } else {
            resolve(acquired);
          }
        },
        (error) => {
          signal.removeEventListener('abort', onAbort);
          reject(error);
        },
      );
    });
  }

  private async evaluateWithResources(deadline: EvaluationDeadline): Promise<TEvaluation> {
    // Initialize OTEL SDK if tracing is enabled
    // Check env flag, test suite level, and default test metadata
    const tracingEnabled =
      getEnvBool('PROMPTFOO_TRACING_ENABLED', false) ||
      this.testSuite.tracing?.enabled === true ||
      (typeof this.testSuite.defaultTest === 'object' &&
        this.testSuite.defaultTest?.metadata?.tracingEnabled === true) ||
      this.testSuite.tests?.some((t) => t.metadata?.tracingEnabled === true);
    let otelInitialized = false;
    let otlpReceiverAcquired = false;

    let evaluationError: unknown;
    try {
      await Promise.all(
        this.testSuite.providers.map((provider) =>
          providerRegistry.useProvider(provider, deadline.providerAbortSignal),
        ),
      );
      otlpReceiverAcquired = await this.acquireOtlpReceiver(deadline.providerAbortSignal);
      deadline.providerAbortSignal?.throwIfAborted();
      if (tracingEnabled) {
        logger.debug('[Evaluator] Initializing OTEL SDK for tracing');
        const otelConfig = getDefaultOtelConfig();
        initializeOtel(otelConfig);
        otelInitialized = true;
      }

      return await this._runEvaluation(deadline);
    } catch (error) {
      evaluationError = error;
      throw error;
    } finally {
      // Close the JSONL writers first, before the (possibly multi-second) OTEL / provider
      // teardown below, so the streamed file is fully flushed before the post-run rewrite
      // reads it back and the file handle is released promptly. allSettled so one writer's
      // close failure neither blocks cleanup nor masks another writer's error.
      const writerCloseResults = await Promise.allSettled(
        this.fileWriters.map((writer) => writer.close()),
      );
      const writerCloseErrors = writerCloseResults.flatMap((result) =>
        result.status === 'rejected' ? [result.reason] : [],
      );

      let cleanupError: unknown;
      try {
        // Flush and shutdown OTEL SDK
        if (otelInitialized) {
          logger.debug('[Evaluator] Flushing OTEL spans...');
          await flushOtel();
          await shutdownOtel();
        }

        if (otlpReceiverAcquired && isOtlpReceiverStarted()) {
          // Add a delay to allow providers to finish exporting spans
          logger.debug('[Evaluator] Waiting for span exports to complete...');
          await sleep(3000);
        }
        await stopOtlpReceiverIfNeeded(otlpReceiverAcquired, this.store.id);

        // Log rate limit metrics for debugging before cleanup
        if (this.rateLimitRegistry) {
          const metrics = this.rateLimitRegistry.getMetrics();
          for (const [key, m] of Object.entries(metrics)) {
            if (m.totalRequests > 0) {
              logger.debug(`[Scheduler] Final metrics for ${sanitizeProviderIdForLog(key)}`, {
                totalRequests: m.totalRequests,
                completedRequests: m.completedRequests,
                failedRequests: m.failedRequests,
                rateLimitHits: m.rateLimitHits,
                retriedRequests: m.retriedRequests,
                avgLatencyMs: Math.round(m.avgLatencyMs),
                p50LatencyMs: Math.round(m.p50LatencyMs),
                p99LatencyMs: Math.round(m.p99LatencyMs),
              });
            }
          }
        }

        // Clean up rate limit registry resources
        this.rateLimitRegistry?.dispose();

        // Clear registry from redteam provider manager
        redteamProviderManager.setRateLimitRegistry(undefined);

        // Reset cliState.maxConcurrency to prevent stale state between evaluations
        cliState.maxConcurrency = undefined;
      } catch (error) {
        cleanupError = error;
        throw error;
      } finally {
        if (writerCloseErrors.length > 0) {
          logger.error('[Evaluator] Error closing JSONL output', { errors: writerCloseErrors });
          // Only surface a writer-close failure when nothing else failed, so the original
          // evaluation/cleanup error is never masked by a secondary I/O error.
          if (evaluationError === undefined && cleanupError === undefined) {
            // When results persisted to the database, that copy is authoritative and the
            // post-run rewrite (writeMultipleOutputs) regenerates the JSONL artifact from
            // it, so a close error (e.g. a delayed fd-close writeback failure) is recoverable
            // — log it rather than failing an otherwise-successful run. Only when persistence
            // failed is the streamed JSONL the sole copy whose truncation must be surfaced.
            if (this.store.resultPersistenceFailed) {
              throw writerCloseErrors.length === 1
                ? writerCloseErrors[0]
                : new AggregateError(
                    writerCloseErrors,
                    'Multiple JSONL output writers failed to close',
                  );
            }
            logger.warn(
              `JSONL output writer reported a close error after results persisted; the output file will be regenerated from the database. ${writerCloseErrors.map((error) => (error instanceof Error ? error.message : String(error))).join('; ')}`,
            );
          }
        }
      }
    }
  }
}

function withTracingInputDefaults(testSuite: TestSuite): TestSuite {
  const tracing = testSuite.tracing;
  if (!tracing) {
    return testSuite;
  }
  const parsed = TestSuiteConfigSchema.shape.tracing.safeParse(tracing);
  if (!parsed.success || !parsed.data) {
    return testSuite;
  }
  const normalized = {
    ...tracing,
    ...parsed.data,
    // Keep runtime provider identity and its private credential-reference metadata.
    ...(tracing.provider && { provider: tracing.provider }),
  };
  return isDeepStrictEqual(tracing, normalized) ? testSuite : { ...testSuite, tracing: normalized };
}

/** Execute with caller-supplied storage, output writers, and optional suite resolution. */
export function evaluate<
  TEvaluation extends EvaluationRecord,
  TResult extends EvaluationStoreResult = EvaluationStoreResult,
>(
  testSuite: TestSuite,
  evalRecord: TEvaluation,
  options: InternalEvaluateOptions,
  runtime: EvaluatorRuntime<TEvaluation, TResult>,
): Promise<TEvaluation> {
  return cliState.withBasePath(testSuite.basePath ?? cliState.basePath, () =>
    cliState.withEnv(testSuite.env ?? cliState.env, () =>
      cliState.withConfig(
        {
          ...evalRecord.config,
          defaultTest: testSuite.defaultTest ?? evalRecord.config.defaultTest,
          redteam: testSuite.redteam ?? evalRecord.config.redteam,
        },
        () => {
          const runtimeTestSuite = runtime.resolveRuntimeTestSuite?.(testSuite) ?? testSuite;
          const store = runtime.createEvaluationStore(evalRecord);
          const ev = new Evaluator(
            withTracingInputDefaults(runtimeTestSuite),
            store,
            options,
            runtime,
          );
          // Capture this entry point's policy for providers and graders loaded
          // through another package copy, including extension-hook imports.
          return withCacheEnabled(options.cache === false ? false : isCacheEnabled(), () =>
            ev.evaluate(),
          );
        },
        testSuite.providers.map((provider) => ({ id: provider.id(), config: provider.config })),
      ),
    ),
  );
}
