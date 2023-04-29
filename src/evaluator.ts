import nunjucks from 'nunjucks';

import { EvaluateOptions, EvaluateSummary, EvaluateResult, ApiProvider } from './types.js';

export async function evaluate(
  options: EvaluateOptions,
  provider: ApiProvider,
): Promise<EvaluateSummary> {
  const results: EvaluateResult[] = [];

  const stats = {
    successes: 0,
    failures: 0,
    tokenUsage: {
      total: 0,
      prompt: 0,
      completion: 0,
    },
  };

  const runEval = async (prompt: string, vars: Record<string, string> = {}) => {
    const renderedPrompt = nunjucks.renderString(prompt, vars);

    try {
      const result = await provider.callApi(renderedPrompt);

      results.push({
        prompt,
        output: result.output,
        ...vars,
      });

      stats.successes++;
      stats.tokenUsage.total += result.tokenUsage?.total || 0;
      stats.tokenUsage.prompt += result.tokenUsage?.prompt || 0;
      stats.tokenUsage.completion += result.tokenUsage?.completion || 0;
    } catch (err) {
      stats.failures++;
    }
  };

  if (options.vars) {
    for (const row of options.vars) {
      for (const promptContent of options.prompts) {
        await runEval(promptContent, row);
      }
    }
  } else {
    for (const promptContent of options.prompts) {
      await runEval(promptContent, {});
    }
  }

  return { results, stats };
}
