import * as fs from 'fs';
import * as path from 'node:path';
import * as os from 'node:os';

import $RefParser from '@apidevtools/json-schema-ref-parser';
import fetch from 'node-fetch';
import yaml from 'js-yaml';
import nunjucks from 'nunjucks';
import { globSync } from 'glob';
import { parse as parsePath } from 'path';
import { parse as parseCsv } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

import logger from './logger';
import { assertionFromString } from './assertions';
import { getDirectory } from './esm';

import type { RequestInfo, RequestInit, Response } from 'node-fetch';

import type {
  Assertion,
  CsvRow,
  EvaluateSummary,
  EvaluateTableOutput,
  UnifiedConfig,
  TestCase,
  Prompt,
} from './types';

const PROMPT_DELIMITER = '---';

function parseJson(json: string): any | undefined {
  try {
    return JSON.parse(json);
  } catch (err) {
    return undefined;
  }
}

export async function maybeReadConfig(configPath: string): Promise<UnifiedConfig | undefined> {
  if (!fs.existsSync(configPath)) {
    return undefined;
  }
  return readConfig(configPath);
}

export async function readConfig(configPath: string): Promise<UnifiedConfig> {
  const ext = path.parse(configPath).ext;
  switch (ext) {
    case '.json':
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content) as UnifiedConfig;
    case '.js':
      return require(configPath) as UnifiedConfig;
    case '.yaml':
    case '.yml':
      let ret = yaml.load(fs.readFileSync(configPath, 'utf-8')) as UnifiedConfig;
      ret = (await $RefParser.dereference(ret)) as UnifiedConfig;
      return ret;
    default:
      throw new Error(`Unsupported configuration file format: ${ext}`);
  }
}

enum PromptInputType {
  STRING = 1,
  ARRAY = 2,
  NAMED = 3,
}

export function readPrompts(
  promptPathOrGlobs: string | string[] | Record<string, string>,
  basePath: string = '',
): Prompt[] {
  let promptPaths: string[] = [];
  let promptContents: Prompt[] = [];

  let inputType: PromptInputType | undefined;
  let resolvedPath: string | undefined;
  const resolvedPathToDisplay = new Map<string, string>();
  if (typeof promptPathOrGlobs === 'string') {
    resolvedPath = path.resolve(basePath, promptPathOrGlobs);
    promptPaths = [resolvedPath];
    resolvedPathToDisplay.set(resolvedPath, promptPathOrGlobs);
    inputType = PromptInputType.STRING;
  } else if (Array.isArray(promptPathOrGlobs)) {
    promptPaths = promptPathOrGlobs.flatMap((pathOrGlob) => {
      resolvedPath = path.resolve(basePath, pathOrGlob);
      resolvedPathToDisplay.set(resolvedPath, pathOrGlob);
      return globSync(resolvedPath);
    });
    inputType = PromptInputType.ARRAY;
  } else if (typeof promptPathOrGlobs === 'object') {
    promptPaths = Object.keys(promptPathOrGlobs).map((key) => {
      resolvedPath = path.resolve(basePath, key);
      resolvedPathToDisplay.set(resolvedPath, promptPathOrGlobs[key]);
      return resolvedPath;
    });
    inputType = PromptInputType.NAMED;
  }

  for (const promptPath of promptPaths) {
    const stat = fs.statSync(promptPath);
    if (stat.isDirectory()) {
      // FIXME(ian): Make directory handling share logic with file handling.
      const filesInDirectory = fs.readdirSync(promptPath);
      const fileContents = filesInDirectory.map((fileName) => {
        const joinedPath = path.join(promptPath, fileName);
        resolvedPath = path.resolve(basePath, joinedPath);
        resolvedPathToDisplay.set(resolvedPath, joinedPath);
        return fs.readFileSync(resolvedPath, 'utf-8');
      });
      promptContents.push(...fileContents.map((content) => ({ raw: content, display: content })));
    } else {
      const fileContent = fs.readFileSync(promptPath, 'utf-8');

      let display: string | undefined;
      if (inputType === PromptInputType.NAMED) {
        display = resolvedPathToDisplay.get(promptPath) || promptPath;
      } else {
        display = fileContent.length > 200 ? promptPath : fileContent;

        const ext = path.parse(promptPath).ext;
        if (ext === '.jsonl') {
          // Special case for JSONL file
          const jsonLines = fileContent.split(/\r?\n/).filter((line) => line.length > 0);
          for (const json of jsonLines) {
            promptContents.push({ raw: json, display: json });
          }
          continue;
        }
      }
      promptContents.push({ raw: fileContent, display });
    }
  }

  if (promptContents.length === 1 && inputType !== PromptInputType.NAMED) {
    const content = promptContents[0].raw;
    promptContents = content
      .split(PROMPT_DELIMITER)
      .map((p) => ({ raw: p.trim(), display: p.trim() }));
  }
  if (promptContents.length === 0) {
    throw new Error(`There are no prompts in ${JSON.stringify(promptPathOrGlobs)}`);
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

export async function readVars(varsPath: string, basePath: string = ''): Promise<CsvRow[]> {
  const resolvedVarsPath = path.resolve(basePath, varsPath);
  const fileExtension = parsePath(varsPath).ext.slice(1);
  let rows: CsvRow[] = [];

  if (fileExtension === 'csv') {
    if (varsPath.startsWith('https://docs.google.com/spreadsheets/')) {
      const csvData = await fetchCsvFromGoogleSheet(varsPath);
      rows = parseCsv(csvData, { columns: true });
    } else {
      rows = parseCsv(fs.readFileSync(resolvedVarsPath, 'utf-8'), { columns: true });
    }
  } else if (fileExtension === 'json') {
    rows = parseJson(fs.readFileSync(resolvedVarsPath, 'utf-8'));
  } else if (fileExtension === 'yaml' || fileExtension === 'yml') {
    rows = yaml.load(fs.readFileSync(resolvedVarsPath, 'utf-8')) as unknown as any;
  }

  return rows;
}

export async function readTests(
  tests: string | TestCase[] | undefined,
  basePath: string = '',
): Promise<TestCase[]> {
  if (!tests) {
    return [];
  }

  if (typeof tests === 'string') {
    // It's a filepath, load from CSV
    const vars = await readVars(tests, basePath);
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

export function writeOutput(
  outputPath: string,
  results: EvaluateSummary,
  config: Partial<UnifiedConfig>,
  shareableUrl: string | null,
): void {
  const outputExtension = outputPath.split('.').pop()?.toLowerCase();

  const outputToSimpleString = (output: EvaluateTableOutput) =>
    `${output.pass ? '[PASS]' : '[FAIL]'} (${output.score.toFixed(2)}) ${output.text}`;

  if (outputExtension === 'csv' || outputExtension === 'txt') {
    const csvOutput = stringify([
      [...results.table.head.prompts, ...results.table.head.vars],
      ...results.table.body.map((row) => [...row.outputs.map(outputToSimpleString), ...row.vars]),
    ]);
    fs.writeFileSync(outputPath, csvOutput);
  } else if (outputExtension === 'json') {
    fs.writeFileSync(outputPath, JSON.stringify({ results, config, shareableUrl }, null, 2));
  } else if (outputExtension === 'yaml' || outputExtension === 'yml') {
    fs.writeFileSync(outputPath, yaml.dump({ results, config, shareableUrl }));
  } else if (outputExtension === 'html') {
    const template = fs.readFileSync(`${getDirectory()}/tableOutput.html`, 'utf-8');
    const table = [
      [...results.table.head.prompts, ...results.table.head.vars],
      ...results.table.body.map((row) => [...row.outputs.map(outputToSimpleString), ...row.vars]),
    ];
    const htmlOutput = nunjucks.renderString(template, {
      table,
      results: results.results,
    });
    fs.writeFileSync(outputPath, htmlOutput);
  } else {
    throw new Error('Unsupported output file format. Use CSV, JSON, or YAML.');
  }
}

export async function fetchWithTimeout(
  url: RequestInfo,
  options: RequestInit = {},
  timeout: number,
): Promise<Response> {
  const controller = new AbortController();
  const { signal } = controller;
  options.signal = signal;

  const timeoutId = setTimeout(() => {
    controller.abort();
    throw new Error(`Request timed out after ${timeout} ms`);
  }, timeout);

  try {
    const response = await fetch(url, options);
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export async function fetchWithRetries(
  url: RequestInfo,
  options: RequestInit = {},
  timeout: number,
  retries: number = 3,
): Promise<Response> {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      return await fetchWithTimeout(url, options, timeout);
    } catch (error) {
      lastError = error;
      const waitTime = Math.pow(2, i) * 1000; // Exponential backoff
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }
  throw new Error(`Request failed after ${retries} retries: ${(lastError as Error).message}`);
}

export function getConfigDirectoryPath(): string {
  return path.join(os.homedir(), '.promptfoo');
}

export function getLatestResultsPath(): string {
  return path.join(getConfigDirectoryPath(), 'output', 'latest.json');
}

export function writeLatestResults(results: EvaluateSummary, config: Partial<UnifiedConfig>) {
  const latestResultsPath = getLatestResultsPath();
  try {
    fs.mkdirSync(path.dirname(latestResultsPath), { recursive: true });
    fs.writeFileSync(
      latestResultsPath,
      JSON.stringify(
        {
          version: 1,
          config,
          results,
        },
        null,
        2,
      ),
    );
  } catch (err) {
    logger.error(`Failed to write latest results to ${latestResultsPath}:\n${err}`);
  }
}

export function readLatestResults():
  | { results: EvaluateSummary; config: Partial<UnifiedConfig> }
  | undefined {
  const latestResultsPath = getLatestResultsPath();
  try {
    const latestResults = JSON.parse(fs.readFileSync(latestResultsPath, 'utf-8'));
    return latestResults;
  } catch (err) {
    logger.error(`Failed to read latest results from ${latestResultsPath}:\n${err}`);
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
