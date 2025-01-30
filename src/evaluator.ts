import async from 'async';
import chalk from 'chalk';
import type { MultiBar, SingleBar } from 'cli-progress';
import { randomUUID } from 'crypto';
import { globSync } from 'glob';
import * as path from 'path';
import readline from 'readline';
import type winston from 'winston';
import { runAssertions, runCompareAssertion } from './assertions';
import { fetchWithCache, getCache } from './cache';
import cliState from './cliState';
import { updateSignalFile } from './database/signal';
import { getEnvBool, getEnvInt, isCI } from './envars';
import { renderPrompt, runExtensionHook } from './evaluatorHelpers';
import logger from './logger';
import type Eval from './models/eval';
import { generateIdFromPrompt } from './models/prompt';
import { maybeEmitAzureOpenAiWarning } from './providers/azureUtil';
import { generatePrompts } from './suggestions';
import telemetry from './telemetry';
import type { EvalConversations, EvalRegisters, TokenUsage, Vars } from './types';
import {
  type ApiProvider,
  type Assertion,
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
import { JsonlFileWriter } from './util/exportToFile/writeToFile';
import invariant from './util/invariant';
import { safeJsonStringify } from './util/json';
import { sleep } from './util/time';
import { transform, type TransformContext, TransformInputType } from './util/transform';

export const DEFAULT_MAX_CONCURRENCY = 4;

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
  conversations, //
  registers,
  isRedteam,
}: RunEvalOptions): Promise<EvaluateResult> {
  // Use the original prompt to set the label, not renderedPrompt
  const promptLabel = prompt.label;

  provider.delay ??= delay ?? getEnvInt('PROMPTFOO_DELAY_MS', 0);
  invariant(
    typeof provider.delay === 'number',
    `Provider delay should be set for ${provider.label}`,
  );

  // Set up the special _conversation variable
  const vars = test.vars || {};
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
  // Render the prompt
  const renderedPrompt = await renderPrompt(prompt, vars, filters, provider);
  let renderedJson = undefined;
  try {
    renderedJson = JSON.parse(renderedPrompt);
  } catch {}

  const setup = {
    provider: {
      id: provider.id(),
      label: provider.label,
      config: provider.config,
    },
    prompt: {
      raw: renderedPrompt,
      label: promptLabel,
      config: prompt.config,
    },
    vars,
  };
  // Call the API
  let latencyMs = 0;
  try {
    const startTime = Date.now();
    let response: ProviderResponse = {
      output: '',
      tokenUsage: {},
      cost: 0,
      cached: false,
    };

    if (test.providerOutput) {
      response.output = test.providerOutput;
    } else {
      response = await ((test.provider as ApiProvider) || provider).callApi(
        renderedPrompt,
        {
          // Always included
          vars,

          // Part of these may be removed in python and script providers, but every Javascript provider gets them
          prompt,
          filters,
          originalProvider: provider,
          test,

          // All of these are removed in python and script providers, but every Javascript provider gets them
          logger: logger as winston.Logger,
          fetchWithCache,
          getCache,
        },
        {
          includeLogProbs: test.assert?.some((a) => a.type === 'perplexity'),
        },
      );
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
      });
    }

    if (!response.cached && provider.delay > 0) {
      logger.debug(`Sleeping for ${provider.delay}ms`);
      await sleep(provider.delay);
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
      metadata: response.metadata,
      promptIdx,
      testIdx,
      testCase: test,
      promptId: prompt.id || '',
      tokenUsage: newTokenUsage(),
    };

    invariant(ret.tokenUsage, 'This is always defined, just doing this to shut TS up');

    if (response.error) {
      ret.error = response.error;
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

    return ret;
  } catch (err) {
    return {
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
    };
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
      const filePaths = globSync(resolvedPath.replace(/\\/g, '/'));
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

  async evaluate(): Promise<Eval> {
    const { testSuite, options } = this;
    const checkAbort = () => {
      if (options.abortSignal?.aborted) {
        throw new Error('Operation cancelled');
      }
    };

    // Add abort checks at key points
    checkAbort();

    const prompts: CompletedPrompt[] = [];
    const assertionTypes = new Set<string>();
    const rowsWithSelectBestAssertion = new Set<number>();

    await runExtensionHook(testSuite.extensions, 'beforeAll', { suite: testSuite });

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
        await new Promise((resolve) => {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          rl.question(
            `${chalk.blue('Do you want to test this prompt?')} (y/N): `,
            async (answer) => {
              rl.close();
              if (answer.toLowerCase().startsWith('y')) {
                testSuite.prompts.push({ raw: prompt, label: prompt });
                numAdded++;
              } else {
                logger.info('Skipping this prompt.');
              }
              resolve(true);
            },
          );
        });
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
            },
            namedScores: {},
            namedScoresCount: {},
            cost: 0,
          },
        };
        prompts.push(completedPrompt);
      }
    }

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
                test: { ...testCase, vars, options: testCase.options },
                nunjucksFilters: testSuite.nunjucksFilters,
                testIdx,
                promptIdx,
                repeatIndex,
                evaluateOptions: options,
                conversations: this.conversations,
                registers: this.registers,
                isRedteam: this.testSuite.redteam != null,
              });
              promptIdx++;
            }
          }
          testIdx++;
        }
      }
    }
    // Determine run parameters
    let concurrency = options.maxConcurrency || DEFAULT_MAX_CONCURRENCY;
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

      await runExtensionHook(testSuite.extensions, 'beforeEach', {
        test: evalStep.test,
      });

      const row = await runEval(evalStep);

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
      if (options.progressCallback) {
        options.progressCallback(
          this.evalRecord.results.length,
          runEvalOptions.length,
          index,
          evalStep,
        );
      }

      try {
        await this.evalRecord.addResult(row);
      } catch (error) {
        logger.error(`Error saving result: ${error} ${safeJsonStringify(row)}`);
      }

      for (const writer of this.fileWriters) {
        await writer.write(row);
      }

      const { promptIdx } = row;
      const metrics = prompts[promptIdx].metrics;
      invariant(metrics, 'Expected prompt.metrics to be set');
      metrics.score += row.score;
      for (const [key, value] of Object.entries(row.namedScores)) {
        metrics.namedScores[key] = (metrics.namedScores[key] || 0) + value;
        metrics.namedScoresCount[key] = (metrics.namedScoresCount[key] || 0) + 1;
      }

      if (testSuite.derivedMetrics) {
        const math = await import('mathjs'); // TODO: move this
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
      metrics.cost += row.cost || 0;

      await runExtensionHook(testSuite.extensions, 'afterEach', {
        test: evalStep.test,
        result: row,
      });
    };

    // Set up main progress bars
    let multibar: MultiBar | undefined;
    let multiProgressBars: SingleBar[] = [];
    const originalProgressCallback = this.options.progressCallback;
    const isWebUI = Boolean(cliState.webUI);

    this.options.progressCallback = (completed, total, index, evalStep) => {
      if (originalProgressCallback) {
        originalProgressCallback(completed, total, index, evalStep);
      }

      if (isWebUI) {
        const provider = evalStep.provider.label || evalStep.provider.id();
        const vars = Object.entries(evalStep.test.vars || {})
          .map(([k, v]) => `${k}=${v}`)
          .join(' ')
          .slice(0, 50)
          .replace(/\n/g, ' ');
        logger.info(`[${numComplete}/${total}] Running ${provider} with vars: ${vars}`);
      } else if (multibar && evalStep) {
        const threadIndex = index % concurrency;
        const progressbar = multiProgressBars[threadIndex];
        progressbar.increment({
          provider: evalStep.provider.label || evalStep.provider.id(),
          prompt: evalStep.prompt.raw.slice(0, 10).replace(/\n/g, ' '),
          vars: Object.entries(evalStep.test.vars || {})
            .map(([k, v]) => `${k}=${v}`)
            .join(' ')
            .slice(0, 10)
            .replace(/\n/g, ' '),
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

      const cliProgress = await import('cli-progress');
      multibar = new cliProgress.MultiBar(
        {
          format:
            '[{bar}] {percentage}% | ETA: {eta}s | {value}/{total} | {provider} "{prompt}" {vars}',
          hideCursor: true,
        },
        cliProgress.Presets.shades_classic,
      );
      const stepsPerThread = Math.floor(evalOptions.length / concurrency);
      const remainingSteps = evalOptions.length % concurrency;
      multiProgressBars = [];
      for (let i = 0; i < concurrency; i++) {
        const totalSteps = i < remainingSteps ? stepsPerThread + 1 : stepsPerThread;
        if (totalSteps > 0) {
          const progressbar = multibar.create(totalSteps, 0, {
            provider: '',
            prompt: '',
            vars: '',
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

    if (serialRunEvalOptions.length > 0) {
      // Run serial evaluations first
      logger.info(`Running ${serialRunEvalOptions.length} serial evaluations...`);
      for (const evalStep of serialRunEvalOptions) {
        if (isWebUI) {
          const provider = evalStep.provider.label || evalStep.provider.id();
          const vars = Object.entries(evalStep.test.vars || {})
            .map(([k, v]) => `${k}=${v}`)
            .join(' ')
            .slice(0, 50)
            .replace(/\n/g, ' ');
          logger.info(
            `[${numComplete}/${serialRunEvalOptions.length}] Running ${provider} with vars: ${vars}`,
          );
        }
        await processEvalStep(evalStep, serialRunEvalOptions.indexOf(evalStep));
      }
    }

    // Then run concurrent evaluations
    logger.info(
      `Running ${concurrentRunEvalOptions.length} concurrent evaluations with up to ${concurrency} threads...`,
    );
    await async.forEachOfLimit(concurrentRunEvalOptions, concurrency, async (evalStep, index) => {
      checkAbort();
      await processEvalStep(evalStep, index);
    });

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
            result.gradingResult.tokensUsed = result.gradingResult.tokensUsed || {
              total: 0,
              prompt: 0,
              completion: 0,
            };
            result.gradingResult.tokensUsed.total =
              (result.gradingResult.tokensUsed.total || 0) + (gradingResult.tokensUsed?.total || 0);
            result.gradingResult.tokensUsed.prompt =
              (result.gradingResult.tokensUsed.prompt || 0) +
              (gradingResult.tokensUsed?.prompt || 0);
            result.gradingResult.tokensUsed.completion =
              (result.gradingResult.tokensUsed.completion || 0) +
              (gradingResult.tokensUsed?.completion || 0);
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

    await runExtensionHook(testSuite.extensions, 'afterAll', {
      prompts: this.evalRecord.prompts,
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
      // FIXME(ian): Does this work?  I think redteam is only on the config, not testSuite.
      // isRedteam: Boolean(testSuite.redteam),
    });

    // Update database signal file after all results are written
    updateSignalFile();

    return this.evalRecord;
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
