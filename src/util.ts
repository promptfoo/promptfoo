import * as fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import yaml from 'js-yaml';
import nunjucks from 'nunjucks';
import { parse as parsePath } from 'path';
import { CsvRow } from './types.js';
import { parse as parseCsv } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

import type { EvaluateResult } from './types.js';

const PROMPT_DELIMITER = '---';

function parseJson(json: string): any | undefined {
  try {
    return JSON.parse(json);
  } catch (err) {
    return undefined;
  }
}

export function readPrompts(promptPaths: string[]): string[] {
  let promptContents = promptPaths.map((path) => fs.readFileSync(path, 'utf-8'));
  if (promptContents.length === 1) {
    promptContents = promptContents[0].split(PROMPT_DELIMITER).map((p) => p.trim());
  }
  return promptContents;
}

export function readVars(varsPath: string): CsvRow[] {
  const fileExtension = parsePath(varsPath).ext.slice(1);
  let rows: CsvRow[] = [];

  if (fileExtension === 'csv') {
    rows = parseCsv(fs.readFileSync(varsPath, 'utf-8'), { columns: true });
  } else if (fileExtension === 'json') {
    rows = parseJson(fs.readFileSync(varsPath, 'utf-8'));
  } else if (fileExtension === 'yaml' || fileExtension === 'yml') {
    rows = yaml.load(fs.readFileSync(varsPath, 'utf-8')) as unknown as any;
  }

  return rows;
}

export function writeOutput(outputPath: string, results: EvaluateResult[], table: string[][]): void {
  const outputExtension = outputPath.split('.').pop()?.toLowerCase();

  if (outputExtension === 'csv') {
    const csvOutput = stringify(
      results.map((row) => {
        const { prompt, output, ...rest } = row;
        return { ...rest, Prompt: prompt, Output: output };
      }),
      { header: true },
    );
    fs.writeFileSync(outputPath, csvOutput);
  } else if (outputExtension === 'json') {
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  } else if (outputExtension === 'yaml' || outputExtension === 'yml') {
    fs.writeFileSync(outputPath, yaml.dump(results));
  } else if (outputExtension === 'html') {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const template = fs.readFileSync(`${__dirname}/tableOutput.html`, 'utf-8');
    const htmlOutput = nunjucks.renderString(template, { table, results });
    fs.writeFileSync(outputPath, htmlOutput);
  } else {
    throw new Error('Unsupported output file format. Use CSV, JSON, or YAML.');
  }
}
