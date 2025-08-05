import async from 'async';
import chalk from 'chalk';
import type { MultiBar, SingleBar } from 'cli-progress';
import cliProgress from 'cli-progress';
import { randomUUID } from 'crypto';
import { globSync } from 'glob';
import * as path from 'path';
import type winston from 'winston';

import { MODEL_GRADED_ASSERTION_TYPES, runAssertions, runCompareAssertion } from './assertions';
import { getCache } from './cache';
import cliState from './cliState';
import { FILE_METADATA_KEY } from './constants';
import { updateSignalFile } from './database/signal';
import { getEnvBool, getEnvInt, getEvalTimeoutMs, getMaxEvalTimeMs, isCI } from './envars';
import { collectFileMetadata, renderPrompt, runExtensionHook } from './evaluatorHelpers';
import logger from './logger';
import { selectMaxScore } from './matchers';
import type Eval from './models/eval';
import { generateIdFromPrompt } from './models/prompt';
import { maybeEmitAzureOpenAiWarning } from './providers/azure/warnings';
import { isPromptfooSampleTarget } from './providers/shared';
import { isPandamoniumProvider } from './redteam/providers/pandamonium';
import { generatePrompts } from './suggestions';
import telemetry from './telemetry';
import {
  generateTraceContextIfNeeded,
  isOtlpReceiverStarted,
  startOtlpReceiverIfNeeded,
  stopOtlpReceiverIfNeeded,
} from './tracing/evaluatorTracing';
import type { EvalConversations, EvalRegisters, ScoringFunction, TokenUsage, Vars } from './types';
import {
  type Assertion,
  type AssertionType,
  type CompletedPrompt,
  type EvaluateOptions,
  type EvaluateResult,
  type EvaluateStats,
  type Prompt,
  type ProviderResponse,
  ResultFailureReason,
  type RunEvalOptions,
  type TestSuite,
} from './types';
import { isApiProvider } from './types/providers';
import { JsonlFileWriter } from './util/exportToFile/writeToFile';
import { loadFunction, parseFileUrl } from './util/functions/loadFunction';
import invariant from './util/invariant';
import { safeJsonStringify, summarizeEvaluateResultForLogging } from './util/json';
import { promptYesNo } from './util/readline';
import { sleep } from './util/time';
import { TokenUsageTracker } from './util/tokenUsage';
import {
  createEmptyTokenUsage,
  createEmptyAssertions,
  accumulateAssertionTokenUsage,
  accumulateResponseTokenUsage,
} from './util/tokenUsageUtils';
import { transform, type TransformContext, TransformInputType } from './util/transform';

/**
 * Manages progress bars for different execution phases of the evaluation
 */
class ProgressBarManager {
  private multibar: MultiBar | undefined;
  private serialBar: SingleBar | undefined;
  private concurrentBars: SingleBar[] = [];
  private comparisonBar: SingleBar | undefined;
  private isWebUI: boolean;

  // Track work distribution
  private serialCount: number = 0;
  private concurrentCount: number = 0;
  private comparisonCount: number = 0;

  // Track completion
  private serialCompleted: number = 0;
  private concurrentCompleted: number = 0;
  private comparisonCompleted: number = 0;

  // Map original indices to execution context
  private indexToContext: Map<number, { phase: 'serial' | 'concurrent'; barIndex: number }> =
    new Map();

  constructor(isWebUI: boolean) {
    this.isWebUI = isWebUI;
  }

  /**
   * Initialize progress bars based on work distribution
   */
  async initialize(
    runEvalOptions: RunEvalOptions[],
    concurrency: number,
    compareRowsCount: number,
  ): Promise<void> {
    if (this.isWebUI) {
      return;
    }

    // Calculate work distribution
    const maxConcurrentBars = Math.min(concurrency, 20);

    for (let i = 0; i < runEvalOptions.length; i++) {
      const evalOption = runEvalOptions[i];
      if (evalOption.test.options?.runSerially) {
        this.serialCount++;
        this.indexToContext.set(i, { phase: 'serial', barIndex: 0 });
      } else {
        this.indexToContext.set(i, {
          phase: 'concurrent',
          barIndex: this.concurrentCount % maxConcurrentBars,
        });
        this.concurrentCount++;
      }
    }
    this.comparisonCount = compareRowsCount;

    // Create multibar
    this.multibar = new cliProgress.MultiBar(
      {
        format:
          '{phase} [{bar}] {percentage}% | {value}/{total} | {status} | {provider} "{prompt}" {vars}',
        hideCursor: true,
        gracefulExit: true,
      },
      cliProgress.Presets.shades_classic,
    );

    // Create serial progress bar if needed
    if (this.serialCount > 0) {
      this.serialBar = this.multibar.create(this.serialCount, 0, {
        phase: 'Serial (1 thread)',
        status: 'Running',
        provider: '',
        prompt: '',
        vars: '',
      });
    }

    // Create concurrent progress bars
    const numConcurrentBars = Math.min(concurrency, 20, this.concurrentCount);
    const concurrentPerBar = Math.floor(this.concurrentCount / numConcurrentBars);
    const concurrentRemainder = this.concurrentCount % numConcurrentBars;

    for (let i = 0; i < numConcurrentBars; i++) {
      const totalSteps = i < concurrentRemainder ? concurrentPerBar + 1 : concurrentPerBar;
      if (totalSteps > 0) {
        const bar = this.multibar.create(totalSteps, 0, {
          phase: `Group ${i + 1}/${numConcurrentBars}`,
          status: `${calculateThreadsPerBar(concurrency, numConcurrentBars, i)} threads`,
          provider: '',
          prompt: '',
          vars: '',
        });
        this.concurrentBars.push(bar);
      }
    }

    // Create comparison progress bar if needed
    if (this.comparisonCount > 0) {
      this.comparisonBar = this.multibar.create(this.comparisonCount, 0, {
        phase: 'select-best',
        status: 'Pending',
        provider: 'Grading',
        prompt: '',
        vars: '',
      });
    }
  }

  /**
   * Update progress for a specific evaluation
   */
  updateProgress(
    index: number,
    evalStep: RunEvalOptions | undefined,
    phase: 'serial' | 'concurrent' = 'concurrent',
  ): void {
    if (this.isWebUI || !evalStep) {
      return;
    }

    const context = this.indexToContext.get(index);
    if (!context) {
      logger.warn(`No context found for index ${index}`);
      return;
    }

    const provider = evalStep.provider.label || evalStep.provider.id();
    const prompt = evalStep.prompt.raw.slice(0, 10).replace(/\n/g, ' ');
    const vars = formatVarsForDisplay(evalStep.test.vars, 10);

    switch (context.phase) {
      case 'serial':
        this.serialCompleted++;
        this.serialBar?.increment({
          status: `Running (${this.serialCompleted}/${this.serialCount})`,
          provider,
          prompt,
          vars,
        });
        break;

      case 'concurrent':
        this.concurrentCompleted++;
        if (context.barIndex >= 0 && context.barIndex < this.concurrentBars.length) {
          const bar = this.concurrentBars[context.barIndex];
          bar.increment({
            status: 'Running',
            provider,
            prompt,
            vars,
          });
        } else {
          logger.warn(`Invalid bar index ${context.barIndex} for concurrent progress update`);
        }
        break;
    }
  }

  /**
   * Update comparison progress
   */
  updateComparisonProgress(prompt: string): void {
    if (this.isWebUI || !this.comparisonBar) {
      return;
    }

    // Validate we don't exceed the total
    if (this.comparisonCompleted >= this.comparisonCount) {
      logger.warn(
        `Comparison progress already at maximum (${this.comparisonCompleted}/${this.comparisonCount})`,
      );
      return;
    }

    this.comparisonCompleted++;
    this.comparisonBar.increment({
      phase: 'select-best',
      status: `Running (${this.comparisonCompleted}/${this.comparisonCount})`,
      provider: 'Grading',
      prompt: prompt.slice(0, 10).replace(/\n/g, ' '),
      vars: '',
    });
  }

  /**
   * Create comparison progress bar dynamically when we know the actual count
   */
  createComparisonBar(comparisonCount: number): void {
    if (this.isWebUI || !this.multibar || comparisonCount <= 0) {
      return;
    }

    this.comparisonCount = comparisonCount;
    this.comparisonBar = this.multibar.create(comparisonCount, 0, {
      phase: 'select-best',
      status: 'Running',
      provider: 'Grading',
      prompt: '',
      vars: '',
    });
  }

  /**
   * Mark a phase as complete
   */
  completePhase(phase: 'serial' | 'concurrent' | 'comparison'): void {
    if (this.isWebUI) {
      return;
    }

    switch (phase) {
      case 'serial':
        if (this.serialBar) {
          this.serialBar.update(this.serialCount, { status: 'Complete' });
        }
        break;
      case 'concurrent':
        this.concurrentBars.forEach((bar) => {
          bar.update(bar.getTotal(), { status: 'Complete' });
        });
        break;
      case 'comparison':
        if (this.comparisonBar) {
          this.comparisonBar.update(this.comparisonCount, { status: 'Complete' });
        }
        break;
    }
  }

  /**
   * Stop all progress bars
   */
  stop(): void {
    if (this.multibar) {
      this.multibar.stop();
    }
  }
}

export const DEFAULT_MAX_CONCURRENCY = 4;

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
 * prompt labels. Providers can be configured with a `prompts` attribute, which
 * corresponds to an array of prompt labels. Labels can either refer to a group
 * (for example from a file) or to individual prompts. If the attribute is
 * present, this function validates that the prompt labels fit the matching
 * criteria of the provider. Examples:
 *
 * - `prompts: ['examplePrompt']` matches `examplePrompt` exactly
 * - `prompts: ['exampleGroup:*']` matches any prompt that starts with `exampleGroup:`
 *
 * If no `prompts` attribute is present, all prompts are allowed by default.
 *
 * @param prompt - The prompt object to check.
 * @param allowedPrompts - The list of allowed prompt labels.
 * @returns Returns true if the prompt is allowed, false otherwise.
 */
export function isAllowedPrompt(prompt: Prompt, allowedPrompts: string[] | undefined): boolean {
  return (
    !Array.isArray(allowedPrompts) ||
    allowedPrompts.includes(prompt.label) ||
    allowedPrompts.some((allowedPrompt) => prompt.label.startsWith(`${allowedPrompt}:`))
  );
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
  delay,
  nunjucksFilters: filters,
  evaluateOptions,
  testIdx,
  promptIdx,
  conversations,
  registers,
  isRedteam,
  allTests,
  concurrency,
  abortSignal,
}: RunEvalOptions): Promise<EvaluateResult[]> {
  // Use the original prompt to set the label, not renderedPrompt
  const promptLabel = prompt.label;

  provider.delay ??= delay ?? getEnvInt('PROMPTFOO_DELAY_MS', 0);
  invariant(
    typeof provider.delay === 'number',
    `Provider delay should be set for ${provider.label}`,
  );

  // Set up the special _conversation variable
  const vars = test.vars || {};

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
  const setup = {
    provider: {
      id: provider.id(),
      label: provider.label,
      config: provider.config,
    },
    prompt: {
      raw: '',
      label: promptLabel,
      config: prompt.config,
    },
    vars,
  };
  let latencyMs = 0;
  let traceContext: Awaited<ReturnType<typeof generateTraceContextIfNeeded>> = null;

  try {
    // Render the prompt
    const renderedPrompt = await renderPrompt(prompt, vars, filters, provider);
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
    } else if (
      typeof test.provider === 'object' &&
      typeof test.provider.id === 'function' &&
      test.provider.id() === 'promptfoo:redteam:pandamonium'
    ) {
      if (!isPandamoniumProvider(test.provider)) {
        throw new Error('Provider identified as pandamonium but does not have required methods');
      }

      return await test.provider.runPandamonium(provider, test, allTests || [], concurrency);
    } else {
      const activeProvider = isApiProvider(test.provider) ? test.provider : provider;
      logger.debug(`Provider type: ${activeProvider.id()}`);

      // Generate trace context if tracing is enabled
      traceContext = await generateTraceContextIfNeeded(test, evaluateOptions, testIdx, promptIdx);

      const callApiContext: any = {
        // Always included
        vars,

        // Part of these may be removed in python and script providers, but every Javascript provider gets them
        prompt,
        filters,
        originalProvider: provider,
        test,

        // All of these are removed in python and script providers, but every Javascript provider gets them
        logger: logger as unknown as winston.Logger,
        getCache,
      };

      // Only add trace context properties if tracing is enabled
      if (traceContext) {
        callApiContext.traceparent = traceContext.traceparent;
        callApiContext.evaluationId = traceContext.evaluationId;
        callApiContext.testCaseId = traceContext.testCaseId;
      }

      response = await activeProvider.callApi(
        renderedPrompt,
        callApiContext,
        abortSignal ? { abortSignal } : undefined,
      );

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

    logger.debug(`Evaluator response = ${JSON.stringify(response).substring(0, 100)}...`);
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
      latencyMs,
      cost: response.cost,
      metadata: {
        ...test.metadata,
        ...response.metadata,
        [FILE_METADATA_KEY]: fileMetadata,
        // Add session information to metadata
        ...(() => {
          // If sessionIds array exists from iterative providers, use it
          if (test.metadata?.sessionIds) {
            return { sessionIds: test.metadata.sessionIds };
          }

          // Otherwise, use single sessionId (prioritize response over vars)
          if (response.sessionId) {
            return { sessionId: response.sessionId };
          }

          // Check if vars.sessionId is a valid string
          const varsSessionId = vars.sessionId;
          if (typeof varsSessionId === 'string' && varsSessionId.trim() !== '') {
            return { sessionId: varsSessionId };
          }

          return {};
        })(),
      },
      promptIdx,
      testIdx,
      testCase: test,
      promptId: prompt.id || '',
      tokenUsage: createEmptyTokenUsage(),
    };

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
      const processedResponse = { ...response };
      const transforms: string[] = [
        provider.transform, // Apply provider transform first
        // NOTE: postprocess is deprecated. Use the first defined transform.
        [test.options?.transform, test.options?.postprocess].find((s) => s),
      ]
        .flat()
        .filter((s): s is string => typeof s === 'string');
      for (const t of transforms) {
        processedResponse.output = await transform(t, processedResponse.output, {
          vars,
          prompt,
        });
      }

      invariant(processedResponse.output != null, 'Response output should not be null');

      // Extract traceId from traceparent if available
      let traceId: string | undefined;
      if (traceContext?.traceparent) {
        // traceparent format: version-traceId-spanId-flags
        const parts = traceContext.traceparent.split('-');
        if (parts.length >= 3) {
          traceId = parts[1];
        }
      }

      const checkResult = await runAssertions({
        prompt: renderedPrompt,
        provider,
        providerResponse: processedResponse,
        test,
        latencyMs: response.cached ? undefined : latencyMs,
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
    return [
      {
        ...setup,
        error: String(err) + '\n\n' + (err as Error).stack,
        success: false,
        failureReason: ResultFailureReason.ERROR,
        score: 0,
        namedScores: {},
        latencyMs,
        promptIdx,
        testIdx,
        testCase: test,
        promptId: prompt.id || '',
      },
    ];
  }
}

/**
 * Calculates the number of threads allocated to a specific progress bar.
 * @param concurrency Total number of concurrent threads
 * @param numProgressBars Total number of progress bars
 * @param barIndex Index of the progress bar (0-based)
 * @returns Number of threads allocated to this progress bar
 */
export function calculateThreadsPerBar(
  concurrency: number,
  numProgressBars: number,
  barIndex: number,
): number {
  const threadsPerBar = Math.floor(concurrency / numProgressBars);
  const extraThreads = concurrency % numProgressBars;
  return barIndex < extraThreads ? threadsPerBar + 1 : threadsPerBar;
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
  vars: Record<string, any> | undefined,
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
  vars: Record<string, string | string[] | any>,
): Record<string, string | any[]>[] {
  const keys = Object.keys(vars);
  const combinations: Record<string, string | any[]>[] = [{}];

  for (const key of keys) {
    let values: any[] = [];

    if (typeof vars[key] === 'string' && vars[key].startsWith('file://')) {
      const filePath = vars[key].slice('file://'.length);
      const resolvedPath = path.resolve(cliState.basePath || '', filePath);
      const filePaths =
        globSync(resolvedPath.replace(/\\/g, '/'), {
          windowsPathsNoEscape: true,
        }) || [];
      values = filePaths.map((path: string) => `file://${path}`);
      if (values.length === 0) {
        throw new Error(`No files found for variable ${key} at path ${resolvedPath}`);
      }
    } else {
      values = Array.isArray(vars[key]) ? vars[key] : [vars[key]];
    }

    // Check if it's an array but not a string array
    if (Array.isArray(vars[key]) && typeof vars[key][0] !== 'string') {
      values = [vars[key]];
    }

    const newCombinations: Record<string, any>[] = [];

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

    const vars = new Set<string>();
    const checkAbort = () => {
      if (options.abortSignal?.aborted) {
        throw new Error('Operation cancelled');
      }
    };

    logger.info(`Starting evaluation ${this.evalRecord.id}`);

    // Add abort checks at key points
    checkAbort();

    const prompts: CompletedPrompt[] = [];
    const assertionTypes = new Set<string>();
    const rowsWithSelectBestAssertion = new Set<number>();
    const rowsWithMaxScoreAssertion = new Set<number>();

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
    for (const provider of testSuite.providers) {
      for (const prompt of testSuite.prompts) {
        // Check if providerPromptMap exists and if it contains the current prompt's label
        const providerKey = provider.label || provider.id();
        if (!isAllowedPrompt(prompt, testSuite.providerPromptMap?.[providerKey])) {
          continue;
        }
        const completedPrompt = {
          ...prompt,
          id: generateIdFromPrompt(prompt),
          provider: providerKey,
          label: prompt.label,
          metrics: {
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

    this.evalRecord.addPrompts(prompts);

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
              metadata: {
                ...(typeof testSuite.defaultTest === 'object'
                  ? testSuite.defaultTest?.metadata
                  : {}),
                ...data.metadata,
                ...test.metadata,
              },
            };
          });
          // Add scenario tests to tests
          tests = tests.concat(scenarioTests);
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
            uuid: randomUUID(),
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
      testCase.provider =
        testCase.provider ||
        (typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest?.provider : undefined);
      testCase.assertScoringFunction =
        testCase.assertScoringFunction ||
        (typeof testSuite.defaultTest === 'object'
          ? testSuite.defaultTest?.assertScoringFunction
          : undefined);

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
            for (const prompt of testSuite.prompts) {
              const providerKey = provider.label || provider.id();
              if (!isAllowedPrompt(prompt, testSuite.providerPromptMap?.[providerKey])) {
                continue;
              }
              runEvalOptions.push({
                delay: options.delay || 0,
                provider,
                prompt: {
                  ...prompt,
                  raw: prependToPrompt + prompt.raw + appendToPrompt,
                },
                test: (() => {
                  const baseTest = {
                    ...testCase,
                    vars,
                    options: testCase.options,
                  };
                  // Only add tracing metadata fields if tracing is actually enabled
                  const tracingEnabled =
                    testCase.metadata?.tracingEnabled === true ||
                    testSuite.tracing?.enabled === true;

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
                allTests: runEvalOptions,
                concurrency,
                abortSignal: options.abortSignal,
              });
              promptIdx++;
            }
          }
          testIdx++;
        }
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
          let contributingAssertions = 0;
          row.gradingResult?.componentResults?.forEach((result) => {
            if (result.assertion?.metric === key) {
              contributingAssertions++;
            }
          });

          metrics.namedScoresCount[key] =
            (metrics.namedScoresCount[key] || 0) + (contributingAssertions || 1);
        }

        if (testSuite.derivedMetrics) {
          const math = await import('mathjs');
          for (const metric of testSuite.derivedMetrics) {
            if (metrics.namedScores[metric.name] === undefined) {
              metrics.namedScores[metric.name] = 0;
            }
            try {
              if (typeof metric.value === 'function') {
                metrics.namedScores[metric.name] = metric.value(metrics.namedScores, evalStep);
              } else {
                const evaluatedValue = math.evaluate(metric.value, metrics.namedScores);
                metrics.namedScores[metric.name] = evaluatedValue;
              }
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
      const { signal } = abortController;

      // Add the abort signal to the evalStep
      const evalStepWithSignal = {
        ...evalStep,
        abortSignal: signal,
      };

      try {
        return await Promise.race([
          processEvalStep(evalStepWithSignal, index),
          new Promise<void>((_, reject) => {
            const timeoutId = setTimeout(() => {
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

              // Clear the timeout to prevent memory leaks
              clearTimeout(timeoutId);
            }, timeoutMs);
          }),
        ]);
      } catch (error) {
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
          testCase: evalStep.test,
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
      }
    };

    // Set up progress tracking
    const originalProgressCallback = this.options.progressCallback;
    const isWebUI = Boolean(cliState.webUI);
    const progressBarManager = new ProgressBarManager(isWebUI);

    // Initialize progress bar manager if needed
    if (this.options.showProgressBar) {
      // We'll create the comparison bar dynamically later when we know the actual count
      await progressBarManager.initialize(runEvalOptions, concurrency, 0);
    }

    this.options.progressCallback = (completed, total, index, evalStep, metrics) => {
      if (originalProgressCallback) {
        originalProgressCallback(completed, total, index, evalStep, metrics);
      }

      if (isWebUI) {
        const provider = evalStep.provider.label || evalStep.provider.id();
        const vars = formatVarsForDisplay(evalStep.test.vars, 50);
        logger.info(`[${numComplete}/${total}] Running ${provider} with vars: ${vars}`);
      } else if (this.options.showProgressBar) {
        // Progress bar update is handled by the manager
        const phase = evalStep.test.options?.runSerially ? 'serial' : 'concurrent';
        progressBarManager.updateProgress(index, evalStep, phase);
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

    try {
      if (serialRunEvalOptions.length > 0) {
        // Run serial evaluations first
        logger.info(`Running ${serialRunEvalOptions.length} test cases serially...`);
        for (const evalStep of serialRunEvalOptions) {
          if (isWebUI) {
            const provider = evalStep.provider.label || evalStep.provider.id();
            const vars = formatVarsForDisplay(evalStep.test.vars || {}, 50);
            logger.info(
              `[${numComplete}/${serialRunEvalOptions.length}] Running ${provider} with vars: ${vars}`,
            );
          }
          const idx = runEvalOptions.indexOf(evalStep);
          await processEvalStepWithTimeout(evalStep, idx);
          processedIndices.add(idx);
        }

        // Mark serial phase as complete
        if (this.options.showProgressBar) {
          progressBarManager.completePhase('serial');
        }
      }

      // Then run concurrent evaluations
      logger.info(
        `Running ${concurrentRunEvalOptions.length} test cases (up to ${concurrency} at a time)...`,
      );
      await async.forEachOfLimit(concurrentRunEvalOptions, concurrency, async (evalStep) => {
        checkAbort();
        const idx = runEvalOptions.indexOf(evalStep);
        await processEvalStepWithTimeout(evalStep, idx);
        processedIndices.add(idx);
        await this.evalRecord.addPrompts(prompts);
      });
    } catch (err) {
      if (options.abortSignal?.aborted) {
        evalTimedOut = evalTimedOut || maxEvalTimeMs > 0;
        logger.warn(`Evaluation aborted: ${String(err)}`);
      } else {
        throw err;
      }
    }

    // Do we have to run comparisons between row outputs?
    const compareRowsCount = rowsWithSelectBestAssertion.size + rowsWithMaxScoreAssertion.size;

    // Mark concurrent phase as complete
    if (this.options.showProgressBar) {
      progressBarManager.completePhase('concurrent');

      // Create comparison progress bar now that we know the actual count
      if (compareRowsCount > 0) {
        progressBarManager.createComparisonBar(compareRowsCount);
      }
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
        const gradingResults = await runCompareAssertion(
          resultsToCompare[0].testCase,
          compareAssertion,
          outputs,
        );
        for (let index = 0; index < resultsToCompare.length; index++) {
          const result = resultsToCompare[index];
          const gradingResult = gradingResults[index];
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
            result.gradingResult = gradingResult;
          }
          if (this.evalRecord.persisted) {
            await result.save();
          }
        }
        if (this.options.showProgressBar) {
          progressBarManager.updateComparisonProgress(resultsToCompare[0].prompt.raw);
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
          if (this.options.showProgressBar) {
            progressBarManager.updateComparisonProgress(resultsToCompare[0].prompt.raw);
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

            result.gradingResult = {
              pass: maxScoreGradingResult.pass,
              score: maxScoreGradingResult.score,
              reason: maxScoreGradingResult.reason,
              componentResults: [...existingComponentResults, maxScoreGradingResult],
              namedScores: {
                ...(existingGradingResult?.namedScores || {}),
                ...maxScoreGradingResult.namedScores,
              },
              tokensUsed: existingGradingResult?.tokensUsed || maxScoreGradingResult.tokensUsed,
              assertion: maxScoreAssertion,
            };

            // Don't overwrite overall success/score - max-score is just another assertion
            // The overall result should be determined by all assertions, not just max-score

            if (this.evalRecord.persisted) {
              await result.save();
            }
          }
        }
      }
    }

    await this.evalRecord.addPrompts(prompts);

    // Finish up
    if (this.options.showProgressBar) {
      progressBarManager.completePhase('comparison');
      progressBarManager.stop();
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

    await runExtensionHook(testSuite.extensions, 'afterAll', {
      prompts: this.evalRecord.prompts,
      results: this.evalRecord.results,
      suite: testSuite,
    });

    // Calculate additional metrics for telemetry
    const endTime = Date.now();
    const totalEvalTimeMs = endTime - startTime;

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
    });

    // Update database signal file after all results are written
    updateSignalFile();

    return this.evalRecord;
  }

  async evaluate(): Promise<Eval> {
    await startOtlpReceiverIfNeeded(this.testSuite);

    try {
      return await this._runEvaluation();
    } finally {
      if (isOtlpReceiverStarted()) {
        // Add a delay to allow providers to finish exporting spans
        logger.debug('[Evaluator] Waiting for span exports to complete...');
        await sleep(1000);
      }
      await stopOtlpReceiverIfNeeded();
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
