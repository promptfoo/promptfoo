import * as fs from 'fs';
import * as path from 'node:path';
import * as os from 'node:os';

import fetch from 'node-fetch';
import yaml from 'js-yaml';
import nunjucks from 'nunjucks';
import { globSync } from 'glob';
import { parse as parsePath } from 'path';
import { parse as parseCsv } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

import logger from './logger.js';
import { getDirectory } from './esm.js';

import type { RequestInfo, RequestInit, Response } from 'node-fetch';

import type { Assertion, CsvRow, EvaluateSummary, UnifiedConfig, TestCase } from './types.js';
import { assertionFromString } from './assertions.js';

const PROMPT_DELIMITER = '---';

function parseJson(json: string): any | undefined {
  try {
    return JSON.parse(json);
  } catch (err) {
    return undefined;
  }
}

export function maybeReadConfig(configPath: string): UnifiedConfig | undefined {
  if (!fs.existsSync(configPath)) {
    return undefined;
  }
  return readConfig(configPath);
}

export function readConfig(configPath: string): UnifiedConfig {
  const ext = path.parse(configPath).ext;
  switch (ext) {
    case '.json':
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content) as UnifiedConfig;
    case '.js':
      return require(configPath) as UnifiedConfig;
    case '.yaml':
      return yaml.load(fs.readFileSync(configPath, 'utf-8')) as UnifiedConfig;
    default:
      throw new Error(`Unsupported configuration file format: ${ext}`);
  }
}

export function readPrompts(promptPathsOrGlobs: string | string[]): string[] {
  promptPathsOrGlobs =
    typeof promptPathsOrGlobs === 'string' ? [promptPathsOrGlobs] : promptPathsOrGlobs;
  const promptPaths = promptPathsOrGlobs.flatMap((pathOrGlob) => globSync(pathOrGlob));
  let promptContents: string[] = [];

  for (const promptPath of promptPaths) {
    const stat = fs.statSync(promptPath);
    if (stat.isDirectory()) {
      const filesInDirectory = fs.readdirSync(promptPath);
      const fileContents = filesInDirectory.map((fileName) =>
        fs.readFileSync(path.join(promptPath, fileName), 'utf-8'),
      );
      promptContents.push(...fileContents);
    } else {
      const fileContent = fs.readFileSync(promptPath, 'utf-8');
      promptContents.push(fileContent);
    }
  }

  if (promptContents.length === 1) {
    promptContents = promptContents[0].split(PROMPT_DELIMITER).map((p) => p.trim());
  }
  if (promptContents.length === 0) {
    throw new Error(`There are no prompts in ${promptPathsOrGlobs.join(', ')}`);
  }
  return promptContents;
}

export async function fetchCsvFromGoogleSheet(url: string): Promise<string> {
  const csvUrl = url.replace(/\/edit.*$/, '/export?format=csv');
  const response = await fetch(csvUrl);
  if (response.status !== 200) {
    throw new Error(`Failed to fetch CSV from Google Sheets URL: ${url}`);
  }
  const csvData = await response.text();
  return csvData;
}

export async function readVars(varsPath: string): Promise<CsvRow[]> {
  const fileExtension = parsePath(varsPath).ext.slice(1);
  let rows: CsvRow[] = [];

  if (fileExtension === 'csv') {
    if (varsPath.startsWith('https://docs.google.com/spreadsheets/')) {
      const csvData = await fetchCsvFromGoogleSheet(varsPath);
      rows = parseCsv(csvData, { columns: true });
    } else {
      rows = parseCsv(fs.readFileSync(varsPath, 'utf-8'), { columns: true });
    }
  } else if (fileExtension === 'json') {
    rows = parseJson(fs.readFileSync(varsPath, 'utf-8'));
  } else if (fileExtension === 'yaml' || fileExtension === 'yml') {
    rows = yaml.load(fs.readFileSync(varsPath, 'utf-8')) as unknown as any;
  }

  return rows;
}

export async function readTests(tests: string | TestCase[] | undefined): Promise<TestCase[]> {
  if (!tests) {
    return [];
  }

  if (typeof tests === 'string') {
    // It's a filepath, load from CSV
    const vars = await readVars(tests);
    return vars.map((row, idx) => {
      const test = testCaseFromCsvRow(row);
      test.description = `Row #${idx + 1}`;
      return test;
    });
  }

  // Some validation of the shape of tests
  for (const test of tests) {
    if (!test.assert && !test.vars) {
      throw new Error(
        `Test case must have either "assert" or "vars" property. Instead got ${JSON.stringify(
          test,
          null,
          2,
        )}`,
      );
    }
  }

  return tests;
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

export function testCaseFromCsvRow(row: CsvRow): TestCase {
  const vars: Record<string, string> = {};
  const asserts: Assertion[] = [];
  for (const [key, value] of Object.entries(row)) {
    if (key === '__expected') {
      asserts.push(assertionFromString(value));
    } else {
      vars[key] = value;
    }
  }

  return {
    vars,
    assert: asserts,
  };
}
