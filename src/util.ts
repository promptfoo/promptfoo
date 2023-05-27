import * as fs from 'fs';
import * as path from 'node:path';
import * as os from 'node:os';

import fetch from 'node-fetch';
import yaml from 'js-yaml';
import nunjucks from 'nunjucks';
import { globSync } from 'glob';
import { parse as parsePath } from 'path';
import { CsvRow } from './types.js';
import { parse as parseCsv } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

import logger from './logger.js';
import { getDirectory } from './esm.js';

import type { RequestInfo, RequestInit, Response } from 'node-fetch';

import type { EvaluateSummary } from './types.js';

const PROMPT_DELIMITER = '---';

function parseJson(json: string): any | undefined {
  try {
    return JSON.parse(json);
  } catch (err) {
    return undefined;
  }
}

export function readPrompts(promptPathsOrGlobs: string[]): string[] {
  const promptPaths = promptPathsOrGlobs.flatMap((pathOrGlob) => globSync(pathOrGlob));
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

export function writeOutput(outputPath: string, summary: EvaluateSummary): void {
  const outputExtension = outputPath.split('.').pop()?.toLowerCase();

  if (outputExtension === 'csv' || outputExtension === 'txt') {
    const csvOutput = stringify([
      [...summary.table.head.prompts, ...summary.table.head.vars],
      ...summary.table.body.map((row) => [...row.outputs, ...row.vars]),
    ]);
    fs.writeFileSync(outputPath, csvOutput);
  } else if (outputExtension === 'json') {
    fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));
  } else if (outputExtension === 'yaml' || outputExtension === 'yml') {
    fs.writeFileSync(outputPath, yaml.dump(summary));
  } else if (outputExtension === 'html') {
    const template = fs.readFileSync(`${getDirectory()}/tableOutput.html`, 'utf-8');
    const table = [
      [...summary.table.head.prompts, ...summary.table.head.vars],
      ...summary.table.body.map((row) => [...row.outputs, ...row.vars]),
    ];
    const htmlOutput = nunjucks.renderString(template, {
      table,
      results: summary.results,
    });
    fs.writeFileSync(outputPath, htmlOutput);
  } else {
    throw new Error('Unsupported output file format. Use CSV, JSON, or YAML.');
  }
}

export function fetchWithTimeout(
  url: RequestInfo,
  options: RequestInit = {},
  timeout: number,
): Promise<Response> {
  return new Promise(async (resolve, reject) => {
    const controller = new AbortController();
    const { signal } = controller;
    options.signal = signal;

    const timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`Request timed out after ${timeout} ms`));
    }, timeout);

    try {
      const response = await fetch(url, options);
      clearTimeout(timeoutId);
      resolve(response);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Fetch request was aborted, no need to reject again
      } else {
        clearTimeout(timeoutId);
        reject(error);
      }
    }
  });
}

export function getConfigDirectoryPath(): string {
  return path.join(os.homedir(), '.promptfoo');
}

export function getLatestResultsPath(): string {
  return path.join(getConfigDirectoryPath(), 'output', 'latest.json');
}

export function writeLatestResults(results: EvaluateSummary) {
  const latestResultsPath = getLatestResultsPath();
  try {
    fs.mkdirSync(path.dirname(latestResultsPath), { recursive: true });
    fs.writeFileSync(latestResultsPath, JSON.stringify(results, null, 2));
    logger.info(`Wrote latest results to ${latestResultsPath}.`);
  } catch (err) {
    logger.error(`Failed to write latest results to ${latestResultsPath}:\n${err}`);
  }
}

export function cosineSimilarity(vecA: number[], vecB: number[]) {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must be of equal length');
  }
  const dotProduct = vecA.reduce((acc, val, idx) => acc + val * vecB[idx], 0);
  const vecAMagnitude = Math.sqrt(vecA.reduce((acc, val) => acc + val * val, 0));
  const vecBMagnitude = Math.sqrt(vecB.reduce((acc, val) => acc + val * val, 0));
  return dotProduct / (vecAMagnitude * vecBMagnitude);
}
