import nunjucks from 'nunjucks';

import { EvaluateOptions, EvaluateSummary, EvaluateResult, ApiProvider } from './types.js';

export async function evaluate(
  options: EvaluateOptions,
  provider: ApiProvider,
): Promise<EvaluateSummary> {
  const results: EvaluateResult[] = [];
  const table: string[][] = [[...options.prompts, ...Object.keys(options.vars?.[0] || {})]];

  const stats = {
    successes: 0,
    failures: 0,
    tokenUsage: {
      total: 0,
      prompt: 0,
      completion: 0,
    },
  };

  const runEval = async (prompt: string, vars: Record<string, string> = {}): Promise<string> => {
    const renderedPrompt = nunjucks.renderString(prompt, vars);

    try {
      const result = await provider.callApi(renderedPrompt);
      const row = {
        prompt,
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

  if (options.vars) {
    for (const row of options.vars) {
      let outputs: string[] = [];
      for (const promptContent of options.prompts) {
        const output = await runEval(promptContent, row);
        outputs.push(output);
      }

      // Set up table headers: Prompt 1, Prompt 2, ..., Prompt N, Var 1 name, Var 2 name, ..., Var N name
      // And then table rows: Output 1, Output 2, ..., Output N, Var 1 value, Var 2 value, ..., Var N value
      table.push([...outputs, ...Object.values(row)]);
    }
  } else {
    for (const promptContent of options.prompts) {
      await runEval(promptContent, {});
    }
    table.push([...options.prompts]);
  }

  return { results, stats, table };
}
