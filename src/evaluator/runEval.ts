import { LRUCache } from 'lru-cache';
import { hasTraceAwareAssertions, runAssertions } from '../assertions/index';
import { extractAndStoreBinaryData } from '../blobs/extractor';
import { getCache, isCacheEnabled, withCacheEnabled, withCacheNamespace } from '../cache';
import cliState from '../cliState';
import { FILE_METADATA_KEY } from '../constants';
import { getEnvBool, getEnvInt } from '../envars';
import { collectFileMetadata, renderPrompt } from '../evaluatorHelpers';
import logger from '../logger';
import { type AgentWorkspace, createAgentWorkspaceForConfig } from '../providers/agentWorkspace';
import { providerRegistry } from '../providers/providerRegistry';
import { maybeWrapMcpProviderForRedteam } from '../redteam/mcpTargetProvider';
import { throwIfTargetPromptExceedsMaxChars } from '../redteam/shared/promptLength';
import { getSessionId } from '../redteam/util';
import { createProviderRateLimitOptions, sleepWithAbort } from '../scheduler';
import {
  withProviderCallExecutionContext,
  withProviderCallTracingContext,
} from '../scheduler/providerCallExecutionContext';
import { type ProviderCallQueue } from '../scheduler/providerCallQueue';
import { generateTraceContextIfNeeded } from '../tracing/evaluatorTracing';
import { flushOtel } from '../tracing/otelSdk';
import { isExternalTraceProvider } from '../tracing/providers';
import { getActiveTraceparent } from '../tracing/spanRoles';
import { withGraderSpan, withTestCaseSpan, withTracedProviderCall } from '../tracing/targetTracer';
import { fetchTraceContext } from '../tracing/traceContext';
import {
  type AtomicTestCase,
  type EvaluateResult,
  type GradingResult,
  type Prompt,
  type ProviderResponse,
  ResultFailureReason,
  type RunEvalOptions,
  type TestSuite,
} from '../types/index';
import { type ApiProvider, isApiProvider } from '../types/providers';
import { isAbortError } from '../util/fetch/errors';
import { isCallerAbortError } from '../util/fetch/requestSignal';
import invariant from '../util/invariant';
import { safeJsonStringify } from '../util/json';
import { getProviderIdentifier, sanitizeProviderIdForLog } from '../util/provider';
import { analyzeTemplateReference, extractVariablesFromTemplate } from '../util/templates';
import { TokenUsageTracker } from '../util/tokenUsage';
import {
  accumulateGradingTokenUsage,
  accumulateResponseTokenUsage,
  createEmptyTokenUsage,
} from '../util/tokenUsageUtils';
import { transform } from '../util/transform';
import type winston from 'winston';

import type {
  EvalConversations,
  RateLimitRegistryRef,
  ScoringFunction,
  Vars,
} from '../types/index';
import type { InternalEvaluateOptions } from '../types/internal';
import type { CallApiContextParams, CallApiOptionsParams } from '../types/providers';

export const CONVERSATION_VAR_NAME = '_conversation';
const PROMPT_CONVERSATION_CACHE_MAX = 1024;
const promptUsesConversationVariableCache = new LRUCache<string, boolean>({
  max: PROMPT_CONVERSATION_CACHE_MAX,
});

export function promptUsesConversationVariable(prompt: Pick<Prompt, 'raw'>): boolean {
  const cached = promptUsesConversationVariableCache.get(prompt.raw);
  if (cached !== undefined) {
    return cached;
  }

  const { referenced, parsed } = analyzeTemplateReference(prompt.raw, CONVERSATION_VAR_NAME);
  // Only cache successfully parsed results. Caching a parse failure would
  // poison the cache for the lifetime of the process and silently downgrade
  // future conversation-aware runs to parallel execution.
  if (parsed) {
    promptUsesConversationVariableCache.set(prompt.raw, referenced);
  }
  return referenced;
}

/** Test-only: reset the per-process prompt conversation-variable cache. */
export function __resetPromptConversationCacheForTests(): void {
  promptUsesConversationVariableCache.clear();
}

function isGeneratedRedteamAssertion(assertion: { type?: string }): boolean {
  return typeof assertion.type === 'string' && assertion.type.startsWith('promptfoo:redteam:');
}

type NestedAssertion = {
  type?: string;
  assert?: NestedAssertion[];
};

function hasNestedRedteamAssertion(assertion: NestedAssertion): boolean {
  if (isGeneratedRedteamAssertion(assertion)) {
    return true;
  }

  return (
    assertion.type === 'assert-set' &&
    Array.isArray(assertion.assert) &&
    assertion.assert.some(hasNestedRedteamAssertion)
  );
}

export function getRepeatCacheNamespace(
  repeatIndex: number,
  evaluateOptions?: InternalEvaluateOptions,
): string | undefined {
  if (repeatIndex > 0 || (evaluateOptions?.repeat ?? 1) > 1) {
    return `repeat:${repeatIndex}`;
  }
  return undefined;
}

function hasGeneratedRedteamMetadata(test: AtomicTestCase): boolean {
  return (
    typeof test.metadata?.pluginId === 'string' &&
    (Boolean(test.metadata?.pluginConfig) || Boolean(test.metadata?.goal))
  );
}

function shouldSkipRedteamInjectVar(
  test: AtomicTestCase,
  testSuite: TestSuite | undefined,
  isRedteam: boolean,
): boolean {
  if (isRedteam || testSuite?.redteam) {
    return true;
  }

  // Exported/generated redteam configs may not include a top-level `redteam` block,
  // but they still carry redteam metadata or nested redteam assertions.
  return hasGeneratedRedteamMetadata(test) || Boolean(test.assert?.some(hasNestedRedteamAssertion));
}

function getRedteamInjectVar(test: AtomicTestCase, prompt: Prompt, testSuite?: TestSuite): string {
  if (testSuite?.redteam?.injectVar) {
    return testSuite.redteam.injectVar;
  }

  const promptTemplate = prompt.template ?? prompt.raw;
  const promptVars = extractVariablesFromTemplate(promptTemplate);

  if (
    testSuite?.redteam &&
    promptVars.includes('prompt') &&
    Object.prototype.hasOwnProperty.call(test.vars ?? {}, 'prompt')
  ) {
    return 'prompt';
  }

  const matchingVars = promptVars.filter((variableName) =>
    Object.prototype.hasOwnProperty.call(test.vars ?? {}, variableName),
  );

  // Mirror redteam generation behavior by preferring the last prompt variable.
  return matchingVars.at(-1) ?? promptVars.at(-1) ?? 'prompt';
}

export const deferredGradingPromises = new WeakMap<EvaluateResult, Promise<void>>();

function applyGradingResult(row: EvaluateResult, checkResult: GradingResult) {
  if (!checkResult.pass) {
    row.error = checkResult.reason;
    row.failureReason = ResultFailureReason.ASSERT;
  }
  row.success = checkResult.pass;
  row.score = checkResult.score;
  row.namedScores = checkResult.namedScores || {};

  if (!row.tokenUsage) {
    row.tokenUsage = createEmptyTokenUsage();
  }
  accumulateGradingTokenUsage(row.tokenUsage, checkResult.tokensUsed, {
    cached: checkResult.metadata?.cachedResponse,
  });
  row.gradingResult = checkResult;
}

export const ABORTED_GRADING_PREFIX = 'Aborted: ';

// Require both: an AbortError during a run that was not cancelled is a real bug, and so is an
// unrelated error that surfaces just after cancellation.
export function isGradingAbort(error: unknown, abortSignal?: AbortSignal): boolean {
  return Boolean(abortSignal?.aborted && (isAbortError(error) || error === abortSignal.reason));
}

export function applyGradingError(
  row: Pick<
    EvaluateResult,
    'error' | 'failureReason' | 'success' | 'score' | 'namedScores' | 'promptIdx' | 'testIdx'
  >,
  error: unknown,
  abortSignal?: AbortSignal,
) {
  const errorAsError = error instanceof Error ? error : undefined;

  if (isGradingAbort(error, abortSignal)) {
    // Skip stack serialization on the abort path — debug logs usually go
    // unread and a noisy shutdown can fire this per row.
    const shortMessage = errorAsError?.message ?? String(error);
    logger.debug('Assertion grading aborted', {
      error: shortMessage,
      promptIdx: row.promptIdx,
      testIdx: row.testIdx,
    });
    row.error = `${ABORTED_GRADING_PREFIX}${shortMessage}`;
  } else {
    const fullMessage = errorAsError ? (errorAsError.stack ?? errorAsError.message) : String(error);
    logger.error('Assertion grading failed during eval', {
      error: fullMessage,
      promptIdx: row.promptIdx,
      testIdx: row.testIdx,
    });
    row.error = fullMessage;
  }
  row.failureReason = ResultFailureReason.ERROR;
  row.success = false;
  row.score = 0;
  row.namedScores = {};
}

type RunEvalSetup = Pick<EvaluateResult, 'prompt' | 'vars'> & {
  provider: EvaluateResult['provider'] & { config?: ApiProvider['config'] };
};

interface RunEvalState {
  conversationKey: string;
  fileMetadata: Record<string, unknown>;
  promptForRender: Prompt;
  setup: RunEvalSetup;
  vars: Vars;
}

interface RenderedRunEvalPrompt {
  renderedJson: unknown;
  renderedPrompt: string;
  setup: RunEvalSetup;
}

interface ProviderCallResult {
  latencyMs: number;
  response: ProviderResponse;
  traceContext: Awaited<ReturnType<typeof generateTraceContextIfNeeded>>;
}

function mergeProviderPromptConfig(
  promptConfig: Prompt['config'],
  testOptions: AtomicTestCase['options'],
): Prompt['config'] {
  const { repeat: _repeat, ...providerOptions } = testOptions ?? {};
  return {
    ...(promptConfig ?? {}),
    ...providerOptions,
  };
}

function createRunEvalState({
  provider,
  prompt,
  promptIndex,
  test,
}: Pick<RunEvalOptions, 'provider' | 'prompt' | 'test'> & {
  promptIndex: number;
}): RunEvalState {
  const vars = structuredClone(test.vars || {});
  const fileMetadata = collectFileMetadata(vars);
  // Provider identifiers and prompt ids can both collide, but every result-table
  // column has a unique index. Encode the components as a tuple because identifiers
  // can contain separators that would make concatenated keys ambiguous.
  const conversationKey = JSON.stringify([
    getProviderIdentifier(provider),
    prompt.id,
    promptIndex,
    test.metadata?.conversationId,
  ]);

  const setup = createRunEvalSetup({
    provider,
    prompt,
    promptConfig: mergeProviderPromptConfig(prompt.config, test.options),
    vars,
  });

  return {
    conversationKey,
    fileMetadata,
    promptForRender: { ...prompt },
    setup,
    vars,
  };
}

/**
 * Reserved keys for eval-step runtime vars. `EvalRuntimeVars` below is keyed by
 * this tuple, so adding a new key to {@link getEvalRuntimeVars} fails to
 * type-check until the key is added here too — keeping the omit list and the
 * producer in lockstep.
 */
const EVAL_RUNTIME_VAR_KEYS = ['__evalId', '__evalStepId', '__repeatIndex'] as const;
type EvalRuntimeVars = Partial<Record<(typeof EVAL_RUNTIME_VAR_KEYS)[number], Vars[string]>>;

function getEvalRuntimeVars({
  evalId,
  promptIndex,
  repeatIndex,
  testIndex,
}: {
  evalId?: string;
  promptIndex: number;
  repeatIndex: number;
  testIndex: number;
}): EvalRuntimeVars {
  return {
    ...(evalId ? { __evalId: evalId } : {}),
    __evalStepId: `test-${testIndex}-prompt-${promptIndex}-repeat-${repeatIndex}`,
    __repeatIndex: repeatIndex,
  };
}

/**
 * Returns a copy of `vars` without the reserved `__eval*` runtime vars. They are
 * merged into an eval step's vars so prompts and providers can reference them,
 * but must not reach the persisted `EvaluateResult.vars` or assertion/grader
 * inputs: they are positional per-step identifiers that would pollute stored
 * results and — being `_`-prefixed — get restored onto re-run `test.vars` by
 * `--filter-*` re-runs. The input is not mutated; it is shared by reference
 * with the provider call context.
 */
function omitEvalRuntimeVars(vars: Vars): Vars {
  // Keep non-serialized metadata needed by assertion and grader providers.
  const result: Vars = { ...vars };
  for (const key of EVAL_RUNTIME_VAR_KEYS) {
    delete result[key];
  }
  return result;
}

function attachConversationVar({
  conversations,
  conversationKey,
  prompt,
  test,
  vars,
}: {
  conversations?: EvalConversations;
  conversationKey: string;
  prompt: Prompt;
  test: AtomicTestCase;
  vars: Vars;
}) {
  const usesConversation = promptUsesConversationVariable(prompt);
  if (
    !getEnvBool('PROMPTFOO_DISABLE_CONVERSATION_VAR') &&
    !test.options?.disableConversationVar &&
    usesConversation
  ) {
    vars._conversation = conversations?.[conversationKey] || [];
  }
}

function createRunEvalSetup({
  provider,
  prompt,
  promptConfig,
  vars,
}: {
  provider: ApiProvider;
  prompt: Prompt;
  promptConfig: Prompt['config'];
  vars: Vars;
}): RunEvalSetup {
  return {
    provider: {
      id: provider.id(),
      label: provider.label,
      config: provider.config,
    },
    prompt: {
      raw: '',
      label: prompt.label,
      ...(prompt.id && { id: prompt.id }),
      config: promptConfig,
    },
    vars,
  };
}

async function renderRunEvalPrompt({
  filters,
  isRedteam,
  provider,
  promptForRender,
  test,
  testSuite,
  vars,
}: {
  filters: RunEvalOptions['nunjucksFilters'];
  isRedteam: boolean;
  provider: ApiProvider;
  promptForRender: Prompt;
  test: AtomicTestCase;
  testSuite?: TestSuite;
  vars: Vars;
}): Promise<RenderedRunEvalPrompt> {
  const skipRenderVars = shouldSkipRedteamInjectVar(test, testSuite, isRedteam)
    ? [getRedteamInjectVar(test, promptForRender, testSuite)]
    : undefined;
  const renderedPrompt = await renderPrompt(
    promptForRender,
    vars,
    filters,
    provider,
    skipRenderVars,
  );
  if (isRedteam) {
    throwIfTargetPromptExceedsMaxChars(renderedPrompt, testSuite?.redteam?.maxCharsPerMessage);
  }
  const promptConfig = mergeProviderPromptConfig(promptForRender.config, test.options);
  const setup = createRunEvalSetup({ provider, prompt: promptForRender, promptConfig, vars });
  setup.prompt.raw = renderedPrompt;
  return {
    renderedJson: tryParseJson(renderedPrompt),
    renderedPrompt,
    setup,
  };
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isCliPauseCancellation(
  error: unknown,
  abortSignal?: AbortSignal,
  pauseSignal?: AbortSignal,
): boolean {
  return Boolean(
    pauseSignal?.aborted &&
      abortSignal?.aborted &&
      abortSignal.reason === pauseSignal.reason &&
      isCallerAbortError(error, pauseSignal, { requireReasonMatch: true }),
  );
}

async function callProviderForRunEval({
  abortSignal,
  pauseSignal,
  evalId,
  filters,
  promptForRender,
  provider,
  rateLimitRegistry,
  renderedPrompt,
  repeatIndex,
  test,
  testIndex,
  testSuite,
  traceContext,
  vars,
}: Pick<
  RunEvalOptions,
  | 'abortSignal'
  | 'evalId'
  | 'nunjucksFilters'
  | 'provider'
  | 'rateLimitRegistry'
  | 'repeatIndex'
  | 'test'
  | 'testSuite'
> & {
  filters: RunEvalOptions['nunjucksFilters'];
  pauseSignal?: AbortSignal;
  promptForRender: Prompt;
  renderedPrompt: string;
  testIndex: number;
  traceContext: Awaited<ReturnType<typeof generateTraceContextIfNeeded>>;
  vars: Vars;
}): Promise<ProviderCallResult> {
  const startTime = Date.now();
  let response: ProviderResponse | undefined;
  let providerInvoked = false;
  let providerFailed = false;

  try {
    if (test.providerOutput) {
      response = {
        output: test.providerOutput,
        tokenUsage: createEmptyTokenUsage(),
        cost: 0,
        cached: false,
      };
    } else {
      response = await callActiveProvider({
        abortSignal,
        pauseSignal,
        evalId,
        filters,
        onProviderInvoked: () => {
          providerInvoked = true;
        },
        promptForRender,
        provider,
        rateLimitRegistry,
        renderedPrompt,
        repeatIndex,
        test,
        testIndex,
        testSuite,
        traceContext,
        vars,
      });
    }

    sanitizeResponseMetadata(response);

    return {
      latencyMs: Date.now() - startTime,
      response,
      traceContext,
    };
  } catch (error) {
    providerFailed = true;
    throw error;
  } finally {
    if (providerInvoked && isExternalTraceProvider(testSuite?.tracing?.provider)) {
      try {
        await collectExternalTraceAfterProviderCall({
          abortSignal,
          providerFailed,
          response,
          test,
          testSuite,
          traceContext,
        });
      } catch (error) {
        // Trace collection must not discard a target response that completed
        // before CLI pause. Real caller/deadline cancellation still propagates.
        if (
          providerFailed ||
          !response ||
          !isCliPauseCancellation(error, abortSignal, pauseSignal)
        ) {
          throw error;
        }
      }
    }
  }
}

async function collectExternalTraceAfterProviderCall({
  abortSignal,
  providerFailed,
  response,
  test,
  testSuite,
  traceContext,
}: {
  abortSignal?: AbortSignal;
  providerFailed: boolean;
  response?: ProviderResponse;
  test: AtomicTestCase;
  testSuite?: TestSuite;
  traceContext: Awaited<ReturnType<typeof generateTraceContextIfNeeded>>;
}): Promise<void> {
  const traceId = getTraceId(traceContext);
  if (!traceId || abortSignal?.aborted) {
    return;
  }

  if (response?.cached) {
    logger.debug(
      `[Evaluator] Skipping external trace fetch for cached response traceId=${traceId}`,
    );
    return;
  }

  const tracingConfig = testSuite?.tracing;
  const needsTraceForGrading =
    !providerFailed &&
    !response?.error &&
    response?.output !== null &&
    response?.output !== undefined &&
    hasTraceAwareAssertions(test.assert);

  try {
    if (needsTraceForGrading) {
      await flushOtel();
    }

    logger.debug(`[Evaluator] Fetching traces from external provider for traceId=${traceId}`);
    const trace = await fetchTraceContext(traceId, {
      providerConfig: tracingConfig?.provider,
      queryDelay: tracingConfig?.queryDelay,
      maxRetries: needsTraceForGrading ? 5 : 0,
      retryDelayMs: 1000,
      includeInternalSpans: true,
      sanitizeAttributes: true,
      redactAttributes: tracingConfig?.otlp?.http?.redactAttributes,
      abortSignal,
    });

    if (trace) {
      logger.debug(`[Evaluator] Successfully fetched traces for traceId=${traceId}`);
    } else {
      logger.debug(`[Evaluator] No external traces found for traceId=${traceId}`);
    }
  } catch (error) {
    if (abortSignal?.aborted) {
      if (!providerFailed) {
        throw error;
      }
      return;
    }
    logger.warn(`[Evaluator] Failed to fetch external traces: ${error}`);
  }
}

async function callActiveProvider({
  abortSignal,
  pauseSignal,
  evalId,
  filters,
  onProviderInvoked,
  promptForRender,
  provider,
  rateLimitRegistry,
  renderedPrompt,
  repeatIndex,
  test,
  testIndex,
  testSuite,
  traceContext,
  vars,
}: Pick<
  RunEvalOptions,
  'abortSignal' | 'evalId' | 'provider' | 'rateLimitRegistry' | 'repeatIndex' | 'test' | 'testSuite'
> & {
  filters: RunEvalOptions['nunjucksFilters'];
  pauseSignal?: AbortSignal;
  onProviderInvoked: () => void;
  promptForRender: Prompt;
  renderedPrompt: string;
  testIndex: number;
  traceContext: Awaited<ReturnType<typeof generateTraceContextIfNeeded>>;
  vars: Vars;
}): Promise<ProviderResponse> {
  const originalProvider = maybeWrapMcpProviderForRedteam(provider, test);
  const cleanupOwner = isApiProvider(test.provider) ? test.provider : provider;
  const activeProvider =
    cleanupOwner === provider
      ? originalProvider
      : maybeWrapMcpProviderForRedteam(cleanupOwner, test);
  logger.debug(`Provider type: ${sanitizeProviderIdForLog(activeProvider.id())}`);

  const callApiContext = buildCallApiContext({
    evalId,
    filters,
    originalProvider,
    promptForRender,
    repeatIndex,
    test,
    testIndex,
    traceContext,
    vars,
  });
  let completedResponse: ProviderResponse | undefined;
  const completedTargets: { prompt: string; response: ProviderResponse }[] = [];
  const callApi = (onResponseHeaders?: CallApiOptionsParams['onResponseHeaders']) => {
    // A previous response belongs only to backoff until the next attempt starts.
    completedResponse = undefined;
    const callApiOptions =
      abortSignal || onResponseHeaders ? { abortSignal, onResponseHeaders } : undefined;
    const invoke = () =>
      providerRegistry.withProvider(
        cleanupOwner,
        async () => {
          onProviderInvoked();
          const result = traceContext?.traceparent
            ? await withTracedProviderCall(
                {
                  provider: activeProvider,
                  callContext: callApiContext,
                  promptLabel: promptForRender.label,
                  evalId: callApiContext.evaluationId,
                  testIndex,
                },
                async (context) => activeProvider.callApi(renderedPrompt, context, callApiOptions),
              )
            : await activeProvider.callApi(renderedPrompt, callApiContext, callApiOptions);
          completedResponse = result;
          return result;
        },
        abortSignal,
      );
    return withProviderCallExecutionContext(
      {
        abortSignal,
        rateLimitRegistry,
        rateLimitProvider: activeProvider,
        onTargetResponse: (prompt, response) => {
          completedTargets.push({ prompt, response });
        },
      },
      () =>
        testSuite?.tracing
          ? cliState.withRequestTracingConfig(testSuite.tracing, invoke)
          : invoke(),
    );
  };
  let response: ProviderResponse;
  try {
    response = rateLimitRegistry
      ? await rateLimitRegistry.execute(
          activeProvider,
          callApi,
          createProviderRateLimitOptions(abortSignal),
        )
      : await callApi();
  } catch (error) {
    if (!isCliPauseCancellation(error, abortSignal, pauseSignal)) {
      throw error;
    }
    if (completedResponse) {
      response = completedResponse;
    } else if (completedTargets.length > 0) {
      // A strategy may still be tracing/grading after a billable or stateful
      // target call completes. Persist its partial work as an error, so resume
      // cannot silently replay it. Explicit retry-errors remains available.
      const last = completedTargets[completedTargets.length - 1].response;
      const tokenUsage = createEmptyTokenUsage();
      let cost: number | undefined;
      let incurredCost: number | undefined;
      for (const { response: target } of completedTargets) {
        accumulateResponseTokenUsage(tokenUsage, target);
        if (target.cost !== undefined) {
          cost = (cost ?? 0) + target.cost;
        }
        const targetIncurredCost = target.incurredCost ?? (target.cached ? 0 : target.cost);
        if (targetIncurredCost !== undefined) {
          incurredCost = (incurredCost ?? 0) + targetIncurredCost;
        }
      }
      response = {
        ...last,
        error:
          last.error ??
          'Evaluation paused before the strategy completed. Completed target responses were retained; use --retry-errors to run this case again.',
        tokenUsage,
        cost,
        incurredCost,
        cached: completedTargets.every(({ response: target }) => target.cached === true),
        metadata: {
          ...last.metadata,
          interruptedStrategy: true,
          completedTargetResponses: completedTargets,
        },
      };
    } else {
      throw error;
    }
  }

  logger.debug(`Provider response properties: ${Object.keys(response).join(', ')}`);
  logger.debug(`Provider response cached property explicitly: ${response.cached}`);
  return response;
}

function buildCallApiContext({
  evalId,
  filters,
  originalProvider,
  promptForRender,
  repeatIndex,
  test,
  testIndex,
  traceContext,
  vars,
}: {
  evalId?: string;
  filters: RunEvalOptions['nunjucksFilters'];
  originalProvider: ApiProvider;
  promptForRender: Prompt;
  repeatIndex: number;
  test: AtomicTestCase;
  testIndex: number;
  traceContext: Awaited<ReturnType<typeof generateTraceContextIfNeeded>>;
  vars: Vars;
}): CallApiContextParams {
  const callApiContext: CallApiContextParams = {
    vars,
    prompt: promptForRender,
    filters,
    originalProvider,
    test,
    logger: logger as unknown as winston.Logger,
    getCache,
    repeatIndex,
    testIdx: testIndex,
  };

  if (!isCacheEnabled()) {
    // Preserve the context hint for custom providers and older package copies.
    // The shared async cache policy also disables writes in built-in providers.
    callApiContext.bustCache = true;
  }

  if (evalId) {
    callApiContext.evaluationId = evalId;
  }
  if (traceContext) {
    callApiContext.traceparent = traceContext.traceparent;
    callApiContext.evaluationId = traceContext.evaluationId;
    callApiContext.testCaseId = traceContext.testCaseId;
  }

  return callApiContext;
}

function sanitizeResponseMetadata(response: ProviderResponse) {
  if (!response.metadata) {
    return;
  }
  const sanitizedMetadata = safeJsonStringify(response.metadata);
  response.metadata = sanitizedMetadata ? JSON.parse(sanitizedMetadata) : {};
}

function updateConversationHistory({
  conversationKey,
  conversations,
  renderedJson,
  renderedPrompt,
  response,
}: {
  conversationKey: string;
  conversations?: EvalConversations;
  renderedJson: unknown;
  renderedPrompt: string;
  response: ProviderResponse;
}) {
  if (!conversations || response.error) {
    return;
  }

  const conversationLastInput = getConversationLastInput(renderedJson);
  conversations[conversationKey] = conversations[conversationKey] || [];
  conversations[conversationKey].push({
    prompt: renderedJson || renderedPrompt,
    input: conversationLastInput || renderedJson || renderedPrompt,
    output: response.conversationOutput ?? (response.output || ''),
    metadata: response.metadata,
  });
}

function getConversationLastInput(renderedJson: unknown) {
  if (!Array.isArray(renderedJson)) {
    return undefined;
  }
  const lastElt = renderedJson[renderedJson.length - 1];
  return lastElt?.content || lastElt;
}

async function applyProviderDelayIfNeeded(
  provider: ApiProvider,
  response: ProviderResponse,
  abortSignal?: AbortSignal,
) {
  if (abortSignal?.aborted) {
    return;
  }
  if (!response.cached && !provider.handlesOwnDelay && provider.delay && provider.delay > 0) {
    logger.debug(`Sleeping for ${provider.delay}ms`);
    try {
      await sleepWithAbort(provider.delay, abortSignal);
    } catch (error) {
      // Cancellation ends the delay without discarding the completed response.
      if (!isCallerAbortError(error, abortSignal, { requireReasonMatch: true })) {
        throw error;
      }
    }
  } else if (response.cached) {
    logger.debug(`Skipping delay because response is cached`);
  }
}

function createEvaluateResult({
  fileMetadata,
  latencyMs,
  prompt,
  promptIdx,
  repeatGroupId,
  repeatIndex,
  rendered,
  response,
  setup,
  test,
  testIdx,
  traceContext,
  evalId,
  vars,
}: {
  fileMetadata: Record<string, unknown>;
  latencyMs: number;
  prompt: Prompt;
  promptIdx: number;
  repeatGroupId?: string;
  repeatIndex: number;
  rendered: RenderedRunEvalPrompt;
  response: ProviderResponse;
  setup: RunEvalSetup;
  test: AtomicTestCase;
  testIdx: number;
  traceContext?: Awaited<ReturnType<typeof generateTraceContextIfNeeded>>;
  evalId?: string;
  vars: Vars;
}): EvaluateResult {
  const ret: EvaluateResult = {
    ...setup,
    // Use the caller-provided vars (which exclude the __eval* runtime vars)
    // for the persisted result rather than setup.vars.
    vars,
    prompt: { ...rendered.setup.prompt, raw: rendered.renderedPrompt },
    response,
    success: false,
    failureReason: ResultFailureReason.NONE,
    score: 0,
    namedScores: {},
    latencyMs: response.latencyMs ?? latencyMs,
    cost: response.cost,
    ...(response.incurredCost !== undefined && { incurredCost: response.incurredCost }),
    metadata: {
      ...test.metadata,
      ...response.metadata,
      [FILE_METADATA_KEY]: fileMetadata,
    },
    promptIdx,
    ...(repeatGroupId !== undefined && { repeatGroupId, repeatIndex }),
    testIdx,
    testCase: test,
    promptId: prompt.id || '',
    tokenUsage: createEmptyTokenUsage(),
    ...getTraceLinkage(traceContext, evalId),
  };

  if (!ret.metadata?.sessionIds && !ret.metadata?.sessionId) {
    ret.metadata ??= {};
    ret.metadata.sessionId = getSessionId(response, { vars });
  }

  return ret;
}

/** Persist both the logical evaluation footprint and the work actually incurred. */
function normalizeCachedTargetResponse(response: ProviderResponse): ProviderResponse {
  if (!response.cached && !response.tokenUsage) {
    return response;
  }

  const tokenUsage = createEmptyTokenUsage();
  accumulateResponseTokenUsage(tokenUsage, response);
  return {
    ...response,
    tokenUsage,
    ...(response.cost !== undefined &&
      (response.cached || response.incurredCost !== undefined) && {
        incurredCost: response.incurredCost ?? (response.cached ? 0 : response.cost),
      }),
  };
}

function trackProviderUsage(provider: ApiProvider, response: ProviderResponse) {
  if (!response.tokenUsage) {
    return;
  }
  const providerId = provider.id();
  const trackingId = provider.constructor?.name
    ? `${providerId} (${provider.constructor.name})`
    : providerId;
  TokenUsageTracker.getInstance().trackResponseUsage(trackingId, response);
}

async function applyRunEvalResponseOutcome({
  abortSignal,
  deferGrading,
  deferredGradingAbortSignal,
  evalId,
  latencyMs,
  prompt,
  promptIdx,
  provider,
  providerCallQueue,
  rateLimitRegistry,
  renderedPrompt,
  response,
  ret,
  test,
  testIdx,
  testSuite,
  traceContext,
  vars,
}: {
  abortSignal?: AbortSignal;
  deferGrading?: boolean;
  deferredGradingAbortSignal?: AbortSignal;
  evalId?: string;
  latencyMs: number;
  prompt: Prompt;
  promptIdx: number;
  provider: ApiProvider;
  providerCallQueue?: ProviderCallQueue;
  rateLimitRegistry?: RateLimitRegistryRef;
  renderedPrompt: string;
  response: ProviderResponse;
  ret: EvaluateResult;
  test: AtomicTestCase;
  testIdx: number;
  testSuite?: TestSuite;
  traceContext: Awaited<ReturnType<typeof generateTraceContextIfNeeded>>;
  vars: Vars;
}) {
  if (response.error) {
    ret.error = response.error;
    ret.failureReason = ResultFailureReason.ERROR;
    ret.success = false;
    return;
  }

  if (response.output === null || response.output === undefined) {
    // An absent provider result is an integration error, including in redteam
    // scans. An intentional empty string still proceeds to the assertions.
    ret.success = false;
    ret.score = 0;
    ret.error = 'No output';
    ret.failureReason = ResultFailureReason.ERROR;
    return;
  }

  await gradeRunEvalResponse({
    abortSignal,
    deferGrading,
    deferredGradingAbortSignal,
    evalId,
    latencyMs,
    prompt,
    promptIdx,
    provider,
    providerCallQueue,
    rateLimitRegistry,
    renderedPrompt,
    response,
    ret,
    test,
    testIdx,
    testSuite,
    traceContext,
    vars,
  });
}

async function gradeRunEvalResponse({
  abortSignal,
  deferGrading,
  deferredGradingAbortSignal,
  evalId,
  latencyMs,
  prompt,
  promptIdx,
  provider,
  providerCallQueue,
  rateLimitRegistry,
  renderedPrompt,
  response,
  ret,
  test,
  testIdx,
  testSuite,
  traceContext,
  vars,
}: {
  abortSignal?: AbortSignal;
  deferGrading?: boolean;
  deferredGradingAbortSignal?: AbortSignal;
  evalId?: string;
  latencyMs: number;
  prompt: Prompt;
  promptIdx: number;
  provider: ApiProvider;
  providerCallQueue?: ProviderCallQueue;
  rateLimitRegistry?: RateLimitRegistryRef;
  renderedPrompt: string;
  response: ProviderResponse;
  ret: EvaluateResult;
  test: AtomicTestCase;
  testIdx: number;
  testSuite?: TestSuite;
  traceContext: Awaited<ReturnType<typeof generateTraceContextIfNeeded>>;
  vars: Vars;
}) {
  const { processedResponse, providerTransformedOutput } = await transformRunEvalResponse({
    evalId,
    prompt,
    promptIdx,
    provider,
    response,
    test,
    testIdx,
    vars,
  });
  const traceId = getTraceId(traceContext);
  if (
    traceId &&
    hasTraceAwareAssertions(test.assert) &&
    !isExternalTraceProvider(testSuite?.tracing?.provider)
  ) {
    await flushOtel();
  }

  const assertionProviderResponse = {
    ...processedResponse,
    // Keep generated audio available to graders after persistence replaces its
    // inline bytes with a blob reference in the saved result.
    ...(response.audio?.data ? { audio: response.audio } : {}),
    providerTransformedOutput,
  };

  if (deferGrading) {
    invariant(providerCallQueue, 'providerCallQueue is required when deferGrading is enabled');
    ret.response = processedResponse;
    const gradingPromise = withProviderCallExecutionContext(
      { abortSignal: deferredGradingAbortSignal, providerCallQueue, rateLimitRegistry },
      () =>
        runAssertions({
          prompt: renderedPrompt,
          provider,
          providerResponse: assertionProviderResponse,
          test,
          vars,
          latencyMs: response.latencyMs ?? latencyMs,
          assertScoringFunction: test.assertScoringFunction as ScoringFunction,
          traceId,
        }).then((checkResult) => applyGradingResult(ret, checkResult)),
    ).catch((error) => {
      applyGradingError(ret, error, deferredGradingAbortSignal);
    });
    deferredGradingPromises.set(ret, gradingPromise);
    return;
  }

  try {
    const checkResult = await withProviderCallExecutionContext(
      { abortSignal, rateLimitRegistry },
      () =>
        runAssertions({
          prompt: renderedPrompt,
          provider,
          providerResponse: assertionProviderResponse,
          test,
          vars,
          latencyMs: response.latencyMs ?? latencyMs,
          assertScoringFunction: test.assertScoringFunction as ScoringFunction,
          traceId,
        }),
    );
    applyGradingResult(ret, checkResult);
  } catch (error) {
    if (!isGradingAbort(error, abortSignal)) {
      throw error;
    }
    applyGradingError(ret, error, abortSignal);
  }
  ret.response = processedResponse;
}

async function transformRunEvalResponse({
  evalId,
  prompt,
  promptIdx,
  provider,
  response,
  test,
  testIdx,
  vars,
}: {
  evalId?: string;
  prompt: Prompt;
  promptIdx: number;
  provider: ApiProvider;
  response: ProviderResponse;
  test: AtomicTestCase;
  testIdx: number;
  vars: Vars;
}): Promise<{
  processedResponse: ProviderResponse;
  providerTransformedOutput: ProviderResponse['output'];
}> {
  const processedResponse = { ...response };
  if (provider.transform) {
    processedResponse.output = await transform(provider.transform, processedResponse.output, {
      vars,
      prompt,
    });
  }
  const providerTransformedOutput = processedResponse.output;

  const testTransform = test.options?.transform || test.options?.postprocess;
  if (testTransform) {
    processedResponse.output = await transform(testTransform, processedResponse.output, {
      vars,
      prompt,
      ...(response && response.metadata && { metadata: response.metadata }),
    });
  }

  invariant(processedResponse.output != null, 'Response output should not be null');
  const blobbedResponse = await extractAndStoreBinaryData(processedResponse, {
    evalId,
    testIdx,
    promptIdx,
  });

  return {
    processedResponse: blobbedResponse || processedResponse,
    providerTransformedOutput,
  };
}

export function getTraceId(
  traceContext: Awaited<ReturnType<typeof generateTraceContextIfNeeded>> | undefined,
) {
  if (!traceContext?.traceparent) {
    return undefined;
  }
  // W3C traceparent: `version-traceId-spanId-flags`. Version 00 has exactly 4 dash-separated
  // parts; future versions MAY append fields after flags. Validate the required fields before
  // surfacing linkage so malformed or sentinel IDs never become persisted row metadata.
  const parts = traceContext.traceparent.split('-');
  const [version, traceId, parentId, flags] = parts;
  const validPartCount = version === '00' ? parts.length === 4 : parts.length >= 4;
  const validTraceId = /^[0-9a-f]{32}$/.test(traceId) && !/^0+$/.test(traceId);
  const validParentId = /^[0-9a-f]{16}$/.test(parentId) && !/^0+$/.test(parentId);
  if (
    !/^[0-9a-f]{2}$/.test(version) ||
    version === 'ff' ||
    !validPartCount ||
    !validTraceId ||
    !validParentId ||
    !/^[0-9a-f]{2}$/.test(flags)
  ) {
    logger.warn(`[Evaluator] Malformed traceparent; dropping trace linkage on this row.`);
    return undefined;
  }
  return traceId;
}

export function getTraceLinkage(
  traceContext: Awaited<ReturnType<typeof generateTraceContextIfNeeded>> | undefined,
  evalId?: string,
) {
  const traceId = getTraceId(traceContext);
  // Only set evaluationId when a trace context exists. Pairing it with traceId keeps
  // the field's presence as a "this row was traced" signal for downstream consumers.
  const evaluationId = traceContext ? (traceContext.evaluationId ?? evalId) : undefined;
  return {
    ...(traceId ? { traceId } : {}),
    ...(evaluationId ? { evaluationId } : {}),
  };
}

/**
 * Runs a single test case.
 * @param options - The options for running the test case.
 * {
 *   provider - The provider to use for the test case.
 *   prompt - The raw prompt to use for the test case.
 *   test - The test case to run with assertions, etc.
 *   delay - A delay in ms to wait before any provider calls
 *   nunjucksFilters - The nunjucks filters to use for the test case.
 *   evaluateOptions - Currently unused
 *   testIdx - The index of the test case among all tests (row in the results table).
 *   promptIdx - The index of the prompt among all prompts (column in the results table).
 *   conversations - Evals can be run serially across multiple turns of a conversation. This gives access to the conversation history.
 *   registers - The registers to use for the test case to store values for later tests.
 *   isRedteam - Whether the test case is a redteam test case.
 * }
 * @returns The result of the test case.
 */
export async function runEval(options: RunEvalOptions): Promise<EvaluateResult[]> {
  return withCacheEnabled(options.evaluateOptions?.cache === false ? false : isCacheEnabled(), () =>
    withCacheNamespace(getRepeatCacheNamespace(options.repeatIndex, options.evaluateOptions), () =>
      runEvalInternal(options),
    ),
  );
}

export async function runEvalInternal(
  {
    provider,
    prompt, // raw prompt
    test,
    testSuite,
    delay,
    nunjucksFilters: filters,
    evaluateOptions,
    // TODO(ian): Rename these public `Idx` fields to `Index` with compatibility handling.
    testIdx: testIndex,
    promptIdx: promptIndex,
    repeatGroupId,
    repeatIndex,
    conversations,
    registers,
    isRedteam,
    abortSignal,
    deferGrading,
    evalId,
    providerCallQueue,
    rateLimitRegistry,
  }: RunEvalOptions,
  orchestrationOptions: Pick<InternalEvaluateOptions, 'abortSignal' | 'pauseSignal'> = {
    abortSignal,
  },
): Promise<EvaluateResult[]> {
  provider.delay ??= delay ?? getEnvInt('PROMPTFOO_DELAY_MS', 0);
  invariant(
    typeof provider.delay === 'number',
    `Provider delay should be set for ${provider.label}`,
  );

  const state = createRunEvalState({ provider, prompt, promptIndex, test });
  attachConversationVar({
    conversations,
    conversationKey: state.conversationKey,
    prompt,
    test,
    vars: state.vars,
  });
  Object.assign(state.vars, registers);
  Object.assign(
    state.vars,
    getEvalRuntimeVars({
      evalId,
      promptIndex,
      repeatIndex,
      testIndex,
    }),
  );

  let setup = state.setup;
  let latencyMs = 0;
  let providerCallCompleted = false;
  let traceContext: Awaited<ReturnType<typeof generateTraceContextIfNeeded>> | undefined;
  // The step's copy_working_dir workspace, removed once its assertions have run.
  let workspace: AgentWorkspace | undefined;

  try {
    const rendered = await renderRunEvalPrompt({
      filters,
      isRedteam,
      provider,
      promptForRender: state.promptForRender,
      test,
      testSuite,
      vars: state.vars,
    });
    setup = rendered.setup;
    if (!test.providerOutput) {
      const activeProvider = isApiProvider(test.provider) ? test.provider : provider;
      workspace = await createAgentWorkspaceForConfig(
        { ...activeProvider.config, ...rendered.setup.prompt.config },
        state.vars,
        abortSignal,
      );
    }
    const stepWorkspace = workspace;

    traceContext = test.providerOutput
      ? null
      : await generateTraceContextIfNeeded(
          test,
          evaluateOptions,
          testIndex,
          promptIndex,
          testSuite,
          {
            providerId: (isApiProvider(test.provider) ? test.provider : provider).id(),
            promptLabel: state.promptForRender.label,
            repeatIndex,
          },
        );
    const executionTraceContext = traceContext;
    const runExecution = () =>
      withTestCaseSpan(
        executionTraceContext?.rootSpan,
        async () => {
          const providerCall = await callProviderForRunEval({
            abortSignal,
            pauseSignal: orchestrationOptions.pauseSignal,
            evalId,
            filters,
            promptForRender: {
              ...state.promptForRender,
              config: stepWorkspace
                ? { ...rendered.setup.prompt.config, working_dir: stepWorkspace.dir }
                : rendered.setup.prompt.config,
            },
            provider,
            rateLimitRegistry,
            renderedPrompt: rendered.renderedPrompt,
            repeatIndex,
            test,
            testIndex,
            testSuite,
            traceContext: executionTraceContext,
            vars: state.vars,
          });
          providerCallCompleted = true;
          const response = normalizeCachedTargetResponse(providerCall.response);
          latencyMs = providerCall.latencyMs;
          if (stepWorkspace) {
            response.metadata = { ...response.metadata, ...(await stepWorkspace.metadata()) };
          }

          updateConversationHistory({
            conversationKey: state.conversationKey,
            conversations,
            renderedJson: rendered.renderedJson,
            renderedPrompt: rendered.renderedPrompt,
            response,
          });

          logger.debug('Evaluator response', {
            responsePreview: (safeJsonStringify(response) ?? '').slice(0, 100),
          });
          logger.debug(
            `Evaluator checking cached flag: response.cached = ${Boolean(response.cached)}, provider.delay = ${provider.delay}`,
          );

          await applyProviderDelayIfNeeded(provider, response, abortSignal);

          // The __eval* runtime vars were exposed to prompt/provider rendering above.
          // Build a copy without them for the persisted result, assertions, and
          // graders. state.vars itself is left intact — it is shared by reference
          // with the provider call context.
          const persistedVars = omitEvalRuntimeVars(state.vars);

          const ret = createEvaluateResult({
            fileMetadata: state.fileMetadata,
            latencyMs,
            prompt,
            promptIdx: promptIndex,
            repeatGroupId,
            repeatIndex,
            rendered,
            response,
            setup,
            test,
            testIdx: testIndex,
            traceContext: executionTraceContext,
            evalId,
            vars: persistedVars,
          });

          invariant(ret.tokenUsage, 'This is always defined, just doing this to shut TS up');

          trackProviderUsage(provider, response);
          await applyRunEvalResponseOutcome({
            abortSignal,
            deferredGradingAbortSignal: orchestrationOptions.abortSignal,
            deferGrading,
            evalId,
            latencyMs,
            prompt,
            promptIdx: promptIndex,
            provider,
            providerCallQueue,
            rateLimitRegistry,
            renderedPrompt: rendered.renderedPrompt,
            response,
            ret,
            test,
            testIdx: testIndex,
            testSuite,
            traceContext: executionTraceContext,
            vars: persistedVars,
          });

          // Update token usage stats
          if (response.tokenUsage) {
            accumulateResponseTokenUsage(ret.tokenUsage, response);
          }

          if (test.options?.storeOutputAs && ret.response?.output && registers) {
            // Save the output in a register for later use
            registers[test.options.storeOutputAs] = ret.response.output;
          }

          return [ret];
        },
        (rows) => deferredGradingPromises.get(rows[0]),
      );
    const rows = executionTraceContext
      ? await withProviderCallTracingContext(
          {
            getActiveTraceparent,
            testIndex,
            withGraderSpan,
            withProviderSpan: withTracedProviderCall,
          },
          runExecution,
        )
      : await runExecution();
    // Deferred assertions still need the workspace, so they remove it when they finish.
    const deferredGrading = deferredGradingPromises.get(rows[0]);
    if (workspace && deferredGrading) {
      deferredGradingPromises.set(rows[0], deferredGrading.finally(workspace.remove));
      workspace = undefined;
    }
    return rows;
  } catch (err) {
    if (
      !providerCallCompleted &&
      isCliPauseCancellation(err, abortSignal, orchestrationOptions.pauseSignal)
    ) {
      // Leave incomplete CLI-paused work eligible for resume instead of persisting an ERROR.
      return [];
    }
    const { errorWithStack, metadata, logContext } = buildProviderErrorContext({
      error: err,
      provider,
      test,
      promptIdx: promptIndex,
      testIdx: testIndex,
    });

    // Caller cancellation is expected; independent provider failures remain actionable.
    const cancelled = Boolean(abortSignal?.aborted) && isAbortError(err);
    if (!cancelled) {
      logger.error('Provider call failed during eval', logContext);
    }

    return [
      {
        ...setup,
        // Exclude the __eval* runtime vars from the persisted error result.
        vars: omitEvalRuntimeVars(setup.vars),
        error: errorWithStack,
        success: false,
        failureReason: ResultFailureReason.ERROR,
        score: 0,
        namedScores: {},
        latencyMs,
        promptIdx: promptIndex,
        ...(repeatGroupId !== undefined && { repeatGroupId, repeatIndex }),
        testIdx: testIndex,
        testCase: test,
        promptId: prompt.id || '',
        metadata,
        ...getTraceLinkage(traceContext, evalId),
      },
    ];
  } finally {
    await workspace?.remove();
  }
}

function buildProviderErrorContext({
  error,
  provider,
  test,
  promptIdx,
  testIdx,
}: {
  error: unknown;
  provider: ApiProvider;
  test: AtomicTestCase;
  promptIdx: number;
  testIdx: number;
}) {
  const providerId = provider.id();
  const providerLabel = provider.label;
  // Type guard for errors with HTTP response information
  const errorWithResponse = error as {
    response?: { status?: number; statusText?: string; data?: unknown };
  };
  const status = errorWithResponse?.response?.status;
  const statusText = errorWithResponse?.response?.statusText;
  const responseData = errorWithResponse?.response?.data;
  const responseSnippet = (() => {
    if (responseData == null) {
      return undefined;
    }
    const asString =
      typeof responseData === 'string' ? responseData : safeJsonStringify(responseData);
    if (!asString) {
      return undefined;
    }
    return asString.length > 500 ? `${asString.slice(0, 500)}...` : asString;
  })();
  const errorMessage = String(error);
  const stack = (error as Error)?.stack;
  // Stack traces typically start with the error message, so check if stack already contains
  // the message to avoid duplication like "Error: msg\n\nError: msg\n    at ..."
  const errorWithStack = stack
    ? stack.startsWith(errorMessage)
      ? stack // Stack already contains the message
      : `${errorMessage}\n\n${stack}`
    : errorMessage;

  return {
    errorWithStack,
    metadata: {
      ...(test.metadata || {}),
      errorContext: {
        providerId,
        providerLabel,
        status,
        statusText,
        responseSnippet,
      },
    },
    logContext: {
      providerId,
      providerLabel,
      status,
      statusText,
      responseSnippet,
      promptIdx,
      testIdx,
      pluginId: test.metadata?.pluginId,
      strategyId: test.metadata?.strategyId,
      error,
    },
  };
}
