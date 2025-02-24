import { parse as csvParse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import dedent from 'dedent';
import dotenv from 'dotenv';
import deepEqual from 'fast-deep-equal';
import * as fs from 'fs';
import { globSync } from 'glob';
import yaml from 'js-yaml';
import nunjucks from 'nunjucks';
import * as path from 'path';
import cliState from '../cliState';
import { TERMINAL_MAX_WIDTH } from '../constants';
import { getEnvBool } from '../envars';
import { getDirectory, importModule } from '../esm';
import { writeCsvToGoogleSheet } from '../googleSheets';
import logger from '../logger';
import type Eval from '../models/eval';
import type EvalResult from '../models/evalResult';
import type { Vars } from '../types';
import {
  type EvaluateResult,
  type EvaluateTableOutput,
  type NunjucksFilterMap,
  type ResultsFile,
  type TestCase,
  type OutputFile,
  type CompletedPrompt,
  type CsvRow,
  isApiProvider,
  isProviderOptions,
  OutputFileExtension,
  ResultFailureReason,
} from '../types';
import invariant from '../util/invariant';
import { getConfigDirectoryPath } from './config/manage';
import { sha256 } from './createHash';
import { convertTestResultsToTableRow, getHeaderForTable } from './exportToFile';
import { isJavascriptFile } from './file';
import { getNunjucksEngine } from './templates';

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
    const summary = await evalRecord.toEvaluateSummary();
    fs.writeFileSync(
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
    fs.writeFileSync(
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
      const text = batchResults.map((result) => JSON.stringify(result)).join('\n');
      fs.appendFileSync(outputPath, text);
    }
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

/**
 * TODO(ian): Remove this
 * @deprecated Use readLatestResults directly instead.
 */
export function getLatestResultsPath(): string {
  return path.join(getConfigDirectoryPath(), 'output', 'latest.json');
}
/**
 * @deprecated Used only for migration to sqlite
 */
export function listPreviousResultFilenames_fileSystem(): string[] {
  const directory = path.join(getConfigDirectoryPath(), 'output');
  if (!fs.existsSync(directory)) {
    return [];
  }
  const files = fs.readdirSync(directory);
  const resultsFiles = files.filter((file) => file.startsWith('eval-') && file.endsWith('.json'));
  return resultsFiles.sort((a, b) => {
    const statA = fs.statSync(path.join(directory, a));
    const statB = fs.statSync(path.join(directory, b));
    return statA.birthtime.getTime() - statB.birthtime.getTime(); // sort in ascending order
  });
}

const resultsCache: { [fileName: string]: ResultsFile | undefined } = {};

/**
 * @deprecated Used only for migration to sqlite
 */
export function listPreviousResults_fileSystem(): { fileName: string; description?: string }[] {
  const directory = path.join(getConfigDirectoryPath(), 'output');
  if (!fs.existsSync(directory)) {
    return [];
  }
  const sortedFiles = listPreviousResultFilenames_fileSystem();
  return sortedFiles.map((fileName) => {
    if (!resultsCache[fileName]) {
      try {
        const fileContents = fs.readFileSync(path.join(directory, fileName), 'utf8');
        const data = yaml.load(fileContents) as ResultsFile;
        resultsCache[fileName] = data;
      } catch (error) {
        logger.warn(`Failed to read results from ${fileName}:\n${error}`);
      }
    }
    return {
      fileName,
      description: resultsCache[fileName]?.config.description,
    };
  });
}

export function filenameToDate(filename: string) {
  const dateString = filename.slice('eval-'.length, filename.length - '.json'.length);

  // Replace hyphens with colons where necessary (Windows compatibility).
  const dateParts = dateString.split('T');
  const timePart = dateParts[1].replace(/-/g, ':');
  const formattedDateString = `${dateParts[0]}T${timePart}`;

  const date = new Date(formattedDateString);
  return date;
  /*
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
  */
}

export function dateToFilename(date: Date) {
  return `eval-${date.toISOString().replace(/:/g, '-')}.json`;
}

/**
 * @deprecated Used only for migration to sqlite
 */
export function readResult_fileSystem(
  name: string,
): { id: string; result: ResultsFile; createdAt: Date } | undefined {
  const resultsDirectory = path.join(getConfigDirectoryPath(), 'output');
  const resultsPath = path.join(resultsDirectory, name);
  try {
    const result = JSON.parse(
      fs.readFileSync(fs.realpathSync(resultsPath), 'utf-8'),
    ) as ResultsFile;
    const createdAt = filenameToDate(name);
    return {
      id: sha256(JSON.stringify(result.config)),
      result,
      createdAt,
    };
  } catch (err) {
    logger.error(`Failed to read results from ${resultsPath}:\n${err}`);
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
    dotenv.config({ path: envPath });
  } else {
    dotenv.config();
  }
}

export type StandaloneEval = CompletedPrompt & {
  evalId: string;
  description: string | null;
  datasetId: string | null;
  promptId: string | null;
  isRedteam: boolean;
  createdAt: number;

  pluginFailCount: Record<string, number>;
  pluginPassCount: Record<string, number>;
};

export function providerToIdentifier(provider: TestCase['provider']): string | undefined {
  if (isApiProvider(provider)) {
    return provider.id();
  } else if (isProviderOptions(provider)) {
    return provider.id;
  } else if (typeof provider === 'string') {
    return provider;
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
    return nunjucks.renderString(obj, vars) as unknown as T;
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

/**
 * Loads content from an external file if the input is a file path, otherwise
 * returns the input as-is. Supports Nunjucks templating for file paths.
 *
 * @param filePath - The input to process. Can be a file path string starting with "file://",
 * an array of file paths, or any other type of data.
 * @returns The loaded content if the input was a file path, otherwise the original input.
 * For JSON and YAML files, the content is parsed into an object.
 * For other file types, the raw file content is returned as a string.
 *
 * @throws {Error} If the specified file does not exist.
 */
export function maybeLoadFromExternalFile(filePath: string | object | Function | undefined | null) {
  if (Array.isArray(filePath)) {
    return filePath.map((path) => {
      const content: any = maybeLoadFromExternalFile(path);
      return content;
    });
  }

  if (typeof filePath !== 'string') {
    return filePath;
  }
  if (!filePath.startsWith('file://')) {
    return filePath;
  }

  // Render the file path using Nunjucks
  const renderedFilePath = getNunjucksEngine().renderString(filePath, {});

  const finalPath = path.resolve(cliState.basePath || '', renderedFilePath.slice('file://'.length));
  if (!fs.existsSync(finalPath)) {
    throw new Error(`File does not exist: ${finalPath}`);
  }

  const contents = fs.readFileSync(finalPath, 'utf8');
  if (finalPath.endsWith('.json')) {
    return JSON.parse(contents);
  }
  if (finalPath.endsWith('.yaml') || finalPath.endsWith('.yml')) {
    return yaml.load(contents);
  }
  if (finalPath.endsWith('.csv')) {
    const records = csvParse(contents, { columns: true });
    // If single column, return array of values
    if (records.length > 0 && Object.keys(records[0]).length === 1) {
      return records.map((record: Record<string, string>) => Object.values(record)[0]);
    }
    return records;
  }
  return contents;
}

export function isRunningUnderNpx(): boolean {
  return Boolean(
    process.env.npm_execpath?.includes('npx') ||
      process.execPath.includes('npx') ||
      process.env.npm_lifecycle_script?.includes('npx'),
  );
}
