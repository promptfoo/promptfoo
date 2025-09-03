import * as fs from 'fs';
import * as path from 'path';

import { stringify } from 'csv-stringify/sync';
import dedent from 'dedent';
import dotenv from 'dotenv';
import deepEqual from 'fast-deep-equal';
import { XMLBuilder } from 'fast-xml-parser';
import { globSync } from 'glob';
import yaml from 'js-yaml';
import * as os from 'os';
import { TERMINAL_MAX_WIDTH, VERSION } from '../constants';
import { getEnvBool, getEnvString } from '../envars';
import { getDirectory, importModule } from '../esm';
import { writeCsvToGoogleSheet } from '../googleSheets';
import logger from '../logger';
import {
  type CsvRow,
  type EvaluateResult,
  type EvaluateTableOutput,
  isApiProvider,
  isProviderOptions,
  type NunjucksFilterMap,
  type OutputFile,
  OutputFileExtension,
  ResultFailureReason,
  type TestCase,
} from '../types';
import invariant from '../util/invariant';
import { convertTestResultsToTableRow } from './exportToFile';
import { getHeaderForTable } from './exportToFile/getHeaderForTable';
import { maybeLoadFromExternalFile } from './file';
import { isJavascriptFile } from './fileExtensions';
import { getNunjucksEngine } from './templates';

import type Eval from '../models/eval';
import type EvalResult from '../models/evalResult';
import type { Vars } from '../types';

const outputToSimpleString = (output: EvaluateTableOutput) => {
  const passFailText = output.pass
    ? '[PASS]'
    : output.failureReason === ResultFailureReason.ASSERT
      ? '[FAIL]'
      : '[ERROR]';
  const namedScoresText = Object.entries(output.namedScores)
    .map(([name, value]) => `${name}: ${value?.toFixed(2)}`)
    .join(', ');
  const scoreText =
    namedScoresText.length > 0
      ? `(${output.score?.toFixed(2)}, ${namedScoresText})`
      : `(${output.score?.toFixed(2)})`;
  const gradingResultText = output.gradingResult
    ? `${output.pass ? 'Pass' : 'Fail'} Reason: ${output.gradingResult.reason}`
    : '';
  return dedent`
      ${passFailText} ${scoreText}

      ${output.text}

      ${gradingResultText}
    `.trim();
};

export function createOutputMetadata(evalRecord: Eval) {
  let evaluationCreatedAt: string | undefined;
  if (evalRecord.createdAt) {
    try {
      const date = new Date(evalRecord.createdAt);
      evaluationCreatedAt = Number.isNaN(date.getTime()) ? undefined : date.toISOString();
    } catch {
      evaluationCreatedAt = undefined;
    }
  }

  return {
    promptfooVersion: VERSION,
    nodeVersion: process.version,
    platform: os.platform(),
    arch: os.arch(),
    exportedAt: new Date().toISOString(),
    evaluationCreatedAt,
    author: evalRecord.author,
  };
}

/**
 * JSON writer with improved error handling for large datasets.
 * Provides helpful error messages when memory limits are exceeded.
 */
async function writeJsonOutputSafely(
  outputPath: string,
  evalRecord: Eval,
  shareableUrl: string | null,
): Promise<void> {
  const metadata = createOutputMetadata(evalRecord);

  try {
    const summary = await evalRecord.toEvaluateSummary();
    const outputData: OutputFile = {
      evalId: evalRecord.id,
      results: summary,
      config: evalRecord.config,
      shareableUrl,
      metadata,
    };

    // Use standard JSON.stringify with proper formatting
    const jsonString = JSON.stringify(outputData, null, 2);
    fs.writeFileSync(outputPath, jsonString);
  } catch (error) {
    const msg = (error as Error)?.message ?? '';
    const isStringLen = error instanceof RangeError && msg.includes('Invalid string length');
    const isHeapOOM = /heap out of memory|Array buffer allocation failed|ERR_STRING_TOO_LONG/i.test(
      msg,
    );
    if (isStringLen || isHeapOOM) {
      // The dataset is too large to load into memory at once
      const resultCount = await evalRecord.getResultsCount();
      logger.error(`Dataset too large for JSON export (${resultCount} results).`);
      throw new Error(
        `Dataset too large for JSON export. The evaluation has ${resultCount} results which exceeds memory limits. ` +
          'Consider using JSONL format instead: --output output.jsonl',
      );
    } else {
      throw error;
    }
  }
}

export async function writeOutput(
  outputPath: string,
  evalRecord: Eval,
  shareableUrl: string | null,
) {
  if (outputPath.match(/^https:\/\/docs\.google\.com\/spreadsheets\//)) {
    const table = await evalRecord.getTable();
    invariant(table, 'Table is required');
    const rows = table.body.map((row) => {
      const csvRow: CsvRow = {};
      table.head.vars.forEach((varName, index) => {
        csvRow[varName] = row.vars[index];
      });
      table.head.prompts.forEach((prompt, index) => {
        csvRow[prompt.label] = outputToSimpleString(row.outputs[index]);
      });
      return csvRow;
    });
    logger.info(`Writing ${rows.length} rows to Google Sheets...`);
    await writeCsvToGoogleSheet(rows, outputPath);
    return;
  }

  const { data: outputExtension } = OutputFileExtension.safeParse(
    path.extname(outputPath).slice(1).toLowerCase(),
  );
  invariant(
    outputExtension,
    `Unsupported output file format ${outputExtension}. Please use one of: ${OutputFileExtension.options.join(', ')}.`,
  );

  // Ensure the directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const metadata = createOutputMetadata(evalRecord);

  if (outputExtension === 'csv') {
    // Write headers first
    const headers = getHeaderForTable(evalRecord);

    const headerCsv = stringify([
      [...headers.vars, ...headers.prompts.map((prompt) => `[${prompt.provider}] ${prompt.label}`)],
    ]);
    fs.writeFileSync(outputPath, headerCsv);

    // Write body rows in batches
    for await (const batchResults of evalRecord.fetchResultsBatched()) {
      // we need split the batch into rows by testIdx
      const tableRows: Record<number, EvalResult[]> = {};
      for (const result of batchResults) {
        if (!(result.testIdx in tableRows)) {
          tableRows[result.testIdx] = [];
        }
        tableRows[result.testIdx].push(result);
      }
      const batchCsv = stringify(
        Object.values(tableRows).map((results) => {
          const row = convertTestResultsToTableRow(results, headers.vars);
          return [...row.vars, ...row.outputs.map(outputToSimpleString)];
        }),
      );
      fs.appendFileSync(outputPath, batchCsv);
    }
  } else if (outputExtension === 'json') {
    await writeJsonOutputSafely(outputPath, evalRecord, shareableUrl);
  } else if (outputExtension === 'yaml' || outputExtension === 'yml' || outputExtension === 'txt') {
    const summary = await evalRecord.toEvaluateSummary();
    fs.writeFileSync(
      outputPath,
      yaml.dump({
        evalId: evalRecord.id,
        results: summary,
        config: evalRecord.config,
        shareableUrl,
        metadata,
      } as OutputFile),
    );
  } else if (outputExtension === 'html') {
    const table = await evalRecord.getTable();
    invariant(table, 'Table is required');
    const summary = await evalRecord.toEvaluateSummary();
    const template = fs.readFileSync(`${getDirectory()}/tableOutput.html`, 'utf-8');
    const htmlTable = [
      [
        ...table.head.vars,
        ...table.head.prompts.map((prompt) => `[${prompt.provider}] ${prompt.label}`),
      ],
      ...table.body.map((row) => [...row.vars, ...row.outputs.map(outputToSimpleString)]),
    ];
    const htmlOutput = getNunjucksEngine().renderString(template, {
      config: evalRecord.config,
      table: htmlTable,
      results: summary,
    });
    fs.writeFileSync(outputPath, htmlOutput);
  } else if (outputExtension === 'jsonl') {
    for await (const batchResults of evalRecord.fetchResultsBatched()) {
      const text = batchResults.map((result) => JSON.stringify(result)).join(os.EOL) + os.EOL;
      fs.appendFileSync(outputPath, text);
    }
  } else if (outputExtension === 'xml') {
    const summary = await evalRecord.toEvaluateSummary();

    // Sanitize data for XML builder to prevent textValue.replace errors
    const sanitizeForXml = (obj: any): any => {
      if (obj === null || obj === undefined) {
        return '';
      }
      if (typeof obj === 'boolean' || typeof obj === 'number') {
        return String(obj);
      }
      if (typeof obj === 'string') {
        return obj;
      }
      if (Array.isArray(obj)) {
        return obj.map(sanitizeForXml);
      }
      if (typeof obj === 'object') {
        const sanitized: any = {};
        for (const [key, value] of Object.entries(obj)) {
          sanitized[key] = sanitizeForXml(value);
        }
        return sanitized;
      }
      // For any other type, convert to string
      return String(obj);
    };

    const xmlBuilder = new XMLBuilder({
      ignoreAttributes: false,
      format: true,
      indentBy: '  ',
    });
    const xmlData = xmlBuilder.build({
      promptfoo: {
        evalId: evalRecord.id,
        results: sanitizeForXml(summary),
        config: sanitizeForXml(evalRecord.config),
        shareableUrl: shareableUrl || '',
      },
    });
    fs.writeFileSync(outputPath, xmlData);
  }
}

export async function writeMultipleOutputs(
  outputPaths: string[],
  evalRecord: Eval,
  shareableUrl: string | null,
) {
  await Promise.all(
    outputPaths.map((outputPath) => writeOutput(outputPath, evalRecord, shareableUrl)),
  );
}

export async function readOutput(outputPath: string): Promise<OutputFile> {
  const ext = path.parse(outputPath).ext.slice(1);

  switch (ext) {
    case 'json':
      return JSON.parse(fs.readFileSync(outputPath, 'utf-8')) as OutputFile;
    default:
      throw new Error(`Unsupported output file format: ${ext} currently only supports json`);
  }
}

export async function readFilters(
  filters: Record<string, string>,
  basePath: string = '',
): Promise<NunjucksFilterMap> {
  const ret: NunjucksFilterMap = {};
  for (const [name, filterPath] of Object.entries(filters)) {
    const globPath = path.join(basePath, filterPath);
    const filePaths = globSync(globPath, {
      windowsPathsNoEscape: true,
    });
    for (const filePath of filePaths) {
      const finalPath = path.resolve(filePath);
      ret[name] = await importModule(finalPath);
    }
  }
  return ret;
}

export function printBorder() {
  const border = '='.repeat(TERMINAL_MAX_WIDTH);
  logger.info(border);
}

export function setupEnv(envPath: string | undefined) {
  if (envPath) {
    logger.info(`Loading environment variables from ${envPath}`);
    dotenv.config({ path: envPath, override: true, quiet: true });
  } else {
    dotenv.config({ quiet: true });
  }
}

function canonicalizeProviderId(id: string): string {
  // Handle file:// prefix
  if (id.startsWith('file://')) {
    const filePath = id.slice('file://'.length);
    return path.isAbsolute(filePath) ? id : `file://${path.resolve(filePath)}`;
  }

  // Handle other executable prefixes with file paths
  const executablePrefixes = ['exec:', 'python:', 'golang:'];
  for (const prefix of executablePrefixes) {
    if (id.startsWith(prefix)) {
      const filePath = id.slice(prefix.length);
      if (filePath.includes('/') || filePath.includes('\\')) {
        return `${prefix}${path.resolve(filePath)}`;
      }
      return id;
    }
  }

  // For JavaScript/TypeScript files without file:// prefix
  if (
    (id.endsWith('.js') || id.endsWith('.ts') || id.endsWith('.mjs')) &&
    (id.includes('/') || id.includes('\\'))
  ) {
    return `file://${path.resolve(id)}`;
  }

  return id;
}

function getProviderLabel(provider: any): string | undefined {
  return provider?.label && typeof provider.label === 'string' ? provider.label : undefined;
}

export function providerToIdentifier(
  provider: TestCase['provider'] | { id?: string; label?: string } | undefined,
): string | undefined {
  if (!provider) {
    return undefined;
  }

  if (typeof provider === 'string') {
    return canonicalizeProviderId(provider);
  }

  // Check for label first on any provider type
  const label = getProviderLabel(provider);
  if (label) {
    return label;
  }

  if (isApiProvider(provider)) {
    return canonicalizeProviderId(provider.id());
  }

  if (isProviderOptions(provider)) {
    if (provider.id) {
      return canonicalizeProviderId(provider.id);
    }
    return undefined;
  }

  // Handle any other object with id property
  if (typeof provider === 'object' && 'id' in provider && typeof provider.id === 'string') {
    return canonicalizeProviderId(provider.id);
  }

  return undefined;
}

export function varsMatch(vars1: Vars | undefined, vars2: Vars | undefined) {
  return deepEqual(vars1, vars2);
}

export function resultIsForTestCase(result: EvaluateResult, testCase: TestCase): boolean {
  const providersMatch = testCase.provider
    ? providerToIdentifier(testCase.provider) === providerToIdentifier(result.provider)
    : true;

  return varsMatch(testCase.vars, result.vars) && providersMatch;
}

export function renderVarsInObject<T>(obj: T, vars?: Record<string, string | object>): T {
  // Renders nunjucks template strings with context variables
  if (!vars || getEnvBool('PROMPTFOO_DISABLE_TEMPLATING')) {
    return obj;
  }
  if (typeof obj === 'string') {
    const nunjucksEngine = getNunjucksEngine();
    return nunjucksEngine.renderString(obj, vars) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => renderVarsInObject(item, vars)) as unknown as T;
  }
  if (typeof obj === 'object' && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const key in obj) {
      result[key] = renderVarsInObject((obj as Record<string, unknown>)[key], vars);
    }
    return result as T;
  } else if (typeof obj === 'function') {
    const fn = obj as Function;
    return renderVarsInObject(fn({ vars }) as T);
  }
  return obj;
}

/**
 * Parses a file path or glob pattern to extract function names and file extensions.
 * Function names can be specified in the filename like this:
 * prompt.py:myFunction or prompts.js:myFunction.
 * @param basePath - The base path for file resolution.
 * @param promptPath - The path or glob pattern.
 * @returns Parsed details including function name, file extension, and directory status.
 */
export function parsePathOrGlob(
  basePath: string,
  promptPath: string,
): {
  extension?: string;
  functionName?: string;
  isPathPattern: boolean;
  filePath: string;
} {
  if (promptPath.startsWith('file://')) {
    promptPath = promptPath.slice('file://'.length);
  }
  const filePath = path.resolve(basePath, promptPath);

  let filename = path.relative(basePath, filePath);
  let functionName: string | undefined;

  if (filename.includes(':')) {
    const splits = filename.split(':');
    if (
      splits[0] &&
      (isJavascriptFile(splits[0]) || splits[0].endsWith('.py') || splits[0].endsWith('.go'))
    ) {
      [filename, functionName] = splits;
    }
  }

  // verify that filename without function exists
  let stats;
  try {
    stats = fs.statSync(path.join(basePath, filename));
  } catch (err) {
    if (getEnvBool('PROMPTFOO_STRICT_FILES')) {
      throw err;
    }
  }

  const isPathPattern = stats?.isDirectory() || /[*?{}\[\]]/.test(filePath); // glob pattern
  const safeFilename = path.relative(
    basePath,
    path.isAbsolute(filename) ? filename : path.resolve(basePath, filename),
  );
  return {
    extension: isPathPattern ? undefined : path.parse(safeFilename).ext,
    filePath: safeFilename.startsWith(basePath) ? safeFilename : path.join(basePath, safeFilename),
    functionName,
    isPathPattern,
  };
}

export function isRunningUnderNpx(): boolean {
  const npmExecPath = getEnvString('npm_execpath');
  const npmLifecycleScript = getEnvString('npm_lifecycle_script');

  return Boolean(
    (npmExecPath && npmExecPath.includes('npx')) ||
      process.execPath.includes('npx') ||
      (npmLifecycleScript && npmLifecycleScript.includes('npx')),
  );
}

/**
 * Renders variables in a tools object and loads from external file if applicable.
 * This function combines renderVarsInObject and maybeLoadFromExternalFile into a single step
 * specifically for handling tools configurations.
 *
 * @param tools - The tools configuration object or array to process.
 * @param vars - Variables to use for rendering.
 * @returns The processed tools configuration with variables rendered and content loaded from files if needed.
 */
export function maybeLoadToolsFromExternalFile(
  tools: any,
  vars?: Record<string, string | object>,
): any {
  return maybeLoadFromExternalFile(renderVarsInObject(tools, vars));
}
