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
  // Use the original prompt to set the label, not renderedPrompt
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

  // Collect file metadata for the test case before rendering the prompt.
  const fileMetadata = collectFileMetadata(test.vars || vars);

  const conversationKey = `${provider.label || provider.id()}:${prompt.id}${test.metadata?.conversationId ? `:${test.metadata.conversationId}` : ''}`;
  const usesConversation = prompt.raw.includes('_conversation');
  if (
    !getEnvBool('PROMPTFOO_DISABLE_CONVERSATION_VAR') &&
    !test.options?.disableConversationVar &&
    usesConversation
  ) {
    vars._conversation = conversations?.[conversationKey] || [];
  }

  // Overwrite vars with any saved register values
  Object.assign(vars, registers);

  // Initialize these outside try block so they're in scope for the catch
  // Merge test.options into prompt.config (test options override prompt config)
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
    // Render the prompt
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
      const activeProvider = isApiProvider(test.provider) ? test.provider : provider;
      logger.debug(`Provider type: ${activeProvider.id()}`);

      // Generate trace context if tracing is enabled
      traceContext = await generateTraceContextIfNeeded(
        test,
        evaluateOptions,
        testIdx,
        promptIdx,
        testSuite,
      );

      // Create a prompt object with merged config for the provider
      // This allows test.options to override prompt.config for per-test structured output
      const promptWithMergedConfig = {
        ...prompt,
        config: mergedPromptConfig,
      };
      const callApiContext: CallApiContextParams = {
        // Always included
        vars,

        // Part of these may be removed in python and script providers, but every Javascript provider gets them
        prompt: promptWithMergedConfig,
        filters,
        originalProvider: provider,
        test,

        // All of these are removed in python and script providers, but every Javascript provider gets them
        logger: logger as unknown as winston.Logger,
        getCache,
        repeatIndex,
      };

      if (repeatIndex > 0) {
        callApiContext.bustCache = true;
      }

      // Always set evaluationId if available (needed by redteam strategies like indirect-web-pwn)
      if (evalId) {
        callApiContext.evaluationId = evalId;
      }
      // Always set testCaseId
      callApiContext.testCaseId = test.metadata?.testCaseId || `${testIdx}-${promptIdx}`;

      // Add trace context properties if tracing is enabled (may override evaluationId with trace-specific ID)
      if (traceContext) {
        callApiContext.traceparent = traceContext.traceparent;
        callApiContext.evaluationId = traceContext.evaluationId;
        callApiContext.testCaseId = traceContext.testCaseId;
      }

      // Wrap provider call with rate limit registry if available
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
    }
    const endTime = Date.now();
    latencyMs = endTime - startTime;

    let conversationLastInput = undefined;
    if (renderedJson && Array.isArray(renderedJson)) {
      const lastElt = renderedJson[renderedJson.length - 1];
      // Use the `content` field if present (OpenAI chat format)
      conversationLastInput = lastElt?.content || lastElt;
    }
    if (conversations) {
      conversations[conversationKey] = conversations[conversationKey] || [];
      conversations[conversationKey].push({
        prompt: renderedJson || renderedPrompt,
        input: conversationLastInput || renderedJson || renderedPrompt,
        output: response.output || '',
        metadata: response.metadata,
      });
    }

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

    // Track token usage at the provider level
    if (response.tokenUsage) {
      const providerId = provider.id();
      const trackingId = provider.constructor?.name
        ? `${providerId} (${provider.constructor.name})`
        : providerId;
      TokenUsageTracker.getInstance().trackUsage(trackingId, response.tokenUsage);
    }

    if (response.error) {
      ret.error = response.error;
      ret.failureReason = ResultFailureReason.ERROR;
      ret.success = false;
    } else if (response.output === null || response.output === undefined) {
      // NOTE: empty output often indicative of guardrails, so behavior differs for red teams.
      if (isRedteam) {
        ret.success = true;
      } else {
        ret.success = false;
        ret.score = 0;
        ret.error = 'No output';
      }
    } else {
      // Create a copy of response so we can potentially mutate it.
      let processedResponse = { ...response };

      // Apply provider transform first (if exists)
      if (provider.transform) {
        processedResponse.output = await transform(provider.transform, processedResponse.output, {
          vars,
          prompt,
        });
      }

      // Store the provider-transformed output for assertions (contextTransform)
      const providerTransformedOutput = processedResponse.output;

      // Apply test transform (if exists)
      const testTransform = test.options?.transform || test.options?.postprocess;
      if (testTransform) {
        processedResponse.output = await transform(testTransform, processedResponse.output, {
          vars,
          prompt,
          ...(response && response.metadata && { metadata: response.metadata }),
        });
      }

      invariant(processedResponse.output != null, 'Response output should not be null');

      // Externalize large blobs before grading to avoid token bloat in model-graded assertions.
      const blobbedResponse = await extractAndStoreBinaryData(processedResponse, {
        evalId,
        testIdx,
        promptIdx,
      });
      if (blobbedResponse) {
        processedResponse = blobbedResponse;
      }

      // Extract traceId from traceparent if available
      let traceId: string | undefined;
      if (traceContext?.traceparent) {
        // traceparent format: version-traceId-spanId-flags
        const parts = traceContext.traceparent.split('-');
        if (parts.length >= 3) {
          traceId = parts[1];
        }
      }

      // Pass providerTransformedOutput for contextTransform to use
      // Pass resolved vars so assertions can access file:// variables that were resolved during prompt rendering
      const checkResult = await runAssertions({
        prompt: renderedPrompt,
        provider,
        providerResponse: {
          ...processedResponse,
          // Add provider-transformed output for contextTransform
          providerTransformedOutput,
        },
        test,
        vars,
        latencyMs: response.latencyMs ?? latencyMs,
        assertScoringFunction: test.assertScoringFunction as ScoringFunction,
        traceId,
        evaluationId: evalId,
      });

      if (!checkResult.pass) {
        ret.error = checkResult.reason;
        ret.failureReason = ResultFailureReason.ASSERT;
      }
      ret.success = checkResult.pass;
      ret.score = checkResult.score;
      ret.namedScores = checkResult.namedScores || {};
      // Track assertion request count
      if (!ret.tokenUsage.assertions) {
        ret.tokenUsage.assertions = createEmptyAssertions();
      }
      ret.tokenUsage.assertions.numRequests = (ret.tokenUsage.assertions.numRequests ?? 0) + 1;

      // Track assertion token usage if provided
      if (checkResult.tokensUsed) {
        accumulateAssertionTokenUsage(ret.tokenUsage.assertions, checkResult.tokensUsed);
      }
      ret.response = processedResponse;
      ret.gradingResult = checkResult;
    }

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

  private async _runEvaluation(): Promise<Eval> {
    const { options } = this;
    let { testSuite } = this;

    const startTime = Date.now();
    const maxEvalTimeMs = options.maxEvalTimeMs ?? getMaxEvalTimeMs();
    let evalTimedOut = false;
    let globalTimeout: NodeJS.Timeout | undefined;
    let globalAbortController: AbortController | undefined;
    const processedIndices = new Set<number>();

    // Progress reporters declared here for cleanup in finally block
    let ciProgressReporter: CIProgressReporter | null = null;
    let progressBarManager: ProgressBarManager | null = null;

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

    const vars = new Set<string>();
    const checkAbort = () => {
      if (options.abortSignal?.aborted) {
        throw new Error('Operation cancelled');
      }
    };

    if (!options.silent) {
      logger.info(`Starting evaluation ${this.evalRecord.id}`);
    }

    // Store evaluationId globally so remote task/grading calls can include it
    const cliState = (await import('./cliState')).default;
    cliState.evaluationId = this.evalRecord.id;

    // Add abort checks at key points
    checkAbort();

    const prompts: CompletedPrompt[] = [];
    const assertionTypes = new Set<string>();
    const rowsWithSelectBestAssertion = new Set<number>();
    const rowsWithMaxScoreAssertion = new Set<number>();

    // Ensure defaultTest has a usable structure before extensions run.
    // This allows extensions to safely do `context.suite.defaultTest.assert.push(...)`
    // without needing defensive checks for undefined values.
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
      // TODO(ian): Move this into its own command/file
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

        // Ask the user if they want to continue
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
        return this.evalRecord;
      }
    }

    // Split prompts by provider
    // Order matters - keep provider in outer loop to reduce need to swap models during local inference.

    // Create a map of existing prompts for resume support
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
        // Check if providerPromptMap exists and if it contains the current prompt's label
        const providerKey = provider.label || provider.id();
        if (!isAllowedPrompt(prompt, testSuite.providerPromptMap?.[providerKey])) {
          continue;
        }

        const promptId = generateIdFromPrompt(prompt);
        const existingPromptKey = `${providerKey}:${promptId}`;
        const existingPrompt = existingPromptsMap.get(existingPromptKey);

        const completedPrompt = {
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
        };
        prompts.push(completedPrompt);
      }
    }

    await this.evalRecord.addPrompts(prompts);

    // Aggregate all vars across test cases
    let tests =
      testSuite.tests && testSuite.tests.length > 0
        ? testSuite.tests
        : testSuite.scenarios
          ? []
          : [
              {
                // Dummy test for cases when we're only comparing raw prompts.
              },
            ];

    // Build scenarios and add to tests
    if (testSuite.scenarios && testSuite.scenarios.length > 0) {
      telemetry.record('feature_used', {
        feature: 'scenarios',
      });
      let scenarioIndex = 0;
      for (const scenario of testSuite.scenarios) {
        for (const data of scenario.config) {
          // Merge defaultTest with scenario config
          const scenarioTests = (
            scenario.tests || [
              {
                // Dummy test for cases when we're only comparing raw prompts.
              },
            ]
          ).map((test) => {
            // Merge metadata from all sources
            const mergedMetadata = {
              ...(typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest?.metadata : {}),
              ...data.metadata,
              ...test.metadata,
            };

            // Auto-generate scenarioConversationId if no conversationId is set
            // This ensures each scenario has isolated conversation history by default
            // Users can still override by setting their own conversationId
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
                ...(typeof testSuite.defaultTest === 'object'
                  ? testSuite.defaultTest?.options
                  : {}),
                ...test.options,
              },
              assert: [
                // defaultTest.assert is omitted because it will be added to each test case later
                ...(data.assert || []),
                ...(test.assert || []),
              ],
              metadata: mergedMetadata,
            };
          });
          // Add scenario tests to tests
          tests = tests.concat(scenarioTests);
          scenarioIndex++;
        }
      }
    }

    maybeEmitAzureOpenAiWarning(testSuite, tests);

    // Prepare vars
    const varNames: Set<string> = new Set();
    const varsWithSpecialColsRemoved: Vars[] = [];
    const inputTransformDefault =
      typeof testSuite?.defaultTest === 'object'
        ? testSuite?.defaultTest?.options?.transformVars
        : undefined;
    for (const testCase of tests) {
      testCase.vars = {
        ...(typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest?.vars : {}),
        ...testCase?.vars,
      };

      if (testCase.vars) {
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

    // Set up eval cases
    const runEvalOptions: RunEvalOptions[] = [];
    let testIdx = 0;
    let concurrency = options.maxConcurrency || DEFAULT_MAX_CONCURRENCY;
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
      // Handle default properties
      testCase.assert = [
        ...(typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest?.assert || [] : []),
        ...(testCase.assert || []),
      ];
      testCase.threshold =
        testCase.threshold ??
        (typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest?.threshold : undefined);
      testCase.options = {
        ...(typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest?.options : {}),
        ...testCase.options,
      };
      testCase.metadata = {
        ...(typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest?.metadata : {}),
        ...testCase.metadata,
      };
      // If the test case doesn't have prompts filter, use the one from defaultTest
      testCase.prompts =
        testCase.prompts ??
        (typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest?.prompts : undefined);
      // If the test case doesn't have a provider, use the one from defaultTest
      // Note: defaultTest.provider may be a raw config object that needs to be loaded
      if (
        !testCase.provider &&
        typeof testSuite.defaultTest === 'object' &&
        testSuite.defaultTest?.provider
      ) {
        const defaultProvider = testSuite.defaultTest.provider;
        if (isApiProvider(defaultProvider)) {
          // Already loaded
          testCase.provider = defaultProvider;
        } else if (typeof defaultProvider === 'object' && defaultProvider.id) {
          // Raw config object - load it
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
      testCase.assertScoringFunction =
        testCase.assertScoringFunction ||
        (typeof testSuite.defaultTest === 'object'
          ? testSuite.defaultTest?.assertScoringFunction
          : undefined);
      // Inherit providers filter from defaultTest if not specified
      testCase.providers =
        testCase.providers ??
        (typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest?.providers : undefined);

      if (typeof testCase.assertScoringFunction === 'string') {
        const { filePath: resolvedPath, functionName } = parseFileUrl(
          testCase.assertScoringFunction,
        );
        testCase.assertScoringFunction = await loadFunction<ScoringFunction>({
          filePath: resolvedPath,
          functionName,
        });
      }
      const prependToPrompt =
        testCase.options?.prefix ||
        (typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest?.options?.prefix : '') ||
        '';
      const appendToPrompt =
        testCase.options?.suffix ||
        (typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest?.options?.suffix : '') ||
        '';

      // Finalize test case eval
      const varCombinations =
        getEnvBool('PROMPTFOO_DISABLE_VAR_EXPANSION') || testCase.options?.disableVarExpansion
          ? [testCase.vars]
          : generateVarCombinations(testCase.vars || {});

      const numRepeat = this.options.repeat || 1;
      for (let repeatIndex = 0; repeatIndex < numRepeat; repeatIndex++) {
        for (const vars of varCombinations) {
          let promptIdx = 0;
          // Order matters - keep provider in outer loop to reduce need to swap models during local inference.
          for (const provider of testSuite.providers) {
            // Test-level provider filtering
            if (!isProviderAllowed(provider, testCase.providers)) {
              continue;
            }
            for (const prompt of testSuite.prompts) {
              const providerKey = provider.label || provider.id();
              // Provider-level prompt filtering
              if (!isAllowedPrompt(prompt, testSuite.providerPromptMap?.[providerKey])) {
                continue;
              }
              // Test-level prompt filtering
              if (!isAllowedPrompt(prompt, testCase.prompts)) {
                continue;
              }
              runEvalOptions.push({
                delay: options.delay || 0,
                provider,
                prompt: {
                  ...prompt,
                  raw: prependToPrompt + prompt.raw + appendToPrompt,
                },
                testSuite,
                test: (() => {
                  const baseTest = {
                    ...testCase,
                    vars,
                    options: testCase.options,
                  };
                  // Only add tracing metadata fields if tracing is actually enabled
                  // Check env flag, test case metadata, and test suite config
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
                })(),
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
              promptIdx++;
            }
          }
          testIdx++;
        }
      }
    }
    // Pre-mark comparison rows before any filtering (used by resume logic)
    for (const evalOption of runEvalOptions) {
      if (evalOption.test.assert?.some((a) => a.type === 'select-best')) {
        rowsWithSelectBestAssertion.add(evalOption.testIdx);
      }
      if (evalOption.test.assert?.some((a) => a.type === 'max-score')) {
        rowsWithMaxScoreAssertion.add(evalOption.testIdx);
      }
    }

    // Resume support: if CLI is in resume mode, skip already-completed (testIdx,promptIdx) pairs
    if (cliState.resume && this.evalRecord.persisted) {
      try {
        const { default: EvalResult } = await import('./models/evalResult');
        // In retry mode, exclude ERROR results from completed pairs so they can be retried
        const completedPairs = await EvalResult.getCompletedIndexPairs(this.evalRecord.id, {
          excludeErrors: cliState.retryMode,
        });
        const originalCount = runEvalOptions.length;
        // Filter out steps that already exist in DB
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

    // Determine run parameters

    if (concurrency > 1) {
      const usesConversation = prompts.some((p) => p.raw.includes('_conversation'));
      const usesStoreOutputAs = tests.some((t) => t.options?.storeOutputAs);
      if (usesConversation) {
        logger.info(
          `Setting concurrency to 1 because the ${chalk.cyan('_conversation')} variable is used.`,
        );
        concurrency = 1;
      } else if (usesStoreOutputAs) {
        logger.info(`Setting concurrency to 1 because storeOutputAs is used.`);
        concurrency = 1;
      }
    }

    // Actually run the eval
    let numComplete = 0;

    const processEvalStep = async (evalStep: RunEvalOptions, index: number | string) => {
      if (typeof index !== 'number') {
        throw new Error('Expected index to be a number');
      }

      const beforeEachOut = await runExtensionHook(testSuite.extensions, 'beforeEach', {
        test: evalStep.test,
      });
      evalStep.test = beforeEachOut.test;

      const rows = await runEval(evalStep);

      for (const row of rows) {
        for (const varName of Object.keys(row.vars)) {
          vars.add(varName);
        }
        // Print token usage for model-graded assertions and add to stats
        if (row.gradingResult?.tokensUsed && row.testCase?.assert) {
          for (const assertion of row.testCase.assert) {
            if (MODEL_GRADED_ASSERTION_TYPES.has(assertion.type as AssertionType)) {
              const tokensUsed = row.gradingResult.tokensUsed;

              if (!this.stats.tokenUsage.assertions) {
                this.stats.tokenUsage.assertions = createEmptyAssertions();
              }

              // Accumulate assertion tokens using the specialized assertion function
              accumulateAssertionTokenUsage(this.stats.tokenUsage.assertions, tokensUsed);

              break;
            }
          }
        }

        // capture metrics
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

        numComplete++;

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
        metrics.score += row.score;
        for (const [key, value] of Object.entries(row.namedScores)) {
          // Update named score value
          metrics.namedScores[key] = (metrics.namedScores[key] || 0) + value;

          // Count assertions contributing to this named score
          // Note: We need to render template variables in assertion metrics before comparing
          const testVars = row.testCase?.vars || {};
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

        if (testSuite.derivedMetrics) {
          const math = await import('mathjs');
          // Calculate per-prompt evaluation count (pass + fail + error + 1 for current row)
          // This is the number of test evaluations for THIS prompt, not global progress
          const promptEvalCount =
            metrics.testPassCount + metrics.testFailCount + metrics.testErrorCount + 1;
          // Warn if user has a metric named __count (it will be overridden)
          if (Object.prototype.hasOwnProperty.call(metrics.namedScores, '__count')) {
            logger.warn(
              "Metric name '__count' is reserved for derived metrics and will be overridden.",
            );
          }
          // Create evaluation context with named scores and __count for average calculations
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
                const evaluatedValue = math.evaluate(metric.value, evalContext);
                metrics.namedScores[metric.name] = evaluatedValue;
              }
              // Update context with the new derived metric value for subsequent metrics
              evalContext[metric.name] = metrics.namedScores[metric.name];
            } catch (error) {
              logger.debug(
                `Could not evaluate derived metric '${metric.name}': ${(error as Error).message}`,
              );
            }
          }
        }
        metrics.testPassCount += row.success ? 1 : 0;
        if (!row.success) {
          if (row.failureReason === ResultFailureReason.ERROR) {
            metrics.testErrorCount += 1;
          } else {
            metrics.testFailCount += 1;
          }
        }
        metrics.assertPassCount +=
          row.gradingResult?.componentResults?.filter((r) => r.pass).length || 0;
        metrics.assertFailCount +=
          row.gradingResult?.componentResults?.filter((r) => !r.pass).length || 0;
        metrics.totalLatencyMs += row.latencyMs || 0;
        accumulateResponseTokenUsage(metrics.tokenUsage, row.response);

        // Add assertion token usage to the metrics
        if (row.gradingResult?.tokensUsed) {
          updateAssertionMetrics(metrics, row.gradingResult.tokensUsed);
        }

        metrics.cost += row.cost || 0;

        await runExtensionHook(testSuite.extensions, 'afterEach', {
          test: evalStep.test,
          result: row,
        });

        if (options.progressCallback) {
          options.progressCallback(numComplete, runEvalOptions.length, index, evalStep, metrics);
        }
      }
    };

    // Add a wrapper function that implements timeout
    const processEvalStepWithTimeout = async (evalStep: RunEvalOptions, index: number | string) => {
      // Get timeout value from options or environment, defaults to 0 (no timeout)
      const timeoutMs = options.timeoutMs || getEvalTimeoutMs();

      if (timeoutMs <= 0) {
        // No timeout, process normally
        return processEvalStep(evalStep, index);
      }

      // Create an AbortController to cancel the request if it times out
      const abortController = new AbortController();
      const combinedSignal = evalStep.abortSignal
        ? AbortSignal.any([evalStep.abortSignal, abortController.signal])
        : abortController.signal;

      // Add the abort signal to the evalStep
      const evalStepWithSignal = {
        ...evalStep,
        abortSignal: combinedSignal,
      };

      let timeoutId: NodeJS.Timeout | undefined;
      let didTimeout = false;

      try {
        return await Promise.race([
          processEvalStep(evalStepWithSignal, index),
          new Promise<void>((_, reject) => {
            timeoutId = setTimeout(() => {
              didTimeout = true;
              // Abort any ongoing requests
              abortController.abort();

              // If the provider has a cleanup method, call it
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

        // Create and add an error result for timeout
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
          failureReason: ResultFailureReason.ERROR, // Using ERROR for timeouts
          score: 0,
          namedScores: {},
          latencyMs: timeoutMs,
          promptIdx: evalStep.promptIdx,
          testIdx: evalStep.testIdx,
          testCase: sanitizedTestCase,
          promptId: evalStep.prompt.id || '',
        };

        // Add the timeout result to the evaluation record
        await this.evalRecord.addResult(timeoutResult);

        // Update stats
        this.stats.errors++;

        // Update prompt metrics
        const { metrics } = prompts[evalStep.promptIdx];
        if (metrics) {
          metrics.testErrorCount += 1;
          metrics.totalLatencyMs += timeoutMs;
        }

        numComplete++;

        // Progress callback
        if (options.progressCallback) {
          options.progressCallback(
            numComplete,
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
              tokenUsage: {
                total: 0,
                prompt: 0,
                completion: 0,
                cached: 0,
                numRequests: 0,
              },
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
    } else if (this.options.showProgressBar && process.stdout.isTTY) {
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
        logger.info(`[${numComplete}/${total}] Running ${provider} with vars: ${vars}`);
      } else if (progressBarManager) {
        // Progress bar update is handled by the manager
        const phase = evalStep.test.options?.runSerially ? 'serial' : 'concurrent';
        progressBarManager.updateProgress(index, evalStep, phase, metrics);
      } else if (ciProgressReporter) {
        // CI progress reporter update
        ciProgressReporter.update(numComplete);
      } else {
        logger.debug(`Eval #${index + 1} complete (${numComplete} of ${runEvalOptions.length})`);
      }
    };

    // Separate serial and concurrent eval options
    const serialRunEvalOptions: RunEvalOptions[] = [];
    const concurrentRunEvalOptions: RunEvalOptions[] = [];

    for (const evalOption of runEvalOptions) {
      if (evalOption.test.options?.runSerially) {
        serialRunEvalOptions.push(evalOption);
      } else {
        concurrentRunEvalOptions.push(evalOption);
      }
    }

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
    }

    try {
      if (serialRunEvalOptions.length > 0) {
        // Run serial evaluations
        for (const evalStep of serialRunEvalOptions) {
          if (isWebUI) {
            const provider = evalStep.provider.label || evalStep.provider.id();
            const vars = formatVarsForDisplay(evalStep.test.vars || {}, 50);
            logger.info(
              `[${numComplete}/${runEvalOptions.length}] Running ${provider} with vars: ${vars}`,
            );
          }
          const idx = runEvalOptions.indexOf(evalStep);
          await processEvalStepWithTimeout(evalStep, idx);
          processedIndices.add(idx);
        }

        // Serial phase complete - progress is tracked automatically by updateProgress
      }

      // Then run concurrent evaluations
      await async.forEachOfLimit(concurrentRunEvalOptions, concurrency, async (evalStep) => {
        checkAbort();
        const idx = runEvalOptions.indexOf(evalStep);
        await processEvalStepWithTimeout(evalStep, idx);
        processedIndices.add(idx);
        await this.evalRecord.addPrompts(prompts);
      });
    } catch (err) {
      if (options.abortSignal?.aborted) {
        // Distinguish between max-duration timeout and user SIGINT
        if (evalTimedOut) {
          // Max-duration timeout: let the normal flow continue to write timeout rows
          logger.warn(`Evaluation stopped after reaching max duration (${maxEvalTimeMs}ms)`);
        } else {
          // User SIGINT: early exit, skip comparisons/afterAll/telemetry
          // Results already persisted by addResult() calls during evaluation
          // Resume will re-run incomplete steps, then run all comparisons
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
          // Persist vars and prompts so UI/export shows correct headers
          this.evalRecord.setVars(Array.from(vars));
          await this.evalRecord.addPrompts(prompts);
          updateSignalFile(this.evalRecord.id);
          return this.evalRecord;
        }
      } else {
        if (ciProgressReporter) {
          ciProgressReporter.error(`Evaluation failed: ${String(err)}`);
        }
        throw err;
      }
    }

    // Do we have to run comparisons between row outputs?
    const compareRowsCount = rowsWithSelectBestAssertion.size + rowsWithMaxScoreAssertion.size;

    // Update progress reporters based on comparison count
    if (progressBarManager) {
      if (compareRowsCount > 0) {
        progressBarManager.updateTotalCount(compareRowsCount);
      }
    } else if (ciProgressReporter && compareRowsCount > 0) {
      // Update total tests to include comparison tests for CI reporter
      ciProgressReporter.updateTotalTests(runEvalOptions.length + compareRowsCount);
    }

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
      if (compareAssertion) {
        const outputs = resultsToCompare.map((r) => r.response?.output || '');

        // Provide context for grading providers that need originalProvider.
        // For example, simulated-user requires originalProvider to access the target provider's configuration.
        const firstResult = resultsToCompare[0];
        const providerId = firstResult.provider.id;
        const originalProvider = this.testSuite.providers.find((p) => p.id() === providerId);
        const callApiContext = originalProvider
          ? {
              originalProvider,
              prompt: firstResult.prompt,
              vars: firstResult.testCase.vars || {},
            }
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
          if (result.gradingResult) {
            result.gradingResult.tokensUsed = result.gradingResult.tokensUsed || {
              total: 0,
              prompt: 0,
              completion: 0,
            };

            // Use the helper function instead of direct updates
            if (gradingResult.tokensUsed) {
              if (!result.gradingResult.tokensUsed) {
                result.gradingResult.tokensUsed = {
                  total: 0,
                  prompt: 0,
                  completion: 0,
                };
              }

              // Update the metrics using the helper function
              updateAssertionMetrics(
                { tokenUsage: { assertions: result.gradingResult.tokensUsed } },
                gradingResult.tokensUsed,
              );

              // Also update the metrics for the eval
              if (gradingResult.tokensUsed && result.testCase?.assert) {
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

            result.success = result.gradingResult.pass =
              result.gradingResult.pass && gradingResult.pass;
            if (!gradingResult.pass) {
              // Failure overrides the reason and the score
              result.gradingResult.reason = gradingResult.reason;
              result.score = result.gradingResult.score = gradingResult.score;
            }
            if (!result.gradingResult.componentResults) {
              result.gradingResult.componentResults = [];
            }
            result.gradingResult.componentResults.push(gradingResult);
          } else {
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

    // Process max-score assertions
    const maxScoreRowsCount = rowsWithMaxScoreAssertion.size;
    if (maxScoreRowsCount > 0) {
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

        if (maxScoreAssertion) {
          const outputs = resultsToCompare.map((r) => r.response?.output || '');

          // Pass the results with their grading results to selectMaxScore
          const maxScoreGradingResults = await selectMaxScore(
            outputs,
            resultsToCompare,
            maxScoreAssertion,
          );

          // Update progress bar
          if (progressBarManager) {
            progressBarManager.updateComparisonProgress(resultsToCompare[0].prompt.raw);
          } else if (ciProgressReporter) {
            // For max-score assertions, we're still in the comparison phase
            // so we add to the total completed count
            ciProgressReporter.update(runEvalOptions.length + compareCount);
          } else if (!isWebUI) {
            logger.debug(`Max-score assertion for test #${testIdx} complete`);
          }

          // Update results with max-score outcomes
          for (let index = 0; index < resultsToCompare.length; index++) {
            const result = resultsToCompare[index];
            const maxScoreGradingResult = {
              ...maxScoreGradingResults[index],
              assertion: maxScoreAssertion,
            };

            // Preserve existing gradingResult data and add max-score result to componentResults
            const existingComponentResults = result.gradingResult?.componentResults || [];
            const existingGradingResult = result.gradingResult;
            const wasSuccess = result.success;
            const wasScore = result.score;
            const metrics = prompts[result.promptIdx]?.metrics;
            const comparisonPassed = maxScoreGradingResult.pass;
            const previousPass = existingGradingResult?.pass ?? result.success;
            const nextPass = previousPass && comparisonPassed;

            // When max-score fails, update score like select-best does
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
              assertion: maxScoreAssertion,
            };

            // Max-score is an additional assertion, so overall pass depends on existing asserts too.
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
        }
      }
    }

    await this.evalRecord.addPrompts(prompts);

    // Clean up progress reporters and timers
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
      for (let i = 0; i < runEvalOptions.length; i++) {
        if (!processedIndices.has(i)) {
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
    }

    this.evalRecord.setVars(Array.from(vars));

    // Only load results from database if there are extensions to run
    if (testSuite.extensions?.length) {
      // Load results from database for extensions (results may not be in memory for persisted evals)
      const allResults = await this.evalRecord.getResults();

      // Convert EvalResult model instances to plain EvaluateResult objects for extensions
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

    // Calculate additional metrics for telemetry
    const endTime = Date.now();
    const totalEvalTimeMs = endTime - startTime;

    // Store the duration on the eval record for persistence
    this.evalRecord.setDurationMs(totalEvalTimeMs);

    // Calculate aggregated metrics
    const totalCost = prompts.reduce((acc, p) => acc + (p.metrics?.cost || 0), 0);
    const totalRequests = this.stats.tokenUsage.numRequests;

    // Calculate efficiency metrics
    const totalTokens = this.stats.tokenUsage.total;
    const cachedTokens = this.stats.tokenUsage.cached;

    // Calculate correct average latency by summing individual request latencies
    const totalLatencyMs = this.evalRecord.results.reduce(
      (sum, result) => sum + (result.latencyMs || 0),
      0,
    );
    const avgLatencyMs =
      this.evalRecord.results.length > 0 ? totalLatencyMs / this.evalRecord.results.length : 0;

    // Detect key feature usage patterns
    const usesConversationVar = prompts.some((p) => p.raw.includes('_conversation'));
    const usesTransforms = Boolean(
      tests.some((t) => t.options?.transform || t.options?.postprocess) ||
        testSuite.providers.some((p) => Boolean(p.transform)),
    );
    const usesScenarios = Boolean(testSuite.scenarios && testSuite.scenarios.length > 0);

    // Detect if using any promptfoo.app example provider
    const usesExampleProvider = testSuite.providers.some((provider) => {
      const url = typeof provider.config?.url === 'string' ? provider.config.url : '';
      const label = provider.label || '';
      return url.includes('promptfoo.app') || label.toLowerCase().includes('example');
    });

    // Calculate assertion metrics
    const totalAssertions = prompts.reduce(
      (acc, p) => acc + (p.metrics?.assertPassCount || 0) + (p.metrics?.assertFailCount || 0),
      0,
    );
    const passedAssertions = prompts.reduce((acc, p) => acc + (p.metrics?.assertPassCount || 0), 0);

    // Count model-graded vs other assertion types
    const modelGradedCount = Array.from(assertionTypes).filter((type) =>
      MODEL_GRADED_ASSERTION_TYPES.has(type as AssertionType),
    ).length;

    // Calculate provider distribution (maintain exact compatibility)
    const providerPrefixes = Array.from(
      new Set(
        testSuite.providers.map((p) => {
          const idParts = p.id().split(':');
          return idParts.length > 1 ? idParts[0] : 'unknown';
        }),
      ),
    );

    // Detect timeout occurrences (more robust than string matching)
    const timeoutOccurred =
      evalTimedOut ||
      this.evalRecord.results.some(
        (r) => r.failureReason === ResultFailureReason.ERROR && r.error?.includes('timed out'),
      );

    telemetry.record('eval_ran', {
      // Basic metrics
      numPrompts: prompts.length,
      numTests: this.stats.successes + this.stats.failures + this.stats.errors,
      numRequests: this.stats.tokenUsage.numRequests || 0,
      numResults: this.evalRecord.results.length,
      numVars: varNames.size,
      numProviders: testSuite.providers.length,
      numRepeat: options.repeat || 1,
      providerPrefixes: providerPrefixes.sort(),
      assertionTypes: Array.from(assertionTypes).sort(),
      eventSource: options.eventSource || 'default',
      ci: isCI(),
      hasAnyPass: this.stats.successes > 0,

      // Result counts
      numPasses: this.stats.successes,
      numFails: this.stats.failures,
      numErrors: this.stats.errors,

      // Performance metrics
      totalEvalTimeMs,
      avgLatencyMs: Math.round(avgLatencyMs),
      concurrencyUsed: concurrency,
      timeoutOccurred,

      // Token and cost metrics
      totalTokens,
      promptTokens: this.stats.tokenUsage.prompt,
      completionTokens: this.stats.tokenUsage.completion,
      cachedTokens,
      totalCost,
      totalRequests,

      // Assertion metrics
      numAssertions: totalAssertions,
      passedAssertions,
      modelGradedAssertions: modelGradedCount,
      assertionPassRate: totalAssertions > 0 ? passedAssertions / totalAssertions : 0,

      // Feature usage
      usesConversationVar,
      usesTransforms,
      usesScenarios,
      usesExampleProvider,
      isPromptfooSampleTarget: testSuite.providers.some(isPromptfooSampleTarget),
      isRedteam: Boolean(options.isRedteam),

      // Provider type detection (including third-party platforms)
      hasOpenAiProviders: testSuite.providers.some((p) => isOpenAiProvider(p.id())),
      hasAnthropicProviders: testSuite.providers.some((p) => isAnthropicProvider(p.id())),
      hasGoogleProviders: testSuite.providers.some((p) => isGoogleProvider(p.id())),
    });

    // Save the eval record to persist durationMs
    if (this.evalRecord.persisted) {
      await this.evalRecord.save();
    }

    // Update database signal file after all results are written, passing the eval ID
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
