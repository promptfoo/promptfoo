import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { parse as parsePath } from 'path';

import $RefParser from '@apidevtools/json-schema-ref-parser';
import { parse as parseCsv } from 'csv-parse/sync';
import dedent from 'dedent';
import { globSync } from 'glob';
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
import { parseAzureBlobUri, readAzureBlobText } from './azureBlob';
import { maybeLoadConfigFromExternalFile } from './file';
import { isJavascriptFile } from './fileExtensions';
import { parseXlsxFile } from './xlsx';

import type {
  CsvRow,
  ProviderOptions,
  TestCase,
  TestCaseWithVarsFile,
  TestSuiteConfig,
  Vars,
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

    const paths = globSync(resolvedPath, {
      windowsPathsNoEscape: true,
    });

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

function parseJsonTestCases(fileContent: string, sourcePath?: string): TestCase[] {
  const jsonData = yaml.load(fileContent) as unknown;

  const agentSkillsCases = maybeConvertAgentSkillsEvalsJson(jsonData, sourcePath);
  if (agentSkillsCases) {
    return agentSkillsCases;
  }

  const testCases: TestCase[] = Array.isArray(jsonData)
    ? (jsonData as TestCase[])
    : [jsonData as TestCase];
  return testCases.map((item, idx) => ({
    ...item,
    description: item.description || `Row #${idx + 1}`,
  }));
}

function maybeConvertAgentSkillsEvalsJson(input: unknown, sourcePath?: string): TestCase[] | null {
  const testCases = parseAgentSkillsEvalsJson(input, sourcePath);
  if (testCases) {
    telemetry.record('feature_used', {
      feature: 'agent-skills evals.json tests file',
    });
  }
  return testCases;
}

type AgentSkillsEvalCase = {
  id?: string | number;
  prompt: string;
  expected_output?: unknown;
  assertions?: unknown;
  files?: unknown;
};

type AgentSkillsEvalsFile = {
  skill_name?: unknown;
  evals?: unknown;
};

/**
 * Detect the AgentSkills `evals.json` format described at
 * https://agentskills.io/skill-creation/evaluating-skills and convert it to
 * promptfoo `TestCase`s. Returns `null` when the input does not match the
 * expected shape so callers can fall back to the generic JSON parser.
 *
 * The mapping is:
 *   - `prompt`           -> literal `vars.prompt`
 *   - `expected_output`  -> `llm-rubric` assertion (first)
 *   - `assertions[i]`    -> additional `llm-rubric` assertions
 *   - `files`            -> absolute paths resolved from the JSON source layout
 *   - `id`               -> `metadata.id` and `description`
 *   - top-level `skill_name` -> `metadata.skill_name`
 */
function parseAgentSkillsEvalsJson(input: unknown, sourcePath?: string): TestCase[] | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }

  const candidate = input as AgentSkillsEvalsFile;
  const skillName =
    typeof candidate.skill_name === 'string' && candidate.skill_name.trim()
      ? candidate.skill_name
      : undefined;
  if (!skillName || !Array.isArray(candidate.evals)) {
    return null;
  }

  const validCases = candidate.evals.filter(
    (entry): entry is AgentSkillsEvalCase =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as Partial<AgentSkillsEvalCase>).prompt === 'string' &&
      Boolean((entry as AgentSkillsEvalCase).prompt.trim()),
  );
  return validCases.flatMap((entry, idx) => {
    const testCase = agentSkillsEvalToTestCase(entry, idx, skillName, sourcePath);
    return testCase ? [testCase] : [];
  });
}

function agentSkillsEvalToTestCase(
  entry: AgentSkillsEvalCase,
  idx: number,
  skillName: string,
  sourcePath?: string,
): TestCase | null {
  const assertions = buildAgentSkillsAssertions(entry);
  if (assertions.length === 0) {
    return null;
  }

  const idValue =
    typeof entry.id === 'string' || typeof entry.id === 'number' ? entry.id : undefined;

  const sourceDirectory = sourcePath ? path.dirname(sourcePath) : undefined;
  const isStandardAgentSkillsLayout =
    sourcePath &&
    sourceDirectory &&
    path.basename(sourcePath) === 'evals.json' &&
    path.basename(sourceDirectory) === 'evals';
  const sourceRoot = isStandardAgentSkillsLayout ? path.dirname(sourceDirectory) : sourceDirectory;
  const files = (
    Array.isArray(entry.files)
      ? entry.files.filter(
          (file): file is string => typeof file === 'string' && Boolean(file.trim()),
        )
      : []
  ).map((file) =>
    sourceRoot && !file.startsWith('file://') ? path.resolve(sourceRoot, file) : file,
  );
  const prompt =
    files.length > 0
      ? `${entry.prompt}\n\nFiles available for this eval:\n${files.map((file) => `- ${file}`).join('\n')}`
      : entry.prompt;
  const vars: Vars = { prompt };
  if (files.length > 0) {
    vars.files = files;
  }

  const metadata = buildAgentSkillsMetadata(idValue, skillName);

  const testCase: TestCase = {
    description: idValue == null ? `Row #${idx + 1}` : `eval ${idValue}`,
    vars,
    assert: assertions,
    options: { disableVarExpansion: true, skipRenderVars: ['prompt'] },
  };
  if (metadata) {
    testCase.metadata = metadata;
  }
  return testCase;
}

function buildAgentSkillsAssertions(
  entry: AgentSkillsEvalCase,
): { type: 'llm-rubric'; value: string }[] {
  const assertions: { type: 'llm-rubric'; value: string }[] = [];
  if (typeof entry.expected_output === 'string' && entry.expected_output.trim()) {
    assertions.push({ type: 'llm-rubric', value: entry.expected_output });
  }
  if (Array.isArray(entry.assertions)) {
    for (const assertion of entry.assertions) {
      if (typeof assertion === 'string' && assertion.trim()) {
        assertions.push({ type: 'llm-rubric', value: assertion });
      }
    }
  }
  return assertions;
}

function buildAgentSkillsMetadata(
  idValue: string | number | undefined,
  skillName: string | undefined,
): Record<string, string | number> | undefined {
  const metadata: Record<string, string | number> = {};
  if (idValue != null) {
    metadata.id = idValue;
  }
  if (skillName) {
    metadata.skill_name = skillName;
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

async function readJsonlTestCases(resolvedVarsPath: string): Promise<TestCase[]> {
  const fileContent = await fsPromises.readFile(resolvedVarsPath, 'utf-8');
  return parseJsonlTestCases(fileContent);
}

function parseJsonlTestCases(fileContent: string): TestCase[] {
  return fileContent
    .split('\n')
    .filter((line) => line.trim())
    .map((line, idx) => {
      const row = JSON.parse(line);
      return {
        ...row,
        description: `Row #${idx + 1}`,
      };
    });
}

function parseYamlTestCases(fileContent: string): TestCase[] {
  const rawContent = yaml.load(fileContent);
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
      const rawContent = yaml.load(await fsPromises.readFile(testFile, 'utf-8'));
      testCases = maybeLoadConfigFromExternalFile(rawContent) as TestCase[];
      testCases = await _deref(testCases, testFile);
    } else if (testFile.endsWith('.jsonl')) {
      const fileContent = await fsPromises.readFile(testFile, 'utf-8');
      const rawCases = fileContent
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));
      testCases = maybeLoadConfigFromExternalFile(rawCases) as TestCase[];
      testCases = await _deref(testCases, testFile);
    } else if (testFile.endsWith('.json')) {
      const rawContent = JSON.parse(await fsPromises.readFile(testFile, 'utf8'));
      testCases =
        maybeConvertAgentSkillsEvalsJson(rawContent, testFile) ??
        (maybeLoadConfigFromExternalFile(rawContent) as TestCase[]);
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

async function readTestsArrayStringSource(source: string, basePath: string): Promise<TestCase[]> {
  // Extract path without function name (Windows-aware).
  const lastColonIndex = source.lastIndexOf(':');
  const pathWithoutFunction = lastColonIndex > 1 ? source.slice(0, lastColonIndex) : source;
  // Handle xlsx/xls files with optional sheet specifier (e.g., file.xlsx#Sheet1).
  const pathWithoutSheet = source.split('#')[0];

  if (
    isJavascriptFile(pathWithoutFunction) ||
    pathWithoutFunction.endsWith('.py') ||
    pathWithoutSheet.endsWith('.xlsx') ||
    pathWithoutSheet.endsWith('.xls') ||
    source.replace(/^file:\/\//, '').includes(':')
  ) {
    return readStandaloneTestsFile(source, basePath);
  }

  return loadTestsFromGlob(source, basePath);
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
        ret.push(...(await readTestsArrayStringSource(globOrTest, basePath)));
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
