import readline from 'readline';

import async from 'async';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import { globSync } from 'glob';
import {
  getAssertionBaseType,
  hasTraceAwareAssertions,
  MODEL_GRADED_ASSERTION_TYPES,
  runAssertions,
  runCompareAssertion,
} from './assertions/index';
import { extractAndStoreBinaryData } from './blobs/extractor';
import { getCache, withCacheNamespace } from './cache';
import cliState from './cliState';
import { DEFAULT_MAX_CONCURRENCY, FILE_METADATA_KEY } from './constants';
import { updateSignalFile } from './database/signal';
import { getEnvBool, getEnvInt, getEvalTimeoutMs, getMaxEvalTimeMs, isCI } from './envars';
import { collectFileMetadata, renderPrompt, runExtensionHook } from './evaluatorHelpers';
import logger, { globalLogCallback, setLogCallback } from './logger';
import { selectMaxScore } from './matchers';
import { generateIdFromPrompt } from './models/prompt';
import { CIProgressReporter } from './progress/ciProgressReporter';
import { maybeEmitAzureOpenAiWarning } from './providers/azure/warnings';
import { providerRegistry } from './providers/providerRegistry';
import { isPromptfooSampleTarget } from './providers/shared';
import { redteamProviderManager } from './redteam/providers/shared';
import { throwIfTargetPromptExceedsMaxChars } from './redteam/shared/promptLength';
import { getSessionId } from './redteam/util';
import {
  createProviderRateLimitOptions,
  createRateLimitRegistry,
  type RateLimitRegistry,
} from './scheduler';
import { withProviderCallExecutionContext } from './scheduler/providerCallExecutionContext';
import { type ProviderCallQueue, ProviderGroupedCallQueue } from './scheduler/providerCallQueue';
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
  type AssertionOrSet,
  type AssertionType,
  type AtomicTestCase,
  type CompletedPrompt,
  type EvaluateOptions,
  type EvaluateResult,
  type EvaluateStats,
  type GradingResult,
  type Prompt,
  type ProviderResponse,
  ResultFailureReason,
  type RunEvalOptions,
  type TestSuite,
} from './types/index';
import { type ApiProvider, isApiProvider } from './types/providers';
import { JsonlFileWriter } from './util/exportToFile/writeToFile';
import { isNonTransientHttpStatus } from './util/fetch/errors';
import { loadFunction, parseFileUrl } from './util/functions/loadFunction';
import invariant from './util/invariant';
import { safeJsonStringify, summarizeEvaluateResultForLogging } from './util/json';
import { accumulateNamedMetric, backfillNamedScoreWeights } from './util/namedMetrics';
import { isPromptAllowed } from './util/promptMatching';
import {
  isAnthropicProvider,
  isGoogleProvider,
  isOpenAiProvider,
  isProviderAllowed,
} from './util/provider';
import { promptYesNo } from './util/readline';
import { extractVariablesFromTemplate } from './util/templates';
import { sleep } from './util/time';
import { TokenUsageTracker } from './util/tokenUsage';
import {
  accumulateAssertionTokenUsage,
  accumulateResponseTokenUsage,
  createEmptyAssertions,
  createEmptyTokenUsage,
} from './util/tokenUsageUtils';
import { TransformInputType, transform } from './util/transform';
import type { SingleBar } from 'cli-progress';
import type winston from 'winston';

import type Eval from './models/eval';
import type EvalResult from './models/evalResult';
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
} from './types/index';
import type { CallApiContextParams } from './types/providers';

/**
 * Manages a single progress bar for the evaluation
 */
export class ProgressBarManager {
  private progressBar: SingleBar | undefined;
  private isWebUI: boolean;
  private originalLogCallback: ((message: string) => void) | null = null;
  private installedLogCallback: ((message: string) => void) | null = null;
  private pendingRender: ReturnType<typeof setImmediate> | null = null;

  // Track overall progress
  private totalCount: number = 0;
  private completedCount: number = 0;
  private concurrency: number = 1;

  constructor(isWebUI: boolean) {
    this.isWebUI = isWebUI;
  }

  private clearProgressBarLine(): void {
    readline.cursorTo(process.stderr, 0);
    readline.clearLine(process.stderr, 0);
  }

  private scheduleRender(): void {
    if (!this.progressBar || this.pendingRender) {
      return;
    }

    this.pendingRender = setImmediate(() => {
      this.pendingRender = null;
      // biome-ignore lint/suspicious/noExplicitAny: cli-progress SingleBar.render() is not in public typings
      (this.progressBar as any)?.render();
    });
  }

  private handleLogMessage(): void {
    if (!this.progressBar) {
      return;
    }

    // Clear the progress bar's stream before Winston writes to the terminal,
    // then re-render the bar after the log line has been emitted.
    this.clearProgressBarLine();
    this.scheduleRender();
  }

  /**
   * Coordinate console logging with the progress bar to prevent visual corruption.
   */
  installLogInterceptor(): void {
    if (!this.progressBar || this.isWebUI || this.installedLogCallback) {
      return;
    }

    this.originalLogCallback = globalLogCallback;
    this.installedLogCallback = (message: string) => {
      this.originalLogCallback?.(message);
      this.handleLogMessage();
    };
    setLogCallback(this.installedLogCallback);
  }

  /**
   * Remove the log interceptor and restore original logger callback behavior.
   */
  removeLogInterceptor(): void {
    if (this.pendingRender) {
      clearImmediate(this.pendingRender);
      this.pendingRender = null;
    }

    if (this.installedLogCallback && globalLogCallback === this.installedLogCallback) {
      setLogCallback(this.originalLogCallback);
    }

    this.installedLogCallback = null;
    this.originalLogCallback = null;
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
        stream: process.stderr,
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

function getRepeatCacheNamespace(
  repeatIndex: number,
  evaluateOptions?: EvaluateOptions,
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

const deferredGradingPromises = new WeakMap<EvaluateResult, Promise<void>>();

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
  if (!row.tokenUsage.assertions) {
    row.tokenUsage.assertions = createEmptyAssertions();
  }
  row.tokenUsage.assertions.numRequests = (row.tokenUsage.assertions.numRequests ?? 0) + 1;

  if (checkResult.tokensUsed) {
    accumulateAssertionTokenUsage(row.tokenUsage.assertions, checkResult.tokensUsed);
  }
  row.gradingResult = checkResult;
}

function applyGradingError(row: EvaluateResult, error: unknown) {
  const errorMessage = error instanceof Error ? (error.stack ?? error.message) : String(error);
  logger.error('Assertion grading failed during eval', {
    error: errorMessage,
    promptIdx: row.promptIdx,
    testIdx: row.testIdx,
  });
  row.error = errorMessage;
  row.failureReason = ResultFailureReason.ERROR;
  row.success = false;
  row.score = 0;
  row.namedScores = {};
}

function getNonTransientTargetStatus(row: EvaluateResult): number | undefined {
  const httpStatus = row.response?.metadata?.http?.status;
  return typeof httpStatus === 'number' && isNonTransientHttpStatus(httpStatus)
    ? httpStatus
    : undefined;
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

function createRunEvalState({
  provider,
  prompt,
  test,
}: Pick<RunEvalOptions, 'provider' | 'prompt' | 'test'>): RunEvalState {
  const vars = structuredClone(test.vars || {});
  const fileMetadata = collectFileMetadata(vars);
  const conversationKey = `${provider.label || provider.id()}:${prompt.id}${test.metadata?.conversationId ? `:${test.metadata.conversationId}` : ''}`;

  const setup = createRunEvalSetup({
    provider,
    prompt,
    promptConfig: {
      ...(prompt.config ?? {}),
      ...(test.options ?? {}),
    },
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
  const usesConversation = prompt.raw.includes('_conversation');
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
  const promptConfig = {
    ...(promptForRender.config ?? {}),
    ...(test.options ?? {}),
  };
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

async function callProviderForRunEval({
  abortSignal,
  evalId,
  evaluateOptions,
  filters,
  promptForRender,
  promptIdx,
  provider,
  rateLimitRegistry,
  renderedPrompt,
  repeatIndex,
  test,
  testIdx,
  testSuite,
  vars,
}: Pick<
  RunEvalOptions,
  | 'abortSignal'
  | 'evalId'
  | 'evaluateOptions'
  | 'nunjucksFilters'
  | 'promptIdx'
  | 'provider'
  | 'rateLimitRegistry'
  | 'repeatIndex'
  | 'test'
  | 'testIdx'
  | 'testSuite'
> & {
  filters: RunEvalOptions['nunjucksFilters'];
  promptForRender: Prompt;
  renderedPrompt: string;
  vars: Vars;
}): Promise<ProviderCallResult> {
  const startTime = Date.now();
  const traceContext = test.providerOutput
    ? null
    : await generateTraceContextIfNeeded(test, evaluateOptions, testIdx, promptIdx, testSuite);
  const response = test.providerOutput
    ? {
        output: test.providerOutput,
        tokenUsage: createEmptyTokenUsage(),
        cost: 0,
        cached: false,
      }
    : await callActiveProvider({
        abortSignal,
        evalId,
        filters,
        promptForRender,
        provider,
        rateLimitRegistry,
        renderedPrompt,
        repeatIndex,
        test,
        traceContext,
        vars,
      });

  sanitizeResponseMetadata(response);

  return {
    latencyMs: Date.now() - startTime,
    response,
    traceContext,
  };
}

async function callActiveProvider({
  abortSignal,
  evalId,
  filters,
  promptForRender,
  provider,
  rateLimitRegistry,
  renderedPrompt,
  repeatIndex,
  test,
  traceContext,
  vars,
}: Pick<
  RunEvalOptions,
  'abortSignal' | 'evalId' | 'provider' | 'rateLimitRegistry' | 'repeatIndex' | 'test'
> & {
  filters: RunEvalOptions['nunjucksFilters'];
  promptForRender: Prompt;
  renderedPrompt: string;
  traceContext: Awaited<ReturnType<typeof generateTraceContextIfNeeded>>;
  vars: Vars;
}): Promise<ProviderResponse> {
  const activeProvider = isApiProvider(test.provider) ? test.provider : provider;
  logger.debug(`Provider type: ${activeProvider.id()}`);

  const callApiContext = buildCallApiContext({
    evalId,
    filters,
    originalProvider: provider,
    promptForRender,
    repeatIndex,
    test,
    traceContext,
    vars,
  });
  const callApiOptions = abortSignal ? { abortSignal } : undefined;

  const callApi = () => activeProvider.callApi(renderedPrompt, callApiContext, callApiOptions);
  const response = rateLimitRegistry
    ? await rateLimitRegistry.execute(activeProvider, callApi, createProviderRateLimitOptions())
    : await callApi();

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
  traceContext,
  vars,
}: {
  evalId?: string;
  filters: RunEvalOptions['nunjucksFilters'];
  originalProvider: ApiProvider;
  promptForRender: Prompt;
  repeatIndex: number;
  test: AtomicTestCase;
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
  };

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
  if (!conversations) {
    return;
  }

  const conversationLastInput = getConversationLastInput(renderedJson);
  conversations[conversationKey] = conversations[conversationKey] || [];
  conversations[conversationKey].push({
    prompt: renderedJson || renderedPrompt,
    input: conversationLastInput || renderedJson || renderedPrompt,
    output: response.output || '',
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

async function applyProviderDelayIfNeeded(provider: ApiProvider, response: ProviderResponse) {
  if (!response.cached && provider.delay && provider.delay > 0) {
    logger.debug(`Sleeping for ${provider.delay}ms`);
    await sleep(provider.delay);
  } else if (response.cached) {
    logger.debug(`Skipping delay because response is cached`);
  }
}

function createEvaluateResult({
  fileMetadata,
  latencyMs,
  prompt,
  promptIdx,
  rendered,
  response,
  setup,
  test,
  testIdx,
  vars,
}: {
  fileMetadata: Record<string, unknown>;
  latencyMs: number;
  prompt: Prompt;
  promptIdx: number;
  rendered: RenderedRunEvalPrompt;
  response: ProviderResponse;
  setup: RunEvalSetup;
  test: AtomicTestCase;
  testIdx: number;
  vars: Vars;
}): EvaluateResult {
  const ret: EvaluateResult = {
    ...setup,
    prompt: { ...rendered.setup.prompt, raw: rendered.renderedPrompt },
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

  return ret;
}

function trackProviderUsage(provider: ApiProvider, response: ProviderResponse) {
  if (!response.tokenUsage) {
    return;
  }
  const providerId = provider.id();
  const trackingId = provider.constructor?.name
    ? `${providerId} (${provider.constructor.name})`
    : providerId;
  TokenUsageTracker.getInstance().trackUsage(trackingId, response.tokenUsage);
}

async function applyRunEvalResponseOutcome({
  abortSignal,
  deferGrading,
  evalId,
  isRedteam,
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
  traceContext,
  vars,
}: {
  abortSignal?: AbortSignal;
  deferGrading?: boolean;
  evalId?: string;
  isRedteam: boolean;
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
    applyEmptyResponseOutcome(ret, isRedteam);
    return;
  }

  await gradeRunEvalResponse({
    abortSignal,
    deferGrading,
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
    traceContext,
    vars,
  });
}

function applyEmptyResponseOutcome(ret: EvaluateResult, isRedteam: boolean) {
  if (isRedteam) {
    ret.success = true;
  } else {
    ret.success = false;
    ret.score = 0;
    ret.error = 'No output';
  }
}

async function gradeRunEvalResponse({
  abortSignal,
  deferGrading,
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
  traceContext,
  vars,
}: {
  abortSignal?: AbortSignal;
  deferGrading?: boolean;
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
  if (traceId && hasTraceAwareAssertions(test.assert)) {
    await flushOtel();
  }

  const assertionProviderResponse = {
    ...processedResponse,
    providerTransformedOutput,
  };

  if (deferGrading) {
    invariant(providerCallQueue, 'providerCallQueue is required when deferGrading is enabled');
    ret.response = processedResponse;
    const gradingPromise = withProviderCallExecutionContext(
      { abortSignal, providerCallQueue, rateLimitRegistry },
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
      applyGradingError(ret, error);
    });
    deferredGradingPromises.set(ret, gradingPromise);
    return;
  }

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

function getTraceId(traceContext: Awaited<ReturnType<typeof generateTraceContextIfNeeded>>) {
  if (!traceContext?.traceparent) {
    return undefined;
  }
  const parts = traceContext.traceparent.split('-');
  return parts.length >= 3 ? parts[1] : undefined;
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
  return withCacheNamespace(
    getRepeatCacheNamespace(options.repeatIndex, options.evaluateOptions),
    () => runEvalInternal(options),
  );
}

async function runEvalInternal({
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
  deferGrading,
  evalId,
  providerCallQueue,
  rateLimitRegistry,
}: RunEvalOptions): Promise<EvaluateResult[]> {
  provider.delay ??= delay ?? getEnvInt('PROMPTFOO_DELAY_MS', 0);
  invariant(
    typeof provider.delay === 'number',
    `Provider delay should be set for ${provider.label}`,
  );

  const state = createRunEvalState({ provider, prompt, test });
  attachConversationVar({
    conversations,
    conversationKey: state.conversationKey,
    prompt,
    test,
    vars: state.vars,
  });
  Object.assign(state.vars, registers);

  let setup = state.setup;
  let latencyMs = 0;

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

    const providerCall = await callProviderForRunEval({
      abortSignal,
      evalId,
      evaluateOptions,
      filters,
      promptForRender: {
        ...state.promptForRender,
        config: rendered.setup.prompt.config,
      },
      promptIdx,
      provider,
      rateLimitRegistry,
      renderedPrompt: rendered.renderedPrompt,
      repeatIndex,
      test,
      testIdx,
      testSuite,
      vars: state.vars,
    });
    const { response, traceContext } = providerCall;
    latencyMs = providerCall.latencyMs;

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

    await applyProviderDelayIfNeeded(provider, response);

    const ret = createEvaluateResult({
      fileMetadata: state.fileMetadata,
      latencyMs,
      prompt,
      promptIdx,
      rendered,
      response,
      setup,
      test,
      testIdx,
      vars: state.vars,
    });

    invariant(ret.tokenUsage, 'This is always defined, just doing this to shut TS up');

    trackProviderUsage(provider, response);
    await applyRunEvalResponseOutcome({
      abortSignal,
      deferGrading,
      evalId,
      isRedteam,
      latencyMs,
      prompt,
      promptIdx,
      provider,
      providerCallQueue,
      rateLimitRegistry,
      renderedPrompt: rendered.renderedPrompt,
      response,
      ret,
      test,
      testIdx,
      traceContext,
      vars: state.vars,
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
  } catch (err) {
    const { errorWithStack, metadata, logContext } = buildProviderErrorContext({
      error: err,
      provider,
      test,
      promptIdx,
      testIdx,
    });

    // Don't log AbortError - these are expected when scan is aborted (e.g., target unavailable)
    const isAbortError = err instanceof Error && err.name === 'AbortError';
    if (!isAbortError) {
      logger.error('Provider call failed during eval', logContext);
    }

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

function updatePromptResultCounts(metrics: PromptMetrics, row: EvaluateResult) {
  metrics.testPassCount += row.success ? 1 : 0;
  if (!row.success) {
    if (row.failureReason === ResultFailureReason.ERROR) {
      metrics.testErrorCount += 1;
    } else {
      metrics.testFailCount += 1;
    }
  }
}

async function updateDerivedMetrics(
  metrics: PromptMetrics,
  derivedMetrics: NonNullable<TestSuite['derivedMetrics']>,
  evalStep: RunEvalOptions,
  promptEvalCount: number,
) {
  const math = await import('mathjs');
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
      metrics.namedScores[metric.name] =
        typeof metric.value === 'function'
          ? metric.value(evalContext, evalStep)
          : math.evaluate(metric.value, evalContext);
      evalContext[metric.name] = metrics.namedScores[metric.name];
    } catch (error) {
      logger.debug(
        `Could not evaluate derived metric '${metric.name}': ${(error as Error).message}`,
      );
    }
  }
}

function updateComparisonReporterTotals({
  ciProgressReporter,
  compareRowsCount,
  progressBarManager,
  runEvalOptions,
}: {
  ciProgressReporter: CIProgressReporter | null;
  compareRowsCount: number;
  progressBarManager: ProgressBarManager | null;
  runEvalOptions: RunEvalOptions[];
}) {
  if (progressBarManager && compareRowsCount > 0) {
    progressBarManager.updateTotalCount(compareRowsCount);
  } else if (ciProgressReporter && compareRowsCount > 0) {
    ciProgressReporter.updateTotalTests(runEvalOptions.length + compareRowsCount);
  }
}

function updateComparisonReporterProgress({
  ciProgressReporter,
  compareCount,
  isWebUI,
  label,
  progressBarManager,
  promptRaw,
  runEvalOptions,
}: {
  ciProgressReporter: CIProgressReporter | null;
  compareCount: number;
  isWebUI: boolean;
  label: string;
  progressBarManager: ProgressBarManager | null;
  promptRaw: string;
  runEvalOptions: RunEvalOptions[];
}) {
  if (progressBarManager) {
    progressBarManager.updateComparisonProgress(promptRaw);
  } else if (ciProgressReporter) {
    ciProgressReporter.update(runEvalOptions.length + compareCount);
  } else if (!isWebUI) {
    logger.debug(`${label} complete`);
  }
}

function resultHasModelGradedAssertion(result: EvalResult) {
  return result.testCase?.assert?.some((assertion) =>
    MODEL_GRADED_ASSERTION_TYPES.has(assertion.type as AssertionType),
  );
}

function mergeComparisonTokenUsage(
  result: EvalResult,
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
  updateAssertionMetrics(
    { tokenUsage: { assertions: result.gradingResult.tokensUsed } },
    gradingResult.tokensUsed,
  );

  if (resultHasModelGradedAssertion(result)) {
    updateAssertionMetrics({ tokenUsage: evalTokenUsage }, gradingResult.tokensUsed);
  }
}

function mergeSelectBestGradingResult(
  result: EvalResult,
  gradingResult: GradingResult,
  evalTokenUsage: TokenUsage,
) {
  mergeComparisonTokenUsage(result, gradingResult, evalTokenUsage);

  if (result.gradingResult) {
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

function mergeMaxScoreGradingResult(result: EvalResult, gradingResult: GradingResult) {
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

function ensureDefaultTestForExtensions(testSuite: TestSuite) {
  if (!testSuite.extensions?.length) {
    return;
  }
  if (!testSuite.defaultTest) {
    testSuite.defaultTest = {};
  }
  if (typeof testSuite.defaultTest !== 'string' && !testSuite.defaultTest.assert) {
    testSuite.defaultTest.assert = [];
  }
}

async function maybeAddGeneratedPrompts(testSuite: TestSuite, options: EvaluateOptions) {
  if (!options.generateSuggestions) {
    return true;
  }

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

    if (await promptYesNo('Do you want to test this prompt?', false)) {
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
  process.exitCode = 1;
  return false;
}

function createDefaultPromptMetrics(): PromptMetrics {
  return {
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
    namedScoreWeights: {},
    cost: 0,
  };
}

function buildExistingPromptsMap(evalRecord: Eval) {
  const existingPromptsMap = new Map<string, CompletedPrompt>();
  if (cliState.resume && evalRecord.persisted && evalRecord.prompts.length > 0) {
    logger.debug('Resuming evaluation: preserving metrics from previous run');
    for (const existingPrompt of evalRecord.prompts) {
      existingPromptsMap.set(`${existingPrompt.provider}:${existingPrompt.id}`, existingPrompt);
    }
  }
  return existingPromptsMap;
}

function buildCompletedPrompts(testSuite: TestSuite, evalRecord: Eval): CompletedPrompt[] {
  const prompts: CompletedPrompt[] = [];
  const existingPromptsMap = buildExistingPromptsMap(evalRecord);

  for (const provider of testSuite.providers) {
    for (const prompt of testSuite.prompts) {
      const providerKey = provider.label || provider.id();
      if (!isAllowedPrompt(prompt, testSuite.providerPromptMap?.[providerKey])) {
        continue;
      }

      const promptId = generateIdFromPrompt(prompt);
      const existingPrompt = existingPromptsMap.get(`${providerKey}:${promptId}`);
      if (existingPrompt?.metrics) {
        backfillNamedScoreWeights(existingPrompt.metrics);
      }

      prompts.push({
        ...prompt,
        id: promptId,
        provider: providerKey,
        label: prompt.label,
        metrics: existingPrompt?.metrics || createDefaultPromptMetrics(),
      });
    }
  }

  return prompts;
}

function buildPromptIndexMap(prompts: CompletedPrompt[]) {
  const promptIndexMap = new Map<string, number>();
  for (let i = 0; i < prompts.length; i++) {
    promptIndexMap.set(`${prompts[i].provider}:${prompts[i].id}`, i);
  }
  return promptIndexMap;
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
      ...(defaultTest?.options || {}),
      ...test.options,
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
  promptIndexMap,
  providerAbortSignal,
  rateLimitRegistry,
  registers,
  testSuite,
  tests,
}: {
  concurrency: number;
  conversations: EvalConversations;
  evalId: string;
  options: EvaluateOptions;
  promptIndexMap: Map<string, number>;
  providerAbortSignal?: AbortSignal;
  rateLimitRegistry?: RateLimitRegistryRef;
  registers: EvalRegisters;
  testSuite: TestSuite;
  tests: AtomicTestCase[];
}): Promise<RunEvalOptions[]> {
  const runEvalOptions: RunEvalOptions[] = [];
  const promptIdCache = new Map<Prompt, string>();
  for (const prompt of testSuite.prompts) {
    promptIdCache.set(prompt, generateIdFromPrompt(prompt));
  }

  let testIdx = 0;
  for (let index = 0; index < tests.length; index++) {
    const testCase = tests[index];
    await prepareTestCaseForEval(testSuite, testCase, index);
    testIdx = appendRunEvalOptionsForTestCase({
      concurrency,
      conversations,
      evalId,
      nextTestIdx: testIdx,
      options,
      promptIdCache,
      promptIndexMap,
      providerAbortSignal,
      rateLimitRegistry,
      registers,
      runEvalOptions,
      testCase,
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
    ...(defaultTest?.options || {}),
    ...testCase.options,
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
    const { loadApiProvider } = await import('./providers');
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
  promptIdCache,
  promptIndexMap,
  providerAbortSignal,
  rateLimitRegistry,
  registers,
  runEvalOptions,
  testCase,
  testSuite,
}: {
  concurrency: number;
  conversations: EvalConversations;
  evalId: string;
  nextTestIdx: number;
  options: EvaluateOptions;
  promptIdCache: Map<Prompt, string>;
  promptIndexMap: Map<string, number>;
  providerAbortSignal?: AbortSignal;
  rateLimitRegistry?: RateLimitRegistryRef;
  registers: EvalRegisters;
  runEvalOptions: RunEvalOptions[];
  testCase: AtomicTestCase;
  testSuite: TestSuite;
}) {
  const promptPrefix = testCase.options?.prefix || getDefaultTest(testSuite)?.options?.prefix || '';
  const promptSuffix = testCase.options?.suffix || getDefaultTest(testSuite)?.options?.suffix || '';
  const varCombinations =
    getEnvBool('PROMPTFOO_DISABLE_VAR_EXPANSION') || testCase.options?.disableVarExpansion
      ? [testCase.vars]
      : generateVarCombinations(testCase.vars || {});

  for (let repeatIndex = 0; repeatIndex < (options.repeat || 1); repeatIndex++) {
    for (const vars of varCombinations) {
      appendRunEvalOptionsForVars({
        concurrency,
        conversations,
        evalId,
        options,
        promptIdCache,
        promptIndexMap,
        promptPrefix,
        promptSuffix,
        providerAbortSignal,
        rateLimitRegistry,
        registers,
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
  promptIdCache,
  promptIndexMap,
  promptPrefix,
  promptSuffix,
  providerAbortSignal,
  rateLimitRegistry,
  registers,
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
  options: EvaluateOptions;
  promptIdCache: Map<Prompt, string>;
  promptIndexMap: Map<string, number>;
  promptPrefix: string;
  promptSuffix: string;
  providerAbortSignal?: AbortSignal;
  rateLimitRegistry?: RateLimitRegistryRef;
  registers: EvalRegisters;
  repeatIndex: number;
  runEvalOptions: RunEvalOptions[];
  testCase: AtomicTestCase;
  testIdx: number;
  testSuite: TestSuite;
  vars: Vars | undefined;
}) {
  for (const provider of testSuite.providers) {
    if (!isProviderAllowed(provider, testCase.providers)) {
      continue;
    }
    appendRunEvalOptionsForProvider({
      concurrency,
      conversations,
      evalId,
      options,
      promptIdCache,
      promptIndexMap,
      promptPrefix,
      promptSuffix,
      provider,
      providerAbortSignal,
      rateLimitRegistry,
      registers,
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
  concurrency,
  conversations,
  evalId,
  options,
  promptIdCache,
  promptIndexMap,
  promptPrefix,
  promptSuffix,
  provider,
  providerAbortSignal,
  rateLimitRegistry,
  registers,
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
  options: EvaluateOptions;
  promptIdCache: Map<Prompt, string>;
  promptIndexMap: Map<string, number>;
  promptPrefix: string;
  promptSuffix: string;
  provider: ApiProvider;
  providerAbortSignal?: AbortSignal;
  rateLimitRegistry?: RateLimitRegistryRef;
  registers: EvalRegisters;
  repeatIndex: number;
  runEvalOptions: RunEvalOptions[];
  testCase: AtomicTestCase;
  testIdx: number;
  testSuite: TestSuite;
  vars: Vars | undefined;
}) {
  const providerKey = provider.label || provider.id();
  for (const prompt of testSuite.prompts) {
    if (!shouldRunPromptForTest(prompt, providerKey, testCase, testSuite)) {
      continue;
    }

    const promptIdx = promptIndexMap.get(`${providerKey}:${promptIdCache.get(prompt)!}`);
    if (promptIdx === undefined) {
      logger.warn(
        `Could not find prompt index for ${providerKey}:${promptIdCache.get(prompt)}, skipping`,
      );
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
        repeatIndex,
        testCase,
        testIdx,
        testSuite,
        vars,
      }),
    );
  }
}

function shouldRunPromptForTest(
  prompt: Prompt,
  providerKey: string,
  testCase: AtomicTestCase,
  testSuite: TestSuite,
) {
  return (
    isAllowedPrompt(prompt, testSuite.providerPromptMap?.[providerKey]) &&
    isAllowedPrompt(prompt, testCase.prompts)
  );
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
  repeatIndex,
  testCase,
  testIdx,
  testSuite,
  vars,
}: {
  concurrency: number;
  conversations: EvalConversations;
  evalId: string;
  options: EvaluateOptions;
  prompt: Prompt;
  promptIdx: number;
  promptPrefix: string;
  promptSuffix: string;
  provider: ApiProvider;
  providerAbortSignal?: AbortSignal;
  rateLimitRegistry?: RateLimitRegistryRef;
  registers: EvalRegisters;
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

async function filterCompletedResumeSteps(runEvalOptions: RunEvalOptions[], evalRecord: Eval) {
  if (!cliState.resume || !evalRecord.persisted) {
    return;
  }

  try {
    const { default: EvalResult } = await import('./models/evalResult');
    const completedPairs = await EvalResult.getCompletedIndexPairs(evalRecord.id, {
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

function adjustConcurrencyForSerialFeatures({
  concurrency,
  prompts,
  tests,
}: {
  concurrency: number;
  prompts: CompletedPrompt[];
  tests: AtomicTestCase[];
}) {
  const usesConversationVar = prompts.some((p) => p.raw.includes('_conversation'));
  if (concurrency <= 1) {
    return { concurrency, usesConversationVar };
  }

  const usesStoreOutputAs = tests.some((t) => t.options?.storeOutputAs);
  if (usesConversationVar) {
    logger.info(
      `Setting concurrency to 1 because the ${chalk.cyan('_conversation')} variable is used.`,
    );
    return { concurrency: 1, usesConversationVar };
  }
  if (usesStoreOutputAs) {
    logger.info(`Setting concurrency to 1 because storeOutputAs is used.`);
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
  numComplete: number;
  options: EvaluateOptions;
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
  const rowsWithDeferredGrading = getRowsWithDeferredGrading(entries);
  if (rowsWithDeferredGrading.length === 0) {
    return;
  }

  const deferredRows = new Set(rowsWithDeferredGrading.map(({ row }) => row));
  const completedRows = new Set<EvaluateResult>();
  const processedEntries = new Set<GroupedRows>();
  let pendingCount = rowsWithDeferredGrading.length;
  let resolveAllDone: () => void = () => {};
  const allDone = new Promise<void>((resolve) => {
    resolveAllDone = resolve;
  });

  const gradingPromises = rowsWithDeferredGrading.map(({ row, gradingPromise }) =>
    gradingPromise.finally(() => {
      deferredGradingPromises.delete(row);
      completedRows.add(row);
      pendingCount--;
      if (pendingCount === 0) {
        resolveAllDone();
      }
    }),
  );

  const processReadyEntries = async () => {
    for (const entry of entries) {
      if (processedEntries.has(entry)) {
        continue;
      }
      if (!entry.rows.every((row) => !deferredRows.has(row) || completedRows.has(row))) {
        break;
      }
      processedEntries.add(entry);
      await onRowsGraded(entry);
    }
  };

  let currentProviderId: string | undefined;
  while (pendingCount > 0 || providerCallQueue.hasJobs()) {
    if (!providerCallQueue.hasJobs()) {
      await Promise.race([providerCallQueue.waitForJob(), allDone]);
      await processReadyEntries();
    }

    const group = providerCallQueue.takeNextGroup(currentProviderId);
    if (group.length === 0) {
      continue;
    }

    currentProviderId = group[0].providerId;
    for (const job of group) {
      await providerCallQueue.run(job);
      await Promise.resolve();
      await processReadyEntries();
    }
  }

  await Promise.all(gradingPromises);
  await processReadyEntries();
}

function getRowsWithDeferredGrading(entries: GroupedRows[]) {
  return entries
    .flatMap((entry) => entry.rows.map((row) => ({ entry, row })))
    .map(({ entry, row }) => ({ entry, row, gradingPromise: deferredGradingPromises.get(row) }))
    .filter(
      (
        item,
      ): item is {
        entry: GroupedRows;
        row: EvaluateResult;
        gradingPromise: Promise<void>;
      } => item.gradingPromise !== undefined,
    );
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

function cleanupProgressAfterError(
  progressBarManager: ProgressBarManager | null,
  ciProgressReporter: CIProgressReporter | null,
  error: unknown,
) {
  progressBarManager?.removeLogInterceptor();
  progressBarManager?.stop();
  ciProgressReporter?.error(`Evaluation failed: ${String(error)}`);
}

function logWebUiEvalStepStart(
  isWebUI: boolean,
  processingContext: EvalProcessingContext,
  evalStep: RunEvalOptions,
) {
  if (!isWebUI) {
    return;
  }
  const provider = evalStep.provider.label || evalStep.provider.id();
  const vars = formatVarsForDisplay(evalStep.test.vars || {}, 50);
  logger.info(
    `[${processingContext.numComplete}/${processingContext.runEvalOptionsLength}] Running ${provider} with vars: ${vars}`,
  );
}

function cleanupProgressReporters(
  progressBarManager: ProgressBarManager | null,
  ciProgressReporter: CIProgressReporter | null,
) {
  try {
    if (progressBarManager) {
      progressBarManager.removeLogInterceptor();
      progressBarManager.complete();
      progressBarManager.stop();
    } else if (ciProgressReporter) {
      ciProgressReporter.finish();
    }
  } catch (cleanupErr) {
    logger.warn(`Error during progress reporter cleanup: ${cleanupErr}`);
  }
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

function getAverageLatencyMs(results: EvalResult[]) {
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

  private trackModelGradedAssertionUsage(row: EvaluateResult): void {
    if (!row.gradingResult?.tokensUsed || !row.testCase?.assert) {
      return;
    }
    const hasModelGradedAssertion = row.testCase.assert.some((assertion) =>
      MODEL_GRADED_ASSERTION_TYPES.has(assertion.type as AssertionType),
    );
    if (!hasModelGradedAssertion) {
      return;
    }

    this.stats.tokenUsage.assertions ??= createEmptyAssertions();
    accumulateAssertionTokenUsage(this.stats.tokenUsage.assertions, row.gradingResult.tokensUsed);
  }

  private trackRowStats(row: EvaluateResult): void {
    this.trackModelGradedAssertionUsage(row);
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

  private async persistEvalRow(row: EvaluateResult): Promise<void> {
    try {
      await this.evalRecord.addResult(row);
    } catch (error) {
      const resultSummary = summarizeEvaluateResultForLogging(row);
      logger.error('[Evaluator] Error saving result', {
        error,
        resultSummary,
      });
    }

    for (const writer of this.fileWriters) {
      await writer.write(row);
    }
  }

  private async updatePromptMetricsForRow({
    derivedMetrics,
    evalStep,
    metrics,
    promptEvalCount,
    row,
  }: {
    derivedMetrics: TestSuite['derivedMetrics'];
    evalStep: RunEvalOptions;
    metrics: PromptMetrics;
    promptEvalCount: number;
    row: EvaluateResult;
  }): Promise<void> {
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
      await updateDerivedMetrics(metrics, derivedMetrics, evalStep, promptEvalCount);
    }

    updatePromptResultCounts(metrics, row);
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
    return withCacheNamespace(
      getRepeatCacheNamespace(evalStep.repeatIndex, evalStep.evaluateOptions),
      async () => {
        const rows =
          precomputedRows ||
          (await this.runEvalStepAfterBeforeEach(evalStep, {
            deferGrading,
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
      onRowsReady,
      providerCallQueue,
      testSuite,
    }: {
      deferGrading: boolean;
      onRowsReady?: () => void;
      providerCallQueue?: ProviderCallQueue;
      testSuite: TestSuite;
    },
  ) {
    const beforeEachOut = await runExtensionHook(testSuite.extensions, 'beforeEach', {
      test: evalStep.test,
    });
    evalStep.test = beforeEachOut.test;

    const rows = await runEvalInternal({
      ...evalStep,
      deferGrading,
      providerCallQueue: deferGrading ? providerCallQueue : undefined,
    });
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

      this.trackCompletedRow(evalStep, row, context);
      context.numComplete++;
      const promptEvalCount = reservePromptEvalCount(context, row.promptIdx);
      await this.persistEvalRow(row);

      if (this.abortIfTargetUnavailable(row, context)) {
        break;
      }

      const metrics = context.prompts[row.promptIdx].metrics;
      invariant(metrics, 'Expected prompt.metrics to be set');
      await this.updatePromptMetricsForRow({
        derivedMetrics: context.testSuite.derivedMetrics,
        evalStep,
        metrics,
        promptEvalCount,
        row,
      });

      await runExtensionHook(context.testSuite.extensions, 'afterEach', {
        test: evalStep.test,
        result: row,
      });

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
      return this.processEvalStep(evalStep, index, { deferGrading, providerCallQueue }, context);
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
    await this.evalRecord.addResult(timeoutResult);
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
  }): Promise<Eval | undefined> {
    let flushGroupedRows: (() => Promise<void>) | undefined;

    try {
      if (shouldGroupGradingByProvider) {
        flushGroupedRows = await this.runGroupedEvalSteps({
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
    } catch (err) {
      if (!combinedAbortSignal.aborted) {
        cleanupProgressAfterError(progressBarManager, ciProgressReporter, err);
        throw err;
      }

      await flushGroupedRows?.();
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
  }) {
    const providerCallQueue = new ProviderGroupedCallQueue();
    const groupedRows: GroupedRows[] = [];
    const processGroupedRows = async ({ evalStep, index, rows }: GroupedRows) => {
      await this.processEvalStep(evalStep, index, { precomputedRows: rows }, processingContext);
      processedIndices.add(index);
      await this.evalRecord.addPrompts(prompts);
    };
    const flushGroupedRows = () =>
      runGroupedGradingForRows(groupedRows, providerCallQueue, processGroupedRows);

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
            rows,
            shouldDeferEvalStepGrading,
            processingContext,
          })
        ) {
          break;
        }
      }
    } catch (error) {
      await flushGroupedRows();
      throw error;
    }

    await flushGroupedRows();
    return undefined;
  }

  private async handleGroupedRowsAfterRun({
    evalStep,
    groupedRows,
    idx,
    processGroupedRows,
    processedIndices,
    rows,
    shouldDeferEvalStepGrading,
    processingContext,
  }: {
    evalStep: RunEvalOptions;
    groupedRows: GroupedRows[];
    idx: number;
    processGroupedRows: (entry: GroupedRows) => Promise<void>;
    processedIndices: Set<number>;
    rows: EvaluateResult[];
    shouldDeferEvalStepGrading: boolean;
    processingContext: EvalProcessingContext;
  }) {
    if (!shouldDeferEvalStepGrading) {
      processedIndices.add(idx);
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
    serialRunEvalOptions,
  }: {
    checkAbort: () => void;
    evalStepIndexMap: Map<RunEvalOptions, number>;
    isWebUI: boolean;
    processingContext: EvalProcessingContext;
    processedIndices: Set<number>;
    serialRunEvalOptions: RunEvalOptions[];
  }) {
    for (const evalStep of serialRunEvalOptions) {
      checkAbort();
      logWebUiEvalStepStart(isWebUI, processingContext, evalStep);
      const idx = evalStepIndexMap.get(evalStep)!;
      await this.processEvalStepWithTimeout(evalStep, idx, {}, processingContext);
      processedIndices.add(idx);
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
    const PROMPTS_FLUSH_INTERVAL_MS = 1000;
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
          await this.evalRecord.addPrompts(prompts);
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
    this.evalRecord.setVars(Array.from(processingContext.vars));
    await this.evalRecord.addPrompts(prompts);
    updateSignalFile(this.evalRecord.id);
    return this.evalRecord;
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
    this.evalRecord.setVars(Array.from(processingContext.vars));
    await this.evalRecord.addPrompts(prompts);
    updateSignalFile(this.evalRecord.id);
    return this.evalRecord;
  }

  private async processComparisonAssertions({
    ciProgressReporter,
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

    const compareCount = await this.processSelectBestAssertions({
      ciProgressReporter,
      compareRowsCount,
      isWebUI,
      progressBarManager,
      prompts,
      providerAbortSignal,
      repeatCacheContextByTestIdx,
      rowsWithSelectBestAssertion,
      runEvalOptions,
    });

    await this.processMaxScoreAssertions({
      ciProgressReporter,
      compareCount,
      isWebUI,
      progressBarManager,
      prompts,
      rowsWithMaxScoreAssertion,
      runEvalOptions,
    });
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

    const compareAssertion = resultsToCompare[0].testCase.assert?.find(
      (a) => a.type === 'select-best',
    ) as Assertion;
    if (!compareAssertion) {
      return;
    }

    const repeatCacheContext = repeatCacheContextByTestIdx.get(testIdx);
    const outputs = resultsToCompare.map((r) => r.response?.output || '');
    const gradingResults = await withCacheNamespace(
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
              resultsToCompare[0].testCase,
              compareAssertion,
              outputs,
              this.getComparisonCallApiContext(resultsToCompare[0], repeatCacheContext),
            ),
        ),
    );

    for (let index = 0; index < resultsToCompare.length; index++) {
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
    rowsWithMaxScoreAssertion,
    runEvalOptions,
  }: {
    ciProgressReporter: CIProgressReporter | null;
    compareCount: number;
    isWebUI: boolean;
    progressBarManager: ProgressBarManager | null;
    prompts: CompletedPrompt[];
    rowsWithMaxScoreAssertion: Set<number>;
    runEvalOptions: RunEvalOptions[];
  }) {
    if (rowsWithMaxScoreAssertion.size > 0) {
      logger.info(`Processing ${rowsWithMaxScoreAssertion.size} max-score assertions...`);
    }

    let currentCompareCount = compareCount;
    for (const testIdx of rowsWithMaxScoreAssertion) {
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

    const maxScoreAssertion = resultsToCompare[0].testCase.assert?.find(
      (a) => a.type === 'max-score',
    ) as Assertion;
    if (!maxScoreAssertion) {
      return;
    }

    const outputs = resultsToCompare.map((r) => r.response?.output || '');
    const maxScoreGradingResults = await selectMaxScore(
      outputs,
      resultsToCompare,
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

  private async getResultsToCompare(testIdx: number) {
    return this.evalRecord.persisted
      ? this.evalRecord.fetchResultsByTestIdx(testIdx)
      : this.evalRecord.results.filter((r) => r.testIdx === testIdx);
  }

  private getComparisonCallApiContext(
    firstResult: EvalResult,
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

  private async applySelectBestGradingResult({
    gradingResult,
    metrics,
    result,
  }: {
    gradingResult: GradingResult;
    metrics: CompletedPrompt['metrics'] | undefined;
    result: EvalResult;
  }) {
    const wasSuccess = result.success;
    const wasScore = result.score;
    mergeSelectBestGradingResult(result, gradingResult, this.stats.tokenUsage);
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

  private async applyMaxScoreGradingResult({
    gradingResult,
    metrics,
    result,
  }: {
    gradingResult: GradingResult;
    metrics: CompletedPrompt['metrics'] | undefined;
    result: EvalResult;
  }) {
    const wasSuccess = result.success;
    const wasScore = result.score;
    mergeMaxScoreGradingResult(result, gradingResult);
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
    options: EvaluateOptions;
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
    await this.evalRecord.addPrompts(prompts);
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

    this.evalRecord.setVars(Array.from(vars));
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

    if (this.evalRecord.persisted) {
      await this.evalRecord.save();
    }
    updateSignalFile(this.evalRecord.id);
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
      await this.evalRecord.addResult(timeoutResult);
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
    options: EvaluateOptions;
    prompts: CompletedPrompt[];
    startTime: number;
    testSuite: TestSuite;
    tests: AtomicTestCase[];
    usesConversationVar: boolean;
    varNames: Set<string>;
  }) {
    const totalEvalTimeMs = Date.now() - startTime;
    this.evalRecord.setDurationMs(totalEvalTimeMs);

    const assertionStats = getAssertionTelemetryStats(prompts, assertionTypes);
    const avgLatencyMs = getAverageLatencyMs(this.evalRecord.results);
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

  private async _runEvaluation(): Promise<Eval> {
    const { options } = this;
    let { testSuite } = this;

    const startTime = Date.now();
    const maxEvalTimeMs = options.maxEvalTimeMs ?? getMaxEvalTimeMs();
    let evalTimedOut = false;
    let globalTimeout: NodeJS.Timeout | undefined;
    let globalAbortController: AbortController | undefined;
    const processedIndices = new Set<number>();

    const targetErrorAbortController = new AbortController();

    // Progress reporters declared here for cleanup in finally block
    let ciProgressReporter: CIProgressReporter | null = null;
    let progressBarManager: ProgressBarManager | null = null;

    // Create abort signals:
    // - providerAbortSignal: passed to providers (user signal + timeout, but NOT target error)
    // - combinedAbortSignal: used internally for checkAbort (includes target error signal)
    // Target error signal is not passed to providers because by the time we detect a 403 etc,
    // the provider call has already completed - it's only used to stop the evaluator loop.
    let providerAbortSignal: AbortSignal | undefined = options.abortSignal;
    let combinedAbortSignal: AbortSignal = options.abortSignal
      ? AbortSignal.any([options.abortSignal, targetErrorAbortController.signal])
      : targetErrorAbortController.signal;

    if (maxEvalTimeMs > 0) {
      globalAbortController = new AbortController();
      // Providers need timeout signal to cancel long-running requests
      providerAbortSignal = providerAbortSignal
        ? AbortSignal.any([providerAbortSignal, globalAbortController.signal])
        : globalAbortController.signal;
      // Internal signal includes all abort sources
      combinedAbortSignal = AbortSignal.any([combinedAbortSignal, globalAbortController.signal]);
      globalTimeout = setTimeout(() => {
        evalTimedOut = true;
        globalAbortController?.abort();
      }, maxEvalTimeMs);
    }

    const vars = new Set<string>();
    const checkAbort = () => {
      if (combinedAbortSignal.aborted) {
        throw new Error('Operation cancelled');
      }
    };

    if (!options.silent) {
      logger.info(`Starting evaluation ${this.evalRecord.id}`);
    }

    // Add abort checks at key points
    checkAbort();

    const prompts: CompletedPrompt[] = [];
    const assertionTypes = new Set<string>();
    const rowsWithSelectBestAssertion = new Set<number>();
    const rowsWithMaxScoreAssertion = new Set<number>();

    ensureDefaultTestForExtensions(testSuite);
    const beforeAllOut = await runExtensionHook(testSuite.extensions, 'beforeAll', {
      suite: testSuite,
    });
    testSuite = beforeAllOut.suite;

    if (!(await maybeAddGeneratedPrompts(testSuite, options))) {
      return this.evalRecord;
    }

    prompts.push(...buildCompletedPrompts(testSuite, this.evalRecord));
    const promptIndexMap = buildPromptIndexMap(prompts);

    await this.evalRecord.addPrompts(prompts);

    const tests = buildTestsFromSuite(testSuite);
    maybeEmitAzureOpenAiWarning(testSuite, tests);

    const varNames = await prepareTestVariables(tests, testSuite);
    let concurrency = options.maxConcurrency || DEFAULT_MAX_CONCURRENCY;
    const runEvalOptions = await buildRunEvalOptions({
      concurrency,
      conversations: this.conversations,
      evalId: this.evalRecord.id,
      options,
      promptIndexMap,
      providerAbortSignal,
      rateLimitRegistry: this.rateLimitRegistry,
      registers: this.registers,
      testSuite,
      tests,
    });
    markComparisonRows(runEvalOptions, rowsWithSelectBestAssertion, rowsWithMaxScoreAssertion);
    const repeatCacheContextByTestIdx = buildRepeatCacheContextByTestIdx(runEvalOptions);
    await filterCompletedResumeSteps(runEvalOptions, this.evalRecord);

    const concurrencySettings = adjustConcurrencyForSerialFeatures({
      concurrency,
      prompts,
      tests,
    });
    concurrency = concurrencySettings.concurrency;
    const { usesConversationVar } = concurrencySettings;

    const processingContext: EvalProcessingContext = {
      assertionTypes,
      concurrency,
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
      isEvalTimedOut: () => evalTimedOut,
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

    await this.processComparisonAssertions({
      ciProgressReporter,
      isWebUI,
      progressBarManager,
      prompts,
      providerAbortSignal,
      repeatCacheContextByTestIdx,
      rowsWithMaxScoreAssertion,
      rowsWithSelectBestAssertion,
      runEvalOptions,
    });

    await this.finalizeEvaluation({
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
    });
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
