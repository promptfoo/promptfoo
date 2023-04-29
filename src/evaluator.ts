import fs from 'fs';

import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import nunjucks from 'nunjucks';

import logger from './logger.js';

import { EvaluationOptions, EvaluateResult, CsvRow, ApiProvider } from './types.js';

export async function evaluate(
  options: EvaluationOptions,
  provider: ApiProvider,
): Promise<EvaluateResult> {
  const rows: CsvRow[] = options.vars
    ? parse(fs.readFileSync(options.vars, 'utf-8'), { columns: true })
    : [];
  const results: CsvRow[] = [];

  const stats = {
    successes: 0,
    failures: 0,
    tokenUsage: {
      total: 0,
      prompt: 0,
      completion: 0,
    },
  };

  for (const promptPath of options.prompts) {
    const runPrompt = async (vars: Record<string, string> = {}) => {
      const prompt = fs.readFileSync(promptPath, 'utf-8');
      const renderedPrompt = nunjucks.renderString(prompt, vars);

      try {
        const result = await provider.callApi(renderedPrompt);

        results.push({
          Prompt: prompt,
          Output: result.output,
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

    if (rows.length === 0) {
      await runPrompt();
    } else {
      for (const row of rows) {
        await runPrompt(row);
      }
    }
  }

  const csvOutput = stringify(results, { header: true });

  logger.info(`Writing output to ${options.output}`);
  fs.writeFileSync(options.output, csvOutput);

  return stats;
}
