import async from 'async';
import nunjucks from 'nunjucks';

import { DEFAULT_GRADING_PROMPT } from './prompts.js';

import type { SingleBar } from 'cli-progress';
import type {
  ApiProvider,
  EvaluateOptions,
  EvaluateResult,
  EvaluateStats,
  EvaluateSummary,
  EvaluateTable,
  Prompt,
  TokenUsage,
} from './types.js';

interface RunEvalOptions {
  provider: ApiProvider;
  prompt: string;
  vars?: Record<string, string>;
  includeProviderId?: boolean;

  rowIndex: number;
  colIndex: number;
}

interface GradingResult {
  pass: boolean;
  reason: string;
  tokensUsed: TokenUsage;
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
      },
    };
  }

  async gradeOutput(expected: string, output: string): Promise<GradingResult> {
    const { grading } = this.options;

    if (!grading) {
      throw new Error(
        'Cannot grade output without grading config. Specify --grader option or grading config.',
      );
    }

    const prompt = nunjucks.renderString(grading.prompt || DEFAULT_GRADING_PROMPT, {
      content: output,
      rubric: expected,
    });

    const resp = await grading.provider.callApi(prompt);
    if (resp.error || !resp.output) {
      return {
        pass: false,
        reason: resp.error || 'No output',
        tokensUsed: {
          total: resp.tokenUsage?.total || 0,
          prompt: resp.tokenUsage?.prompt || 0,
          completion: resp.tokenUsage?.completion || 0,
        },
      };
    }

    try {
      const parsed = JSON.parse(resp.output) as GradingResult;
      parsed.tokensUsed = {
        total: resp.tokenUsage?.total || 0,
        prompt: resp.tokenUsage?.prompt || 0,
        completion: resp.tokenUsage?.completion || 0,
      };
      return parsed;
    } catch (err) {
      return {
        pass: false,
        reason: `Output is not valid JSON: ${resp.output}`,
        tokensUsed: {
          total: resp.tokenUsage?.total || 0,
          prompt: resp.tokenUsage?.prompt || 0,
          completion: resp.tokenUsage?.completion || 0,
        },
      };
    }
  }

  async checkExpectedValue(
    expected: string,
    output: string,
  ): Promise<{ pass: boolean; reason?: string }> {
    if (expected.startsWith('eval:')) {
      const evalBody = expected.slice(5);
      const evalFunction = new Function('output', `return ${evalBody}`);
      return { pass: evalFunction(output) };
    } else if (expected.startsWith('grade:')) {
      const gradingResult = await this.gradeOutput(expected.slice(6), output);
      return {
        pass: gradingResult.pass,
        reason: gradingResult.reason,
      };
    } else {
      const pass = expected === output;
      return {
        pass,
        reason: pass ? undefined : `Expected: ${expected}, Output: ${output}`,
      };
    }
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
          ? await this.checkExpectedValue(vars.__expected, response.output)
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
    const varsWithExpectedKeyRemoved = vars.map((v) => {
      const ret = { ...v };
      delete ret.__expected;
      return ret;
    });
    const isTest = vars[0].__expected;
    const table: EvaluateTable = {
      head: {
        prompts: prompts.map((p) => p.display),
        vars: Object.keys(varsWithExpectedKeyRemoved[0]),
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
      for (const promptContent of options.prompts) {
        for (const provider of options.providers) {
          runEvalOptions.push({
            provider,
            prompt: promptContent,
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
          resultText = `[FAIL] ${row.error}\n---\n${row.response?.output || row.error || ''}`;
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
