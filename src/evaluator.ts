import async from 'async';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import { globSync } from 'glob';
import {
  MODEL_GRADED_ASSERTION_TYPES,
  renderMetricName,
  runAssertions,
  runCompareAssertion,
} from './assertions/index';
import { extractAndStoreBinaryData } from './blobs/extractor';
import { getCache } from './cache';
import cliState from './cliState';
import { DEFAULT_MAX_CONCURRENCY, FILE_METADATA_KEY } from './constants';
import { updateSignalFile } from './database/signal';
import { getEnvBool, getEnvInt, getEvalTimeoutMs, getMaxEvalTimeMs, isCI } from './envars';
import { collectFileMetadata, renderPrompt, runExtensionHook } from './evaluatorHelpers';
import logger from './logger';
import { selectMaxScore } from './matchers';
import { generateIdFromPrompt } from './models/prompt';
import { CIProgressReporter } from './progress/ciProgressReporter';
import { maybeEmitAzureOpenAiWarning } from './providers/azure/warnings';
import { providerRegistry } from './providers/providerRegistry';
import { isPromptfooSampleTarget } from './providers/shared';
import { redteamProviderManager } from './redteam/providers/shared';
import { getSessionId } from './redteam/util';
import {
  createProviderRateLimitOptions,
  createRateLimitRegistry,
  type RateLimitRegistry,
} from './scheduler';
import { generatePrompts } from './suggestions';
import telemetry from './telemetry';
import {
  generateTraceContextIfNeeded,
  isOtlpReceiverStarted,
  startOtlpReceiverIfNeeded,
  stopOtlpReceiverIfNeeded,
} from './tracing/evaluatorTracing';
import { getDefaultOtelConfig } from './tracing/otelConfig';
import { flushOtel, initializeOtel, shutdownOtel } from './tracing/otelSdk';
import {
  type Assertion,
  type AssertionType,
  type AtomicTestCase,
  type CompletedPrompt,
  type EvaluateOptions,
  type EvaluateResult,
  type EvaluateStats,
  type Prompt,
  type ProviderResponse,
  ResultFailureReason,
  type RunEvalOptions,
  type TestSuite,
} from './types/index';
import { type ApiProvider, isApiProvider } from './types/providers';
import { JsonlFileWriter } from './util/exportToFile/writeToFile';
import { loadFunction, parseFileUrl } from './util/functions/loadFunction';
import invariant from './util/invariant';
import { safeJsonStringify, summarizeEvaluateResultForLogging } from './util/json';
import { isPromptAllowed } from './util/promptMatching';
import {
  isAnthropicProvider,
  isGoogleProvider,
  isOpenAiProvider,
  isProviderAllowed,
} from './util/provider';
import { promptYesNo } from './util/readline';
import { sleep } from './util/time';
import { TokenUsageTracker } from './util/tokenUsage';
import {
  accumulateAssertionTokenUsage,
  accumulateResponseTokenUsage,
  createEmptyAssertions,
  createEmptyTokenUsage,
} from './util/tokenUsageUtils';
import { type TransformContext, TransformInputType, transform } from './util/transform';
import type { SingleBar } from 'cli-progress';
import type winston from 'winston';

import type Eval from './models/eval';
import type EvalResult from './models/evalResult';
import type {
  EvalConversations,
  EvalRegisters,
  PromptMetrics,
  ProviderOptions,
  ScoringFunction,
  TokenUsage,
  Vars,
  VarValue,
} from './types/index';
import type { CallApiContextParams } from './types/providers';

/**
 * Manages a single progress bar for the evaluation
 */
class ProgressBarManager {
  private progressBar: SingleBar | undefined;
  private isWebUI: boolean;

  // Track overall progress
  private totalCount: number = 0;
  private completedCount: number = 0;
  private concurrency: number = 1;

  constructor(isWebUI: boolean) {
    this.isWebUI = isWebUI;
  }

  /**
   * Initialize progress bar
   */
  async initialize(
    runEvalOptions: RunEvalOptions[],
    concurrency: number,
    compareRowsCount: number,
  ): Promise<void> {
    if (this.isWebUI) {
      return;
    }

    this.totalCount = runEvalOptions.length + compareRowsCount;
    this.concurrency = concurrency;

    // Create single progress bar
    this.progressBar = new cliProgress.SingleBar(
      {
        format: (options, params, payload) => {
          const barsize = options.barsize ?? 40;
          const barCompleteString = options.barCompleteString ?? '=';
          const barIncompleteString = options.barIncompleteString ?? '-';

          const bar = barCompleteString.substring(0, Math.round(params.progress * barsize));
          const spaces = barIncompleteString.substring(0, barsize - bar.length);
          const percentage = Math.round(params.progress * 100);

          // Only show errors if count > 0
          const errorsText = payload.errors > 0 ? ` (errors: ${payload.errors})` : '';

          return `Evaluating [${bar}${spaces}] ${percentage}% | ${params.value}/${params.total}${errorsText} | ${payload.provider} ${payload.prompt} ${payload.vars}`;
        },
        hideCursor: true,
        gracefulExit: true,
      },
      cliProgress.Presets.shades_classic,
    );

    // Start the progress bar
    this.progressBar.start(this.totalCount, 0, {
      provider: '',
      prompt: '',
      vars: '',
      errors: 0,
    });
  }

  /**
   * Update progress for a specific evaluation
   */
  updateProgress(
    _index: number,
    evalStep: RunEvalOptions | undefined,
    _phase: 'serial' | 'concurrent' = 'concurrent',
    metrics?: PromptMetrics,
  ): void {
    if (this.isWebUI || !evalStep || !this.progressBar) {
      return;
    }

    this.completedCount++;
    const provider = evalStep.provider.label || evalStep.provider.id();
    const prompt = `"${evalStep.prompt.raw.slice(0, 10).replace(/\n/g, ' ')}"`;
    const vars = formatVarsForDisplay(evalStep.test.vars, 40);

    this.progressBar.increment({
      provider,
      prompt: prompt || '""',
      vars: vars || '',
      errors: metrics?.testErrorCount ?? 0,
    });
  }

  /**
   * Update comparison progress
   */
  updateComparisonProgress(prompt: string): void {
    if (this.isWebUI || !this.progressBar) {
      return;
    }

    this.completedCount++;
    this.progressBar.increment({
      provider: 'Grading',
      prompt: `"${prompt.slice(0, 10).replace(/\n/g, ' ')}"`,
      vars: '',
      errors: 0,
    });
  }

  /**
   * Update total count when comparison count is determined
   */
  updateTotalCount(additionalCount: number): void {
    if (this.isWebUI || !this.progressBar || additionalCount <= 0) {
      return;
    }

    this.totalCount += additionalCount;
    this.progressBar.setTotal(this.totalCount);
  }

  /**
   * Mark evaluation as complete
   */
  complete(): void {
    if (this.isWebUI || !this.progressBar) {
      return;
    }

    // Just ensure we're at 100% - the bar will be stopped in stop()
    this.progressBar.update(this.totalCount);
  }

  /**
   * Stop the progress bar
   */
  stop(): void {
    if (this.progressBar) {
      this.progressBar.stop();
    }
  }
}

/**
 * Update token usage metrics with assertion token usage
 */
function updateAssertionMetrics(
  metrics: { tokenUsage: Partial<TokenUsage> },
  assertionTokens: Partial<TokenUsage>,
): void {
  if (metrics.tokenUsage && assertionTokens) {
    if (!metrics.tokenUsage.assertions) {
      metrics.tokenUsage.assertions = createEmptyAssertions();
    }

    // Accumulate assertion tokens using the specialized assertion function
    accumulateAssertionTokenUsage(metrics.tokenUsage.assertions, assertionTokens);
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

/**
 * Calls the provider API and returns the raw response, given a rendered prompt.
 */
async function callProviderApi({
  provider,
  prompt,
  renderedPrompt,
  mergedPromptConfig,
  vars,
  filters,
  evaluateOptions,
  testIdx,
  promptIdx,
  repeatIndex,
  abortSignal,
  evalId,
  rateLimitRegistry,
  test,
  testSuite,
}: {
  provider: ApiProvider;
  prompt: Prompt;
  renderedPrompt: string;
  mergedPromptConfig: Record<string, unknown>;
  vars: Vars;
  filters: RunEvalOptions['nunjucksFilters'];
  evaluateOptions: RunEvalOptions['evaluateOptions'];
  testIdx: number;
  promptIdx: number;
  repeatIndex: number;
  abortSignal: RunEvalOptions['abortSignal'];
  evalId: RunEvalOptions['evalId'];
  rateLimitRegistry: RunEvalOptions['rateLimitRegistry'];
  test: AtomicTestCase;
  testSuite: RunEvalOptions['testSuite'];
}): Promise<{
  response: ProviderResponse;
  traceContext: Awaited<ReturnType<typeof generateTraceContextIfNeeded>>;
}> {
  const activeProvider = isApiProvider(test.provider) ? test.provider : provider;
  logger.debug(`Provider type: ${activeProvider.id()}`);

  const traceContext = await generateTraceContextIfNeeded(
    test,
    evaluateOptions,
    testIdx,
    promptIdx,
    testSuite,
  );

  const promptWithMergedConfig = { ...prompt, config: mergedPromptConfig };
  const callApiContext: CallApiContextParams = {
    vars,
    prompt: promptWithMergedConfig,
    filters,
    originalProvider: provider,
    test,
    logger: logger as unknown as winston.Logger,
    getCache,
    repeatIndex,
  };

  if (repeatIndex > 0) {
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

  let response: ProviderResponse;
  if (rateLimitRegistry) {
    response = await rateLimitRegistry.execute(
      activeProvider,
      () =>
        activeProvider.callApi(
          renderedPrompt,
          callApiContext,
          abortSignal ? { abortSignal } : undefined,
        ),
      createProviderRateLimitOptions(),
    );
  } else {
    response = await activeProvider.callApi(
      renderedPrompt,
      callApiContext,
      abortSignal ? { abortSignal } : undefined,
    );
  }

  // Sanitize response metadata to remove circular references (e.g., leaked Timeout objects)
  // This MUST happen here - circular refs cause heap overflow during downstream processing
  // (logging, deep cloning, etc.) before reaching sanitizeForDb in evalResult.ts
  // See: https://github.com/promptfoo/promptfoo/issues/7266
  if (response.metadata) {
    const sanitizedMetadata = safeJsonStringify(response.metadata);
    response.metadata = sanitizedMetadata ? JSON.parse(sanitizedMetadata) : {};
  }

  logger.debug(`Provider response properties: ${Object.keys(response).join(', ')}`);
  logger.debug(`Provider response cached property explicitly: ${response.cached}`);

  return { response, traceContext };
}

/**
 * Applies provider-level and test-level output transforms, extracts blobs.
 */
async function applyOutputTransforms({
  response,
  provider,
  test,
  vars,
  prompt,
  evalId,
  testIdx,
  promptIdx,
}: {
  response: ProviderResponse;
  provider: ApiProvider;
  test: AtomicTestCase;
  vars: Vars;
  prompt: Prompt;
  evalId: RunEvalOptions['evalId'];
  testIdx: number;
  promptIdx: number;
}): Promise<{ processedResponse: ProviderResponse; providerTransformedOutput: unknown }> {
  let processedResponse = { ...response };

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
      ...(response?.metadata && { metadata: response.metadata }),
    });
  }

  invariant(processedResponse.output != null, 'Response output should not be null');

  const blobbedResponse = await extractAndStoreBinaryData(processedResponse, {
    evalId,
    testIdx,
    promptIdx,
  });
  if (blobbedResponse) {
    processedResponse = blobbedResponse;
  }

  return { processedResponse, providerTransformedOutput };
}

/**
 * Runs assertions and populates grading fields on the result.
 */
async function runAssertionsAndUpdateResult({
  ret,
  processedResponse,
  providerTransformedOutput,
  renderedPrompt,
  provider,
  test,
  vars,
  latencyMs,
  traceContext,
}: {
  ret: EvaluateResult;
  processedResponse: ProviderResponse;
  providerTransformedOutput: unknown;
  renderedPrompt: string;
  provider: ApiProvider;
  test: AtomicTestCase;
  vars: Vars;
  latencyMs: number;
  traceContext: Awaited<ReturnType<typeof generateTraceContextIfNeeded>>;
}): Promise<void> {
  let traceId: string | undefined;
  if (traceContext?.traceparent) {
    const parts = traceContext.traceparent.split('-');
    if (parts.length >= 3) {
      traceId = parts[1];
    }
  }

  const checkResult = await runAssertions({
    prompt: renderedPrompt,
    provider,
    providerResponse: {
      ...processedResponse,
      providerTransformedOutput,
    },
    test,
    vars,
    latencyMs,
    assertScoringFunction: test.assertScoringFunction as ScoringFunction,
    traceId,
  });

  if (!checkResult.pass) {
    ret.error = checkResult.reason;
    ret.failureReason = ResultFailureReason.ASSERT;
  }
  ret.success = checkResult.pass;
  ret.score = checkResult.score;
  ret.namedScores = checkResult.namedScores || {};
  const tokenUsage = ret.tokenUsage!;
  if (!tokenUsage.assertions) {
    tokenUsage.assertions = createEmptyAssertions();
  }
  tokenUsage.assertions.numRequests = (tokenUsage.assertions.numRequests ?? 0) + 1;
  if (checkResult.tokensUsed) {
    accumulateAssertionTokenUsage(tokenUsage.assertions, checkResult.tokensUsed);
  }
  ret.response = processedResponse;
  ret.gradingResult = checkResult;
}

/**
 * Updates conversation history with the latest prompt/response pair.
 */
function updateConversationHistory({
  conversations,
  conversationKey,
  renderedPrompt,
  renderedJson,
  response,
}: {
  conversations: EvalConversations | undefined;
  conversationKey: string;
  renderedPrompt: string;
  renderedJson: unknown;
  response: ProviderResponse;
}): void {
  if (!conversations) {
    return;
  }
  const lastInput =
    renderedJson && Array.isArray(renderedJson)
      ? renderedJson[renderedJson.length - 1]?.content || renderedJson[renderedJson.length - 1]
      : undefined;
  conversations[conversationKey] = conversations[conversationKey] || [];
  conversations[conversationKey].push({
    prompt: renderedJson || renderedPrompt,
    input: lastInput || renderedJson || renderedPrompt,
    output: response.output || '',
    metadata: response.metadata,
  });
}

/**
 * Handles the response outcome: sets error fields, handles null output, or runs assertions.
 */
async function processResponseOutcome({
  ret,
  response,
  provider,
  test,
  vars,
  prompt,
  evalId,
  testIdx,
  promptIdx,
  renderedPrompt,
  latencyMs,
  traceContext,
  isRedteam,
}: {
  ret: EvaluateResult;
  response: ProviderResponse;
  provider: ApiProvider;
  test: AtomicTestCase;
  vars: Vars;
  prompt: Prompt;
  evalId: RunEvalOptions['evalId'];
  testIdx: number;
  promptIdx: number;
  renderedPrompt: string;
  latencyMs: number;
  traceContext: Awaited<ReturnType<typeof generateTraceContextIfNeeded>>;
  isRedteam: boolean | undefined;
}): Promise<void> {
  if (response.error) {
    ret.error = response.error;
    ret.failureReason = ResultFailureReason.ERROR;
    ret.success = false;
    return;
  }

  if (response.output === null || response.output === undefined) {
    // NOTE: empty output often indicative of guardrails, so behavior differs for red teams.
    if (isRedteam) {
      ret.success = true;
    } else {
      ret.success = false;
      ret.score = 0;
      ret.error = 'No output';
    }
    return;
  }

  const { processedResponse, providerTransformedOutput } = await applyOutputTransforms({
    response,
    provider,
    test,
    vars,
    prompt,
    evalId,
    testIdx,
    promptIdx,
  });

  await runAssertionsAndUpdateResult({
    ret,
    processedResponse,
    providerTransformedOutput,
    renderedPrompt,
    provider,
    test,
    vars,
    latencyMs: response.latencyMs ?? latencyMs,
    traceContext,
  });
}

/**
 * Tracks provider-level token usage in the global tracker.
 */
function trackProviderTokenUsage(provider: ApiProvider, response: ProviderResponse): void {
  if (!response.tokenUsage) {
    return;
  }
  const providerId = provider.id();
  const trackingId = provider.constructor?.name
    ? `${providerId} (${provider.constructor.name})`
    : providerId;
  TokenUsageTracker.getInstance().trackUsage(trackingId, response.tokenUsage);
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
export async function runEval({
  provider,
  prompt, // raw prompt
  test,
  testSuite,
  delay,
  nunjucksFilters: filters,
  evaluateOptions,
  testIdx,
  promptIdx,
  repeatIndex,
  conversations,
  registers,
  isRedteam,
  abortSignal,
  evalId,
  rateLimitRegistry,
}: RunEvalOptions): Promise<EvaluateResult[]> {
  const promptLabel = prompt.label;

  provider.delay ??= delay ?? getEnvInt('PROMPTFOO_DELAY_MS', 0);
  invariant(
    typeof provider.delay === 'number',
    `Provider delay should be set for ${provider.label}`,
  );

  // Deep clone vars to prevent mutation of the original test.vars.
  // This is important because providers (especially multi-turn strategies like GOAT,
  // Crescendo) may add runtime variables like sessionId to vars during execution.
  // Without this deep clone, mutations to nested objects would persist to the stored
  // testCase, causing non-deterministic behavior where test execution order affects results.
  const vars = structuredClone(test.vars || {});

  const fileMetadata = collectFileMetadata(test.vars || vars);

  const conversationKey = `${provider.label || provider.id()}:${prompt.id}${test.metadata?.conversationId ? `:${test.metadata.conversationId}` : ''}`;
  if (
    !getEnvBool('PROMPTFOO_DISABLE_CONVERSATION_VAR') &&
    !test.options?.disableConversationVar &&
    prompt.raw.includes('_conversation')
  ) {
    vars._conversation = conversations?.[conversationKey] || [];
  }

  Object.assign(vars, registers);

  const mergedPromptConfig = {
    ...(prompt.config ?? {}),
    ...(test.options ?? {}),
  };
  const setup = {
    provider: {
      id: provider.id(),
      label: provider.label,
      config: provider.config,
    },
    prompt: {
      raw: '',
      label: promptLabel,
      config: mergedPromptConfig,
    },
    vars,
  };
  let latencyMs = 0;
  let traceContext: Awaited<ReturnType<typeof generateTraceContextIfNeeded>> = null;

  try {
    // For redteam tests, skip rendering the inject variable to prevent double-rendering of
    // attack payloads that may contain template syntax (e.g., {{purpose | trim}})
    const skipRenderVars = isRedteam ? [testSuite?.redteam?.injectVar ?? 'prompt'] : undefined;
    const renderedPrompt = await renderPrompt(prompt, vars, filters, provider, skipRenderVars);
    let renderedJson = undefined;
    try {
      renderedJson = JSON.parse(renderedPrompt);
    } catch {}
    setup.prompt.raw = renderedPrompt;

    const startTime = Date.now();
    let response: ProviderResponse = {
      output: '',
      tokenUsage: createEmptyTokenUsage(),
      cost: 0,
      cached: false,
    };

    if (test.providerOutput) {
      response.output = test.providerOutput;
    } else {
      const result = await callProviderApi({
        provider,
        prompt,
        renderedPrompt,
        mergedPromptConfig,
        vars,
        filters,
        evaluateOptions,
        testIdx,
        promptIdx,
        repeatIndex,
        abortSignal,
        evalId,
        rateLimitRegistry,
        test,
        testSuite,
      });
      response = result.response;
      traceContext = result.traceContext;
    }

    const endTime = Date.now();
    latencyMs = endTime - startTime;

    updateConversationHistory({
      conversations,
      conversationKey,
      renderedPrompt,
      renderedJson,
      response,
    });

    logger.debug('Evaluator response', {
      responsePreview: (safeJsonStringify(response) ?? '').slice(0, 100),
    });
    logger.debug(
      `Evaluator checking cached flag: response.cached = ${Boolean(response.cached)}, provider.delay = ${provider.delay}`,
    );

    if (!response.cached && provider.delay > 0) {
      logger.debug(`Sleeping for ${provider.delay}ms`);
      await sleep(provider.delay);
    } else if (response.cached) {
      logger.debug(`Skipping delay because response is cached`);
    }

    const ret: EvaluateResult = {
      ...setup,
      response,
      success: false,
      failureReason: ResultFailureReason.NONE,
      score: 0,
      namedScores: {},
      latencyMs: response.latencyMs ?? latencyMs,
      cost: response.cost,
      metadata: {
        ...test.metadata,
        ...response.metadata,
        [FILE_METADATA_KEY]: fileMetadata,
      },
      promptIdx,
      testIdx,
      testCase: test,
      promptId: prompt.id || '',
      tokenUsage: createEmptyTokenUsage(),
    };

    if (!ret.metadata?.sessionIds && !ret.metadata?.sessionId) {
      ret.metadata ??= {};
      ret.metadata.sessionId = getSessionId(response, { vars });
    }

    invariant(ret.tokenUsage, 'This is always defined, just doing this to shut TS up');

    trackProviderTokenUsage(provider, response);

    await processResponseOutcome({
      ret,
      response,
      provider,
      test,
      vars,
      prompt,
      evalId,
      testIdx,
      promptIdx,
      renderedPrompt,
      latencyMs,
      traceContext,
      isRedteam,
    });

    if (response.tokenUsage) {
      accumulateResponseTokenUsage(ret.tokenUsage, response);
    }

    if (test.options?.storeOutputAs && ret.response?.output && registers) {
      registers[test.options.storeOutputAs] = ret.response.output;
    }

    return [ret];
  } catch (err) {
    const { errorWithStack, metadata, logContext } = buildProviderErrorContext({
      error: err,
      provider,
      test,
      promptIdx,
      testIdx,
    });

    logger.error('Provider call failed during eval', logContext);

    return [
      {
        ...setup,
        error: errorWithStack,
        success: false,
        failureReason: ResultFailureReason.ERROR,
        score: 0,
        namedScores: {},
        latencyMs,
        promptIdx,
        testIdx,
        testCase: test,
        promptId: prompt.id || '',
        metadata,
      },
    ];
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

/**
 * Safely formats variables for display in progress bars and logs.
 * Handles extremely large variables that could cause RangeError crashes.
 *
 * @param vars - Variables to format
 * @param maxLength - Maximum length of the final formatted string
 * @returns Formatted variables string or fallback message
 */
export function formatVarsForDisplay(
  vars: Record<string, unknown> | undefined,
  maxLength: number,
): string {
  if (!vars || Object.keys(vars).length === 0) {
    return '';
  }

  try {
    // Simple approach: limit individual values, then truncate the whole result
    const formatted = Object.entries(vars)
      .map(([key, value]) => {
        // Prevent memory issues by limiting individual values first
        const valueStr = String(value).slice(0, 100);
        return `${key}=${valueStr}`;
      })
      .join(' ')
      .replace(/\n/g, ' ')
      .slice(0, maxLength);

    return formatted;
  } catch {
    // Any error - return safe fallback
    return '[vars unavailable]';
  }
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

class Evaluator {
  evalRecord: Eval;
  testSuite: TestSuite;
  options: EvaluateOptions;
  stats: EvaluateStats;
  conversations: EvalConversations;
  registers: EvalRegisters;
  fileWriters: JsonlFileWriter[];
  rateLimitRegistry: RateLimitRegistry | undefined;

  constructor(testSuite: TestSuite, evalRecord: Eval, options: EvaluateOptions) {
    this.testSuite = testSuite;
    this.evalRecord = evalRecord;
    this.options = options;
    this.stats = {
      successes: 0,
      failures: 0,
      errors: 0,
      tokenUsage: createEmptyTokenUsage(),
    };
    this.conversations = {};
    this.registers = {};

    const jsonlFiles = Array.isArray(evalRecord.config.outputPath)
      ? evalRecord.config.outputPath.filter((p) => p.endsWith('.jsonl'))
      : evalRecord.config.outputPath?.endsWith('.jsonl')
        ? [evalRecord.config.outputPath]
        : [];

    this.fileWriters = jsonlFiles.map((p) => new JsonlFileWriter(p));

    // Create rate limit registry for adaptive concurrency control
    this.rateLimitRegistry = createRateLimitRegistry({
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
    result: EvalResult,
    passed: boolean,
    reason: string,
    tokensUsed: TokenUsage | undefined,
    wasSuccess: boolean,
    wasScore: number,
    metrics: CompletedPrompt['metrics'] | undefined,
  ): void {
    if (metrics) {
      metrics.assertPassCount += passed ? 1 : 0;
      metrics.assertFailCount += passed ? 0 : 1;
      if (tokensUsed) {
        updateAssertionMetrics(metrics, tokensUsed);
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
      this.stats.successes -= 1;
      this.stats.failures += 1;
    }
  }

  /**
   * Accumulates model-graded assertion token usage for a row into stats.
   */
  private accumulateModelGradedTokenUsage(row: EvaluateResult): void {
    if (!row.gradingResult?.tokensUsed || !row.testCase?.assert) {
      return;
    }
    for (const assertion of row.testCase.assert) {
      if (MODEL_GRADED_ASSERTION_TYPES.has(assertion.type as AssertionType)) {
        if (!this.stats.tokenUsage.assertions) {
          this.stats.tokenUsage.assertions = createEmptyAssertions();
        }
        accumulateAssertionTokenUsage(
          this.stats.tokenUsage.assertions,
          row.gradingResult.tokensUsed,
        );
        break;
      }
    }
  }

  /**
   * Updates global eval stats (successes/failures/errors) for a single row.
   */
  private updateEvalStats(row: EvaluateResult): void {
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

  /**
   * Computes derived metrics for a prompt given the current named scores.
   */
  private async computeDerivedMetrics(
    metrics: NonNullable<CompletedPrompt['metrics']>,
    evalStep: RunEvalOptions,
    testSuite: TestSuite,
    promptEvalCount: number,
  ): Promise<void> {
    if (!testSuite.derivedMetrics) {
      return;
    }
    const math = await import('mathjs');
    if (Object.prototype.hasOwnProperty.call(metrics.namedScores, '__count')) {
      logger.warn("Metric name '__count' is reserved for derived metrics and will be overridden.");
    }
    const evalContext: Record<string, number> = {
      ...metrics.namedScores,
      __count: promptEvalCount,
    };
    for (const metric of testSuite.derivedMetrics) {
      if (metrics.namedScores[metric.name] === undefined) {
        metrics.namedScores[metric.name] = 0;
      }
      try {
        if (typeof metric.value === 'function') {
          metrics.namedScores[metric.name] = metric.value(evalContext, evalStep);
        } else {
          metrics.namedScores[metric.name] = math.evaluate(metric.value, evalContext);
        }
        evalContext[metric.name] = metrics.namedScores[metric.name];
      } catch (error) {
        logger.debug(
          `Could not evaluate derived metric '${metric.name}': ${(error as Error).message}`,
        );
      }
    }
  }

  /**
   * Updates prompt-level metrics (named scores, pass/fail counts, latency, etc.) for a row.
   */
  private async updatePromptMetrics(
    row: EvaluateResult,
    metrics: NonNullable<CompletedPrompt['metrics']>,
    evalStep: RunEvalOptions,
    testSuite: TestSuite,
  ): Promise<void> {
    metrics.score += row.score;

    const testVars = row.testCase?.vars || {};
    for (const [key, value] of Object.entries(row.namedScores)) {
      metrics.namedScores[key] = (metrics.namedScores[key] || 0) + value;
      let contributingAssertions = 0;
      row.gradingResult?.componentResults?.forEach((result) => {
        const renderedMetric = renderMetricName(result.assertion?.metric, testVars);
        if (renderedMetric === key) {
          contributingAssertions++;
        }
      });
      metrics.namedScoresCount[key] =
        (metrics.namedScoresCount[key] || 0) + (contributingAssertions || 1);
    }

    // Increment pass/fail/error counts synchronously BEFORE any await. This prevents
    // race conditions in concurrent execution: all concurrent tasks increment their
    // counts during their synchronous section, so by the time any task reaches
    // computeDerivedMetrics (after await import('mathjs')), promptEvalCount correctly
    // reflects how many evaluations have completed up to and including this row.
    metrics.testPassCount += row.success ? 1 : 0;
    if (!row.success) {
      if (row.failureReason === ResultFailureReason.ERROR) {
        metrics.testErrorCount += 1;
      } else {
        metrics.testFailCount += 1;
      }
    }

    // promptEvalCount is now correct because pass/fail/error were already incremented above
    const promptEvalCount = metrics.testPassCount + metrics.testFailCount + metrics.testErrorCount;
    await this.computeDerivedMetrics(metrics, evalStep, testSuite, promptEvalCount);
    metrics.assertPassCount +=
      row.gradingResult?.componentResults?.filter((r) => r.pass).length || 0;
    metrics.assertFailCount +=
      row.gradingResult?.componentResults?.filter((r) => !r.pass).length || 0;
    metrics.totalLatencyMs += row.latencyMs || 0;
    accumulateResponseTokenUsage(metrics.tokenUsage, row.response);
    if (row.gradingResult?.tokensUsed) {
      updateAssertionMetrics(metrics, row.gradingResult.tokensUsed);
    }
    metrics.cost += row.cost || 0;
  }

  /**
   * Builds the completed prompts list from provider/prompt combinations.
   */
  private buildPromptsList(testSuite: TestSuite): CompletedPrompt[] {
    const prompts: CompletedPrompt[] = [];
    const existingPromptsMap = new Map<string, CompletedPrompt>();

    if (cliState.resume && this.evalRecord.persisted && this.evalRecord.prompts.length > 0) {
      logger.debug('Resuming evaluation: preserving metrics from previous run');
      for (const existingPrompt of this.evalRecord.prompts) {
        const key = `${existingPrompt.provider}:${existingPrompt.id}`;
        existingPromptsMap.set(key, existingPrompt);
      }
    }

    for (const provider of testSuite.providers) {
      for (const prompt of testSuite.prompts) {
        const providerKey = provider.label || provider.id();
        if (!isAllowedPrompt(prompt, testSuite.providerPromptMap?.[providerKey])) {
          continue;
        }
        const promptId = generateIdFromPrompt(prompt);
        const existingPrompt = existingPromptsMap.get(`${providerKey}:${promptId}`);
        prompts.push({
          ...prompt,
          id: promptId,
          provider: providerKey,
          label: prompt.label,
          metrics: existingPrompt?.metrics || {
            score: 0,
            testPassCount: 0,
            testFailCount: 0,
            testErrorCount: 0,
            assertPassCount: 0,
            assertFailCount: 0,
            totalLatencyMs: 0,
            tokenUsage: createEmptyTokenUsage(),
            namedScores: {},
            namedScoresCount: {},
            cost: 0,
          },
        });
      }
    }

    return prompts;
  }

  /**
   * Expands scenario configs into test cases and appends to the existing tests array.
   */
  private buildTestsFromScenarios(tests: AtomicTestCase[], testSuite: TestSuite): AtomicTestCase[] {
    if (!testSuite.scenarios || testSuite.scenarios.length === 0) {
      return tests;
    }
    telemetry.record('feature_used', { feature: 'scenarios' });
    let scenarioIndex = 0;
    const result = [...tests];
    for (const scenario of testSuite.scenarios) {
      for (const data of scenario.config) {
        const scenarioTests = (scenario.tests || [{}]).map((test) => {
          const mergedMetadata = {
            ...(typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest?.metadata : {}),
            ...data.metadata,
            ...test.metadata,
          };
          if (!mergedMetadata.conversationId) {
            mergedMetadata.conversationId = `__scenario_${scenarioIndex}__`;
          }
          return {
            ...(typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest : {}),
            ...data,
            ...test,
            vars: {
              ...(typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest?.vars : {}),
              ...data.vars,
              ...test.vars,
            },
            options: {
              ...(typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest?.options : {}),
              ...test.options,
            },
            assert: [...(data.assert || []), ...(test.assert || [])],
            metadata: mergedMetadata,
          };
        });
        result.push(...scenarioTests);
        scenarioIndex++;
      }
    }
    return result;
  }

  /**
   * Applies defaultTest properties to a test case and loads its provider if needed.
   */
  private async applyDefaultTestProperties(
    testCase: AtomicTestCase,
    testSuite: TestSuite,
  ): Promise<void> {
    const defaultTest =
      typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest : undefined;

    testCase.assert = [...(defaultTest?.assert || []), ...(testCase.assert || [])];
    testCase.threshold = testCase.threshold ?? defaultTest?.threshold;
    testCase.options = { ...(defaultTest?.options || {}), ...testCase.options };
    testCase.metadata = { ...(defaultTest?.metadata || {}), ...testCase.metadata };
    testCase.prompts = testCase.prompts ?? defaultTest?.prompts;
    testCase.assertScoringFunction =
      testCase.assertScoringFunction ?? defaultTest?.assertScoringFunction;
    testCase.providers = testCase.providers ?? defaultTest?.providers;

    if (!testCase.provider && defaultTest?.provider) {
      const defaultProvider = defaultTest.provider;
      if (isApiProvider(defaultProvider)) {
        testCase.provider = defaultProvider;
      } else if (typeof defaultProvider === 'object' && defaultProvider.id) {
        const { loadApiProvider } = await import('./providers');
        const providerId =
          typeof defaultProvider.id === 'function' ? defaultProvider.id() : defaultProvider.id;
        testCase.provider = await loadApiProvider(providerId, {
          options: defaultProvider as ProviderOptions,
        });
      } else {
        testCase.provider = defaultProvider;
      }
    }

    if (typeof testCase.assertScoringFunction === 'string') {
      const { filePath: resolvedPath, functionName } = parseFileUrl(testCase.assertScoringFunction);
      testCase.assertScoringFunction = await loadFunction<ScoringFunction>({
        filePath: resolvedPath,
        functionName,
      });
    }
  }

  /**
   * Builds a single test object for runEval, injecting tracing metadata if enabled.
   */
  private buildTestForRunEval(
    testCase: AtomicTestCase,
    vars: Vars,
    testSuite: TestSuite,
  ): AtomicTestCase {
    const globalGraderExamples = testSuite.redteam?.graderExamples;
    const testOptions = globalGraderExamples
      ? { ...testCase.options, redteamGraderExamples: globalGraderExamples }
      : testCase.options;

    const baseTest = { ...testCase, vars, options: testOptions };
    const tracingEnabled =
      getEnvBool('PROMPTFOO_TRACING_ENABLED', false) ||
      testCase.metadata?.tracingEnabled === true ||
      testSuite.tracing?.enabled === true;

    logger.debug(
      `[Evaluator] Tracing check: env=${getEnvBool('PROMPTFOO_TRACING_ENABLED', false)}, testCase.metadata?.tracingEnabled=${testCase.metadata?.tracingEnabled}, testSuite.tracing?.enabled=${testSuite.tracing?.enabled}, tracingEnabled=${tracingEnabled}`,
    );

    if (tracingEnabled) {
      return {
        ...baseTest,
        metadata: {
          ...testCase.metadata,
          tracingEnabled: true,
          evaluationId: this.evalRecord.id,
        },
      };
    }
    return baseTest;
  }

  /**
   * Writes timeout result entries for all unprocessed eval steps.
   */
  private async writeTimeoutResultsForUnprocessed(
    runEvalOptions: RunEvalOptions[],
    processedIndices: Set<number>,
    prompts: CompletedPrompt[],
    startTime: number,
    maxEvalTimeMs: number,
  ): Promise<void> {
    for (let i = 0; i < runEvalOptions.length; i++) {
      if (processedIndices.has(i)) {
        continue;
      }
      const evalStep = runEvalOptions[i];
      const timeoutResult = {
        provider: {
          id: evalStep.provider.id(),
          label: evalStep.provider.label,
          config: evalStep.provider.config,
        },
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
        testIdx: evalStep.testIdx,
        testCase: evalStep.test,
        promptId: evalStep.prompt.id || '',
      } as EvaluateResult;

      await this.evalRecord.addResult(timeoutResult);
      this.stats.errors++;
      const { metrics } = prompts[evalStep.promptIdx];
      if (metrics) {
        metrics.testErrorCount += 1;
        metrics.totalLatencyMs += timeoutResult.latencyMs;
      }
    }
  }

  /**
   * Merges a comparison grading result into an existing eval result.
   */
  private mergeGradingResultIntoResult(
    result: EvalResult,
    gradingResult: Awaited<ReturnType<typeof runCompareAssertion>>[number],
  ): void {
    if (result.gradingResult) {
      result.gradingResult.tokensUsed = result.gradingResult.tokensUsed || {
        total: 0,
        prompt: 0,
        completion: 0,
      };

      if (gradingResult.tokensUsed) {
        updateAssertionMetrics(
          { tokenUsage: { assertions: result.gradingResult.tokensUsed } },
          gradingResult.tokensUsed,
        );

        if (result.testCase?.assert) {
          for (const assertion of result.testCase.assert) {
            if (MODEL_GRADED_ASSERTION_TYPES.has(assertion.type as AssertionType)) {
              updateAssertionMetrics(
                { tokenUsage: this.stats.tokenUsage },
                gradingResult.tokensUsed,
              );
              break;
            }
          }
        }
      }

      result.success = result.gradingResult.pass = result.gradingResult.pass && gradingResult.pass;
      if (!gradingResult.pass) {
        result.gradingResult.reason = gradingResult.reason;
        result.score = result.gradingResult.score = gradingResult.score;
      }
      if (!result.gradingResult.componentResults) {
        result.gradingResult.componentResults = [];
      }
      result.gradingResult.componentResults.push(gradingResult);
    } else {
      const newPass = result.success && gradingResult.pass;
      result.gradingResult = { ...gradingResult, pass: newPass };
      result.success = newPass;
      if (!gradingResult.pass) {
        result.score = result.gradingResult.score = gradingResult.score;
      }
    }
  }

  /**
   * Processes select-best comparison assertions for all matching test rows.
   */
  private async processSelectBestComparisons(
    rowsWithSelectBestAssertion: Set<number>,
    prompts: CompletedPrompt[],
    isWebUI: boolean,
    compareRowsCount: number,
    progressBarManager: ProgressBarManager | null,
    ciProgressReporter: CIProgressReporter | null,
    runEvalOptions: RunEvalOptions[],
  ): Promise<void> {
    let compareCount = 0;
    for (const testIdx of rowsWithSelectBestAssertion) {
      compareCount++;

      if (isWebUI) {
        logger.info(`Running model-graded comparison ${compareCount} of ${compareRowsCount}...`);
      }

      const resultsToCompare = this.evalRecord.persisted
        ? await this.evalRecord.fetchResultsByTestIdx(testIdx)
        : this.evalRecord.results.filter((r) => r.testIdx === testIdx);

      if (resultsToCompare.length === 0) {
        logger.warn(`Expected results to be found for test index ${testIdx}`);
        continue;
      }

      const compareAssertion = resultsToCompare[0].testCase.assert?.find(
        (a) => a.type === 'select-best',
      ) as Assertion;

      if (!compareAssertion) {
        continue;
      }

      const outputs = resultsToCompare.map((r) => r.response?.output || '');
      const firstResult = resultsToCompare[0];
      const providerId = firstResult.provider.id;
      const originalProvider = this.testSuite.providers.find((p) => p.id() === providerId);
      const callApiContext = originalProvider
        ? { originalProvider, prompt: firstResult.prompt, vars: firstResult.testCase.vars || {} }
        : undefined;

      const gradingResults = await runCompareAssertion(
        resultsToCompare[0].testCase,
        compareAssertion,
        outputs,
        callApiContext,
      );

      for (let index = 0; index < resultsToCompare.length; index++) {
        const result = resultsToCompare[index];
        const gradingResult = gradingResults[index];
        const wasSuccess = result.success;
        const wasScore = result.score;
        const metrics = prompts[result.promptIdx]?.metrics;

        this.mergeGradingResultIntoResult(result, gradingResult);
        this.updateComparisonStats(
          result,
          gradingResult.pass,
          gradingResult.reason || '',
          gradingResult.tokensUsed,
          wasSuccess,
          wasScore,
          metrics,
        );

        if (this.evalRecord.persisted) {
          await result.save();
        }
      }

      if (progressBarManager) {
        progressBarManager.updateComparisonProgress(resultsToCompare[0].prompt.raw);
      } else if (ciProgressReporter) {
        ciProgressReporter.update(runEvalOptions.length + compareCount);
      } else if (!isWebUI) {
        logger.debug(`Model-graded comparison #${compareCount} of ${compareRowsCount} complete`);
      }
    }
  }

  /**
   * Processes max-score assertions for all matching test rows.
   */
  /**
   * Applies a max-score grading result to a single eval result, updating pass/score/gradingResult.
   */
  private async applyMaxScoreResultToEvalResult(
    result: EvalResult,
    maxScoreGradingResult: ReturnType<typeof Object.assign> & {
      pass: boolean;
      score: number;
      reason?: string;
      tokensUsed?: TokenUsage;
      namedScores?: Record<string, number>;
      assertion: Assertion;
    },
    prompts: CompletedPrompt[],
    wasSuccess: boolean,
    wasScore: number,
  ): Promise<void> {
    const existingComponentResults = result.gradingResult?.componentResults || [];
    const existingGradingResult = result.gradingResult;
    const metrics = prompts[result.promptIdx]?.metrics;
    const comparisonPassed = maxScoreGradingResult.pass;
    const previousPass = existingGradingResult?.pass ?? result.success;
    const nextPass = previousPass && comparisonPassed;
    const newScore = comparisonPassed
      ? (existingGradingResult?.score ?? result.score)
      : maxScoreGradingResult.score;

    result.gradingResult = {
      ...(existingGradingResult || {}),
      pass: nextPass,
      score: newScore,
      reason:
        !comparisonPassed && previousPass
          ? maxScoreGradingResult.reason
          : (existingGradingResult?.reason ?? ''),
      componentResults: [...existingComponentResults, maxScoreGradingResult],
      namedScores: {
        ...(existingGradingResult?.namedScores || {}),
        ...maxScoreGradingResult.namedScores,
      },
      tokensUsed: existingGradingResult?.tokensUsed || maxScoreGradingResult.tokensUsed,
      assertion: maxScoreGradingResult.assertion,
    };

    result.success = nextPass;
    if (!comparisonPassed) {
      result.score = newScore;
    }
    this.updateComparisonStats(
      result,
      comparisonPassed,
      maxScoreGradingResult.reason || '',
      maxScoreGradingResult.tokensUsed,
      wasSuccess,
      wasScore,
      metrics,
    );
    if (this.evalRecord.persisted) {
      await result.save();
    }
  }

  private async processMaxScoreAssertions(
    rowsWithMaxScoreAssertion: Set<number>,
    prompts: CompletedPrompt[],
    isWebUI: boolean,
    progressBarManager: ProgressBarManager | null,
    ciProgressReporter: CIProgressReporter | null,
    runEvalOptions: RunEvalOptions[],
    compareCount: number,
  ): Promise<void> {
    const maxScoreRowsCount = rowsWithMaxScoreAssertion.size;
    if (maxScoreRowsCount === 0) {
      return;
    }
    logger.info(`Processing ${maxScoreRowsCount} max-score assertions...`);

    for (const testIdx of rowsWithMaxScoreAssertion) {
      const resultsToCompare = this.evalRecord.persisted
        ? await this.evalRecord.fetchResultsByTestIdx(testIdx)
        : this.evalRecord.results.filter((r) => r.testIdx === testIdx);

      if (resultsToCompare.length === 0) {
        logger.warn(`Expected results to be found for test index ${testIdx}`);
        continue;
      }

      const maxScoreAssertion = resultsToCompare[0].testCase.assert?.find(
        (a) => a.type === 'max-score',
      ) as Assertion;

      if (!maxScoreAssertion) {
        continue;
      }

      const outputs = resultsToCompare.map((r) => r.response?.output || '');
      const maxScoreGradingResults = await selectMaxScore(
        outputs,
        resultsToCompare,
        maxScoreAssertion,
      );

      if (progressBarManager) {
        progressBarManager.updateComparisonProgress(resultsToCompare[0].prompt.raw);
      } else if (ciProgressReporter) {
        ciProgressReporter.update(runEvalOptions.length + compareCount);
      } else if (!isWebUI) {
        logger.debug(`Max-score assertion for test #${testIdx} complete`);
      }

      for (let index = 0; index < resultsToCompare.length; index++) {
        const result = resultsToCompare[index];
        const wasSuccess = result.success;
        const wasScore = result.score;
        const maxScoreGradingResult = {
          ...maxScoreGradingResults[index],
          assertion: maxScoreAssertion,
        };
        await this.applyMaxScoreResultToEvalResult(
          result,
          maxScoreGradingResult,
          prompts,
          wasSuccess,
          wasScore,
        );
      }
    }
  }

  /**
   * Generates prompt suggestions if enabled and prompts user to select them.
   * Returns false if the user selected no prompts and evaluation should abort.
   */
  private async generateSuggestions(testSuite: TestSuite): Promise<boolean> {
    logger.info(`Generating prompt variations...`);
    const { prompts: newPrompts, error } = await generatePrompts(testSuite.prompts[0].raw, 1);
    if (error || !newPrompts) {
      throw new Error(`Failed to generate prompts: ${error}`);
    }

    logger.info(chalk.blue('Generated prompts:'));
    let numAdded = 0;
    for (const prompt of newPrompts) {
      logger.info('--------------------------------------------------------');
      logger.info(`${prompt}`);
      logger.info('--------------------------------------------------------');

      const shouldTest = await promptYesNo('Do you want to test this prompt?', false);
      if (shouldTest) {
        testSuite.prompts.push({ raw: prompt, label: prompt });
        numAdded++;
      } else {
        logger.info('Skipping this prompt.');
      }
    }

    if (numAdded < 1) {
      logger.info(chalk.red('No prompts selected. Aborting.'));
      process.exitCode = 1;
      return false;
    }
    return true;
  }

  /**
   * Prepares vars for all test cases: merges defaultTest vars, applies transformVars,
   * and populates varNames and varsWithSpecialColsRemoved.
   */
  private async prepareVarsForTests(
    tests: AtomicTestCase[],
    testSuite: TestSuite,
    varNames: Set<string>,
    varsWithSpecialColsRemoved: Vars[],
  ): Promise<void> {
    const inputTransformDefault =
      typeof testSuite?.defaultTest === 'object'
        ? testSuite?.defaultTest?.options?.transformVars
        : undefined;

    for (const testCase of tests) {
      testCase.vars = {
        ...(typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest?.vars : {}),
        ...testCase?.vars,
      };

      if (!testCase.vars) {
        continue;
      }

      const varWithSpecialColsRemoved: Vars = {};
      const inputTransformForIndividualTest = testCase.options?.transformVars;
      const inputTransform = inputTransformForIndividualTest || inputTransformDefault;
      if (inputTransform) {
        const transformContext: TransformContext = {
          prompt: {},
          uuid: crypto.randomUUID(),
        };
        const transformedVars: Vars = await transform(
          inputTransform,
          testCase.vars,
          transformContext,
          true,
          TransformInputType.VARS,
        );
        invariant(
          typeof transformedVars === 'object',
          'Transform function did not return a valid object',
        );
        testCase.vars = { ...testCase.vars, ...transformedVars };
      }
      for (const varName of Object.keys(testCase.vars)) {
        varNames.add(varName);
        varWithSpecialColsRemoved[varName] = testCase.vars[varName];
      }
      varsWithSpecialColsRemoved.push(varWithSpecialColsRemoved);
    }
  }

  /**
   * Builds RunEvalOptions for a single (testCase, vars, repeatIndex) combination across all providers and prompts.
   */
  private buildRunEvalOptionsForVarSet(
    testCase: AtomicTestCase,
    vars: Vars | undefined,
    repeatIndex: number,
    testIdx: number,
    testSuite: TestSuite,
    promptIndexMap: Map<string, number>,
    concurrency: number,
    prependToPrompt: string,
    appendToPrompt: string,
  ): RunEvalOptions[] {
    const { options } = this;
    const result: RunEvalOptions[] = [];

    for (const provider of testSuite.providers) {
      if (!isProviderAllowed(provider, testCase.providers)) {
        continue;
      }
      for (const prompt of testSuite.prompts) {
        const providerKey = provider.label || provider.id();
        if (!isAllowedPrompt(prompt, testSuite.providerPromptMap?.[providerKey])) {
          continue;
        }
        if (!isAllowedPrompt(prompt, testCase.prompts)) {
          continue;
        }
        const promptId = generateIdFromPrompt(prompt);
        const promptIdx = promptIndexMap.get(`${providerKey}:${promptId}`);
        if (promptIdx === undefined) {
          logger.warn(`Could not find prompt index for ${providerKey}:${promptId}, skipping`);
          continue;
        }
        result.push({
          delay: options.delay || 0,
          provider,
          prompt: { ...prompt, raw: prependToPrompt + prompt.raw + appendToPrompt },
          testSuite,
          test: this.buildTestForRunEval(testCase, vars || {}, testSuite),
          nunjucksFilters: testSuite.nunjucksFilters,
          testIdx,
          promptIdx,
          repeatIndex,
          evaluateOptions: options,
          conversations: this.conversations,
          registers: this.registers,
          isRedteam: testSuite.redteam != null,
          concurrency,
          abortSignal: options.abortSignal,
          evalId: this.evalRecord.id,
          rateLimitRegistry: this.rateLimitRegistry,
        });
      }
    }

    return result;
  }

  /**
   * Builds the list of RunEvalOptions from test cases, providers, and prompts.
   */
  private async buildRunEvalOptions(
    tests: AtomicTestCase[],
    testSuite: TestSuite,
    promptIndexMap: Map<string, number>,
    concurrency: number,
  ): Promise<RunEvalOptions[]> {
    const { options } = this;
    const runEvalOptions: RunEvalOptions[] = [];
    let testIdx = 0;

    for (let index = 0; index < tests.length; index++) {
      const testCase = tests[index];
      invariant(
        typeof testSuite.defaultTest !== 'object' ||
          Array.isArray(testSuite.defaultTest?.assert || []),
        `defaultTest.assert is not an array in test case #${index + 1}`,
      );
      invariant(
        Array.isArray(testCase.assert || []),
        `testCase.assert is not an array in test case #${index + 1}`,
      );

      await this.applyDefaultTestProperties(testCase, testSuite);

      const defaultTestOptions =
        typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest?.options : {};
      const prependToPrompt = testCase.options?.prefix || defaultTestOptions?.prefix || '';
      const appendToPrompt = testCase.options?.suffix || defaultTestOptions?.suffix || '';

      const varCombinations =
        getEnvBool('PROMPTFOO_DISABLE_VAR_EXPANSION') || testCase.options?.disableVarExpansion
          ? [testCase.vars]
          : generateVarCombinations(testCase.vars || {});

      const numRepeat = options.repeat || 1;
      for (let repeatIndex = 0; repeatIndex < numRepeat; repeatIndex++) {
        for (const vars of varCombinations) {
          const newOptions = this.buildRunEvalOptionsForVarSet(
            testCase,
            vars,
            repeatIndex,
            testIdx,
            testSuite,
            promptIndexMap,
            concurrency,
            prependToPrompt,
            appendToPrompt,
          );
          runEvalOptions.push(...newOptions);
          testIdx++;
        }
      }
    }

    return runEvalOptions;
  }

  /**
   * Applies resume-mode filtering to runEvalOptions, removing already-completed steps.
   */
  private async applyResumeFilter(runEvalOptions: RunEvalOptions[]): Promise<void> {
    if (!cliState.resume || !this.evalRecord.persisted) {
      return;
    }
    try {
      const { default: EvalResult } = await import('./models/evalResult');
      const completedPairs = await EvalResult.getCompletedIndexPairs(this.evalRecord.id, {
        excludeErrors: cliState.retryMode,
      });
      const originalCount = runEvalOptions.length;
      for (let i = runEvalOptions.length - 1; i >= 0; i--) {
        const step = runEvalOptions[i];
        if (completedPairs.has(`${step.testIdx}:${step.promptIdx}`)) {
          runEvalOptions.splice(i, 1);
        }
      }
      const skipped = originalCount - runEvalOptions.length;
      if (skipped > 0) {
        logger.info(`Resuming: skipping ${skipped} previously completed cases`);
      }
    } catch (err) {
      logger.warn(
        `Resume: failed to load completed results. Running full evaluation. ${String(err)}`,
      );
    }
  }

  /**
   * Adjusts concurrency to 1 if conversation vars or storeOutputAs options are in use.
   */
  private determineConcurrency(
    concurrency: number,
    prompts: CompletedPrompt[],
    tests: AtomicTestCase[],
  ): number {
    if (concurrency <= 1) {
      return concurrency;
    }
    const usesConversation = prompts.some((p) => p.raw.includes('_conversation'));
    if (usesConversation) {
      logger.info(
        `Setting concurrency to 1 because the ${chalk.cyan('_conversation')} variable is used.`,
      );
      return 1;
    }
    const usesStoreOutputAs = tests.some((t) => t.options?.storeOutputAs);
    if (usesStoreOutputAs) {
      logger.info(`Setting concurrency to 1 because storeOutputAs is used.`);
      return 1;
    }
    return concurrency;
  }

  /**
   * Sets up progress reporters and installs the progress callback.
   * Returns the created reporters and the isWebUI flag.
   */
  private setupProgressReporting(
    runEvalOptions: RunEvalOptions[],
    numCompleteRef: { value: number },
  ): {
    isWebUI: boolean;
    progressBarManager: ProgressBarManager | null;
    ciProgressReporter: CIProgressReporter | null;
  } {
    const isWebUI = Boolean(cliState.webUI);
    let progressBarManager: ProgressBarManager | null = null;
    let ciProgressReporter: CIProgressReporter | null = null;

    logger.debug(
      `Progress bar settings: showProgressBar=${this.options.showProgressBar}, isWebUI=${isWebUI}`,
    );

    if (isCI() && !isWebUI) {
      ciProgressReporter = new CIProgressReporter(runEvalOptions.length);
      ciProgressReporter.start();
    } else if (this.options.showProgressBar && process.stdout.isTTY) {
      progressBarManager = new ProgressBarManager(isWebUI);
    }

    const originalProgressCallback = this.options.progressCallback;
    this.options.progressCallback = (completed, total, index, evalStep, metrics) => {
      if (originalProgressCallback) {
        originalProgressCallback(completed, total, index, evalStep, metrics);
      }

      if (isWebUI) {
        const provider = evalStep.provider.label || evalStep.provider.id();
        const vars = formatVarsForDisplay(evalStep.test.vars, 50);
        logger.info(`[${numCompleteRef.value}/${total}] Running ${provider} with vars: ${vars}`);
      } else if (progressBarManager) {
        const phase = evalStep.test.options?.runSerially ? 'serial' : 'concurrent';
        progressBarManager.updateProgress(index, evalStep, phase, metrics);
      } else if (ciProgressReporter) {
        ciProgressReporter.update(numCompleteRef.value);
      } else {
        logger.debug(
          `Eval #${index + 1} complete (${numCompleteRef.value} of ${runEvalOptions.length})`,
        );
      }
    };

    return { isWebUI, progressBarManager, ciProgressReporter };
  }

  /**
   * Runs a single eval step with an optional per-step timeout.
   * Creates a timeout result and updates stats/metrics if the step times out.
   */
  private async runEvalStepWithTimeout(
    evalStep: RunEvalOptions,
    index: number | string,
    processEvalStep: (evalStep: RunEvalOptions, index: number | string) => Promise<void>,
    prompts: CompletedPrompt[],
    runEvalOptions: RunEvalOptions[],
    numCompleteRef: { value: number },
  ): Promise<void> {
    const timeoutMs = this.options.timeoutMs || getEvalTimeoutMs();

    if (timeoutMs <= 0) {
      return processEvalStep(evalStep, index);
    }

    const abortController = new AbortController();
    const combinedSignal = evalStep.abortSignal
      ? AbortSignal.any([evalStep.abortSignal, abortController.signal])
      : abortController.signal;

    const evalStepWithSignal = { ...evalStep, abortSignal: combinedSignal };
    let timeoutId: NodeJS.Timeout | undefined;
    let didTimeout = false;

    try {
      return await Promise.race([
        processEvalStep(evalStepWithSignal, index),
        new Promise<void>((_, reject) => {
          timeoutId = setTimeout(() => {
            didTimeout = true;
            abortController.abort();
            if (typeof evalStep.provider.cleanup === 'function') {
              try {
                evalStep.provider.cleanup();
              } catch (cleanupErr) {
                logger.warn(`Error during provider cleanup: ${cleanupErr}`);
              }
            }
            reject(new Error(`Evaluation timed out after ${timeoutMs}ms`));
          }, timeoutMs);
        }),
      ]);
    } catch (error) {
      if (!didTimeout) {
        throw error;
      }
      const sanitizedTestCase = { ...evalStep.test };
      delete (sanitizedTestCase as Partial<AtomicTestCase>).provider;

      const timeoutResult = {
        provider: {
          id: evalStep.provider.id(),
          label: evalStep.provider.label,
          config: evalStep.provider.config,
        },
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
        testIdx: evalStep.testIdx,
        testCase: sanitizedTestCase,
        promptId: evalStep.prompt.id || '',
      };

      await this.evalRecord.addResult(timeoutResult);
      this.stats.errors++;

      const { metrics } = prompts[evalStep.promptIdx];
      if (metrics) {
        metrics.testErrorCount += 1;
        metrics.totalLatencyMs += timeoutMs;
      }

      numCompleteRef.value++;

      if (this.options.progressCallback) {
        this.options.progressCallback(
          numCompleteRef.value,
          runEvalOptions.length,
          typeof index === 'number' ? index : 0,
          evalStep,
          metrics || {
            score: 0,
            testPassCount: 0,
            testFailCount: 0,
            testErrorCount: 1,
            assertPassCount: 0,
            assertFailCount: 0,
            totalLatencyMs: timeoutMs,
            tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 },
            namedScores: {},
            namedScoresCount: {},
            cost: 0,
          },
        );
      }
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Runs afterAll extension hooks, loading results from the DB if needed.
   */
  private async runAfterAllExtensions(testSuite: TestSuite): Promise<void> {
    if (!testSuite.extensions?.length) {
      return;
    }
    const allResults = await this.evalRecord.getResults();
    const resultsForExtension: EvaluateResult[] = allResults.map(
      (result): EvaluateResult =>
        'toEvaluateResult' in result ? result.toEvaluateResult() : result,
    );

    await runExtensionHook(testSuite.extensions, 'afterAll', {
      prompts: this.evalRecord.prompts,
      results: resultsForExtension,
      suite: testSuite,
      evalId: this.evalRecord.id,
      config: this.evalRecord.config,
    });
  }

  /**
   * Records telemetry for the completed evaluation run.
   */
  private recordTelemetry(
    prompts: CompletedPrompt[],
    tests: AtomicTestCase[],
    testSuite: TestSuite,
    varNames: Set<string>,
    assertionTypes: Set<string>,
    startTime: number,
    concurrency: number,
    evalTimedOut: boolean,
  ): void {
    const endTime = Date.now();
    const totalEvalTimeMs = endTime - startTime;
    this.evalRecord.setDurationMs(totalEvalTimeMs);

    const totalCost = prompts.reduce((acc, p) => acc + (p.metrics?.cost || 0), 0);
    const totalRequests = this.stats.tokenUsage.numRequests;
    const totalTokens = this.stats.tokenUsage.total;
    const cachedTokens = this.stats.tokenUsage.cached;

    const totalLatencyMs = this.evalRecord.results.reduce(
      (sum, result) => sum + (result.latencyMs || 0),
      0,
    );
    const avgLatencyMs =
      this.evalRecord.results.length > 0 ? totalLatencyMs / this.evalRecord.results.length : 0;

    const usesConversationVar = prompts.some((p) => p.raw.includes('_conversation'));
    const usesTransforms = Boolean(
      tests.some((t) => t.options?.transform || t.options?.postprocess) ||
        testSuite.providers.some((p) => Boolean(p.transform)),
    );
    const usesScenarios = Boolean(testSuite.scenarios && testSuite.scenarios.length > 0);

    const usesExampleProvider = testSuite.providers.some((provider) => {
      const url = typeof provider.config?.url === 'string' ? provider.config.url : '';
      const label = provider.label || '';
      return url.includes('promptfoo.app') || label.toLowerCase().includes('example');
    });

    const totalAssertions = prompts.reduce(
      (acc, p) => acc + (p.metrics?.assertPassCount || 0) + (p.metrics?.assertFailCount || 0),
      0,
    );
    const passedAssertions = prompts.reduce((acc, p) => acc + (p.metrics?.assertPassCount || 0), 0);

    const modelGradedCount = Array.from(assertionTypes).filter((type) =>
      MODEL_GRADED_ASSERTION_TYPES.has(type as AssertionType),
    ).length;

    const providerPrefixes = Array.from(
      new Set(
        testSuite.providers.map((p) => {
          const idParts = p.id().split(':');
          return idParts.length > 1 ? idParts[0] : 'unknown';
        }),
      ),
    );

    const timeoutOccurred =
      evalTimedOut ||
      this.evalRecord.results.some(
        (r) => r.failureReason === ResultFailureReason.ERROR && r.error?.includes('timed out'),
      );

    telemetry.record('eval_ran', {
      numPrompts: prompts.length,
      numTests: this.stats.successes + this.stats.failures + this.stats.errors,
      numRequests: this.stats.tokenUsage.numRequests || 0,
      numResults: this.evalRecord.results.length,
      numVars: varNames.size,
      numProviders: testSuite.providers.length,
      numRepeat: this.options.repeat || 1,
      providerPrefixes: providerPrefixes.sort(),
      assertionTypes: Array.from(assertionTypes).sort(),
      eventSource: this.options.eventSource || 'default',
      ci: isCI(),
      hasAnyPass: this.stats.successes > 0,
      numPasses: this.stats.successes,
      numFails: this.stats.failures,
      numErrors: this.stats.errors,
      totalEvalTimeMs,
      avgLatencyMs: Math.round(avgLatencyMs),
      concurrencyUsed: concurrency,
      timeoutOccurred,
      totalTokens,
      promptTokens: this.stats.tokenUsage.prompt,
      completionTokens: this.stats.tokenUsage.completion,
      cachedTokens,
      totalCost,
      totalRequests,
      numAssertions: totalAssertions,
      passedAssertions,
      modelGradedAssertions: modelGradedCount,
      assertionPassRate: totalAssertions > 0 ? passedAssertions / totalAssertions : 0,
      usesConversationVar,
      usesTransforms,
      usesScenarios,
      usesExampleProvider,
      isPromptfooSampleTarget: testSuite.providers.some(isPromptfooSampleTarget),
      isRedteam: Boolean(this.options.isRedteam),
      hasOpenAiProviders: testSuite.providers.some((p) => isOpenAiProvider(p.id())),
      hasAnthropicProviders: testSuite.providers.some((p) => isAnthropicProvider(p.id())),
      hasGoogleProviders: testSuite.providers.some((p) => isGoogleProvider(p.id())),
    });
  }

  /**
   * Shared mutable state passed between processEvalRow and processEvalStep helpers.
   */
  private makeEvalRunState(
    prompts: CompletedPrompt[],
    runEvalOptions: RunEvalOptions[],
    testSuite: TestSuite,
  ): {
    vars: Set<string>;
    rowsWithSelectBestAssertion: Set<number>;
    rowsWithMaxScoreAssertion: Set<number>;
    assertionTypes: Set<string>;
    numCompleteRef: { value: number };
    prompts: CompletedPrompt[];
    runEvalOptions: RunEvalOptions[];
    testSuite: TestSuite;
  } {
    return {
      vars: new Set<string>(),
      rowsWithSelectBestAssertion: new Set<number>(),
      rowsWithMaxScoreAssertion: new Set<number>(),
      assertionTypes: new Set<string>(),
      numCompleteRef: { value: 0 },
      prompts,
      runEvalOptions,
      testSuite,
    };
  }

  /**
   * Processes a single result row from runEval, updating shared state and persisting.
   */
  private async processEvalRow(
    row: EvaluateResult,
    evalStep: RunEvalOptions,
    index: number,
    state: ReturnType<Evaluator['makeEvalRunState']>,
  ): Promise<void> {
    const {
      vars,
      rowsWithSelectBestAssertion,
      rowsWithMaxScoreAssertion,
      assertionTypes,
      numCompleteRef,
      prompts,
      runEvalOptions,
      testSuite,
    } = state;

    for (const varName of Object.keys(row.vars)) {
      vars.add(varName);
    }

    this.accumulateModelGradedTokenUsage(row);
    this.updateEvalStats(row);

    if (evalStep.test.assert?.some((a) => a.type === 'select-best')) {
      rowsWithSelectBestAssertion.add(row.testIdx);
    }
    if (evalStep.test.assert?.some((a) => a.type === 'max-score')) {
      rowsWithMaxScoreAssertion.add(row.testIdx);
    }
    for (const assert of evalStep.test.assert || []) {
      if (assert.type) {
        assertionTypes.add(assert.type);
      }
    }

    numCompleteRef.value++;

    try {
      await this.evalRecord.addResult(row);
    } catch (error) {
      const resultSummary = summarizeEvaluateResultForLogging(row);
      logger.error(`Error saving result: ${error} ${safeJsonStringify(resultSummary)}`);
    }

    for (const writer of this.fileWriters) {
      await writer.write(row);
    }

    const { promptIdx } = row;
    const metrics = prompts[promptIdx].metrics;
    invariant(metrics, 'Expected prompt.metrics to be set');

    await this.updatePromptMetrics(row, metrics, evalStep, testSuite);

    await runExtensionHook(testSuite.extensions, 'afterEach', {
      test: evalStep.test,
      result: row,
    });

    if (this.options.progressCallback) {
      this.options.progressCallback(
        numCompleteRef.value,
        runEvalOptions.length,
        index,
        evalStep,
        metrics,
      );
    }
  }

  /**
   * Returns a processEvalStep function that runs each eval step and processes the resulting rows.
   */
  private buildProcessEvalStep(
    state: ReturnType<Evaluator['makeEvalRunState']>,
  ): (evalStep: RunEvalOptions, index: number | string) => Promise<void> {
    return async (evalStep: RunEvalOptions, index: number | string) => {
      if (typeof index !== 'number') {
        throw new Error('Expected index to be a number');
      }

      const beforeEachOut = await runExtensionHook(state.testSuite.extensions, 'beforeEach', {
        test: evalStep.test,
      });
      evalStep.test = beforeEachOut.test;

      const rows = await runEval(evalStep);
      for (const row of rows) {
        await this.processEvalRow(row, evalStep, index, state);
      }
    };
  }

  /**
   * Handles an abort error during the eval loop.
   * Returns true if the caller should return early (SIGINT), false if execution should continue (max-duration timeout).
   */
  private async handleEvalLoopAbort(
    evalTimedOut: boolean,
    maxEvalTimeMs: number,
    globalTimeout: NodeJS.Timeout | undefined,
    progressBarManager: ProgressBarManager | null,
    ciProgressReporter: CIProgressReporter | null,
    vars: Set<string>,
    prompts: CompletedPrompt[],
  ): Promise<boolean> {
    if (evalTimedOut) {
      logger.warn(`Evaluation stopped after reaching max duration (${maxEvalTimeMs}ms)`);
      return false;
    }
    logger.info('Evaluation interrupted, saving progress...');
    if (globalTimeout) {
      clearTimeout(globalTimeout);
    }
    if (progressBarManager) {
      progressBarManager.stop();
    }
    if (ciProgressReporter) {
      ciProgressReporter.finish();
    }
    this.evalRecord.setVars(Array.from(vars));
    await this.evalRecord.addPrompts(prompts);
    updateSignalFile(this.evalRecord.id);
    return true;
  }

  /**
   * Runs all serial and concurrent eval steps, handling abort and error cases.
   * Returns true if the evaluation was interrupted by SIGINT (caller should return early).
   */
  private async runEvalLoop(
    runEvalOptions: RunEvalOptions[],
    processEvalStepWithTimeout: (evalStep: RunEvalOptions, index: number | string) => Promise<void>,
    concurrency: number,
    isWebUI: boolean,
    prompts: CompletedPrompt[],
    vars: Set<string>,
    processedIndices: Set<number>,
    numCompleteRef: { value: number },
    evalTimedOut: boolean,
    maxEvalTimeMs: number,
    globalTimeout: NodeJS.Timeout | undefined,
    progressBarManager: ProgressBarManager | null,
    ciProgressReporter: CIProgressReporter | null,
  ): Promise<boolean> {
    const { options } = this;
    const checkAbort = () => {
      if (options.abortSignal?.aborted) {
        throw new Error('Operation cancelled');
      }
    };

    const serialRunEvalOptions: RunEvalOptions[] = [];
    const concurrentRunEvalOptions: RunEvalOptions[] = [];
    for (const evalOption of runEvalOptions) {
      if (evalOption.test.options?.runSerially) {
        serialRunEvalOptions.push(evalOption);
      } else {
        concurrentRunEvalOptions.push(evalOption);
      }
    }

    if (!this.options.silent) {
      if (serialRunEvalOptions.length > 0) {
        logger.info(`Running ${serialRunEvalOptions.length} test cases serially...`);
      }
      if (concurrentRunEvalOptions.length > 0) {
        logger.info(
          `Running ${concurrentRunEvalOptions.length} test cases (up to ${concurrency} at a time)...`,
        );
      }
    }

    if (this.options.showProgressBar && progressBarManager) {
      await progressBarManager.initialize(runEvalOptions, concurrency, 0);
    }

    try {
      for (const evalStep of serialRunEvalOptions) {
        checkAbort();
        if (isWebUI) {
          const provider = evalStep.provider.label || evalStep.provider.id();
          const evalVars = formatVarsForDisplay(evalStep.test.vars || {}, 50);
          logger.info(
            `[${numCompleteRef.value}/${runEvalOptions.length}] Running ${provider} with vars: ${evalVars}`,
          );
        }
        const idx = runEvalOptions.indexOf(evalStep);
        await processEvalStepWithTimeout(evalStep, idx);
        processedIndices.add(idx);
      }

      await async.forEachOfLimit(concurrentRunEvalOptions, concurrency, async (evalStep) => {
        checkAbort();
        const idx = runEvalOptions.indexOf(evalStep);
        await processEvalStepWithTimeout(evalStep, idx);
        processedIndices.add(idx);
        await this.evalRecord.addPrompts(prompts);
      });
    } catch (err) {
      if (options.abortSignal?.aborted) {
        return this.handleEvalLoopAbort(
          evalTimedOut,
          maxEvalTimeMs,
          globalTimeout,
          progressBarManager,
          ciProgressReporter,
          vars,
          prompts,
        );
      }
      if (ciProgressReporter) {
        ciProgressReporter.error(`Evaluation failed: ${String(err)}`);
      }
      throw err;
    }

    return false;
  }

  /**
   * Runs comparison assertions, cleans up progress reporters, and handles timeout results.
   */
  private async finalizeEvalRun(
    rowsWithSelectBestAssertion: Set<number>,
    rowsWithMaxScoreAssertion: Set<number>,
    prompts: CompletedPrompt[],
    isWebUI: boolean,
    progressBarManager: ProgressBarManager | null,
    ciProgressReporter: CIProgressReporter | null,
    runEvalOptions: RunEvalOptions[],
    globalTimeout: NodeJS.Timeout | undefined,
    evalTimedOut: boolean,
    processedIndices: Set<number>,
    startTime: number,
    maxEvalTimeMs: number,
  ): Promise<void> {
    const compareRowsCount = rowsWithSelectBestAssertion.size + rowsWithMaxScoreAssertion.size;

    if (progressBarManager && compareRowsCount > 0) {
      progressBarManager.updateTotalCount(compareRowsCount);
    } else if (ciProgressReporter && compareRowsCount > 0) {
      ciProgressReporter.updateTotalTests(runEvalOptions.length + compareRowsCount);
    }

    await this.processSelectBestComparisons(
      rowsWithSelectBestAssertion,
      prompts,
      isWebUI,
      compareRowsCount,
      progressBarManager,
      ciProgressReporter,
      runEvalOptions,
    );

    await this.processMaxScoreAssertions(
      rowsWithMaxScoreAssertion,
      prompts,
      isWebUI,
      progressBarManager,
      ciProgressReporter,
      runEvalOptions,
      rowsWithSelectBestAssertion.size,
    );

    await this.evalRecord.addPrompts(prompts);

    try {
      if (progressBarManager) {
        progressBarManager.complete();
        progressBarManager.stop();
      } else if (ciProgressReporter) {
        ciProgressReporter.finish();
      }
    } catch (cleanupErr) {
      logger.warn(`Error during progress reporter cleanup: ${cleanupErr}`);
    }

    if (globalTimeout) {
      clearTimeout(globalTimeout);
    }

    if (evalTimedOut) {
      await this.writeTimeoutResultsForUnprocessed(
        runEvalOptions,
        processedIndices,
        prompts,
        startTime,
        maxEvalTimeMs,
      );
    }
  }

  private async _runEvaluation(): Promise<Eval> {
    const { options } = this;
    let { testSuite } = this;

    const startTime = Date.now();
    const maxEvalTimeMs = options.maxEvalTimeMs ?? getMaxEvalTimeMs();
    let evalTimedOut = false;
    let globalTimeout: NodeJS.Timeout | undefined;
    let globalAbortController: AbortController | undefined;
    const processedIndices = new Set<number>();

    if (maxEvalTimeMs > 0) {
      globalAbortController = new AbortController();
      options.abortSignal = options.abortSignal
        ? AbortSignal.any([options.abortSignal, globalAbortController.signal])
        : globalAbortController.signal;
      globalTimeout = setTimeout(() => {
        evalTimedOut = true;
        globalAbortController?.abort();
      }, maxEvalTimeMs);
    }

    if (!options.silent) {
      logger.info(`Starting evaluation ${this.evalRecord.id}`);
    }
    if (options.abortSignal?.aborted) {
      throw new Error('Operation cancelled');
    }

    if (testSuite.extensions?.length) {
      if (!testSuite.defaultTest) {
        testSuite.defaultTest = {};
      }
      if (typeof testSuite.defaultTest !== 'string' && !testSuite.defaultTest.assert) {
        testSuite.defaultTest.assert = [];
      }
    }

    const beforeAllOut = await runExtensionHook(testSuite.extensions, 'beforeAll', {
      suite: testSuite,
    });
    testSuite = beforeAllOut.suite;

    if (options.generateSuggestions) {
      const shouldContinue = await this.generateSuggestions(testSuite);
      if (!shouldContinue) {
        return this.evalRecord;
      }
    }

    const prompts: CompletedPrompt[] = [];
    const builtPrompts = this.buildPromptsList(testSuite);
    prompts.push(...builtPrompts);

    const promptIndexMap = new Map<string, number>();
    for (let i = 0; i < prompts.length; i++) {
      promptIndexMap.set(`${prompts[i].provider}:${prompts[i].id}`, i);
    }
    await this.evalRecord.addPrompts(prompts);

    let tests: AtomicTestCase[] =
      testSuite.tests && testSuite.tests.length > 0
        ? testSuite.tests
        : testSuite.scenarios
          ? []
          : [{}];

    tests = this.buildTestsFromScenarios(tests, testSuite);
    maybeEmitAzureOpenAiWarning(testSuite, tests);

    const varNames: Set<string> = new Set();
    const varsWithSpecialColsRemoved: Vars[] = [];
    await this.prepareVarsForTests(tests, testSuite, varNames, varsWithSpecialColsRemoved);

    let concurrency = options.maxConcurrency || DEFAULT_MAX_CONCURRENCY;
    const runEvalOptions = await this.buildRunEvalOptions(
      tests,
      testSuite,
      promptIndexMap,
      concurrency,
    );

    const state = this.makeEvalRunState(prompts, runEvalOptions, testSuite);

    for (const evalOption of runEvalOptions) {
      if (evalOption.test.assert?.some((a) => a.type === 'select-best')) {
        state.rowsWithSelectBestAssertion.add(evalOption.testIdx);
      }
      if (evalOption.test.assert?.some((a) => a.type === 'max-score')) {
        state.rowsWithMaxScoreAssertion.add(evalOption.testIdx);
      }
    }

    await this.applyResumeFilter(runEvalOptions);
    concurrency = this.determineConcurrency(concurrency, prompts, tests);

    const { isWebUI, progressBarManager, ciProgressReporter } = this.setupProgressReporting(
      runEvalOptions,
      state.numCompleteRef,
    );

    const processEvalStep = this.buildProcessEvalStep(state);
    const processEvalStepWithTimeout = async (evalStep: RunEvalOptions, index: number | string) => {
      return this.runEvalStepWithTimeout(
        evalStep,
        index,
        processEvalStep,
        prompts,
        runEvalOptions,
        state.numCompleteRef,
      );
    };

    const wasInterrupted = await this.runEvalLoop(
      runEvalOptions,
      processEvalStepWithTimeout,
      concurrency,
      isWebUI,
      prompts,
      state.vars,
      processedIndices,
      state.numCompleteRef,
      evalTimedOut,
      maxEvalTimeMs,
      globalTimeout,
      progressBarManager,
      ciProgressReporter,
    );

    if (wasInterrupted) {
      return this.evalRecord;
    }

    await this.finalizeEvalRun(
      state.rowsWithSelectBestAssertion,
      state.rowsWithMaxScoreAssertion,
      prompts,
      isWebUI,
      progressBarManager,
      ciProgressReporter,
      runEvalOptions,
      globalTimeout,
      evalTimedOut,
      processedIndices,
      startTime,
      maxEvalTimeMs,
    );

    this.evalRecord.setVars(Array.from(state.vars));
    await this.runAfterAllExtensions(testSuite);

    this.recordTelemetry(
      prompts,
      tests,
      testSuite,
      varNames,
      state.assertionTypes,
      startTime,
      concurrency,
      evalTimedOut,
    );

    if (this.evalRecord.persisted) {
      await this.evalRecord.save();
    }

    updateSignalFile(this.evalRecord.id);

    return this.evalRecord;
  }

  async evaluate(): Promise<Eval> {
    await startOtlpReceiverIfNeeded(this.testSuite);

    // Initialize OTEL SDK if tracing is enabled
    // Check env flag, test suite level, and default test metadata
    const tracingEnabled =
      getEnvBool('PROMPTFOO_TRACING_ENABLED', false) ||
      this.testSuite.tracing?.enabled === true ||
      (typeof this.testSuite.defaultTest === 'object' &&
        this.testSuite.defaultTest?.metadata?.tracingEnabled === true) ||
      this.testSuite.tests?.some((t) => t.metadata?.tracingEnabled === true);

    if (tracingEnabled) {
      logger.debug('[Evaluator] Initializing OTEL SDK for tracing');
      const otelConfig = getDefaultOtelConfig();
      initializeOtel(otelConfig);
    }

    try {
      return await this._runEvaluation();
    } finally {
      // Flush and shutdown OTEL SDK
      if (tracingEnabled) {
        logger.debug('[Evaluator] Flushing OTEL spans...');
        await flushOtel();
        await shutdownOtel();
      }

      if (isOtlpReceiverStarted()) {
        // Add a delay to allow providers to finish exporting spans
        logger.debug('[Evaluator] Waiting for span exports to complete...');
        await sleep(3000);
      }
      await stopOtlpReceiverIfNeeded();

      // Clean up Python worker pools to prevent resource leaks
      await providerRegistry.shutdownAll();

      // Log rate limit metrics for debugging before cleanup
      if (this.rateLimitRegistry) {
        const metrics = this.rateLimitRegistry.getMetrics();
        for (const [key, m] of Object.entries(metrics)) {
          if (m.totalRequests > 0) {
            logger.debug(`[Scheduler] Final metrics for ${key}`, {
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
    }
  }
}

export function evaluate(
  testSuite: TestSuite,
  evalRecord: Eval,
  options: EvaluateOptions,
): Promise<Eval> {
  const ev = new Evaluator(testSuite, evalRecord, options);
  return ev.evaluate();
}
