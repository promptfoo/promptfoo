import readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';

import async from 'async';
import chalk from 'chalk';
import invariant from 'tiny-invariant';
import yaml from 'js-yaml';
import { globSync } from 'glob';

import cliState from './cliState';
import logger from './logger';
import telemetry from './telemetry';
import { runAssertions, runCompareAssertion } from './assertions';
import { generatePrompts } from './suggestions';
import { getNunjucksEngine, transformOutput, sha256, renderVarsInObject } from './util';
import { maybeEmitAzureOpenAiWarning } from './providers/azureopenaiUtil';
import { runPython } from './python/wrapper';
import { importModule } from './esm';
import { fetchWithCache, getCache } from './cache';

import type { MultiBar, SingleBar } from 'cli-progress';
import type {
  ApiProvider,
  CompletedPrompt,
  EvaluateOptions,
  EvaluateResult,
  EvaluateStats,
  EvaluateSummary,
  EvaluateTable,
  NunjucksFilterMap,
  Prompt,
  RunEvalOptions,
  TestSuite,
  ProviderResponse,
  Assertion,
} from './types';
export const DEFAULT_MAX_CONCURRENCY = 4;

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

export function resolveVariables(
  variables: Record<string, string | object>,
): Record<string, string | object> {
  let resolved = true;
  const regex = /\{\{\s*(\w+)\s*\}\}/; // Matches {{variableName}}, {{ variableName }}, etc.

  let iterations = 0;
  do {
    resolved = true;
    for (const key of Object.keys(variables)) {
      if (typeof variables[key] !== 'string') {
        continue;
      }
      const value = variables[key] as string;
      const match = regex.exec(value);
      if (match) {
        const [placeholder, varName] = match;
        if (variables[varName] !== undefined) {
          variables[key] = value.replace(placeholder, variables[varName] as string);
          resolved = false; // Indicate that we've made a replacement and should check again
        } else {
          // Do nothing - final nunjucks render will fail if necessary.
          // logger.warn(`Variable "${varName}" not found for substitution.`);
        }
      }
    }
    iterations++;
  } while (!resolved && iterations < 5);

  return variables;
}

export async function renderPrompt(
  prompt: Prompt,
  vars: Record<string, string | object>,
  nunjucksFilters?: NunjucksFilterMap,
  provider?: ApiProvider,
): Promise<string> {
  const nunjucks = getNunjucksEngine(nunjucksFilters);

  let basePrompt = prompt.raw;

  // Load files
  for (const [varName, value] of Object.entries(vars)) {
    if (typeof value === 'string' && value.startsWith('file://')) {
      const basePath = cliState.basePath || '';
      const filePath = path.resolve(process.cwd(), basePath, value.slice('file://'.length));
      const fileExtension = filePath.split('.').pop();

      logger.debug(`Loading var ${varName} from file: ${filePath}`);
      switch (fileExtension) {
        case 'js':
          const javascriptOutput = (await (
            await importModule(filePath)
          )(varName, basePrompt, vars, provider)) as {
            output?: string;
            error?: string;
          };
          if (javascriptOutput.error) {
            throw new Error(`Error running ${filePath}: ${javascriptOutput.error}`);
          }
          if (!javascriptOutput.output) {
            throw new Error(
              `Expected ${filePath} to return { output: string } but got ${javascriptOutput}`,
            );
          }
          vars[varName] = javascriptOutput.output;
          break;
        case 'py':
          const pythonScriptOutput = (await runPython(filePath, 'get_var', [
            varName,
            basePrompt,
            vars,
          ])) as { output?: string; error?: string };
          if (pythonScriptOutput.error) {
            throw new Error(`Error running Python script ${filePath}: ${pythonScriptOutput.error}`);
          }
          if (!pythonScriptOutput.output) {
            throw new Error(`Python script ${filePath} did not return any output`);
          }
          vars[varName] = pythonScriptOutput.output.trim();
          break;
        case 'yaml':
        case 'yml':
          vars[varName] = JSON.stringify(
            yaml.load(fs.readFileSync(filePath, 'utf8')) as string | object,
          );
          break;
        case 'json':
        default:
          vars[varName] = fs.readFileSync(filePath, 'utf8').trim();
          break;
      }
    }
  }

  // Apply prompt functions
  if (prompt.function) {
    const result = await prompt.function({ vars, provider });
    if (typeof result === 'string') {
      basePrompt = result;
    } else if (typeof result === 'object') {
      basePrompt = JSON.stringify(result);
    } else {
      throw new Error(`Prompt function must return a string or object, got ${typeof result}`);
    }
  }

  // Remove any trailing newlines from vars, as this tends to be a footgun for JSON prompts.
  for (const key of Object.keys(vars)) {
    if (typeof vars[key] === 'string') {
      vars[key] = (vars[key] as string).replace(/\n$/, '');
    }
  }

  // Resolve variable mappings
  resolveVariables(vars);

  // Third party integrations
  if (prompt.raw.startsWith('portkey://')) {
    const { getPrompt } = await import('./integrations/portkey');
    const portKeyResult = await getPrompt(prompt.raw.slice('portkey://'.length), vars);
    return JSON.stringify(portKeyResult.messages);
  } else if (prompt.raw.startsWith('langfuse://')) {
    const { getPrompt } = await import('./integrations/langfuse');
    const langfusePrompt = prompt.raw.slice('langfuse://'.length);

    // we default to "text" type.
    const [helper, version, promptType = 'text'] = langfusePrompt.split(':');
    if (promptType !== 'text' && promptType !== 'chat') {
      throw new Error('Unknown promptfoo prompt type');
    }

    const langfuseResult = await getPrompt(
      helper,
      vars,
      promptType,
      version !== 'latest' ? Number(version) : undefined,
    );
    return langfuseResult;
  }

  // Render prompt
  try {
    if (process.env.PROMPTFOO_DISABLE_JSON_AUTOESCAPE) {
      return nunjucks.renderString(basePrompt, vars);
    }

    const parsed = JSON.parse(basePrompt);

    // The _raw_ prompt is valid JSON. That means that the user likely wants to substitute vars _within_ the JSON itself.
    // Recursively walk the JSON structure. If we find a string, render it with nunjucks.
    return JSON.stringify(renderVarsInObject(parsed, vars), null, 2);
  } catch (err) {
    return nunjucks.renderString(basePrompt, vars);
  }
}

class Evaluator {
  testSuite: TestSuite;
  options: EvaluateOptions;
  stats: EvaluateStats;
  conversations: Record<
    string,
    { prompt: string | object; input: string; output: string | object }[]
  >;
  registers: Record<string, string | object>;

  constructor(testSuite: TestSuite, options: EvaluateOptions) {
    this.testSuite = testSuite;
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
    prompt,
    test,
    delay,
    nunjucksFilters: filters,
    evaluateOptions,
  }: RunEvalOptions): Promise<EvaluateResult> {
    // Use the original prompt to set the label, not renderedPrompt
    let promptLabel = prompt.label;

    // Set up the special _conversation variable
    const vars = test.vars || {};
    const conversationKey = `${provider.label || provider.id()}:${prompt.id}`;
    const usesConversation = prompt.raw.includes('_conversation');
    if (
      !process.env.PROMPTFOO_DISABLE_CONVERSATION_VAR &&
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
      },
      prompt: {
        raw: renderedPrompt,
        label: promptLabel,
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
            vars,

            // These are removed in python and script providers, but every Javascript provider gets them
            logger,
            fetchWithCache,
            getCache,
          },
          {
            originalProvider: provider,
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
        if (!sleep && process.env.PROMPTFOO_DELAY_MS) {
          sleep = parseInt(process.env.PROMPTFOO_DELAY_MS, 10) || 0;
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
      };
      if (response.error) {
        ret.error = response.error;
      } else if (response.output) {
        // Create a copy of response so we can potentially mutate it.
        let processedResponse = { ...response };
        const transform =
          test.options?.transform || test.options?.postprocess || provider.transform;
        if (transform) {
          processedResponse.output = await transformOutput(transform, processedResponse.output, {
            vars,
            prompt,
          });
        }

        invariant(processedResponse.output != null, 'Response output should not be null');
        const checkResult = await runAssertions({
          prompt: renderedPrompt,
          provider,
          test,
          output: processedResponse.output,
          latencyMs: response.cached ? undefined : latencyMs,
          logProbs: response.logProbs,
          cost: processedResponse.cost,
        });
        if (!checkResult.pass) {
          ret.error = checkResult.reason;
        }
        ret.success = checkResult.pass;
        ret.score = checkResult.score;
        ret.namedScores = checkResult.namedScores || {};
        if (checkResult.tokensUsed) {
          this.stats.tokenUsage.total += checkResult.tokensUsed.total;
          this.stats.tokenUsage.prompt += checkResult.tokensUsed.prompt;
          this.stats.tokenUsage.completion += checkResult.tokensUsed.completion;
        }
        ret.response = processedResponse;
        ret.gradingResult = checkResult;
      } else {
        ret.success = false;
        ret.score = 0;
        ret.error = 'No output';
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
      };
    }
  }

  async evaluate(): Promise<EvaluateSummary> {
    const { testSuite, options } = this;
    const prompts: CompletedPrompt[] = [];

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
    for (const prompt of testSuite.prompts) {
      for (const provider of testSuite.providers) {
        // Check if providerPromptMap exists and if it contains the current prompt's label
        if (testSuite.providerPromptMap) {
          const allowedPrompts = testSuite.providerPromptMap[provider.id()];
          if (allowedPrompts && !allowedPrompts.includes(prompt.label)) {
            continue;
          }
        }
        const completedPrompt = {
          ...prompt,
          id: sha256(typeof prompt.raw === 'object' ? JSON.stringify(prompt.raw) : prompt.raw),
          provider: provider.label || provider.id(),
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
    for (const testCase of tests) {
      if (testCase.vars) {
        const varWithSpecialColsRemoved: Record<string, string | string[] | object> = {};
        for (const varName of Object.keys(testCase.vars)) {
          varNames.add(varName);
          varWithSpecialColsRemoved[varName] = testCase.vars[varName];
        }
        varsWithSpecialColsRemoved.push(varWithSpecialColsRemoved);
      }
    }

    // Set up eval cases
    let runEvalOptions: RunEvalOptions[] = [];
    let rowIndex = 0;
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

      const prependToPrompt =
        testCase.options?.prefix || testSuite.defaultTest?.options?.prefix || '';
      const appendToPrompt =
        testCase.options?.suffix || testSuite.defaultTest?.options?.suffix || '';

      // Finalize test case eval
      const varCombinations =
        process.env.PROMPTFOO_DISABLE_VAR_EXPANSION || testCase.options.disableVarExpansion
          ? [testCase.vars]
          : generateVarCombinations(testCase.vars || {});

      const numRepeat = this.options.repeat || 1;
      for (let repeatIndex = 0; repeatIndex < numRepeat; repeatIndex++) {
        for (const vars of varCombinations) {
          let colIndex = 0;
          for (const prompt of testSuite.prompts) {
            for (const provider of testSuite.providers) {
              if (testSuite.providerPromptMap) {
                const allowedPrompts = testSuite.providerPromptMap[provider.id()];
                if (allowedPrompts && !allowedPrompts.includes(prompt.label)) {
                  // This prompt should not be used with this provider.
                  continue;
                }
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
                rowIndex,
                colIndex,
                repeatIndex,
                evaluateOptions: options,
              });
              colIndex++;
            }
          }
          rowIndex++;
        }
      }
    }

    // Set up table...
    const isTest = tests.some((t) => !!t.assert);

    const table: EvaluateTable = {
      head: {
        prompts,
        vars: Array.from(varNames).sort(),
      },
      body: [],
    };

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
    const results: EvaluateResult[] = [];
    let numComplete = 0;

    const processEvalStep = async (evalStep: RunEvalOptions, index: number | string) => {
      if (typeof index !== 'number') {
        throw new Error('Expected index to be a number');
      }

      const row = await this.runEval(evalStep);

      results.push(row);

      numComplete++;
      if (options.progressCallback) {
        options.progressCallback(results.length, runEvalOptions.length, index, evalStep);
      }

      // Bookkeeping for table
      let resultText: string | undefined;
      const outputTextDisplay =
        typeof row.response?.output === 'object'
          ? JSON.stringify(row.response.output)
          : row.response?.output || null;
      if (isTest) {
        if (row.success) {
          resultText = `${outputTextDisplay || row.error || ''}`;
        } else {
          resultText = `${row.error}\n---\n${outputTextDisplay || ''}`;
        }
      } else if (row.error) {
        resultText = `${row.error}`;
      } else {
        resultText = outputTextDisplay || row.error || '';
      }

      const { rowIndex, colIndex } = evalStep;
      if (!table.body[rowIndex]) {
        table.body[rowIndex] = {
          description: evalStep.test.description,
          outputs: [],
          test: evalStep.test,
          vars: table.head.vars
            .map((varName) => {
              const varValue = evalStep.test.vars?.[varName] || '';
              if (typeof varValue === 'string') {
                return varValue;
              }
              return JSON.stringify(varValue);
            })
            .flat(),
        };
      }
      table.body[rowIndex].outputs[colIndex] = {
        pass: row.success,
        score: row.score,
        namedScores: row.namedScores,
        text: resultText,
        prompt: row.prompt.raw,
        provider: row.provider.label || row.provider.id,
        latencyMs: row.latencyMs,
        tokenUsage: row.response?.tokenUsage,
        gradingResult: row.gradingResult,
        cost: row.cost || 0,
      };

      const metrics = table.head.prompts[colIndex].metrics;
      invariant(metrics, 'Expected prompt.metrics to be set');
      metrics.score += row.score;
      for (const [key, value] of Object.entries(row.namedScores)) {
        metrics.namedScores[key] = (metrics.namedScores[key] || 0) + value;
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
      metrics.testFailCount += row.success ? 0 : 1;
      metrics.assertPassCount +=
        row.gradingResult?.componentResults?.filter((r) => r.pass).length || 0;
      metrics.assertFailCount +=
        row.gradingResult?.componentResults?.filter((r) => !r.pass).length || 0;
      metrics.totalLatencyMs += row.latencyMs || 0;
      metrics.tokenUsage.cached =
        (metrics.tokenUsage.cached || 0) + (row.response?.tokenUsage?.cached || 0);
      metrics.tokenUsage.completion += row.response?.tokenUsage?.completion || 0;
      metrics.tokenUsage.prompt += row.response?.tokenUsage?.prompt || 0;
      metrics.tokenUsage.total += row.response?.tokenUsage?.total || 0;
      metrics.cost += row.cost || 0;
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
    if (this.options.interactiveProviders) {
      runEvalOptions = runEvalOptions.sort((a, b) =>
        a.provider.id().localeCompare(b.provider.id()),
      );
      logger.warn('Providers are running in serial with user input.');

      // Group evalOptions by provider
      const groupedEvalOptions = runEvalOptions.reduce<Record<string, RunEvalOptions[]>>(
        (acc, evalOption) => {
          const providerId = evalOption.provider.id();
          if (!acc[providerId]) {
            acc[providerId] = [];
          }
          acc[providerId].push(evalOption);
          return acc;
        },
        {},
      );

      // Process each group
      for (const [providerId, providerEvalOptions] of Object.entries(groupedEvalOptions)) {
        logger.info(
          `Running ${providerEvalOptions.length} evaluations for provider ${providerId} with concurrency=${concurrency}...`,
        );

        if (this.options.showProgressBar) {
          await createMultiBars(providerEvalOptions);
        }
        await async.forEachOfLimit(providerEvalOptions, concurrency, processEvalStep);
        if (multibar) {
          multibar.stop();
        }

        // Prompt to continue to the next provider unless it's the last one
        if (
          Object.keys(groupedEvalOptions).indexOf(providerId) <
          Object.keys(groupedEvalOptions).length - 1
        ) {
          await new Promise((resolve) => {
            const rl = readline.createInterface({
              input: process.stdin,
              output: process.stdout,
            });
            rl.question(`\nReady to continue to the next provider? (Y/n) `, (answer) => {
              rl.close();
              if (answer.toLowerCase() === 'n') {
                logger.info('Aborting evaluation.');
                process.exit(1);
              }
              resolve(true);
            });
          });
        }
      }
    } else {
      if (this.options.showProgressBar) {
        await createMultiBars(runEvalOptions);
      }
      await async.forEachOfLimit(runEvalOptions, concurrency, processEvalStep);
    }

    // Do we have to run comparisons between row outputs?
    const compareRowsCount = table.body.reduce(
      (count, row) => count + (row.test.assert?.some((a) => a.type === 'select-best') ? 1 : 0),
      0,
    );

    let progressBar;
    if (compareRowsCount > 0 && multibar) {
      progressBar = multibar.create(compareRowsCount, 0, {
        provider: 'Running model-graded comparisons',
        prompt: '',
        vars: '',
      });
    }

    for (let index = 0; index < table.body.length; index++) {
      const row = table.body[index];
      const compareAssertion = row.test.assert?.find((a) => a.type === 'select-best') as Assertion;
      if (compareAssertion) {
        const outputs = row.outputs.map((o) => o.text);
        const gradingResults = await runCompareAssertion(row.test, compareAssertion, outputs);
        row.outputs.forEach((output, index) => {
          const gradingResult = gradingResults[index];
          if (!output.gradingResult) {
            output.gradingResult = gradingResult;
          } else {
            output.gradingResult.tokensUsed = output.gradingResult.tokensUsed || {
              total: 0,
              prompt: 0,
              completion: 0,
            };
            output.gradingResult.tokensUsed.total += gradingResult.tokensUsed?.total || 0;
            output.gradingResult.tokensUsed.prompt += gradingResult.tokensUsed?.prompt || 0;
            output.gradingResult.tokensUsed.completion += gradingResult.tokensUsed?.completion || 0;
            output.pass = output.gradingResult.pass =
              output.gradingResult.pass && gradingResult.pass;
            if (!gradingResult.pass) {
              // Failure overrides the reason and the score
              output.gradingResult.reason = gradingResult.reason;
              output.score = output.gradingResult.score = gradingResult.score;
              output.text = `${gradingResult.reason}\n---\n${output.text}`;
            }
            if (!output.gradingResult.componentResults) {
              output.gradingResult.componentResults = [];
            }
            output.gradingResult.componentResults.push(gradingResult);
          }
        });
        if (progressBar) {
          progressBar.increment({
            prompt: row.outputs[0].text.slice(0, 10).replace(/\n/g, ''),
          });
        } else {
          logger.debug(`Model-graded comparison #${index + 1} of ${compareRowsCount} complete`);
        }
      }
    }

    // Finish up
    if (multibar) {
      multibar.stop();
    }
    if (progressBar) {
      progressBar.stop();
    }

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
      ci: Boolean(
        process.env.CI ||
          process.env.GITHUB_ACTIONS ||
          process.env.TRAVIS ||
          process.env.CIRCLECI ||
          process.env.JENKINS ||
          process.env.GITLAB_CI,
      ),
      hasAnyPass: results.some((r) => r.success),
    });

    return { version: 2, timestamp: new Date().toISOString(), results, stats: this.stats, table };
  }
}

export function evaluate(testSuite: TestSuite, options: EvaluateOptions) {
  const ev = new Evaluator(testSuite, options);
  return ev.evaluate();
}
