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
import type Eval from './models/eval';
import { generateIdFromPrompt } from './models/prompt';
import { maybeEmitAzureOpenAiWarning } from './providers/azure/warnings';
import { isPromptfooSampleTarget } from './providers/shared';
import { isPandamoniumProvider } from './redteam/providers/pandamonium';
import { generatePrompts } from './suggestions';
import telemetry from './telemetry';
import {
  generateTraceContextIfNeeded,
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
import { transform, type TransformContext, TransformInputType } from './util/transform';

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
      metrics.tokenUsage.assertions = {
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      };
    }

    const assertions = metrics.tokenUsage.assertions;

    // Update basic token counts
    assertions.total = (assertions.total ?? 0) + (assertionTokens.total ?? 0);
    assertions.prompt = (assertions.prompt ?? 0) + (assertionTokens.prompt ?? 0);
    assertions.completion = (assertions.completion ?? 0) + (assertionTokens.completion ?? 0);
    assertions.cached = (assertions.cached ?? 0) + (assertionTokens.cached ?? 0);

    // Update completion details if present
    if (assertionTokens.completionDetails && assertions.completionDetails) {
      assertions.completionDetails.reasoning =
        (assertions.completionDetails.reasoning ?? 0) +
        (assertionTokens.completionDetails.reasoning ?? 0);

      assertions.completionDetails.acceptedPrediction =
        (assertions.completionDetails.acceptedPrediction ?? 0) +
        (assertionTokens.completionDetails.acceptedPrediction ?? 0);

      assertions.completionDetails.rejectedPrediction =
        (assertions.completionDetails.rejectedPrediction ?? 0) +
        (assertionTokens.completionDetails.rejectedPrediction ?? 0);
    }
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

export function newTokenUsage(): Required<TokenUsage> {
  return {
    prompt: 0,
    completion: 0,
    cached: 0,
    total: 0,
    numRequests: 0,
    completionDetails: {
      reasoning: 0,
      acceptedPrediction: 0,
      rejectedPrediction: 0,
    },
    assertions: {
      total: 0,
      prompt: 0,
      completion: 0,
      cached: 0,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
    },
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
      tokenUsage: {},
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
      const traceContext = await generateTraceContextIfNeeded(
        test,
        evaluateOptions,
        testIdx,
        promptIdx,
      );

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
      },
      promptIdx,
      testIdx,
      testCase: test,
      promptId: prompt.id || '',
      tokenUsage: newTokenUsage(),
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
      const checkResult = await runAssertions({
        prompt: renderedPrompt,
        provider,
        providerResponse: processedResponse,
        test,
        latencyMs: response.cached ? undefined : latencyMs,
        assertScoringFunction: test.assertScoringFunction as ScoringFunction,
      });

      if (!checkResult.pass) {
        ret.error = checkResult.reason;
        ret.failureReason = ResultFailureReason.ASSERT;
      }
      ret.success = checkResult.pass;
      ret.score = checkResult.score;
      ret.namedScores = checkResult.namedScores || {};
      if (checkResult.tokensUsed) {
        ret.tokenUsage.total += checkResult.tokensUsed.total || 0;
        ret.tokenUsage.prompt += checkResult.tokensUsed.prompt || 0;
        ret.tokenUsage.completion += checkResult.tokensUsed.completion || 0;
        ret.tokenUsage.cached += checkResult.tokensUsed.cached || 0;
        ret.tokenUsage.numRequests += checkResult.tokensUsed.numRequests || 1;
        if (checkResult.tokensUsed.completionDetails) {
          ret.tokenUsage.completionDetails.reasoning! +=
            checkResult.tokensUsed.completionDetails.reasoning || 0;
          ret.tokenUsage.completionDetails.acceptedPrediction! +=
            checkResult.tokensUsed.completionDetails.acceptedPrediction || 0;
          ret.tokenUsage.completionDetails.rejectedPrediction! +=
            checkResult.tokensUsed.completionDetails.rejectedPrediction || 0;
        }
      }
      ret.response = processedResponse;
      ret.gradingResult = checkResult;
    }

    // Update token usage stats
    if (response.tokenUsage) {
      ret.tokenUsage.total += response.tokenUsage.total || 0;
      ret.tokenUsage.prompt += response.tokenUsage.prompt || 0;
      ret.tokenUsage.completion += response.tokenUsage.completion || 0;
      ret.tokenUsage.cached += response.tokenUsage.cached || 0;
      ret.tokenUsage.numRequests += response.tokenUsage.numRequests || 1;

      if (response.tokenUsage.completionDetails) {
        ret.tokenUsage.completionDetails.reasoning! +=
          response.tokenUsage.completionDetails.reasoning || 0;
        ret.tokenUsage.completionDetails.acceptedPrediction! +=
          response.tokenUsage.completionDetails.acceptedPrediction || 0;
        ret.tokenUsage.completionDetails.rejectedPrediction! +=
          response.tokenUsage.completionDetails.rejectedPrediction || 0;
      }
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
      const filePaths = globSync(resolvedPath.replace(/\\/g, '/')) || [];
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
      tokenUsage: newTokenUsage(),
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
            tokenUsage: {
              total: 0,
              prompt: 0,
              completion: 0,
              cached: 0,
              numRequests: 0,
              completionDetails: {
                reasoning: 0,
                acceptedPrediction: 0,
                rejectedPrediction: 0,
              },
              assertions: {
                total: 0,
                prompt: 0,
                completion: 0,
                cached: 0,
              },
            },
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
      telemetry.recordAndSendOnce('feature_used', {
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
              ...testSuite.defaultTest,
              ...data,
              ...test,
              vars: {
                ...testSuite.defaultTest?.vars,
                ...data.vars,
                ...test.vars,
              },
              options: {
                ...testSuite.defaultTest?.options,
                ...test.options,
              },
              assert: [
                // defaultTest.assert is omitted because it will be added to each test case later
                ...(data.assert || []),
                ...(test.assert || []),
              ],
              metadata: {
                ...testSuite.defaultTest?.metadata,
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
    const inputTransformDefault = testSuite?.defaultTest?.options?.transformVars;
    for (const testCase of tests) {
      testCase.vars = { ...testSuite.defaultTest?.vars, ...testCase?.vars };

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
        Array.isArray(testSuite.defaultTest?.assert || []),
        `defaultTest.assert is not an array in test case #${index + 1}`,
      );
      invariant(
        Array.isArray(testCase.assert || []),
        `testCase.assert is not an array in test case #${index + 1}`,
      );
      // Handle default properties
      testCase.assert = [...(testSuite.defaultTest?.assert || []), ...(testCase.assert || [])];
      testCase.threshold = testCase.threshold ?? testSuite.defaultTest?.threshold;
      testCase.options = { ...testSuite.defaultTest?.options, ...testCase.options };
      testCase.metadata = { ...testSuite.defaultTest?.metadata, ...testCase.metadata };
      testCase.provider = testCase.provider || testSuite.defaultTest?.provider;
      testCase.assertScoringFunction =
        testCase.assertScoringFunction || testSuite.defaultTest?.assertScoringFunction;

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
        testCase.options?.prefix || testSuite.defaultTest?.options?.prefix || '';
      const appendToPrompt =
        testCase.options?.suffix || testSuite.defaultTest?.options?.suffix || '';

      // Finalize test case eval
      const varCombinations =
        getEnvBool('PROMPTFOO_DISABLE_VAR_EXPANSION') || testCase.options.disableVarExpansion
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
                this.stats.tokenUsage.assertions = {
                  total: 0,
                  prompt: 0,
                  completion: 0,
                  cached: 0,
                };
              }

              const assertions = this.stats.tokenUsage.assertions;
              assertions.total = (assertions.total ?? 0) + (tokensUsed.total ?? 0);
              assertions.prompt = (assertions.prompt ?? 0) + (tokensUsed.prompt ?? 0);
              assertions.completion = (assertions.completion ?? 0) + (tokensUsed.completion ?? 0);
              assertions.cached = (assertions.cached ?? 0) + (tokensUsed.cached ?? 0);

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
          this.stats.tokenUsage.total += row.tokenUsage.total || 0;
          this.stats.tokenUsage.prompt += row.tokenUsage.prompt || 0;
          this.stats.tokenUsage.completion += row.tokenUsage.completion || 0;
          this.stats.tokenUsage.cached += row.tokenUsage.cached || 0;
          this.stats.tokenUsage.numRequests += row.tokenUsage.numRequests || 1;
          if (row.tokenUsage.completionDetails) {
            this.stats.tokenUsage.completionDetails.reasoning! +=
              row.tokenUsage.completionDetails.reasoning || 0;
            this.stats.tokenUsage.completionDetails.acceptedPrediction! +=
              row.tokenUsage.completionDetails.acceptedPrediction || 0;
            this.stats.tokenUsage.completionDetails.rejectedPrediction! +=
              row.tokenUsage.completionDetails.rejectedPrediction || 0;
          }
        }

        if (evalStep.test.assert?.some((a) => a.type === 'select-best')) {
          rowsWithSelectBestAssertion.add(row.testIdx);
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
        metrics.tokenUsage.cached =
          (metrics.tokenUsage.cached || 0) + (row.response?.tokenUsage?.cached || 0);
        metrics.tokenUsage.completion =
          (metrics.tokenUsage.completion || 0) + (row.response?.tokenUsage?.completion || 0);
        metrics.tokenUsage.prompt =
          (metrics.tokenUsage.prompt || 0) + (row.response?.tokenUsage?.prompt || 0);
        metrics.tokenUsage.total =
          (metrics.tokenUsage.total || 0) + (row.response?.tokenUsage?.total || 0);
        metrics.tokenUsage.numRequests =
          (metrics.tokenUsage.numRequests || 0) + (row.response?.tokenUsage?.numRequests || 1);
        metrics.tokenUsage.completionDetails = {
          reasoning:
            (metrics.tokenUsage.completionDetails?.reasoning || 0) +
            (row.response?.tokenUsage?.completionDetails?.reasoning || 0),
          acceptedPrediction:
            (metrics.tokenUsage.completionDetails?.acceptedPrediction || 0) +
            (row.response?.tokenUsage?.completionDetails?.acceptedPrediction || 0),
          rejectedPrediction:
            (metrics.tokenUsage.completionDetails?.rejectedPrediction || 0) +
            (row.response?.tokenUsage?.completionDetails?.rejectedPrediction || 0),
        };

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

    // Set up main progress bars
    let multibar: MultiBar | undefined;
    let multiProgressBars: SingleBar[] = [];
    const originalProgressCallback = this.options.progressCallback;
    const isWebUI = Boolean(cliState.webUI);

    this.options.progressCallback = (completed, total, index, evalStep, metrics) => {
      if (originalProgressCallback) {
        originalProgressCallback(completed, total, index, evalStep, metrics);
      }

      if (isWebUI) {
        const provider = evalStep.provider.label || evalStep.provider.id();
        const vars = formatVarsForDisplay(evalStep.test.vars, 50);
        logger.info(`[${numComplete}/${total}] Running ${provider} with vars: ${vars}`);
      } else if (multibar && evalStep) {
        const numProgressBars = Math.min(concurrency, 20);

        // Calculate which progress bar to use
        const progressBarIndex = index % numProgressBars;
        const progressbar = multiProgressBars[progressBarIndex];

        // Calculate how many threads are assigned to this progress bar
        const threadsForThisBar = calculateThreadsPerBar(
          concurrency,
          numProgressBars,
          progressBarIndex,
        );

        const vars = formatVarsForDisplay(evalStep.test.vars, 10);
        progressbar.increment({
          provider: evalStep.provider.label || evalStep.provider.id(),
          prompt: evalStep.prompt.raw.slice(0, 10).replace(/\n/g, ' '),
          vars,
          activeThreads: threadsForThisBar,
        });
      } else {
        logger.debug(`Eval #${index + 1} complete (${numComplete} of ${runEvalOptions.length})`);
      }
    };

    const createMultiBars = async (evalOptions: RunEvalOptions[]) => {
      // Only create progress bars if not in web UI mode
      if (isWebUI) {
        return;
      }

      const numProgressBars = Math.min(concurrency, 20);

      const showThreadCounts = concurrency > numProgressBars;

      multibar = new cliProgress.MultiBar(
        {
          format: showThreadCounts
            ? 'Group {groupId} [{bar}] {percentage}% | {value}/{total} | {activeThreads}/{maxThreads} threads | {provider} "{prompt}" {vars}'
            : 'Group {groupId} [{bar}] {percentage}% | {value}/{total} | {provider} "{prompt}" {vars}',
          hideCursor: true,
          gracefulExit: true,
        },
        cliProgress.Presets.shades_classic,
      );

      if (!multibar) {
        return;
      }

      const stepsPerProgressBar = Math.floor(evalOptions.length / numProgressBars);
      const remainingSteps = evalOptions.length % numProgressBars;
      multiProgressBars = [];

      for (let i = 0; i < numProgressBars; i++) {
        const totalSteps = i < remainingSteps ? stepsPerProgressBar + 1 : stepsPerProgressBar;
        if (totalSteps > 0) {
          // Calculate how many threads are assigned to this progress bar
          const threadsForThisBar = calculateThreadsPerBar(concurrency, numProgressBars, i);

          const progressbar = multibar.create(totalSteps, 0, {
            groupId: `${i + 1}/${numProgressBars}`,
            provider: '',
            prompt: '',
            vars: '',
            activeThreads: 0,
            maxThreads: threadsForThisBar,
          });
          multiProgressBars.push(progressbar);
        }
      }
    };

    // Run the evals
    if (this.options.showProgressBar) {
      await createMultiBars(runEvalOptions);
    }

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
    const compareRowsCount = rowsWithSelectBestAssertion.size;

    let progressBar;
    if (compareRowsCount > 0 && multibar && !isWebUI) {
      progressBar = multibar.create(compareRowsCount, 0, {
        provider: 'Running model-graded comparisons',
        prompt: '',
        vars: '',
      });
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
        if (progressBar) {
          progressBar.increment({
            prompt: resultsToCompare[0].prompt.raw.slice(0, 10).replace(/\n/g, ''),
          });
        } else if (!isWebUI) {
          logger.debug(`Model-graded comparison #${compareCount} of ${compareRowsCount} complete`);
        }
      }
    }

    await this.evalRecord.addPrompts(prompts);

    // Finish up
    if (multibar) {
      multibar.stop();
    }
    if (progressBar) {
      progressBar.stop();
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

    telemetry.record('eval_ran', {
      numPrompts: prompts.length,
      numTests: prompts.reduce(
        (acc, p) =>
          acc +
          (p.metrics?.testPassCount || 0) +
          (p.metrics?.testFailCount || 0) +
          (p.metrics?.testErrorCount || 0),
        0,
      ),
      numVars: varNames.size,
      numProviders: testSuite.providers.length,
      numRepeat: options.repeat || 1,
      providerPrefixes: Array.from(
        new Set(
          testSuite.providers.map((p) => {
            const idParts = p.id().split(':');
            return idParts.length > 1 ? idParts[0] : 'unknown';
          }),
        ),
      ).sort(),
      assertionTypes: Array.from(assertionTypes).sort(),
      eventSource: options.eventSource || 'default',
      ci: isCI(),
      hasAnyPass: this.evalRecord.prompts.some(
        (p) => p.metrics?.testPassCount && p.metrics.testPassCount > 0,
      ),
      numPasses: this.evalRecord.prompts.reduce(
        (acc, p) => acc + (p.metrics?.testPassCount || 0),
        0,
      ),
      numFails: this.evalRecord.prompts.reduce(
        (acc, p) => acc + (p.metrics?.testFailCount || 0),
        0,
      ),
      numErrors: this.evalRecord.prompts.reduce(
        (acc, p) => acc + (p.metrics?.testErrorCount || 0),
        0,
      ),
      isPromptfooSampleTarget: testSuite.providers.some(isPromptfooSampleTarget),
      isRedteam: Boolean(options.isRedteam),
    });

    // Update database signal file after all results are written
    updateSignalFile();

    return this.evalRecord;
  }

  async evaluate(): Promise<Eval> {
    // Start OTLP receiver if tracing is enabled
    await startOtlpReceiverIfNeeded(this.testSuite);

    // Wrap the rest of the evaluation in try-finally to ensure OTLP receiver cleanup
    try {
      return await this._runEvaluation();
    } finally {
      // Stop OTLP receiver if it was started
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
