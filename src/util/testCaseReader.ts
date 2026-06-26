import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { parse as parsePath } from 'path';

import $RefParser from '@apidevtools/json-schema-ref-parser';
import { parse as parseCsv } from 'csv-parse/sync';
import dedent from 'dedent';
import yaml from 'js-yaml';
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
import { ConfigResolutionError } from './config/errors';
import {
  getScenarioDependencyContext,
  getScenarioOriginalValue,
  getScenarioTestSourceContext,
  mergeScenarioSourceContexts,
  restoreScenarioTestSourceContext,
  setScenarioOriginalValue,
  setScenarioTestSourceContext,
  transferScenarioTestSourceContext,
  withScenarioSourceFallback,
} from './config/scenarioContext';
import {
  materializeScenarioTestCase,
  materializeScenarioTestSource,
  renderScenarioSourceEnvTemplates,
} from './config/scenarioMatrix';
import { maybeLoadConfigFromExternalFile } from './file';
import { isJavascriptFile } from './fileExtensions';
import { resolveLiteralPathOrGlob } from './pathUtils';
import { REDACTED, redactEnvValues, sanitizeUrl } from './sanitizer';
import { parseXlsxFile } from './xlsx';

import type {
  CsvRow,
  EnvOverrides,
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
  extensionWithoutSheet: string;
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

    const paths = resolveLiteralPathOrGlob(resolvedPath);

    for (const p of paths) {
      const rawData = yaml.load(await fsPromises.readFile(p, 'utf-8'));
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
  if (fileExtension === 'json') {
    telemetry.record('feature_used', {
      feature: 'json tests file - azure blob',
    });
    return parseJsonTestCases(fileContent);
  }
  if (fileExtension === 'jsonl') {
    telemetry.record('feature_used', {
      feature: 'jsonl tests file - azure blob',
    });
    return parseJsonlTestCases(fileContent);
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
  const {
    resolvedVarsPath,
    pathWithoutFunction,
    maybeFunctionName,
    fileExtension,
    extensionWithoutSheet,
  } = getStandaloneTestsFileMetadata(varsPath, basePath);

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
  if (extensionWithoutSheet === 'xlsx' || extensionWithoutSheet === 'xls') {
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
    const rawContent = yaml.load(await fsPromises.readFile(resolvedVarsPath, 'utf-8'));
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
  let localPath = varsPath.replace(/^file:\/\//, '');
  if (process.platform === 'win32' && /^\/[A-Za-z]:[\\/]/.test(localPath)) {
    localPath = localPath.slice(1);
  }
  const resolvedVarsPath = path.isAbsolute(localPath)
    ? localPath
    : path.resolve(basePath, localPath);
  const { pathWithoutFunction, functionName: maybeFunctionName } =
    splitTestScriptPath(resolvedVarsPath);
  const fileExtension = parsePath(pathWithoutFunction).ext.slice(1);
  // For xlsx/xls files, remove sheet specifier (e.g., #Sheet1) from extension
  const extensionWithoutSheet = fileExtension.split('#')[0];

  return {
    resolvedVarsPath,
    pathWithoutFunction,
    maybeFunctionName,
    fileExtension,
    extensionWithoutSheet,
  };
}

function splitTestScriptPath(value: string): {
  pathWithoutFunction: string;
  functionName?: string;
} {
  const lastColonIndex = value.lastIndexOf(':');
  if (lastColonIndex <= 1) {
    return { pathWithoutFunction: value };
  }
  const candidatePath = value.slice(0, lastColonIndex);
  if (!isJavascriptFile(candidatePath) && !candidatePath.endsWith('.py')) {
    return { pathWithoutFunction: value };
  }
  return {
    pathWithoutFunction: candidatePath,
    functionName: value.slice(lastColonIndex + 1),
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
  return parseJsonTestCases(fileContent);
}

function parseJsonTestCases(fileContent: string): TestCase[] {
  const jsonData = yaml.load(fileContent) as any;
  const testCases: unknown[] = Array.isArray(jsonData) ? jsonData : [jsonData];
  return testCases.map((item, idx) => normalizeParsedTestCase(item, idx, 'JSON'));
}

async function readJsonlTestCases(resolvedVarsPath: string): Promise<TestCase[]> {
  const fileContent = await fsPromises.readFile(resolvedVarsPath, 'utf-8');
  return parseJsonlTestCases(fileContent);
}

function parseJsonlTestCases(fileContent: string): TestCase[] {
  return fileContent
    .split('\n')
    .filter((line) => line.trim())
    .map((line, idx) => normalizeParsedTestCase(JSON.parse(line), idx, 'JSONL'));
}

function parseYamlTestCases(fileContent: string): TestCase[] {
  const rawContent = yaml.load(fileContent);
  const testCases: unknown[] = Array.isArray(rawContent) ? rawContent : [rawContent];
  return testCases.map((item, idx) => normalizeParsedTestCase(item, idx, 'YAML'));
}

function normalizeParsedTestCase(item: unknown, index: number, source: string): TestCase {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`Test case ${index + 1} in ${source} test file must be an object`);
  }
  return {
    ...item,
    description: (item as TestCase).description || `Row #${index + 1}`,
  };
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
    const rawContent = yaml.load(await fsPromises.readFile(testFilePath, 'utf-8'));
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
  allowPartialTests = false,
  envOverrides?: EnvOverrides,
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
  if (process.platform === 'win32' && /^\/[A-Za-z]:[\\/]/.test(loadTestsGlob)) {
    loadTestsGlob = loadTestsGlob.slice(1);
  }
  const resolvedPath = path.resolve(basePath, loadTestsGlob);

  const testFiles: Array<string> = resolveLiteralPathOrGlob(resolvedPath);

  // Check for possible function names in the path (Windows-aware)
  const { pathWithoutFunction } = splitTestScriptPath(resolvedPath);
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
    logger.error(`No test files found for path: ${redactEnvValues(loadTestsGlob, envOverrides)}`);
    return ret;
  }
  for (const testFile of testFiles) {
    let testCases: TestCase[] | undefined;
    // Extract path without function name (Windows-aware)
    const { pathWithoutFunction } = splitTestScriptPath(testFile);

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
      const rawContent = yaml.load(await fsPromises.readFile(testFile, 'utf-8'));
      testCases = loadTestCaseConfig(rawContent, allowPartialTests, envOverrides);
      assertLoadedTestCaseShapes(testCases, testFile);
      testCases = await _deref(testCases, testFile);
    } else if (testFile.endsWith('.jsonl')) {
      const fileContent = await fsPromises.readFile(testFile, 'utf-8');
      const rawCases = fileContent
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));
      testCases = loadTestCaseConfig(rawCases, allowPartialTests, envOverrides);
      assertLoadedTestCaseShapes(testCases, testFile);
      testCases = await _deref(testCases, testFile);
    } else if (testFile.endsWith('.json')) {
      const rawContent = JSON.parse(await fsPromises.readFile(testFile, 'utf8'));
      testCases = loadTestCaseConfig(rawContent, allowPartialTests, envOverrides);
      assertLoadedTestCaseShapes(testCases, testFile);
      testCases = await _deref(testCases, testFile);
    } else {
      throw new Error(`Unsupported file type for test file: ${testFile}`);
    }

    await appendLoadedTestCases(ret, testCases, testFile, allowPartialTests, envOverrides);
  }
  return ret;
}

function loadTestCaseConfig(
  config: unknown,
  allowPartialTests: boolean,
  envOverrides?: EnvOverrides,
): TestCase[] {
  if (allowPartialTests) {
    return config as TestCase[];
  }
  return maybeLoadConfigFromExternalFile(config, undefined, envOverrides) as TestCase[];
}

async function appendLoadedTestCases(
  destination: TestCase[],
  loaded: TestCase[] | undefined,
  testFile: string,
  allowPartialTests: boolean,
  envOverrides?: EnvOverrides,
): Promise<void> {
  if (!loaded) {
    return;
  }
  const testCases = Array.isArray(loaded) ? loaded : [loaded];
  for (const [index, testCase] of testCases.entries()) {
    if (!testCase || typeof testCase !== 'object' || Array.isArray(testCase)) {
      throw new Error(`Test case ${index + 1} in ${testFile} must be an object`);
    }
    const testBasePath = path.dirname(testFile);
    const normalizedTest = allowPartialTests
      ? materializeScenarioTestCase(testBasePath, testCase, envOverrides)
      : testCase;
    const hasProvider =
      allowPartialTests && Object.prototype.hasOwnProperty.call(normalizedTest, 'provider');
    const providerRef = hasProvider ? normalizedTest.provider : undefined;
    const testForNormalization = hasProvider ? { ...normalizedTest } : normalizedTest;
    if (hasProvider) {
      Reflect.deleteProperty(testForNormalization, 'provider');
    }
    const loadedTest = await readTest(testForNormalization, testBasePath, allowPartialTests);
    if (hasProvider) {
      loadedTest.provider = providerRef as TestCase['provider'];
    }
    transferScenarioTestSourceContext(normalizedTest, loadedTest);
    setScenarioOriginalValue(loadedTest, getScenarioOriginalValue(normalizedTest) ?? testCase);
    destination.push(loadedTest);
  }
}

function assertLoadedTestCaseShapes(loaded: unknown, testFile: string): void {
  if (loaded === null || loaded === undefined) {
    return;
  }
  const testCases = Array.isArray(loaded) ? loaded : [loaded];
  for (const [index, testCase] of testCases.entries()) {
    if (!testCase || typeof testCase !== 'object' || Array.isArray(testCase)) {
      throw new Error(`Test case ${index + 1} in ${testFile} must be an object`);
    }
  }
}

export async function readTests(
  tests: TestSuiteConfig['tests'],
  basePath: string = '',
  allowPartialTests = false,
  envOverrides?: EnvOverrides,
): Promise<TestCase[]> {
  const ret: TestCase[] = [];

  if (typeof tests === 'string') {
    if (tests.startsWith('az://')) {
      return readStandaloneTestsFile(tests, basePath);
    }
    // Points to a tests file with multiple test cases
    if (tests.endsWith('yaml') || tests.endsWith('yml')) {
      return loadTestsFromGlob(tests, basePath, allowPartialTests, envOverrides);
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
        const localPath = globOrTest.replace(/^file:\/\//, '');
        const { functionName, pathWithoutFunction } = splitTestScriptPath(localPath);
        // Handle xlsx/xls files with optional sheet specifier (e.g., file.xlsx#Sheet1)
        const pathWithoutSheet = globOrTest.split('#')[0];
        // For Python, JS, xlsx/xls files, or files with potential function names, use readStandaloneTestsFile
        if (
          isJavascriptFile(pathWithoutFunction) ||
          pathWithoutFunction.endsWith('.py') ||
          pathWithoutSheet.endsWith('.xlsx') ||
          pathWithoutSheet.endsWith('.xls') ||
          functionName !== undefined
        ) {
          ret.push(...(await readStandaloneTestsFile(globOrTest, basePath)));
        } else {
          // Resolve globs for other file types
          ret.push(
            ...(await loadTestsFromGlob(globOrTest, basePath, allowPartialTests, envOverrides)),
          );
        }
      } else if ('path' in globOrTest) {
        ret.push(...(await readStandaloneTestsFile(globOrTest.path, basePath, globOrTest.config)));
      } else {
        // Load individual TestCase
        ret.push(await readTest(globOrTest as TestCaseWithVarsFile, basePath, allowPartialTests));
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
 * Materialize external scenario test sources while preserving ordinary inline
 * tests that may rely on scenario/default fields for their runnable behavior.
 */
export async function readScenarioTests(
  tests: unknown,
  basePath = '',
  envOverrides?: EnvOverrides,
): Promise<TestCase[] | undefined> {
  if (tests === undefined || tests === null) {
    return undefined;
  }

  const normalizedTests: TestCase[] = [];
  for (const test of Array.isArray(tests) ? tests : [tests]) {
    if (isScenarioTestRecord(test) && !isGeneratorLikeScenarioTest(test)) {
      const restoredTest = restoreScenarioTestSourceContext(test);
      const sourceContext = withScenarioSourceFallback(
        getScenarioTestSourceContext(restoredTest),
        basePath,
        envOverrides,
      );
      const renderedTest = renderScenarioSourceEnvTemplates(
        restoredTest,
        sourceContext.envOverrides,
      );
      const materializedTest = materializeScenarioTestCase(
        sourceContext.basePath,
        renderedTest,
        sourceContext.envOverrides,
      ) as TestCaseWithVarsFile;
      const hasProvider = Object.prototype.hasOwnProperty.call(materializedTest, 'provider');
      const providerRef = hasProvider ? materializedTest.provider : undefined;
      const testForNormalization = hasProvider ? { ...materializedTest } : materializedTest;
      if (hasProvider) {
        Reflect.deleteProperty(testForNormalization, 'provider');
      }
      const normalizedTest = await readTest(testForNormalization, sourceContext.basePath, true);
      if (hasProvider) {
        normalizedTest.provider = providerRef as TestCase['provider'];
      }
      transferScenarioTestSourceContext(materializedTest, normalizedTest);
      setScenarioOriginalValue(
        normalizedTest,
        getScenarioOriginalValue(restoredTest) ?? restoredTest,
      );
      normalizedTests.push(normalizedTest);
      continue;
    }
    for (const loadedTest of await loadScenarioTestSource(test, basePath, envOverrides)) {
      normalizedTests.push(loadedTest);
    }
  }

  return normalizedTests;
}

function isScenarioTestRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null || Object.keys(value).length > 0;
}

function isGeneratorLikeScenarioTest(value: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(value, 'path') ||
    Object.prototype.hasOwnProperty.call(value, 'config')
  );
}

async function loadScenarioTestSource(
  test: unknown,
  basePath: string,
  envOverrides?: EnvOverrides,
): Promise<TestCase[]> {
  const isGenerator = isScenarioTestRecord(test) && isGeneratorLikeScenarioTest(test);
  if (isGenerator && typeof test.path !== 'string') {
    throw new ConfigResolutionError('Scenario test generator must have a string path');
  }
  if (typeof test !== 'string' && !isGenerator) {
    throw new ConfigResolutionError(
      `Scenario tests must be test case objects or file:// references; got ${typeof test}`,
    );
  }

  const materializedTest = isGenerator
    ? materializeScenarioTestSource(basePath, test, envOverrides)
    : test;
  const sourceType = typeof test === 'string' ? 'file' : 'generator';
  const sourcePath =
    typeof materializedTest === 'string' ? materializedTest : (materializedTest.path as string);
  const safeSourcePath = redactEnvValues(
    sourcePath.startsWith('az://')
      ? sanitizeAzureBlobUriForError(sourcePath)
      : sanitizeUrl(sourcePath),
    envOverrides,
  );
  const sourceContext =
    materializedTest && typeof materializedTest === 'object'
      ? getScenarioTestSourceContext(materializedTest)
      : undefined;
  let normalizedTests: TestCase[];
  try {
    const loaded = (await readTests(
      (typeof materializedTest === 'string'
        ? [materializedTest]
        : materializedTest) as TestSuiteConfig['tests'],
      basePath,
      true,
      envOverrides,
    )) as unknown;
    if (!Array.isArray(loaded)) {
      throw new Error(`expected an array of test cases, got ${typeof loaded}`);
    }
    normalizedTests = await normalizeLoadedScenarioTests(
      loaded,
      sourcePath,
      basePath,
      envOverrides,
      sourceContext,
    );
  } catch (error) {
    const detail = sanitizeScenarioSourceErrorDetail(
      sourcePath,
      safeSourcePath,
      error,
      envOverrides,
    );
    throw new ConfigResolutionError(
      `Failed to load scenario test ${sourceType} ${safeSourcePath}: ${detail}`,
      { cause: new Error(detail) },
    );
  }
  if (normalizedTests.length === 0) {
    throw new ConfigResolutionError(
      `Failed to load scenario test ${sourceType} ${safeSourcePath}: source contributed no tests`,
    );
  }
  return normalizedTests;
}

async function normalizeLoadedScenarioTests(
  loadedTests: unknown[],
  sourcePath: string,
  fallbackBasePath: string,
  envOverrides?: EnvOverrides,
  declaringContext?: ReturnType<typeof getScenarioTestSourceContext>,
): Promise<TestCase[]> {
  const normalizedTests: TestCase[] = [];
  const shouldNormalize = isLocalScenarioTestSource(sourcePath);
  const declarationDependencyContext = shouldNormalize
    ? getScenarioDependencyContext(
        getStandaloneTestsFileMetadata(sourcePath, fallbackBasePath).pathWithoutFunction,
        fallbackBasePath,
      )
    : {};
  for (const [index, loadedTest] of loadedTests.entries()) {
    if (!isScenarioTestRecord(loadedTest)) {
      throw new Error(`test case ${index + 1} must be a plain object`);
    }
    if (!shouldNormalize) {
      const sourceContext = mergeScenarioSourceContexts(
        getScenarioTestSourceContext(loadedTest),
        declaringContext,
        { basePath: fallbackBasePath, envOverrides },
      );
      if (sourceContext) {
        setScenarioTestSourceContext(loadedTest, sourceContext);
      }
      normalizedTests.push(loadedTest as TestCase);
      continue;
    }

    const loadedContext = getScenarioTestSourceContext(loadedTest);
    const sourceBasePath =
      loadedContext?.basePath ?? getScenarioTestSourceBasePath(sourcePath, fallbackBasePath);
    const resolvedTest = materializeScenarioTestCase(
      sourceBasePath,
      loadedTest,
      envOverrides,
    ) as TestCaseWithVarsFile;
    const hasProvider = Object.prototype.hasOwnProperty.call(resolvedTest, 'provider');
    const providerRef = hasProvider ? resolvedTest.provider : undefined;
    const testForNormalization = hasProvider ? { ...resolvedTest } : resolvedTest;
    if (hasProvider) {
      Reflect.deleteProperty(testForNormalization, 'provider');
    }
    const normalizedTest = await readTest(testForNormalization, sourceBasePath, true);
    if (hasProvider) {
      normalizedTest.provider = providerRef as TestCase['provider'];
    }
    transferScenarioTestSourceContext(resolvedTest, normalizedTest);
    const sourceContext = mergeScenarioSourceContexts(
      getScenarioTestSourceContext(normalizedTest),
      loadedContext,
      declaringContext,
      {
        basePath: sourceBasePath,
        envOverrides,
        ...declarationDependencyContext,
      },
    );
    if (sourceContext) {
      setScenarioTestSourceContext(normalizedTest, sourceContext);
    }
    setScenarioOriginalValue(normalizedTest, getScenarioOriginalValue(loadedTest) ?? loadedTest);
    normalizedTests.push(normalizedTest);
  }
  return normalizedTests;
}

function sanitizeScenarioSourceErrorDetail(
  sourcePath: string,
  safeSourcePath: string,
  error: unknown,
  envOverrides?: EnvOverrides,
): string {
  let detail = error instanceof Error ? error.message : String(error);
  detail = detail.split(sourcePath).join(safeSourcePath);
  try {
    const url = new URL(sourcePath);
    const sensitiveValues = [
      url.username,
      url.password,
      ...Array.from(url.searchParams.values()),
    ].filter(Boolean);
    for (const value of sensitiveValues) {
      detail = detail.split(value).join(REDACTED);
      try {
        detail = detail.split(decodeURIComponent(value)).join(REDACTED);
      } catch {}
    }
  } catch {}
  const sanitized = redactEnvValues(detail, envOverrides).replace(/[\u0000-\u001f\u007f]/g, '?');
  return sanitized.length > 512 ? `${sanitized.slice(0, 512)}...` : sanitized;
}

function getScenarioTestSourceBasePath(sourcePath: string, fallbackBasePath: string): string {
  if (!isLocalScenarioTestSource(sourcePath)) {
    return fallbackBasePath;
  }
  return path.dirname(
    getStandaloneTestsFileMetadata(sourcePath, fallbackBasePath).pathWithoutFunction,
  );
}

function isLocalScenarioTestSource(sourcePath: string): boolean {
  return (
    !sourcePath.startsWith('az://') &&
    !sourcePath.startsWith('huggingface://') &&
    !/^https?:\/\//i.test(sourcePath)
  );
}
