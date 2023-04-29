import fs from 'fs';

import yaml from 'js-yaml';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import nunjucks from 'nunjucks';

import logger from './logger.js';

import { EvaluationOptions, EvaluateResult, CsvRow, ApiProvider } from './types.js';

const PROMPT_DELIMITER = '---';

function parseJson(json: string): any | undefined {
  try {
    return JSON.parse(json);
  } catch (err) {
    return undefined;
  }
}

export async function evaluate(
  options: EvaluationOptions,
  provider: ApiProvider,
): Promise<EvaluateResult> {
  const fileExtension = options.vars?.split('.').pop()?.toLowerCase();

  let rows: CsvRow[] = [];
  if (options.vars) {
    if (fileExtension === 'csv') {
      rows = parse(fs.readFileSync(options.vars, 'utf-8'), { columns: true });
    } else if (fileExtension === 'json') {
      rows = parseJson(fs.readFileSync(options.vars, 'utf-8'));
    } else if (fileExtension === 'yaml' || fileExtension === 'yml') {
      rows = yaml.load(fs.readFileSync(options.vars, 'utf-8')) as unknown as any;
    }
  }

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
    const fileContent = fs.readFileSync(promptPath, 'utf-8');
    const prompts = options.prompts.length === 1 ? fileContent.split(PROMPT_DELIMITER).map(p => p.trim()) : [fileContent];

    const runPrompt = async (prompt: string, vars: Record<string, string> = {}) => {
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

    for (const prompt of prompts) {
      if (rows.length === 0) {
        await runPrompt(prompt);
      } else {
        for (const row of rows) {
          await runPrompt(prompt, row);
        }
      }
    }
  }

  const outputExtension = options.output.split('.').pop()?.toLowerCase();

  logger.info(`Writing output to ${options.output}`);
  if (outputExtension === 'csv') {
    const csvOutput = stringify(results, { header: true });
    fs.writeFileSync(options.output, csvOutput);
  } else if (outputExtension === 'json') {
    fs.writeFileSync(options.output, JSON.stringify(results, null, 2));
  } else if (outputExtension === 'yaml' || outputExtension === 'yml') {
    fs.writeFileSync(options.output, yaml.dump(results));
  } else {
    throw new Error('Unsupported output file format. Use CSV, JSON, or YAML.');
  }

  return stats;
}
