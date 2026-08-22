import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { parse as parsePath } from 'path';

import $RefParser from '@apidevtools/json-schema-ref-parser';
import { parse as parseCsv } from 'csv-parse/sync';
import dedent from 'dedent';
import { globSync } from 'glob';
import { testCaseFromCsvRow } from '../csv';
import { getEnvBool, getEnvString } from '../envars';
import { importModule } from '../esm';
import { fetchCsvFromGoogleSheet } from '../googleSheets';
import { fetchHuggingFaceDataset } from '../integrations/huggingfaceDatasets';
import logger from '../logger';
import { fetchCsvFromSharepoint } from '../microsoftSharepoint';
import { loadApiProvider } from '../providers/index';
import { runPython } from '../python/pythonUtils';
import telemetry from '../telemetry';
import { parseAzureBlobUri, readAzureBlobText, sanitizeAzureBlobUriForError } from './azureBlob';
import { maybeLoadConfigFromExternalFile } from './file';
import { isJavascriptFile } from './fileExtensions';
import { parseXlsxFile } from './xlsx';
import { loadYaml } from './yamlLoad';

import type {
  CsvRow,
  ProviderOptions,
  TestCase,
  TestCaseWithVarsFile,
  TestSuiteConfig,
} from '../types/index';

type StandaloneTestsFileMetadata = {
  resolvedVarsPath: string;
  pathWithoutFunction: string;
  maybeFunctionName: string | undefined;
  fileExtension: string;
};

type AzureBlobTestFileExtension = 'csv' | 'json' | 'jsonl' | 'yaml' | 'yml';

const SHA256_BLOB_SUFFIX = /\.[a-f0-9]{64}$/i;

export async function readTestFiles(
  pathOrGlobs: string | string[],
  basePath: string = '',
): Promise<Record<string, string | string[] | object>> {
  if (typeof pathOrGlobs === 'string') {
    pathOrGlobs = [pathOrGlobs];
  }

  const ret: Record<string, string | string[] | object> = {};
  for (const pathOrGlob of pathOrGlobs) {
    const resolvedPath = path.resolve(basePath, pathOrGlob);

    const paths = globSync(resolvedPath, {
      windowsPathsNoEscape: true,
    });

    for (const p of paths) {
      const rawData = loadYaml(await fsPromises.readFile(p, 'utf-8'));
      const yamlData = maybeLoadConfigFromExternalFile(rawData);
      Object.assign(ret, yamlData);
    }
  }
  return ret;
}

/**
 * Reads test cases from a file in various formats (CSV, JSON, YAML, Python, JavaScript) and returns them as TestCase objects.
 *
 * Supports multiple input sources:
 * - Hugging Face datasets (huggingface://datasets/...)
 * - Azure Blob Storage test sets (az://...)
 * - JavaScript/TypeScript files (.js, .ts, .mjs)
 * - Python files (.py) with optional function name
 * - Google Sheets (https://docs.google.com/spreadsheets/...)
 * - Local CSV files with configurable delimiter
 * - Local JSON files
 * - Local YAML files (.yaml, .yml)
 *
 * For file-based inputs, each row/entry is converted into a TestCase object with an auto-generated description
 * if none is provided.
 *
 * @param varsPath - Path or URL to the file containing test cases. Can include protocol prefixes for special handlers.
 * @param basePath - Optional base path for resolving relative file paths. Defaults to empty string.
 * @returns Promise resolving to an array of TestCase objects parsed from the input source.
 * @throws Error if Python test function returns non-array result
 */
export async function readStandaloneTestsFile(
  varsPath: string,
  basePath: string = '',
  config?: Record<string, any>,
): Promise<TestCase[]> {
  const finalConfig = config ? maybeLoadConfigFromExternalFile(config) : config;

  if (varsPath.startsWith('huggingface://datasets/')) {
    telemetry.record('feature_used', {
      feature: 'huggingface dataset',
    });
    return await fetchHuggingFaceDataset(varsPath);
  }

  if (varsPath.startsWith('az://')) {
    return await readAzureBlobStandaloneTestsFile(varsPath);
  }

  let rows: CsvRow[];
  if (varsPath.startsWith('https://docs.google.com/spreadsheets/')) {
    telemetry.record('feature_used', {
      feature: 'csv tests file - google sheet',
    });
    rows = await fetchCsvFromGoogleSheet(varsPath);
  } else if (/https:\/\/[^/]+\.sharepoint\.com\//i.test(varsPath)) {
    telemetry.record('feature_used', {
      feature: 'csv tests file - sharepoint',
    });
    rows = await fetchCsvFromSharepoint(varsPath);
  } else {
    return readLocalStandaloneTestsFile(varsPath, basePath, finalConfig);
  }

  return csvRowsToTestCases(rows);
}

async function readAzureBlobStandaloneTestsFile(varsPath: string): Promise<TestCase[]> {
  const fileExtension = getAzureBlobTestFileExtension(varsPath);
  if (!fileExtension) {
    throw new Error(
      'Unsupported Azure Blob Storage test file type. Supported formats: CSV, JSON, JSONL, YAML, and YML.',
    );
  }

  const fileContent = await readAzureBlobText(varsPath);
  if (fileExtension === 'csv') {
    telemetry.record('feature_used', {
      feature: 'csv tests file - azure blob',
    });
    return csvRowsToTestCases(parseCsvRows(fileContent));
  }
  // Use the sanitized URI in parse errors so SAS tokens never leak into logs.
  const sanitizedVarsPath = sanitizeAzureBlobUriForError(varsPath);
  if (fileExtension === 'json') {
    telemetry.record('feature_used', {
      feature: 'json tests file - azure blob',
    });
    return parseJsonTestCases(fileContent, sanitizedVarsPath);
  }
  if (fileExtension === 'jsonl') {
    telemetry.record('feature_used', {
      feature: 'jsonl tests file - azure blob',
    });
    return parseJsonlTestCases(fileContent, sanitizedVarsPath);
  }

  telemetry.record('feature_used', {
    feature: 'yaml tests file - azure blob',
  });
  return parseYamlTestCases(fileContent);
}

function getAzureBlobTestFileExtension(varsPath: string): AzureBlobTestFileExtension | undefined {
  const { blobName } = parseAzureBlobUri(varsPath);
  const pathWithoutBlobHash = blobName.replace(SHA256_BLOB_SUFFIX, '');
  const extension = parsePath(pathWithoutBlobHash).ext.slice(1).toLowerCase();
  if (
    extension === 'csv' ||
    extension === 'json' ||
    extension === 'jsonl' ||
    extension === 'yaml' ||
    extension === 'yml'
  ) {
    return extension;
  }
  return undefined;
}

async function readLocalStandaloneTestsFile(
  varsPath: string,
  basePath: string,
  finalConfig: Record<string, any> | undefined,
): Promise<TestCase[]> {
  const { resolvedVarsPath, pathWithoutFunction, maybeFunctionName, fileExtension } =
    getStandaloneTestsFileMetadata(varsPath, basePath);

  if (isJavascriptFile(pathWithoutFunction)) {
    telemetry.record('feature_used', {
      feature: 'js tests file',
    });
    return readJavascriptTestCases(pathWithoutFunction, maybeFunctionName, finalConfig);
  }
  if (fileExtension === 'py') {
    telemetry.record('feature_used', {
      feature: 'python tests file',
    });
    return readPythonTestCases(pathWithoutFunction, maybeFunctionName, finalConfig);
  }

  if (fileExtension === 'csv') {
    telemetry.record('feature_used', {
      feature: 'csv tests file - local',
    });
    return csvRowsToTestCases(await readLocalCsvRows(resolvedVarsPath));
  }
  if (fileExtension === 'xlsx' || fileExtension === 'xls') {
    telemetry.record('feature_used', {
      feature: 'xlsx tests file - local',
    });
    return csvRowsToTestCases(await parseXlsxFile(resolvedVarsPath));
  }
  if (fileExtension === 'json') {
    telemetry.record('feature_used', {
      feature: 'json tests file',
    });
    return readJsonTestCases(resolvedVarsPath);
  }
  if (fileExtension === 'jsonl') {
    telemetry.record('feature_used', {
      feature: 'jsonl tests file',
    });
    return readJsonlTestCases(resolvedVarsPath);
  }
  if (fileExtension === 'yaml' || fileExtension === 'yml') {
    telemetry.record('feature_used', {
      feature: 'yaml tests file',
    });
    const rawContent = loadYaml(await fsPromises.readFile(resolvedVarsPath, 'utf-8'));
    const rows = maybeLoadConfigFromExternalFile(rawContent) as unknown as CsvRow[];
    return csvRowsToTestCases(rows);
  }

  return [];
}

function csvRowsToTestCases(rows: CsvRow[]): TestCase[] {
  return rows.map((row, idx) => {
    const test = testCaseFromCsvRow(row);
    test.description ||= `Row #${idx + 1}`;
    return test;
  });
}

function getStandaloneTestsFileMetadata(
  varsPath: string,
  basePath: string,
): StandaloneTestsFileMetadata {
  const resolvedVarsPath = path.resolve(basePath, varsPath.replace(/^file:\/\//, ''));
  // Split on the last colon to handle Windows drive letters correctly
  const colonCount = resolvedVarsPath.split(':').length - 1;
  const lastColonIndex = resolvedVarsPath.lastIndexOf(':');

  // For Windows paths, we need to account for the drive letter colon
  const isWindowsPath = /^[A-Za-z]:/.test(resolvedVarsPath);
  const effectiveColonCount = isWindowsPath ? colonCount - 1 : colonCount;

  if (effectiveColonCount > 1) {
    throw new Error(`Too many colons. Invalid test file script path: ${varsPath}`);
  }

  const pathWithoutFunction =
    lastColonIndex > 1 ? resolvedVarsPath.slice(0, lastColonIndex) : resolvedVarsPath;
  const maybeFunctionName =
    lastColonIndex > 1 ? resolvedVarsPath.slice(lastColonIndex + 1) : undefined;
  // Sheet specifiers apply only to xlsx/xls basenames. Inspecting the basename preserves `#`
  // characters in parent directories and non-Excel filenames.
  const fileNameWithoutSheet = path.basename(pathWithoutFunction).split('#')[0];
  const sheetAwareExtension = parsePath(fileNameWithoutSheet).ext.slice(1);
  const fileExtension =
    sheetAwareExtension === 'xlsx' || sheetAwareExtension === 'xls'
      ? sheetAwareExtension
      : parsePath(pathWithoutFunction).ext.slice(1);

  return {
    resolvedVarsPath,
    pathWithoutFunction,
    maybeFunctionName,
    fileExtension,
  };
}

async function readJavascriptTestCases(
  pathWithoutFunction: string,
  maybeFunctionName: string | undefined,
  finalConfig: Record<string, any> | undefined,
): Promise<TestCase[]> {
  const mod = await importModule(pathWithoutFunction, maybeFunctionName);
  return typeof mod === 'function' ? await mod(finalConfig) : mod;
}

async function readPythonTestCases(
  pathWithoutFunction: string,
  maybeFunctionName: string | undefined,
  finalConfig: Record<string, any> | undefined,
): Promise<TestCase[]> {
  const args = finalConfig === undefined ? [] : [finalConfig];
  const result = await runPython(pathWithoutFunction, maybeFunctionName ?? 'generate_tests', args);
  if (!Array.isArray(result)) {
    throw new Error(`Python test function must return a list of test cases, got ${typeof result}`);
  }
  return result;
}

function parseLocalCsv(fileContent: string, delimiter: string, relaxQuotes: boolean): CsvRow[] {
  return parseCsv(fileContent, {
    columns: true,
    bom: true,
    delimiter,
    relax_quotes: relaxQuotes,
  });
}

async function readLocalCsvRows(resolvedVarsPath: string): Promise<CsvRow[]> {
  const fileContent = await fsPromises.readFile(resolvedVarsPath, 'utf-8');
  return parseCsvRows(fileContent);
}

function parseCsvRows(fileContent: string): CsvRow[] {
  const delimiter = getEnvString('PROMPTFOO_CSV_DELIMITER', ',');
  const enforceStrict = getEnvBool('PROMPTFOO_CSV_STRICT', false);

  try {
    if (enforceStrict) {
      return parseLocalCsv(fileContent, delimiter, false);
    }

    try {
      return parseLocalCsv(fileContent, delimiter, false);
    } catch {
      return parseLocalCsv(fileContent, delimiter, true);
    }
  } catch (err) {
    const e = err as { code?: string; message: string };
    if (e.code === 'CSV_INVALID_OPENING_QUOTE') {
      throw new Error(e.message);
    }
    throw e;
  }
}

async function readJsonTestCases(resolvedVarsPath: string): Promise<TestCase[]> {
  const fileContent = await fsPromises.readFile(resolvedVarsPath, 'utf-8');
  return parseJsonTestCases(fileContent, resolvedVarsPath);
}

function parseJsonTestCases(fileContent: string, filePath: string): TestCase[] {
  let jsonData: any;
  try {
    jsonData = loadYaml(fileContent);
  } catch (err) {
    throw new Error(
      `Failed to parse JSON test file ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const testCases: TestCase[] = Array.isArray(jsonData) ? jsonData : [jsonData];
  return testCases.map((item, idx) => ({
    ...item,
    description: item.description || `Row #${idx + 1}`,
  }));
}

async function readJsonlTestCases(resolvedVarsPath: string): Promise<TestCase[]> {
  const fileContent = await fsPromises.readFile(resolvedVarsPath, 'utf-8');
  return parseJsonlTestCases(fileContent, resolvedVarsPath);
}

/**
 * Parse JSON, throwing a user-friendly error prefixed with `context` so the
 * raw `JSON.parse` SyntaxError is attributed to its source file.
 */
function parseJsonOrThrow(text: string, context: string): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${context}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Parse the non-empty lines of a JSONL file into raw test cases. */
function parseJsonlLines(fileContent: string, filePath: string): TestCase[] {
  const rows: TestCase[] = [];
  for (const [lineIndex, line] of fileContent.split('\n').entries()) {
    if (!line.trim()) {
      continue;
    }
    rows.push(
      parseJsonOrThrow(
        line,
        `Failed to parse JSONL test file ${filePath} on line ${lineIndex + 1}`,
      ) as TestCase,
    );
  }
  return rows;
}

function parseJsonlTestCases(fileContent: string, filePath: string): TestCase[] {
  return parseJsonlLines(fileContent, filePath).map((testCase, idx) => ({
    ...testCase,
    description: testCase.description || `Row #${idx + 1}`,
  }));
}

function parseYamlTestCases(fileContent: string): TestCase[] {
  const rawContent = loadYaml(fileContent);
  const testCases: TestCase[] = Array.isArray(rawContent)
    ? (rawContent as TestCase[])
    : [rawContent as TestCase];
  return testCases.map((item, idx) => ({
    ...item,
    description: item.description || `Row #${idx + 1}`,
  }));
}

async function loadTestWithVars(
  testCase: TestCaseWithVarsFile,
  testBasePath: string,
): Promise<TestCase> {
  const ret: TestCase = { ...testCase, vars: undefined };
  if (typeof testCase.vars === 'string' || Array.isArray(testCase.vars)) {
    ret.vars = await readTestFiles(testCase.vars, testBasePath);
  } else {
    ret.vars = testCase.vars;
  }
  return ret;
}

export async function readTest(
  test: string | TestCaseWithVarsFile,
  basePath: string = '',
  isDefaultTest: boolean = false,
): Promise<TestCase> {
  let testCase: TestCase;
  let effectiveBasePath = basePath;

  if (typeof test === 'string') {
    const testFilePath = path.resolve(basePath, test);
    effectiveBasePath = path.dirname(testFilePath);
    const rawContent = loadYaml(await fsPromises.readFile(testFilePath, 'utf-8'));
    const rawTestCase = maybeLoadConfigFromExternalFile(rawContent) as TestCaseWithVarsFile;
    testCase = await loadTestWithVars(rawTestCase, effectiveBasePath);
  } else {
    testCase = await loadTestWithVars(test, basePath);
  }

  if (testCase.provider && typeof testCase.provider !== 'function') {
    // Load provider - resolve paths relative to the test case's location
    if (typeof testCase.provider === 'string') {
      testCase.provider = await loadApiProvider(testCase.provider, { basePath: effectiveBasePath });
    } else if (typeof testCase.provider.id === 'string') {
      testCase.provider = await loadApiProvider(testCase.provider.id, {
        options: testCase.provider as ProviderOptions,
        basePath: effectiveBasePath,
      });
    }
  }

  if (
    !isDefaultTest &&
    !testCase.assert &&
    !testCase.vars &&
    !testCase.options &&
    !testCase.metadata &&
    !testCase.provider &&
    !testCase.providerOutput &&
    typeof testCase.threshold !== 'number'
  ) {
    // Validate the shape of the test case
    // We skip validation when loading the default test case, since it may not have all the properties
    throw new Error(
      `Test case must contain one of the following properties: assert, vars, options, metadata, provider, providerOutput, threshold.\n\nInstead got:\n${JSON.stringify(
        testCase,
        null,
        2,
      )}`,
    );
  }

  return testCase;
}

/**
 * Loads test cases from a glob pattern, supporting various file formats and sources.
 * @param loadTestsGlob - The glob pattern or URL to load tests from
 * @param basePath - Base path for resolving relative paths
 * @returns Promise resolving to an array of TestCase objects
 */
export async function loadTestsFromGlob(
  loadTestsGlob: string,
  basePath: string = '',
): Promise<TestCase[]> {
  if (loadTestsGlob.startsWith('huggingface://datasets/')) {
    telemetry.record('feature_used', {
      feature: 'huggingface dataset',
    });
    return await fetchHuggingFaceDataset(loadTestsGlob);
  }

  if (loadTestsGlob.startsWith('file://')) {
    loadTestsGlob = loadTestsGlob.slice('file://'.length);
  }
  const resolvedPath = path.resolve(basePath, loadTestsGlob);

  const testFiles: Array<string> = globSync(resolvedPath, {
    windowsPathsNoEscape: true,
  });

  // Check for possible function names in the path (Windows-aware)
  const lastColonIndex = resolvedPath.lastIndexOf(':');
  const pathWithoutFunction: string =
    lastColonIndex > 1 ? resolvedPath.slice(0, lastColonIndex) : resolvedPath;
  // Only add the file if it's not already included by glob and it's a special file type
  if (
    (isJavascriptFile(pathWithoutFunction) || pathWithoutFunction.endsWith('.py')) &&
    !testFiles.some((file) => file === resolvedPath || file === pathWithoutFunction)
  ) {
    testFiles.push(resolvedPath);
  }

  if (loadTestsGlob.startsWith('https://docs.google.com/spreadsheets/')) {
    testFiles.push(loadTestsGlob);
  }

  const _deref = async (testCases: TestCase[], file: string) => {
    logger.debug(`Dereferencing test file: ${file}`);
    return (await $RefParser.dereference(testCases)) as TestCase[];
  };

  const ret: TestCase[] = [];
  if (testFiles.length < 1) {
    logger.error(`No test files found for path: ${loadTestsGlob}`);
    return ret;
  }
  for (const testFile of testFiles) {
    let testCases: TestCase[] | undefined;
    // Extract path without function name (Windows-aware)
    const lastColonIndex = testFile.lastIndexOf(':');
    const pathWithoutFunction: string =
      lastColonIndex > 1 ? testFile.slice(0, lastColonIndex) : testFile;

    // Handle xlsx/xls files with optional sheet specifier (e.g., file.xlsx#Sheet1)
    const fileWithoutSheet = testFile.split('#')[0];
    if (
      testFile.endsWith('.csv') ||
      testFile.startsWith('https://docs.google.com/spreadsheets/') ||
      isJavascriptFile(pathWithoutFunction) ||
      pathWithoutFunction.endsWith('.py') ||
      fileWithoutSheet.endsWith('.xlsx') ||
      fileWithoutSheet.endsWith('.xls')
    ) {
      testCases = await readStandaloneTestsFile(testFile, basePath);
    } else if (testFile.endsWith('.yaml') || testFile.endsWith('.yml')) {
      const rawContent = loadYaml(await fsPromises.readFile(testFile, 'utf-8'));
      testCases = maybeLoadConfigFromExternalFile(rawContent) as TestCase[];
      testCases = await _deref(testCases, testFile);
    } else if (testFile.endsWith('.jsonl')) {
      const fileContent = await fsPromises.readFile(testFile, 'utf-8');
      const rawCases = parseJsonlLines(fileContent, testFile);
      testCases = maybeLoadConfigFromExternalFile(rawCases) as TestCase[];
      testCases = await _deref(testCases, testFile);
    } else if (testFile.endsWith('.json')) {
      const fileContent = await fsPromises.readFile(testFile, 'utf8');
      const rawContent = parseJsonOrThrow(
        fileContent,
        `Failed to parse JSON test file ${testFile}`,
      );
      testCases = maybeLoadConfigFromExternalFile(rawContent) as TestCase[];
      testCases = await _deref(testCases, testFile);
    } else {
      throw new Error(`Unsupported file type for test file: ${testFile}`);
    }

    if (testCases) {
      if (!Array.isArray(testCases) && typeof testCases === 'object') {
        testCases = [testCases];
      }
      for (const testCase of testCases) {
        ret.push(await readTest(testCase, path.dirname(testFile)));
      }
    }
  }
  return ret;
}

export async function readTests(
  tests: TestSuiteConfig['tests'],
  basePath: string = '',
): Promise<TestCase[]> {
  const ret: TestCase[] = [];

  if (typeof tests === 'string') {
    if (tests.startsWith('az://')) {
      return readStandaloneTestsFile(tests, basePath);
    }
    // Points to a tests file with multiple test cases
    if (tests.endsWith('yaml') || tests.endsWith('yml')) {
      return loadTestsFromGlob(tests, basePath);
    }
    // Points to a tests.{csv,json,yaml,yml,py,js,ts,mjs} or Google Sheet
    return readStandaloneTestsFile(tests, basePath);
  } else if (
    typeof tests === 'object' &&
    !Array.isArray(tests) &&
    'path' in tests &&
    typeof tests.path === 'string'
  ) {
    return readStandaloneTestsFile(tests.path, basePath, tests.config);
  }
  if (Array.isArray(tests)) {
    for (const globOrTest of tests) {
      if (typeof globOrTest === 'string') {
        // Extract path without function name (Windows-aware)
        const lastColonIndex = globOrTest.lastIndexOf(':');
        const pathWithoutFunction: string =
          lastColonIndex > 1 ? globOrTest.slice(0, lastColonIndex) : globOrTest;
        // Handle xlsx/xls files with optional sheet specifier (e.g., file.xlsx#Sheet1)
        const pathWithoutSheet = globOrTest.split('#')[0];
        // For Python, JS, xlsx/xls files, or files with potential function names, use readStandaloneTestsFile
        if (
          isJavascriptFile(pathWithoutFunction) ||
          pathWithoutFunction.endsWith('.py') ||
          pathWithoutSheet.endsWith('.xlsx') ||
          pathWithoutSheet.endsWith('.xls') ||
          globOrTest.replace(/^file:\/\//, '').includes(':')
        ) {
          ret.push(...(await readStandaloneTestsFile(globOrTest, basePath)));
        } else {
          // Resolve globs for other file types
          ret.push(...(await loadTestsFromGlob(globOrTest, basePath)));
        }
      } else if ('path' in globOrTest) {
        ret.push(...(await readStandaloneTestsFile(globOrTest.path, basePath, globOrTest.config)));
      } else {
        // Load individual TestCase
        ret.push(await readTest(globOrTest as TestCaseWithVarsFile, basePath));
      }
    }
  } else if (tests !== undefined && tests !== null) {
    logger.warn(dedent`
      Warning: Unsupported 'tests' format in promptfooconfig.yaml.
      Expected: string, string[], or TestCase[], but received: ${typeof tests}

      Please check your configuration file and ensure the 'tests' field is correctly formatted.
      For more information, visit: https://promptfoo.dev/docs/configuration/reference/#test-case
    `);
  }

  if (
    ret.some((testCase) => testCase.vars?.assert) &&
    !getEnvBool('PROMPTFOO_NO_TESTCASE_ASSERT_WARNING')
  ) {
    logger.warn(dedent`
      Warning: Found 'assert' key in vars. This is likely a mistake in your configuration.

      'assert' should be *unindented* so it is under the test itself, not vars. For example:

      tests:
        - vars:
            foo: bar
          assert:
            - type: contains
              value: "bar"

      To disable this message, set the environment variable PROMPTFOO_NO_TESTCASE_ASSERT_WARNING=1.
    `);
  }

  return ret;
}

/**
 * Strip a trailing `:functionName` suffix from a resolved path.
 *
 * Mirrors the last-colon rule used by `getStandaloneTestsFileMetadata` and
 * `loadTestsFromGlob`, including their Windows drive-letter guard.
 */
function stripFunctionSuffix(resolvedPath: string): string {
  const lastColonIndex = resolvedPath.lastIndexOf(':');
  const isWindowsDriveColon = lastColonIndex === 1 && /^[A-Za-z]:/.test(resolvedPath);
  return lastColonIndex > 1 && !isWindowsDriveColon
    ? resolvedPath.slice(0, lastColonIndex)
    : resolvedPath;
}

/**
 * Strip an Excel `#SheetName` selector from a path.
 *
 * Sheet specifiers apply only to xlsx/xls basenames, so this inspects the basename and
 * preserves `#` characters in parent directories and in non-Excel filenames, matching
 * `getStandaloneTestsFileMetadata`.
 */
function stripSheetSelector(resolvedPath: string): string {
  const base = path.basename(resolvedPath);
  const hashIndex = base.indexOf('#');
  if (hashIndex === -1) {
    return resolvedPath;
  }
  const baseWithoutSheet = base.slice(0, hashIndex);
  const ext = parsePath(baseWithoutSheet).ext.slice(1).toLowerCase();
  if (ext !== 'xlsx' && ext !== 'xls') {
    return resolvedPath;
  }
  return path.join(path.dirname(resolvedPath), baseWithoutSheet);
}

/** References the loader fetches over the network rather than reading from disk. */
function isRemoteTestsReference(reference: string): boolean {
  return (
    reference.startsWith('http://') ||
    reference.startsWith('https://') ||
    reference.startsWith('az://') ||
    reference.startsWith('huggingface://') ||
    reference.startsWith('hf://')
  );
}

/**
 * Resolve a single `tests` string reference to the file paths the loader will read.
 *
 * Globs are expanded with the same `globSync` call `loadTestsFromGlob` uses, because
 * chokidar v5 does not expand glob patterns itself. When a pattern matches nothing the
 * literal path is returned so that creating the file later still triggers a rerun.
 */
function hasGlobMagic(reference: string): boolean {
  return /[*?[\]{}]/.test(reference);
}

/**
 * The deepest directory of a glob that contains no wildcards.
 *
 * Watching it means a file added later that matches the pattern still triggers a rerun,
 * which resolving the pattern to its current matches alone would miss.
 */
function globParentDirectory(resolvedPattern: string): string {
  const segments = resolvedPattern.split(path.sep);
  const firstMagic = segments.findIndex((segment) => hasGlobMagic(segment));
  const stable = firstMagic === -1 ? segments : segments.slice(0, firstMagic);
  return stable.join(path.sep) || path.sep;
}

function resolveTestsFileReference(reference: string, basePath: string): string[] {
  const withoutScheme = reference.replace(/^file:\/\//, '');
  if (isRemoteTestsReference(withoutScheme)) {
    return [];
  }

  const resolved = path.resolve(basePath, withoutScheme);
  const matches = globSync(resolved, { windowsPathsNoEscape: true });
  if (matches.length > 0) {
    const paths = matches.map((match) => stripSheetSelector(match));
    // Watch the glob's stable parent too, so a file added later that matches the
    // pattern triggers a rerun rather than being silently excluded until restart.
    if (hasGlobMagic(withoutScheme)) {
      paths.push(globParentDirectory(resolved));
    }
    return paths;
  }
  if (hasGlobMagic(withoutScheme)) {
    // A pattern matching nothing yet: watch the stable parent so the first matching
    // file to appear is picked up.
    return [globParentDirectory(resolved)];
  }

  // No glob matches: fall back to the concrete path the loader would open. Only strip a
  // `:functionName` suffix for script references, so that a vars file whose name legally
  // contains a colon is still watched in full.
  const withoutSheet = stripSheetSelector(resolved);
  const withoutFunction = stripFunctionSuffix(withoutSheet);
  const isScript = isJavascriptFile(withoutFunction) || withoutFunction.endsWith('.py');
  return [isScript ? withoutFunction : withoutSheet];
}

/**
 * Collect `file://` references nested inside a test generator's `config` object.
 *
 * `readStandaloneTestsFile` passes `config` through `maybeLoadConfigFromExternalFile`
 * before invoking the generator, so those files change the generated cases and need to
 * be watched alongside the generator script itself.
 */
/**
 * Collect `file://` references contained inside a resolved tests file.
 *
 * Only declarative formats are inspected. Reading is best effort: a malformed or
 * unreadable file is left to the loader to report, since this runs only to decide what
 * to watch.
 */
function collectNestedFileReferences(testsFile: string): string[] {
  const ext = parsePath(testsFile).ext.slice(1).toLowerCase();
  if (!['yaml', 'yml', 'json'].includes(ext)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(testsFile, 'utf-8');
    const parsed = ext === 'json' ? JSON.parse(raw) : loadYaml(raw);
    return collectConfigFileReferences(parsed, path.dirname(testsFile));
  } catch {
    return [];
  }
}

function collectConfigFileReferences(value: unknown, basePath: string): string[] {
  if (typeof value === 'string') {
    return value.startsWith('file://') ? resolveTestsFileReference(value, basePath) : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectConfigFileReferences(item, basePath));
  }
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap((item) => collectConfigFileReferences(item, basePath));
  }
  return [];
}

/**
 * Resolve the filesystem paths that a `tests` config reads, for watch mode.
 *
 * `readTests` accepts a bare file reference, a test-generator object, or an array of
 * either plus inline test cases. This mirrors that resolution so the watcher and the
 * loader agree on which files feed an evaluation, rather than duplicating the rules.
 *
 * Must be called with the raw `tests` value from the config file. `combineConfigs`
 * expands scalar and generator references into concrete test cases, after which the
 * original reference is no longer available.
 */
export function resolveTestsWatchPaths(
  tests: TestSuiteConfig['tests'],
  basePath: string = '',
): string[] {
  if (tests == null) {
    return [];
  }

  const entries = Array.isArray(tests) ? tests : [tests];
  const paths = entries.flatMap((entry): string[] => {
    if (typeof entry === 'string') {
      const resolved = resolveTestsFileReference(entry, basePath);
      // A tests file may itself point at more files, e.g. a case with
      // `vars: {data: file://vars.yaml}`. The loader reads those before the resolved
      // config is built, so collect them here as well.
      return [...resolved, ...resolved.flatMap((file) => collectNestedFileReferences(file))];
    }
    if (!entry || typeof entry !== 'object') {
      return [];
    }
    if ('path' in entry && typeof entry.path === 'string') {
      return [
        ...resolveTestsFileReference(entry.path, basePath),
        ...collectConfigFileReferences((entry as { config?: unknown }).config, basePath),
      ];
    }
    if ('vars' in entry && entry.vars) {
      // `vars` may itself be a file reference rather than a mapping, e.g.
      // `{ vars: 'vars/*.yaml' }`, which loadTestWithVars() passes to readTestFiles().
      // That form carries no file:// scheme, so it is resolved as written.
      if (typeof entry.vars === 'string') {
        return resolveTestsFileReference(entry.vars, basePath);
      }
      if (Array.isArray(entry.vars)) {
        // `vars: ['common.yaml', 'case.yaml']` passes every bare path to
        // readTestFiles(), so array elements are resolved as written, like the
        // scalar form, rather than requiring a file:// scheme.
        return entry.vars.flatMap((value) =>
          typeof value === 'string' ? resolveTestsFileReference(value, basePath) : [],
        );
      }
      if (typeof entry.vars === 'object') {
        return Object.values(entry.vars).flatMap((value) =>
          typeof value === 'string' && value.startsWith('file://')
            ? resolveTestsFileReference(value, basePath)
            : [],
        );
      }
    }
    return [];
  });

  return Array.from(new Set(paths.filter(Boolean)));
}
