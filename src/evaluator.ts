import async from 'async';
import chalk from 'chalk';
import type { MultiBar, SingleBar } from 'cli-progress';
import { globSync } from 'glob';
import * as path from 'path';
import readline from 'readline';
import invariant from 'tiny-invariant';
import { runAssertions, runCompareAssertion } from './assertions';
import { fetchWithCache, getCache } from './cache';
import cliState from './cliState';
import { getEnvBool, getEnvInt, isCI } from './envars';
import { renderPrompt, runExtensionHook } from './evaluatorHelpers';
import logger from './logger';
import type Eval from './models/eval';
import { generateIdFromPrompt } from './models/prompt';
import Provider from './models/provider';
import { maybeEmitAzureOpenAiWarning } from './providers/azureopenaiUtil';
import { generatePrompts } from './suggestions';
import telemetry from './telemetry';
import type {
  ApiProvider,
  Assertion,
  CompletedPrompt,
  EvaluateOptions,
  EvaluateResult,
  EvaluateStats,
  Prompt,
  ProviderResponse,
  RunEvalOptions,
  TestSuite,
} from './types';
import { transform, TransformInputType } from './util/transform';

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
  conversations: Record<
    string,
    { prompt: string | object; input: string; output: string | object }[]
  >;
  registers: Record<string, string | object>;

  constructor(testSuite: TestSuite, evalRecord: Eval, options: EvaluateOptions) {
    this.testSuite = testSuite;
    this.evalRecord = evalRecord;
    this.options = options;
    this.stats = {
      successes: 0,
      failures: 0,
      tokenUsage: {
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
      },
    };
    this.conversations = {};
    this.registers = {};
  }

  async runEval({
    provider,
    prompt, // raw prompt
    test,
    delay,
    nunjucksFilters: filters,
    evaluateOptions,
    testIdx,
    promptIdx,
  }: RunEvalOptions): Promise<EvaluateResult> {
    // Use the original prompt to set the label, not renderedPrompt
    const promptLabel = prompt.label;

    // Set up the special _conversation variable
    const vars = test.vars || {};
    const conversationKey = `${provider.label || provider.id()}:${prompt.id}`;
    const usesConversation = prompt.raw.includes('_conversation');
    if (
      !getEnvBool('PROMPTFOO_DISABLE_CONVERSATION_VAR') &&
      !test.options?.disableConversationVar &&
      usesConversation
    ) {
      vars._conversation = this.conversations[conversationKey] || [];
    }

    // Overwrite vars with any saved register values
    Object.assign(vars, this.registers);

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

            // All of these are removed in python and script providers, but every Javascript provider gets them
            logger,
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
      this.conversations[conversationKey] = this.conversations[conversationKey] || [];
      this.conversations[conversationKey].push({
        prompt: renderedJson || renderedPrompt,
        input: conversationLastInput || renderedJson || renderedPrompt,
        output: response.output || '',
      });

      if (!response.cached) {
        let sleep = provider.delay ?? delay;
        if (!sleep) {
          sleep = getEnvInt('PROMPTFOO_DELAY_MS', 0);
        }
        if (sleep) {
          logger.debug(`Sleeping for ${sleep}ms`);
          await new Promise((resolve) => setTimeout(resolve, sleep));
        }
      }

      const ret: EvaluateResult = {
        ...setup,
        response,
        success: false,
        score: 0,
        namedScores: {},
        latencyMs,
        cost: response.cost,
        metadata: response.metadata,
        promptIdx,
        testIdx,
        testCase: test,
        promptId: prompt.id || '',
      };
      if (response.error) {
        ret.error = response.error;
      } else if (response.output == null) {
        ret.success = false;
        ret.score = 0;
        ret.error = 'No output';
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
        }
        ret.success = checkResult.pass;
        ret.score = checkResult.score;
        ret.namedScores = checkResult.namedScores || {};
        if (checkResult.tokensUsed) {
          this.stats.tokenUsage.total += checkResult.tokensUsed.total || 0;
          this.stats.tokenUsage.prompt += checkResult.tokensUsed.prompt || 0;
          this.stats.tokenUsage.completion += checkResult.tokensUsed.completion || 0;
          this.stats.tokenUsage.cached += checkResult.tokensUsed.cached || 0;
        }
        ret.response = processedResponse;
        ret.gradingResult = checkResult;
      }

      // Update token usage stats
      if (response.tokenUsage) {
        this.stats.tokenUsage.total += response.tokenUsage.total || 0;
        this.stats.tokenUsage.prompt += response.tokenUsage.prompt || 0;
        this.stats.tokenUsage.completion += response.tokenUsage.completion || 0;
        this.stats.tokenUsage.cached += response.tokenUsage.cached || 0;
      }

      if (ret.success) {
        this.stats.successes++;
      } else {
        this.stats.failures++;
      }

      if (test.options?.storeOutputAs && ret.response?.output) {
        // Save the output in a register for later use
        this.registers[test.options.storeOutputAs] = ret.response.output;
      }

      return ret;
    } catch (err) {
      this.stats.failures++;
      return {
        ...setup,
        error: String(err) + '\n\n' + (err as Error).stack,
        success: false,
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

  async evaluate(): Promise<Eval> {
    const { testSuite, options } = this;
    const prompts: CompletedPrompt[] = [];
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
        process.exit(1);
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
            assertPassCount: 0,
            assertFailCount: 0,
            totalLatencyMs: 0,
            tokenUsage: {
              total: 0,
              prompt: 0,
              completion: 0,
              cached: 0,
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
    const varsWithSpecialColsRemoved: Record<string, string | string[] | object>[] = [];
    const inputTransformDefault = testSuite?.defaultTest?.options?.transformVars;
    for (const testCase of tests) {
      if (testCase.vars) {
        const varWithSpecialColsRemoved: Record<string, string | string[] | object> = {};
        const inputTransformForIndividualTest = testCase.options?.transformVars;
        const inputTransform = inputTransformForIndividualTest || inputTransformDefault;
        if (inputTransform) {
          const transformedVars = await transform(
            inputTransform,
            testCase.vars,
            {
              prompt: {},
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
      testCase.vars = { ...testSuite.defaultTest?.vars, ...testCase.vars };
      testCase.assert = [...(testSuite.defaultTest?.assert || []), ...(testCase.assert || [])];
      testCase.threshold = testCase.threshold ?? testSuite.defaultTest?.threshold;
      testCase.options = { ...testSuite.defaultTest?.options, ...testCase.options };
      testCase.metadata = { ...testSuite.defaultTest?.metadata, ...testCase.metadata };

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

      const row = await this.runEval(evalStep);

      if (evalStep.test.assert?.some((a) => a.type === 'select-best')) {
        rowsWithSelectBestAssertion.add(row.testIdx);
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
        await this.evalRecord.addResult(row, evalStep.test);
      } catch (error) {
        logger.error(`Error saving result: ${error} ${JSON.stringify(row)}`);
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
      metrics.testFailCount += row.success ? 0 : 1;
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
    this.options.progressCallback = (completed, total, index, evalStep) => {
      if (originalProgressCallback) {
        originalProgressCallback(completed, total, index, evalStep);
      }

      if (multibar && evalStep) {
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

    // Run serial evaluations first
    for (const evalStep of serialRunEvalOptions) {
      await processEvalStep(evalStep, serialRunEvalOptions.indexOf(evalStep));
    }

    // Then run concurrent evaluations
    await async.forEachOfLimit(concurrentRunEvalOptions, concurrency, processEvalStep);

    // Do we have to run comparisons between row outputs?
    const compareRowsCount = rowsWithSelectBestAssertion.size;

    let progressBar;
    if (compareRowsCount > 0 && multibar) {
      progressBar = multibar.create(compareRowsCount, 0, {
        provider: 'Running model-graded comparisons',
        prompt: '',
        vars: '',
      });
    }
    let compareCount = 0;
    for (const testIdx of rowsWithSelectBestAssertion) {
      compareCount++;

      const resultsToCompare = this.evalRecord.results.filter((r) => r.testIdx === testIdx);
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
        } else {
          logger.debug(`Model-graded comparison #${compareCount} of ${compareRowsCount} complete`);
        }
      }
    }

    await this.evalRecord.addPrompts(prompts);
    const providers = await Provider.createMultiple(testSuite.providers, {
      persist: this.evalRecord.persisted,
    });
    await this.evalRecord.addProviders(providers);

    // Finish up
    if (multibar) {
      multibar.stop();
    }
    if (progressBar) {
      progressBar.stop();
    }

    await runExtensionHook(testSuite.extensions, 'afterAll', {
      results: this.evalRecord.results.map((r) => r.toEvaluateResult()),
      suite: testSuite,
    });

    telemetry.record('eval_ran', {
      numPrompts: prompts.length,
      numTests: tests.length,
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
      assertionTypes: Array.from(
        new Set(tests.flatMap((t) => t.assert || []).map((a) => a.type)),
      ).sort(),
      eventSource: options.eventSource || 'default',
      ci: isCI(),
      hasAnyPass: this.evalRecord.results.some((r) => r.success),
      isRedteam: Boolean(testSuite.redteam),
    });
    return this.evalRecord;
  }
}

export function evaluate(testSuite: TestSuite, evalRecord: Eval, options: EvaluateOptions) {
  const ev = new Evaluator(testSuite, evalRecord, options);
  return ev.evaluate();
}
