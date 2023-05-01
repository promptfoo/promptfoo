import nunjucks from 'nunjucks';

import { EvaluateOptions, EvaluateSummary, EvaluateResult, ApiProvider } from './types.js';

interface RunEvalOptions {
  provider: ApiProvider;
  prompt: string;
  vars?: Record<string, string>;
  includeProviderId?: boolean;
}

interface PromptOptions {
  content: string;
  display: string;
}

export async function evaluate(options: EvaluateOptions): Promise<EvaluateSummary> {
  const prompts: PromptOptions[] = [];
  const results: EvaluateResult[] = [];

  for (const promptContent of options.prompts) {
    for (const provider of options.providers) {
      prompts.push({
        content: promptContent,
        display:
          options.providers.length > 1 ? `[${provider.id()}] ${promptContent}` : promptContent,
      });
    }
  }

  const table: string[][] = [
    [...prompts.map((p) => p.display), ...Object.keys(options.vars?.[0] || {})],
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

  const runEval = async ({
    provider,
    prompt,
    vars,
    includeProviderId,
  }: RunEvalOptions): Promise<string> => {
    vars = vars || {};
    const renderedPrompt = nunjucks.renderString(prompt, vars);

    try {
      const result = await provider.callApi(renderedPrompt);
      const row = {
        // Note that we're using original prompt, not renderedPrompt
        prompt: includeProviderId ? `[${provider.id()}] ${prompt}` : prompt,
        output: result.output,
        vars,
      };
      results.push(row);

      stats.successes++;
      stats.tokenUsage.total += result.tokenUsage?.total || 0;
      stats.tokenUsage.prompt += result.tokenUsage?.prompt || 0;
      stats.tokenUsage.completion += result.tokenUsage?.completion || 0;
      return result.output;
    } catch (err) {
      stats.failures++;
      return String(err);
    }
  };

  let progressbar;
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

  const vars = options.vars && options.vars.length > 0 ? options.vars : [{}];
  for (const row of vars) {
    let outputs: string[] = [];
    for (const promptContent of options.prompts) {
      for (const provider of options.providers) {
        const output = await runEval({
          provider,
          prompt: promptContent,
          vars: row,
          includeProviderId: options.providers.length > 1,
        });
        outputs.push(output);
        if (progressbar) {
          progressbar.increment({
            provider: provider.id(),
            prompt: promptContent.slice(0, 10),
            vars: Object.entries(row)
              .map(([k, v]) => `${k}=${v}`)
              .join(' ')
              .slice(0, 10),
          });
        }
      }
    }

    // Set up table headers: Prompt 1, Prompt 2, ..., Prompt N, Var 1 name, Var 2 name, ..., Var N name
    // And then table rows: Output 1, Output 2, ..., Output N, Var 1 value, Var 2 value, ..., Var N value
    table.push([...outputs, ...Object.values(row)]);
  }

  if (progressbar) {
    progressbar.stop();
  }

  return { results, stats, table };
}
