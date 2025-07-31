import * as path from 'node:path';

import { stringify as csvStringify } from 'csv-stringify/sync';
import dedent from 'dedent';
import dotenv from 'dotenv';
import deepEqual from 'fast-deep-equal';
import { XMLBuilder } from 'fast-xml-parser';
import { globSync } from 'glob';
import yaml from 'js-yaml';
import { TERMINAL_MAX_WIDTH } from '../constants';
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
import { access, mkdir, readFile, stat, writeFile, appendFile } from 'node:fs/promises';

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

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
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
  if (!(await exists(outputDir))) {
    await mkdir(outputDir, { recursive: true });
  }

  if (outputExtension === 'csv') {
    // Write headers first
    const headers = getHeaderForTable(evalRecord);

    const headerCsv = csvStringify([
      [...headers.vars, ...headers.prompts.map((prompt) => `[${prompt.provider}] ${prompt.label}`)],
    ]);
    await writeFile(outputPath, headerCsv);

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
      const batchCsv = csvStringify(
        Object.values(tableRows).map((results) => {
          const row = convertTestResultsToTableRow(results, headers.vars);
          return [...row.vars, ...row.outputs.map(outputToSimpleString)];
        }),
      );
      await appendFile(outputPath, batchCsv);
    }
  } else if (outputExtension === 'json') {
    const summary = await evalRecord.toEvaluateSummary();
    await writeFile(
      outputPath,
      JSON.stringify(
        {
          evalId: evalRecord.id,
          results: summary,
          config: evalRecord.config,
          shareableUrl,
        } satisfies OutputFile,
        null,
        2,
      ),
    );
  } else if (outputExtension === 'yaml' || outputExtension === 'yml' || outputExtension === 'txt') {
    const summary = await evalRecord.toEvaluateSummary();
    await writeFile(
      outputPath,
      yaml.dump({
        evalId: evalRecord.id,
        results: summary,
        config: evalRecord.config,
        shareableUrl,
      } as OutputFile),
    );
  } else if (outputExtension === 'html') {
    const table = await evalRecord.getTable();
    invariant(table, 'Table is required');
    const summary = await evalRecord.toEvaluateSummary();
    const template = await readFile(`${getDirectory()}/tableOutput.html`, 'utf-8');
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
    await writeFile(outputPath, htmlOutput);
  } else if (outputExtension === 'jsonl') {
    for await (const batchResults of evalRecord.fetchResultsBatched()) {
      const text = batchResults.map((result) => JSON.stringify(result)).join('\n');
      await appendFile(outputPath, text);
    }
  } else if (outputExtension === 'xml') {
    const summary = await evalRecord.toEvaluateSummary();
    const xmlBuilder = new XMLBuilder({
      ignoreAttributes: false,
      format: true,
      indentBy: '  ',
    });
    const xmlData = xmlBuilder.build({
      promptfoo: {
        evalId: evalRecord.id,
        results: summary,
        config: evalRecord.config,
        shareableUrl: shareableUrl || undefined,
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
      return JSON.parse(await readFile(outputPath, 'utf-8')) as OutputFile;
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
    dotenv.config({ path: envPath, override: true });
  } else {
    dotenv.config();
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
export async function parsePathOrGlob(
  basePath: string,
  promptPath: string,
): Promise<{
  extension?: string;
  functionName?: string;
  isPathPattern: boolean;
  filePath: string;
}> {
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
    stats = await stat(path.join(basePath, filename));
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
export async function maybeLoadTools(tools: string | object | undefined, vars?: Record<string, any>) {
  if (!tools) {
    return undefined;
  }
  return maybeLoadFromExternalFile(renderVarsInObject(tools, vars || {}));
}

// Alias for backward compatibility
export const maybeLoadToolsFromExternalFile = maybeLoadTools;
