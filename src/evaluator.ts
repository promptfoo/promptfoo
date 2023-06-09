import readline from 'node:readline';

import async from 'async';
import chalk from 'chalk';
import nunjucks from 'nunjucks';

import logger from './logger';
import { runAssertions } from './assertions';

import type { SingleBar } from 'cli-progress';
import type {
  ApiProvider,
  EvaluateOptions,
  EvaluateResult,
  EvaluateStats,
  EvaluateSummary,
  EvaluateTable,
  TestSuite,
  Prompt,
  TestCase,
  AtomicTestCase,
} from './types';
import { generatePrompts } from './suggestions';

interface RunEvalOptions {
  provider: ApiProvider;
  prompt: Prompt;

  test: AtomicTestCase;

  includeProviderId?: boolean;

  rowIndex: number;
  colIndex: number;
}

const DEFAULT_MAX_CONCURRENCY = 4;

function generateVarCombinations(
  vars: Record<string, string | string[]>,
): Record<string, string>[] {
  const keys = Object.keys(vars);
  const combinations: Record<string, string>[] = [{}];

  for (const key of keys) {
    const values = Array.isArray(vars[key]) ? vars[key] : [vars[key]];
    const newCombinations: Record<string, string>[] = [];

    for (const combination of combinations) {
      for (const value of values) {
        newCombinations.push({ ...combination, [key]: value as string });
      }
    }

    combinations.length = 0;
    combinations.push(...newCombinations);
  }

  return combinations;
}

class Evaluator {
  testSuite: TestSuite;
  options: EvaluateOptions;
  stats: EvaluateStats;

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
  }

  async runEval({
    provider,
    prompt,
    test,
    includeProviderId,
  }: RunEvalOptions): Promise<EvaluateResult> {
    const vars = test.vars || {};
    const renderedPrompt = nunjucks.renderString(prompt.raw, vars);

    // Note that we're using original prompt, not renderedPrompt
    let promptDisplay = prompt.display;
    if (includeProviderId) {
      promptDisplay = `[${provider.id()}] ${promptDisplay}`;
    }

    const setup = {
      prompt: {
        raw: renderedPrompt,
        display: promptDisplay,
      },
      vars,
    };

    try {
      const response = await provider.callApi(renderedPrompt);
      const ret: EvaluateResult = {
        ...setup,
        response,
        success: false,
      };
      if (response.error) {
        ret.error = response.error;
      } else if (response.output) {
        const checkResult = await runAssertions(test, response.output);
        if (!checkResult.pass) {
          ret.error = checkResult.reason;
        }
        ret.success = checkResult.pass;
        if (checkResult.tokensUsed) {
          this.stats.tokenUsage.total += checkResult.tokensUsed.total;
          this.stats.tokenUsage.prompt += checkResult.tokensUsed.prompt;
          this.stats.tokenUsage.completion += checkResult.tokensUsed.completion;
        }
      } else {
        ret.success = false;
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

      return ret;
    } catch (err) {
      return {
        ...setup,
        error: String(err),
        success: false,
      };
    }
  }

  async evaluate(): Promise<EvaluateSummary> {
    const { testSuite, options } = this;
    const prompts: Prompt[] = [];

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
                testSuite.prompts.push({ raw: prompt, display: prompt });
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
        const updatedDisplay =
          testSuite.providers.length > 1 ? `[${provider.id()}] ${prompt.display}` : prompt.display;
        prompts.push({
          ...prompt,
          display: updatedDisplay,
        });
      }
    }

    // Aggregate all vars across test cases

    const tests = (
      testSuite.tests || [
        {
          // Dummy test for cases when we're only comparing raw prompts.
        },
      ]
    ).map((test) => {
      const finalTestCase: TestCase = Object.assign({}, testSuite.defaultTest);
      return Object.assign(finalTestCase, test);
    });

    const varNames: Set<string> = new Set();
    const varsWithSpecialColsRemoved: Record<string, string | string[]>[] = [];
    for (const testCase of tests) {
      if (testCase.vars) {
        const varWithSpecialColsRemoved: Record<string, string | string[]> = {};
        for (const varName of Object.keys(testCase.vars)) {
          varNames.add(varName);
          varWithSpecialColsRemoved[varName] = testCase.vars[varName];
        }
        varsWithSpecialColsRemoved.push(varWithSpecialColsRemoved);
      }
    }

    // Set up table...
    const isTest = tests.some((t) => !!t.assert);

    const table: EvaluateTable = {
      head: {
        prompts: prompts.map((p) => p.display),
        vars: Array.from(varNames).sort(),
        // TODO(ian): add assertions to table?
      },
      body: [],
    };

    // And progress bar...
    let progressbar: SingleBar | undefined;
    if (options.showProgressBar) {
      // FIXME(ian): Add var combinations too
      const totalNumRuns =
        testSuite.prompts.length * testSuite.providers.length * (tests.length || 1);
      const cliProgress = await import('cli-progress');
      progressbar = new cliProgress.SingleBar(
        {
          format:
            'Eval: [{bar}] {percentage}% | ETA: {eta}s | {value}/{total} | {provider} "{prompt}" {vars}',
        },
        cliProgress.Presets.shades_classic,
      );
      progressbar.start(totalNumRuns, 0, {
        provider: '',
        prompt: '',
        vars: '',
      });
    }

    // Set up eval cases
    const runEvalOptions: RunEvalOptions[] = [];
    let rowIndex = 0;
    for (const testCase of tests) {
      // Handle default properties
      testCase.vars = Object.assign({}, testSuite.defaultTest?.vars, testCase.vars);
      testCase.assert = [...(testSuite.defaultTest?.assert || []), ...(testCase.assert || [])];
      testCase.options = testCase.options || {};
      testCase.options.provider =
        testCase.options.provider || testSuite.defaultTest?.options?.provider;
      const prependToPrompt =
        testCase.options?.prefix || testSuite.defaultTest?.options?.prefix || '';
      const appendToPrompt =
        testCase.options?.suffix || testSuite.defaultTest?.options?.suffix || '';

      // Finalize test case eval
      const varCombinations = generateVarCombinations(testCase.vars || {});
      for (const vars of varCombinations) {
        let colIndex = 0;
        for (const prompt of testSuite.prompts) {
          for (const provider of testSuite.providers) {
            runEvalOptions.push({
              provider,
              prompt: {
                ...prompt,
                raw: prependToPrompt + prompt.raw + appendToPrompt,
              },
              test: { ...testCase, vars },
              includeProviderId: testSuite.providers.length > 1,
              rowIndex,
              colIndex,
            });
            colIndex++;
          }
        }
        rowIndex++;
      }
    }

    // Actually run the eval
    const results: EvaluateResult[] = [];
    await async.forEachOfLimit(
      runEvalOptions,
      options.maxConcurrency || DEFAULT_MAX_CONCURRENCY,
      async (options: RunEvalOptions, index: number | string) => {
        const row = await this.runEval(options);

        results.push(row);

        if (progressbar) {
          progressbar.increment({
            provider: options.provider.id(),
            prompt: options.prompt.raw.slice(0, 10),
            vars: Object.entries(options.test.vars || {})
              .map(([k, v]) => `${k}=${v}`)
              .join(' ')
              .slice(0, 10),
          });
        }

        // Bookkeeping for table
        if (typeof index !== 'number') {
          throw new Error('Expected index to be a number');
        }

        let resultText: string | undefined;
        if (isTest) {
          if (row.success) {
            resultText = `[PASS] ${row.response?.output || row.error || ''}`;
          } else {
            resultText = `[FAIL] ${row.error}\n---\n${row.response?.output || row.error || ''}`;
          }
        } else if (row.error) {
          resultText = `[FAIL] ${row.error}`;
        } else {
          resultText = row.response?.output || row.error || '';
        }

        // TODO(ian): Provide full context in table cells, and have the caller
        // construct the table contents itself.
        const { rowIndex, colIndex } = options;
        if (!table.body[rowIndex]) {
          table.body[rowIndex] = {
            outputs: [],
            vars: table.head.vars.map((varName) => options.test.vars?.[varName] || '').flat(),
          };
        }
        table.body[rowIndex].outputs[colIndex] = resultText;
      },
    );

    if (progressbar) {
      progressbar.stop();
    }

    return { version: 1, results, stats: this.stats, table };
  }
}

export function evaluate(testSuite: TestSuite, options: EvaluateOptions) {
  const ev = new Evaluator(testSuite, options);
  return ev.evaluate();
}
