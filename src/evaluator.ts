import readline from 'node:readline';

import async from 'async';
import chalk from 'chalk';
import nunjucks from 'nunjucks';

import logger from './logger.js';
import { matchesExpectedValue } from './assertions.js';

import type { SingleBar } from 'cli-progress';
import type {
  ApiProvider,
  EvaluateOptions,
  EvaluateResult,
  EvaluateStats,
  EvaluateSummary,
  EvaluateTable,
  Prompt,
} from './types.js';
import { generatePrompts } from './suggestions.js';

interface RunEvalOptions {
  provider: ApiProvider;
  prompt: string;
  vars?: Record<string, string>;
  includeProviderId?: boolean;

  rowIndex: number;
  colIndex: number;
}

const DEFAULT_MAX_CONCURRENCY = 4;

class Evaluator {
  options: EvaluateOptions;
  stats: EvaluateStats;

  constructor(options: EvaluateOptions) {
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
    vars,
    includeProviderId,
  }: RunEvalOptions): Promise<EvaluateResult> {
    vars = vars || {};
    const renderedPrompt = nunjucks.renderString(prompt, vars);

    // Note that we're using original prompt, not renderedPrompt
    const promptDisplay = includeProviderId ? `[${provider.id()}] ${prompt}` : prompt;

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
        const checkResult = vars.__expected
          ? await matchesExpectedValue(vars.__expected, response.output, this.options)
          : { pass: true };
        if (!checkResult.pass) {
          ret.error = checkResult.reason || `Expected: ${vars.__expected}`;
        }
        ret.success = checkResult.pass;
      } else {
        ret.success = false;
        ret.error = 'No output';
      }

      // Update token usage stats
      this.stats.tokenUsage.total += response.tokenUsage?.total || 0;
      this.stats.tokenUsage.prompt += response.tokenUsage?.prompt || 0;
      this.stats.tokenUsage.completion += response.tokenUsage?.completion || 0;
      this.stats.tokenUsage.cached += response.tokenUsage?.cached || 0;

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
    const options = this.options;
    const prompts: Prompt[] = [];

    if (options.prompt?.generateSuggestions) {
      logger.info(`Generating prompt variations...`);
      const { prompts: newPrompts, error } = await generatePrompts(options.prompts[0], 1);
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
                options.prompts.push(prompt);
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

    for (const promptContent of options.prompts) {
      for (const provider of options.providers) {
        const display =
          options.providers.length > 1 ? `[${provider.id()}] ${promptContent}` : promptContent;
        prompts.push({
          raw: promptContent,
          display,
        });
      }
    }

    const vars = options.vars && options.vars.length > 0 ? options.vars : [{}];
    const varsWithSpecialColsRemoved = vars.map((v) => {
      const ret = { ...v };
      Object.keys(ret).forEach((key) => {
        if (key.startsWith('__')) {
          delete ret[key];
        }
      });
      return ret;
    });
    const isTest = vars[0].__expected;
    const table: EvaluateTable = {
      head: {
        prompts: prompts.map((p) => p.display),
        vars: Object.keys(varsWithSpecialColsRemoved[0]),
      },
      body: [],
    };

    let progressbar: SingleBar | undefined;
    if (options.showProgressBar) {
      const totalNumRuns =
        options.prompts.length * options.providers.length * (options.vars?.length || 1);
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

    const runEvalOptions: RunEvalOptions[] = [];
    let rowIndex = 0;
    for (const row of vars) {
      let colIndex = 0;

      const prependToPrompt = row.__prefix || options.prompt?.prefix || '';
      const appendToPrompt = row.__suffix || options.prompt?.suffix || '';

      for (const promptContent of options.prompts) {
        for (const provider of options.providers) {
          runEvalOptions.push({
            provider,
            prompt: prependToPrompt + promptContent + appendToPrompt,
            vars: row,
            includeProviderId: options.providers.length > 1,
            rowIndex,
            colIndex,
          });
          colIndex++;
        }
      }
      rowIndex++;
    }

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
            prompt: options.prompt.slice(0, 10),
            vars: Object.entries(options.vars || {})
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
            vars: Object.values(options.vars || {}),
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

export function evaluate(options: EvaluateOptions) {
  const ev = new Evaluator(options);
  return ev.evaluate();
}
