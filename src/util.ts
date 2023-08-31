import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import invariant from 'tiny-invariant';
import $RefParser from '@apidevtools/json-schema-ref-parser';
import fetch from 'node-fetch';
import yaml from 'js-yaml';
import nunjucks from 'nunjucks';
import { globSync } from 'glob';
import { parse as parsePath } from 'path';
import { parse as parseCsv } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

import logger from './logger';
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
  ProviderOptionsMap,
  TestSuite,
  ProviderOptions,
} from './types';

export function readProviderPromptMap(
  config: Partial<UnifiedConfig>,
  parsedPrompts: Prompt[],
): TestSuite['providerPromptMap'] {
  const ret: Record<string, string[]> = {};

  if (!config.providers) {
    return ret;
  }

  const allPrompts = [];
  for (const prompt of parsedPrompts) {
    allPrompts.push(prompt.display);
  }

  if (typeof config.providers === 'string') {
    return { [config.providers]: allPrompts };
  }

  if (typeof config.providers === 'function') {
    return { 'Custom function': allPrompts };
  }

  for (const provider of config.providers) {
    if (typeof provider === 'object') {
      // It's either a ProviderOptionsMap or a ProviderOptions
      if (provider.id) {
        const rawProvider = provider as ProviderOptions;
        invariant(
          rawProvider.id,
          'You must specify an `id` on the Provider when you override options.prompts',
        );
        ret[rawProvider.id] = rawProvider.prompts || allPrompts;
      } else {
        const rawProvider = provider as ProviderOptionsMap;
        const originalId = Object.keys(rawProvider)[0];
        const providerObject = rawProvider[originalId];
        const id = providerObject.id || originalId;
        ret[id] = rawProvider[originalId].prompts || allPrompts;
      }
    }
  }

  return ret;
}

const PROMPT_DELIMITER = '---';

function parseJson(json: string): any | undefined {
  try {
    return JSON.parse(json);
  } catch (err) {
    return undefined;
  }
}

let globalConfigCache: any = null;

export function resetGlobalConfig(): void {
  globalConfigCache = null;
}

export function readGlobalConfig(): any {
  if (!globalConfigCache) {
    const configDir = getConfigDirectoryPath();
    const configFilePath = path.join(configDir, 'promptfoo.yaml');

    if (fs.existsSync(configFilePath)) {
      globalConfigCache = yaml.load(fs.readFileSync(configFilePath, 'utf-8'));
    } else {
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      globalConfigCache = { hasRun: false };
      fs.writeFileSync(configFilePath, yaml.dump(globalConfigCache));
    }
  }

  return globalConfigCache;
}

export function maybeRecordFirstRun(): boolean {
  // Return true if first run
  try {
    const config = readGlobalConfig();
    if (!config.hasRun) {
      config.hasRun = true;
      fs.writeFileSync(path.join(getConfigDirectoryPath(), 'promptfoo.yaml'), yaml.dump(config));
      return true;
    }
    return false;
  } catch (err) {
    return false;
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

export async function readVarsFiles(
  pathOrGlobs: string | string[],
  basePath: string = '',
): Promise<Record<string, string | string[] | object>> {
  if (typeof pathOrGlobs === 'string') {
    pathOrGlobs = [pathOrGlobs];
  }

  const ret: Record<string, string | string[] | object> = {};
  for (const pathOrGlob of pathOrGlobs) {
    const resolvedPath = path.resolve(basePath, pathOrGlob);
    const paths = globSync(resolvedPath);

    for (const p of paths) {
      const yamlData = yaml.load(fs.readFileSync(p, 'utf-8'));
      Object.assign(ret, yamlData);
    }
  }

  return ret;
}

export async function readTestsFile(varsPath: string, basePath: string = ''): Promise<CsvRow[]> {
  // This function is confusingly named - it reads a CSV, JSON, or YAML file of
  // TESTS or test equivalents.
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
  tests: string | string[] | TestCase[] | undefined,
  basePath: string = '',
): Promise<TestCase[]> {
  const ret: TestCase[] = [];

  const loadTestsFromGlob = async (loadTestsGlob: string) => {
    const resolvedPath = path.resolve(basePath, loadTestsGlob);
    const testFiles = globSync(resolvedPath);
    for (const testFile of testFiles) {
      const testFileContent = yaml.load(fs.readFileSync(testFile, 'utf-8')) as TestCase[];
      for (const testCase of testFileContent) {
        if (typeof testCase.vars === 'string' || Array.isArray(testCase.vars)) {
          const testcaseBasePath = path.dirname(testFile);
          testCase.vars = await readVarsFiles(testCase.vars, testcaseBasePath);
        }
      }
      ret.push(...testFileContent);
    }
  };

  if (typeof tests === 'string') {
    if (tests.endsWith('yaml') || tests.endsWith('yml')) {
      // Load testcase config from yaml
      await loadTestsFromGlob(tests);
    } else {
      // Legacy load CSV
      const vars = await readTestsFile(tests, basePath);
      return vars.map((row, idx) => {
        const test = testCaseFromCsvRow(row);
        test.description = `Row #${idx + 1}`;
        return test;
      });
    }
  } else if (Array.isArray(tests)) {
    for (const maybeTestsGlob of tests) {
      if (typeof maybeTestsGlob === 'string') {
        // Assume it's a filepath
        await loadTestsFromGlob(maybeTestsGlob);
      } else {
        // Assume it's a full test case
        ret.push(maybeTestsGlob);
      }
    }
  }

  // Some validation of the shape of tests
  for (const test of ret) {
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

  return ret;
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
    const htmlOutput = getNunjucksEngine().renderString(template, {
      table,
      results: results.results,
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
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const { signal } = controller;
    options.signal = signal;

    const timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`Request timed out after ${timeout} ms`));
    }, timeout);

    fetch(url, options)
      .then((response) => {
        clearTimeout(timeoutId);
        resolve(response);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
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

const RESULT_HISTORY_LENGTH = parseInt(process.env.RESULT_HISTORY_LENGTH || '', 10) || 50;

export function getConfigDirectoryPath(): string {
  return path.join(os.homedir(), '.promptfoo');
}

export function getLatestResultsPath(): string {
  return path.join(getConfigDirectoryPath(), 'output', 'latest.json');
}

export function writeLatestResults(results: EvaluateSummary, config: Partial<UnifiedConfig>) {
  const resultsDirectory = path.join(getConfigDirectoryPath(), 'output');

  // Replace hyphens with colons (Windows compatibility).
  const timestamp = new Date().toISOString().replace(/:/g, '-');

  const newResultsPath = path.join(resultsDirectory, `eval-${timestamp}.json`);
  const latestResultsPath = getLatestResultsPath();
  try {
    fs.mkdirSync(resultsDirectory, { recursive: true });
    fs.writeFileSync(
      newResultsPath,
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

    // Use copy instead of symlink to avoid issues with Windows permissions.
    try {
      // Backwards compatibility: delete old symlink.
      fs.unlinkSync(latestResultsPath);
    } catch {}
    fs.copyFileSync(newResultsPath, latestResultsPath);

    cleanupOldResults();
  } catch (err) {
    logger.error(`Failed to write latest results to ${newResultsPath}:\n${err}`);
  }
}

export function listPreviousResults(): string[] {
  const directory = path.join(getConfigDirectoryPath(), 'output');
  const files = fs.readdirSync(directory);
  const resultsFiles = files.filter((file) => file.startsWith('eval-') && file.endsWith('.json'));
  const sortedFiles = resultsFiles.sort((a, b) => {
    const statA = fs.statSync(path.join(directory, a));
    const statB = fs.statSync(path.join(directory, b));
    return statA.birthtime.getTime() - statB.birthtime.getTime(); // sort in ascending order
  });
  return sortedFiles;
}

export function cleanupOldResults(remaining = RESULT_HISTORY_LENGTH) {
  const sortedFiles = listPreviousResults();
  for (let i = 0; i < sortedFiles.length - remaining; i++) {
    fs.unlinkSync(path.join(getConfigDirectoryPath(), 'output', sortedFiles[i]));
  }
}

export function readResult(
  name: string,
): { results: EvaluateSummary; config: Partial<UnifiedConfig> } | undefined {
  const resultsDirectory = path.join(getConfigDirectoryPath(), 'output');
  const resultsPath = path.join(resultsDirectory, name);
  try {
    const results = JSON.parse(fs.readFileSync(fs.realpathSync(resultsPath), 'utf-8'));
    return results;
  } catch (err) {
    logger.error(`Failed to read results from ${resultsPath}:\n${err}`);
  }
}

export function readLatestResults():
  | { results: EvaluateSummary; config: Partial<UnifiedConfig> }
  | undefined {
  return JSON.parse(fs.readFileSync(getLatestResultsPath(), 'utf-8'));
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
      if (value.trim() !== '') {
        const { assertionFromString } = require('./assertions');
        asserts.push(assertionFromString(value));
      }
    } else {
      vars[key] = value;
    }
  }

  return {
    vars,
    assert: asserts,
  };
}

export function getNunjucksEngine() {
  nunjucks.configure({
    autoescape: false,
  });
  return nunjucks;
}
