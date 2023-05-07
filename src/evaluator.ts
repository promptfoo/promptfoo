import async from 'async';
import nunjucks from 'nunjucks';

import { DEFAULT_GRADING_PROMPT } from './prompts.js';

import type { SingleBar } from 'cli-progress';
import type {
  EvaluateOptions,
  EvaluateSummary,
  EvaluateResult,
  ApiProvider,
  Prompt,
  GradingConfig,
} from './types.js';

interface RunEvalOptions {
  provider: ApiProvider;
  prompt: string;
  vars?: Record<string, string>;
  includeProviderId?: boolean;
  grading?: GradingConfig;
}

const DEFAULT_MAX_CONCURRENCY = 4;

interface GradingResult {
  pass: boolean;
  reason: string;
}

async function gradeOutput(
  expected: string,
  output: string,
  grading?: GradingConfig,
): Promise<GradingResult> {
  if (!grading) {
    throw new Error('Cannot grade output without grading config. Specify --grader option or grading config.');
  }

  const prompt = nunjucks.renderString(grading.prompt || DEFAULT_GRADING_PROMPT, {
    content: output,
    rubric: expected,
  });

  const resp = await grading.provider.callApi(prompt);
  // TODO(ian): Return tokens used
  if (resp.error || !resp.output) {
    return {
      pass: false,
      reason: resp.error || 'No output',
    };
  }

  try {
    const parsed = JSON.parse(resp.output) as GradingResult;
    return parsed;
  } catch (err) {
    return {
      pass: false,
      reason: `Output is not valid JSON: ${resp.output}`,
    };
  }
}

async function checkExpectedValue(
  expected: string,
  output: string,
  grading?: GradingConfig,
): Promise<boolean> {
  if (expected.startsWith('eval:')) {
    const evalBody = expected.slice(5);
    const evalFunction = new Function('output', `return ${evalBody}`);
    return evalFunction(output);
  } else if (expected.startsWith('grade:')) {
    return (await gradeOutput(expected.slice(6), output, grading)).pass;
  } else {
    return expected === output;
  }
}

async function runEval({
  provider,
  prompt,
  vars,
  includeProviderId,
  grading,
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
      const matchesExpected = vars.__expected
        ? await checkExpectedValue(vars.__expected, response.output, grading)
        : true;
      if (!matchesExpected) {
        ret.error = `Expected: ${vars.__expected}`;
      }
      ret.success = matchesExpected;
    } else {
      ret.success = false;
      ret.error = 'No output';
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

export async function evaluate(options: EvaluateOptions): Promise<EvaluateSummary> {
  const prompts: Prompt[] = [];
  const results: EvaluateResult[] = [];

  for (const promptContent of options.prompts) {
    for (const provider of options.providers) {
      prompts.push({
        raw: promptContent,
        display:
          options.providers.length > 1 ? `[${provider.id()}] ${promptContent}` : promptContent,
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
  const table: string[][] = [
    [...prompts.map((p) => p.display), ...Object.keys(varsWithExpectedKeyRemoved[0])],
  ];

  const stats = {
    successes: 0,
    failures: 0,
    tokenUsage: {
      total: 0,
      prompt: 0,
      completion: 0,
    },
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
  for (const row of vars) {
    for (const promptContent of options.prompts) {
      for (const provider of options.providers) {
        runEvalOptions.push({
          provider,
          prompt: promptContent,
          vars: row,
          includeProviderId: options.providers.length > 1,
          grading: options.grading,
        });
      }
    }
  }

  const combinedOutputs: string[][] = new Array(vars.length).fill(null).map(() => []);
  await async.forEachOfLimit(
    runEvalOptions,
    options.maxConcurrency || DEFAULT_MAX_CONCURRENCY,
    async (options: RunEvalOptions, index: number | string) => {
      const row = await runEval(options);
      results[index as number] = row;
      if (row.error) {
        stats.failures++;
      } else {
        if (row.success) {
          stats.successes++;
        } else {
          stats.failures++;
        }
        stats.tokenUsage.total += row.response?.tokenUsage?.total || 0;
        stats.tokenUsage.prompt += row.response?.tokenUsage?.prompt || 0;
        stats.tokenUsage.completion += row.response?.tokenUsage?.completion || 0;
      }

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
      const combinedOutputIndex = Math.floor(index / prompts.length);
      combinedOutputs[combinedOutputIndex].push(row.response?.output || row.error || '');
    },
  );

  if (progressbar) {
    progressbar.stop();
  }

  if (isTest) {
    // Iterate through each combined output
    combinedOutputs.forEach((output, index) => {
      // Create a new array to store the modified output with [PASS] or [FAIL] prepended
      const modifiedOutput: string[] = [];

      // Iterate through each output value and prepend [PASS] or [FAIL] based on the success status
      output.forEach((o, outputIndex) => {
        const resultIndex = index * prompts.length + outputIndex;
        const result = results[resultIndex];
        // TODO(ian): sometimes output and result.error can be identical (in the case of exception)
        const resultStatus = result.success ? `[PASS] ${o}` : `[FAIL] ${o}\n---\n${result.error}`;
        modifiedOutput.push(resultStatus);
      });

      // Add the modified output and the corresponding values from varsWithExpectedKeyRemoved to the table
      const tableRow = [...modifiedOutput, ...Object.values(varsWithExpectedKeyRemoved[index])];
      table.push(tableRow);
    });
  } else {
    table.push(
      ...combinedOutputs.map((output, index) => [...output, ...Object.values(vars[index])]),
    );
  }

  return { results, stats, table };
}
