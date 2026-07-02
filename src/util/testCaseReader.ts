import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { parse as parsePath } from 'path';

import $RefParser from '@apidevtools/json-schema-ref-parser';
import { parse as parseCsv } from 'csv-parse/sync';
import dedent from 'dedent';
import { globSync, hasMagic } from 'glob';
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
import {
  getNunjucksEngineForFilePath,
  loadConfigFromFilePath,
  maybeLoadConfigFromExternalFile,
} from './file';
import { isJavascriptFile } from './fileExtensions';
import { parseRubyFileReference } from './fileUrl';
import { parseFileUrl } from './functions/loadFunction';
import { toPosixPath } from './pathUtils';
import { parseXlsxFile } from './xlsx';

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
  extensionWithoutSheet: string;
};

type AzureBlobTestFileExtension = 'csv' | 'json' | 'jsonl' | 'yaml' | 'yml';

const SHA256_BLOB_SUFFIX = /\.[a-f0-9]{64}$/i;
const varFileDependencyPaths = new WeakMap<object, string[]>();

function getExternalFileDependencyPaths(reference: string, declaringBasePath: string): string[] {
  if (!reference.startsWith('file://')) {
    return [];
  }
  const renderedReference = getNunjucksEngineForFilePath().renderString(reference, {});
  const { filePath } = parseFileUrl(renderedReference);
  const physicalPath = parseRubyFileReference(filePath)?.filePath ?? filePath;
  const absolutePath = path.isAbsolute(physicalPath)
    ? physicalPath
    : path.resolve(declaringBasePath, physicalPath);
  const matches = hasMagic(physicalPath, {
    magicalBraces: true,
    windowsPathsNoEscape: true,
  })
    ? (globSync(absolutePath, { windowsPathsNoEscape: true }) ?? [])
    : [absolutePath];
  return matches.map((matchedPath) => path.resolve(matchedPath));
}

function collectExternalFileDependencies(
  value: unknown,
  declaringBasePath: string,
  dependencyPaths: Set<string>,
  visited = new WeakSet<object>(),
): void {
  if (typeof value === 'string') {
    getExternalFileDependencyPaths(value, declaringBasePath).forEach((dependencyPath) =>
      dependencyPaths.add(dependencyPath),
    );
    return;
  }
  if (typeof value !== 'object' || value === null || visited.has(value)) {
    return;
  }
  visited.add(value);
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && 'value' in descriptor) {
      collectExternalFileDependencies(
        descriptor.value,
        declaringBasePath,
        dependencyPaths,
        visited,
      );
    }
  }
}

export function getVarFileDependencyPaths(value: unknown): string[] {
  return typeof value === 'object' && value !== null
    ? [...(varFileDependencyPaths.get(value) ?? [])]
    : [];
}

function resolveVarFileReference(
  reference: string,
  declaringBasePath: string,
  resolutionBasePath: string,
  resolveDirectReference: boolean,
  visited: WeakSet<object>,
  loadStructuredReference: boolean,
  dependencyPaths?: Set<string>,
): unknown {
  const shouldRender = reference.includes('{{') || reference.includes('{%');
  const renderedReference = shouldRender
    ? maybeLoadConfigFromExternalFile(reference, 'vars')
    : reference;
  if (
    typeof renderedReference !== 'string' ||
    !renderedReference.startsWith('file://') ||
    !resolveDirectReference
  ) {
    return renderedReference;
  }

  const { filePath, functionName } = parseFileUrl(renderedReference);
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(declaringBasePath, filePath);
  const structuredPaths = loadStructuredReference
    ? getStructuredVarFilePaths(filePath, absolutePath, declaringBasePath)
    : undefined;
  if (structuredPaths) {
    return loadStructuredVarFileReference(
      absolutePath,
      structuredPaths,
      resolutionBasePath,
      visited,
      dependencyPaths,
    );
  }
  dependencyPaths?.add(path.resolve(absolutePath));

  if (path.isAbsolute(filePath)) {
    return renderedReference;
  }
  const rebasedPath = path.relative(path.resolve(resolutionBasePath), absolutePath);
  const rebasedReference = `file://${toPosixPath(rebasedPath)}`;
  return functionName ? `${rebasedReference}:${functionName}` : rebasedReference;
}

function resolveVarFileReferences(
  value: unknown,
  declaringBasePath: string,
  resolutionBasePath: string,
  resolveDirectReferences = false,
  visited = new WeakSet<object>(),
  loadStructuredReferences = false,
  dependencyPaths?: Set<string>,
): void {
  if (typeof value !== 'object' || value === null || visited.has(value)) {
    return;
  }
  visited.add(value);

  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || descriptor.writable !== true) {
      continue;
    }

    const nestedValue = descriptor.value;
    if (typeof nestedValue === 'string' && nestedValue.startsWith('file://')) {
      const resolvedValue = resolveVarFileReference(
        nestedValue,
        declaringBasePath,
        resolutionBasePath,
        resolveDirectReferences,
        visited,
        loadStructuredReferences,
        dependencyPaths,
      );
      if (resolvedValue !== nestedValue) {
        Object.defineProperty(value, key, { ...descriptor, value: resolvedValue });
      }
    } else if (Array.isArray(nestedValue) || isPlainObject(nestedValue)) {
      resolveVarFileReferences(
        nestedValue,
        declaringBasePath,
        resolutionBasePath,
        true,
        visited,
        loadStructuredReferences,
        dependencyPaths,
      );
    }
  }
}

const STRUCTURED_VAR_FILE_EXTENSIONS = new Set(['.csv', '.json', '.yaml', '.yml']);

type StructuredVarFileSource = {
  isGlob: boolean;
  matchedPaths: string[];
};

function hasStructuredVarFileExtension(filePath: string): boolean {
  return STRUCTURED_VAR_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function hasStructuredVarFileExtensionPattern(filePath: string): boolean {
  const extensionPattern = path.extname(filePath).toLowerCase();
  return (
    STRUCTURED_VAR_FILE_EXTENSIONS.has(extensionPattern) ||
    /\.(?:csv|json|yaml|yml)(?=$|[)}|,])/.test(filePath.toLowerCase()) ||
    /(?:^|[({|,])(?:csv|json|yaml|yml)(?=$|[)}|,])/.test(extensionPattern)
  );
}

function getStructuredVarFilePaths(
  filePath: string,
  absolutePath: string,
  declaringBasePath: string,
): StructuredVarFileSource | undefined {
  const hasLoaderMagic = hasMagic(filePath, { windowsPathsNoEscape: true });
  if (hasLoaderMagic) {
    const extensionPattern = path.extname(filePath);
    const hasStructuredExtensionPattern = hasStructuredVarFileExtensionPattern(filePath);
    const hasLiteralExtension = /^\.[a-z0-9_-]+$/i.test(extensionPattern);
    if (hasLiteralExtension && !hasStructuredExtensionPattern) {
      return undefined;
    }
    const matchedPaths = path.isAbsolute(filePath)
      ? globSync(filePath, { windowsPathsNoEscape: true })
      : globSync(filePath, {
          absolute: true,
          cwd: declaringBasePath,
          windowsPathsNoEscape: true,
        });
    if (matchedPaths.length === 0) {
      return hasStructuredExtensionPattern ? { isGlob: true, matchedPaths } : undefined;
    }
    return matchedPaths.every(hasStructuredVarFileExtension)
      ? { isGlob: true, matchedPaths }
      : undefined;
  }

  const hasBraceMagic = hasMagic(filePath, {
    magicalBraces: true,
    windowsPathsNoEscape: true,
  });
  return !hasBraceMagic && hasStructuredVarFileExtension(filePath)
    ? { isGlob: false, matchedPaths: [absolutePath] }
    : undefined;
}

function rebaseLoadedStructuredValue(
  value: unknown,
  declaringBasePath: string,
  resolutionBasePath: string,
  visited: WeakSet<object>,
  dependencyPaths?: Set<string>,
): unknown {
  if (typeof value === 'string' && value.startsWith('file://')) {
    return resolveVarFileReference(
      value,
      declaringBasePath,
      resolutionBasePath,
      true,
      visited,
      false,
      dependencyPaths,
    );
  }
  if (typeof value === 'object' && value !== null) {
    resolveVarFileReferences(
      value,
      declaringBasePath,
      resolutionBasePath,
      true,
      visited,
      false,
      dependencyPaths,
    );
  }
  return value;
}

function loadStructuredVarFileReference(
  absolutePath: string,
  source: StructuredVarFileSource,
  resolutionBasePath: string,
  visited: WeakSet<object>,
  dependencyPaths?: Set<string>,
): unknown {
  for (const matchedPath of source.matchedPaths) {
    dependencyPaths?.add(path.resolve(matchedPath));
  }
  if (!source.isGlob) {
    return rebaseLoadedStructuredValue(
      loadConfigFromFilePath(absolutePath),
      path.dirname(absolutePath),
      resolutionBasePath,
      visited,
      dependencyPaths,
    );
  }

  if (source.matchedPaths.length === 0) {
    throw new Error(`No files found matching pattern: ${absolutePath}`);
  }

  const loadedValues: unknown[] = [];
  for (const matchedPath of source.matchedPaths) {
    let loadedValue: unknown;
    try {
      loadedValue = loadConfigFromFilePath(matchedPath);
    } catch (error) {
      if (error instanceof Error && error.message === `File does not exist: ${matchedPath}`) {
        logger.debug(`File disappeared during glob expansion: ${matchedPath}`);
        continue;
      }
      throw error;
    }
    const extension = path.extname(matchedPath).toLowerCase();
    if ((extension === '.yaml' || extension === '.yml') && loadedValue == null) {
      continue;
    }
    const rebasedValue = rebaseLoadedStructuredValue(
      loadedValue,
      path.dirname(matchedPath),
      resolutionBasePath,
      visited,
      dependencyPaths,
    );
    if (Array.isArray(rebasedValue)) {
      loadedValues.push(...rebasedValue);
    } else {
      loadedValues.push(rebasedValue);
    }
  }
  return loadedValues;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function rebaseTestCaseVarFileReferences(
  testCase: TestCase,
  declaringBasePath: string,
  resolutionBasePath: string,
  visited = new WeakSet<object>(),
): TestCase {
  resolveVarFileReferences(testCase.vars, declaringBasePath, resolutionBasePath, false, visited);
  return testCase;
}

function loadTopLevelVarsFileReferences(
  value: unknown,
  declaringBasePath: string,
  resolutionBasePath: string,
  visited: WeakSet<object>,
  dependencyPaths?: Set<string>,
): unknown {
  if (typeof value !== 'object' || value === null) {
    return value;
  }

  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      !descriptor ||
      !('value' in descriptor) ||
      descriptor.writable !== true ||
      typeof descriptor.value !== 'string' ||
      !descriptor.value.startsWith('file://')
    ) {
      continue;
    }

    const renderedReference = maybeLoadConfigFromExternalFile(descriptor.value, 'vars');
    if (typeof renderedReference !== 'string' || !renderedReference.startsWith('file://')) {
      continue;
    }
    const { filePath } = parseFileUrl(renderedReference);
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(declaringBasePath, filePath);
    const structuredPaths = getStructuredVarFilePaths(filePath, absolutePath, declaringBasePath);
    let loadedValue: unknown;
    if (structuredPaths) {
      loadedValue = loadStructuredVarFileReference(
        absolutePath,
        structuredPaths,
        resolutionBasePath,
        visited,
        dependencyPaths,
      );
    } else {
      loadedValue = resolveVarFileReference(
        renderedReference,
        declaringBasePath,
        resolutionBasePath,
        true,
        visited,
        false,
        dependencyPaths,
      );
    }
    Object.defineProperty(value, key, { ...descriptor, value: loadedValue });
  }

  return value;
}

export async function readTestFiles(
  pathOrGlobs: string | string[],
  basePath: string = '',
  resolutionBasePath: string = basePath || process.cwd(),
): Promise<Record<string, string | string[] | object>> {
  if (typeof pathOrGlobs === 'string') {
    pathOrGlobs = [pathOrGlobs];
  }

  const ret: Record<string, string | string[] | object> = {};
  const dependencyPaths = new Set<string>();
  for (const pathOrGlob of pathOrGlobs) {
    const renderedPathOrGlob = pathOrGlob.startsWith('file://')
      ? maybeLoadConfigFromExternalFile(pathOrGlob, 'vars')
      : pathOrGlob;
    const filePathOrGlob = renderedPathOrGlob.startsWith('file://')
      ? parseFileUrl(renderedPathOrGlob).filePath
      : renderedPathOrGlob;
    const resolvedPath = path.resolve(basePath, filePathOrGlob);

    const paths = globSync(resolvedPath, {
      windowsPathsNoEscape: true,
    });

    for (const p of paths) {
      dependencyPaths.add(path.resolve(p));
      const rawData = yaml.load(await fsPromises.readFile(p, 'utf-8'));
      const visited = new WeakSet<object>();
      const yamlData = loadTopLevelVarsFileReferences(
        rawData,
        path.dirname(p),
        resolutionBasePath,
        visited,
        dependencyPaths,
      );
      resolveVarFileReferences(
        yamlData,
        path.dirname(p),
        resolutionBasePath,
        false,
        visited,
        true,
        dependencyPaths,
      );
      Object.assign(ret, yamlData);
    }
  }
  varFileDependencyPaths.set(ret, [...dependencyPaths]);
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
    const testCases = await readLocalStandaloneTestsFile(varsPath, basePath, finalConfig);
    const { fileExtension, pathWithoutFunction } = getStandaloneTestsFileMetadata(
      varsPath,
      basePath,
    );
    if (
      fileExtension === 'json' ||
      fileExtension === 'jsonl' ||
      fileExtension === 'yaml' ||
      fileExtension === 'yml'
    ) {
      const declaringBasePath = path.dirname(pathWithoutFunction);
      const visited = new WeakSet<object>();
      const loadedTestCases: TestCase[] = [];
      for (const testCase of testCases) {
        const loadedTestCase = await loadTestWithVars(
          testCase,
          declaringBasePath,
          basePath || process.cwd(),
        );
        loadedTestCases.push(
          typeof testCase.vars === 'string' || Array.isArray(testCase.vars)
            ? loadedTestCase
            : rebaseTestCaseVarFileReferences(
                loadedTestCase,
                declaringBasePath,
                basePath || process.cwd(),
                visited,
              ),
        );
      }
      return loadedTestCases;
    }
    return testCases;
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
  const parsedFileUrl = varsPath.startsWith('file://') ? parseFileUrl(varsPath) : undefined;
  const resolvedVarsPath = path.resolve(basePath, parsedFileUrl?.filePath ?? varsPath);
  if (parsedFileUrl?.functionName) {
    const pathWithoutFunction = resolvedVarsPath;
    const fileExtension = parsePath(pathWithoutFunction).ext.slice(1);
    return {
      resolvedVarsPath,
      pathWithoutFunction,
      maybeFunctionName: parsedFileUrl.functionName,
      fileExtension,
      extensionWithoutSheet: fileExtension.split('#')[0],
    };
  }
  const lastColonIndex = resolvedVarsPath.lastIndexOf(':');
  const candidateFilePath = resolvedVarsPath.slice(0, lastColonIndex);
  const candidateFunctionName = resolvedVarsPath.slice(lastColonIndex + 1);
  const lastColonIsInDirectory = /[\\/]/.test(candidateFunctionName);
  const hasFunctionSuffix =
    lastColonIndex > 1 &&
    !lastColonIsInDirectory &&
    (isJavascriptFile(candidateFilePath) || candidateFilePath.endsWith('.py'));

  const basename = parsePath(resolvedVarsPath).base;
  const firstBasenameColon = basename.indexOf(':');
  const hasMultipleExecutableSuffixes =
    firstBasenameColon > 0 &&
    basename.indexOf(':', firstBasenameColon + 1) > firstBasenameColon &&
    (isJavascriptFile(basename.slice(0, firstBasenameColon)) ||
      basename.slice(0, firstBasenameColon).endsWith('.py'));
  if (hasMultipleExecutableSuffixes) {
    throw new Error(`Too many colons. Invalid test file script path: ${varsPath}`);
  }

  const pathWithoutFunction = hasFunctionSuffix ? candidateFilePath : resolvedVarsPath;
  const maybeFunctionName = hasFunctionSuffix ? candidateFunctionName : undefined;
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
  return parseJsonTestCases(fileContent);
}

function parseJsonTestCases(fileContent: string): TestCase[] {
  const jsonData = yaml.load(fileContent) as any;
  const testCases: TestCase[] = Array.isArray(jsonData) ? jsonData : [jsonData];
  return testCases.map((item, idx) => ({
    ...item,
    description: item.description || `Row #${idx + 1}`,
  }));
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
        description: row.description || `Row #${idx + 1}`,
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
  resolutionBasePath: string = testBasePath || process.cwd(),
): Promise<TestCase> {
  const ret: TestCase = { ...testCase, vars: undefined };
  if (typeof testCase.vars === 'string' || Array.isArray(testCase.vars)) {
    ret.vars = await readTestFiles(testCase.vars, testBasePath, resolutionBasePath);
    varFileDependencyPaths.set(ret, getVarFileDependencyPaths(ret.vars));
  } else {
    ret.vars = testCase.vars;
  }
  return ret;
}

function loadExternalDefaultTestAssertionValues(
  assertions: TestCase['assert'],
  declaringBasePath: string,
  resolutionBasePath: string,
  dependencyPaths: Set<string>,
): void {
  if (!Array.isArray(assertions)) {
    return;
  }
  const pending: Array<{
    assertions: unknown[];
    index: number;
    loadStringEntries: boolean;
  }> = assertions.map((_, index) => ({
    assertions: assertions as unknown[],
    index,
    loadStringEntries: true,
  }));
  const visited = new WeakSet<object>();
  while (pending.length > 0) {
    const { assertions: assertionList, index, loadStringEntries } = pending.pop()!;
    let assertion = assertionList[index];
    const loadedFromString = typeof assertion === 'string';
    let assertionSourcePaths: string[] = [];
    if (typeof assertion === 'string') {
      if (!loadStringEntries) {
        continue;
      }
      assertionSourcePaths = getExternalFileDependencyPaths(assertion, declaringBasePath);
      assertionSourcePaths.forEach((dependencyPath) => dependencyPaths.add(dependencyPath));
      assertion = maybeLoadConfigFromExternalFile(
        assertion,
        'assertion',
        declaringBasePath,
        resolutionBasePath,
      );
      assertionList[index] = assertion;
    }
    if (typeof assertion !== 'object' || assertion === null || visited.has(assertion)) {
      continue;
    }
    if (loadedFromString && assertionSourcePaths.length === 1) {
      const assertionBasePath = path.dirname(assertionSourcePaths[0]);
      collectExternalFileDependencies(assertion, assertionBasePath, dependencyPaths);
      resolveVarFileReferences(
        assertion,
        assertionBasePath,
        resolutionBasePath,
        true,
        new WeakSet<object>(),
        false,
      );
    }
    visited.add(assertion);
    const record = assertion as Record<string, unknown>;
    if (record.type === 'assert-set' && Array.isArray(record.assert)) {
      pending.push(
        ...record.assert.map((_, childIndex) => ({
          assertions: record.assert as unknown[],
          index: childIndex,
          loadStringEntries: !loadedFromString && loadStringEntries,
        })),
      );
    }
    if (
      !loadedFromString &&
      loadStringEntries &&
      Object.prototype.hasOwnProperty.call(record, 'value')
    ) {
      collectExternalFileDependencies(record.value, declaringBasePath, dependencyPaths);
      record.value = maybeLoadConfigFromExternalFile(
        record.value,
        'assertion',
        declaringBasePath,
        resolutionBasePath,
      );
    }
  }
}

export async function readTest(
  test: string | TestCaseWithVarsFile,
  basePath: string = '',
  isDefaultTest: boolean = false,
): Promise<TestCase> {
  let testCase: TestCase;
  let effectiveBasePath = basePath;
  const externalDefaultTestDependencyPaths = new Set<string>();

  if (typeof test === 'string') {
    const testFilePath = path.resolve(basePath, test);
    effectiveBasePath = path.dirname(testFilePath);
    const rawContent = yaml.load(await fsPromises.readFile(testFilePath, 'utf-8'));
    const rawTestCase = (
      isDefaultTest ? rawContent : maybeLoadConfigFromExternalFile(rawContent)
    ) as TestCaseWithVarsFile;
    if (isDefaultTest) {
      loadExternalDefaultTestAssertionValues(
        rawTestCase.assert,
        effectiveBasePath,
        basePath || process.cwd(),
        externalDefaultTestDependencyPaths,
      );
    }
    testCase = await loadTestWithVars(rawTestCase, effectiveBasePath, basePath || process.cwd());
    if (externalDefaultTestDependencyPaths.size > 0) {
      varFileDependencyPaths.set(testCase, [
        ...new Set([...getVarFileDependencyPaths(testCase), ...externalDefaultTestDependencyPaths]),
      ]);
    }
    if (typeof rawTestCase.vars !== 'string' && !Array.isArray(rawTestCase.vars)) {
      rebaseTestCaseVarFileReferences(testCase, effectiveBasePath, basePath || process.cwd());
    }
  } else {
    testCase = await loadTestWithVars(test, basePath, basePath || process.cwd());
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
    loadTestsGlob = parseFileUrl(loadTestsGlob).filePath;
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
    let testCasesDeclareNestedVarPaths = false;
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
      testCasesDeclareNestedVarPaths = true;
    } else if (testFile.endsWith('.jsonl')) {
      const fileContent = await fsPromises.readFile(testFile, 'utf-8');
      const rawCases = fileContent
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));
      testCases = maybeLoadConfigFromExternalFile(rawCases) as TestCase[];
      testCases = await _deref(testCases, testFile);
      testCasesDeclareNestedVarPaths = true;
    } else if (testFile.endsWith('.json')) {
      const rawContent = JSON.parse(await fsPromises.readFile(testFile, 'utf8'));
      testCases = maybeLoadConfigFromExternalFile(rawContent) as TestCase[];
      testCases = await _deref(testCases, testFile);
      testCasesDeclareNestedVarPaths = true;
    } else {
      throw new Error(`Unsupported file type for test file: ${testFile}`);
    }

    if (testCases) {
      if (!Array.isArray(testCases) && typeof testCases === 'object') {
        testCases = [testCases];
      }
      const visited = new WeakSet<object>();
      for (const testCase of testCases) {
        const loadedTestCase = await readTest(testCase, path.dirname(testFile));
        if (testCasesDeclareNestedVarPaths) {
          rebaseTestCaseVarFileReferences(
            loadedTestCase,
            path.dirname(testFile),
            basePath || process.cwd(),
            visited,
          );
        }
        ret.push(loadedTestCase);
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
