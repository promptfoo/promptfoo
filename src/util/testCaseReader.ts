import $RefParser from '@apidevtools/json-schema-ref-parser';
import { parse as parseCsv } from 'csv-parse/sync';
import dedent from 'dedent';
import * as fs from 'fs';
import { globSync } from 'glob';
import yaml from 'js-yaml';
import * as path from 'path';
import { parse as parsePath } from 'path';
import { testCaseFromCsvRow } from '../csv';
import { getEnvBool, getEnvString } from '../envars';
import { importModule } from '../esm';
import { fetchCsvFromGoogleSheet } from '../googleSheets';
import { fetchHuggingFaceDataset } from '../integrations/huggingfaceDatasets';
import logger from '../logger';
import { loadApiProvider } from '../providers';
import { runPython } from '../python/pythonUtils';
import telemetry from '../telemetry';
import type {
  CsvRow,
  ProviderOptions,
  TestCase,
  TestCaseWithVarsFile,
  TestSuiteConfig,
} from '../types';
import { isJavascriptFile } from './file';

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
      const yamlData = yaml.load(fs.readFileSync(p, 'utf-8'));
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
): Promise<TestCase[]> {
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

  if (varsPath.startsWith('huggingface://datasets/')) {
    telemetry.recordAndSendOnce('feature_used', {
      feature: 'huggingface dataset',
    });
    return await fetchHuggingFaceDataset(varsPath);
  }
  if (isJavascriptFile(pathWithoutFunction)) {
    telemetry.recordAndSendOnce('feature_used', {
      feature: 'js tests file',
    });
    const mod = await importModule(pathWithoutFunction, maybeFunctionName);
    return typeof mod === 'function' ? await mod() : mod;
  }
  if (fileExtension === 'py') {
    telemetry.recordAndSendOnce('feature_used', {
      feature: 'python tests file',
    });
    const result = await runPython(pathWithoutFunction, maybeFunctionName ?? 'generate_tests', []);
    if (!Array.isArray(result)) {
      throw new Error(
        `Python test function must return a list of test cases, got ${typeof result}`,
      );
    }
    return result;
  }

  let rows: CsvRow[] = [];

  if (varsPath.startsWith('https://docs.google.com/spreadsheets/')) {
    telemetry.recordAndSendOnce('feature_used', {
      feature: 'csv tests file - google sheet',
    });
    rows = await fetchCsvFromGoogleSheet(varsPath);
  } else if (fileExtension === 'csv') {
    telemetry.recordAndSendOnce('feature_used', {
      feature: 'csv tests file - local',
    });
    const delimiter = getEnvString('PROMPTFOO_CSV_DELIMITER', ',');
    const fileContent = fs.readFileSync(resolvedVarsPath, 'utf-8');
    const enforceStrict = getEnvBool('PROMPTFOO_CSV_STRICT', false);

    try {
      // First try parsing with strict mode if enforced
      if (enforceStrict) {
        rows = parseCsv(fileContent, {
          columns: true,
          bom: true,
          delimiter,
          relax_quotes: false,
        });
      } else {
        // Try strict mode first, fall back to relaxed if it fails
        try {
          rows = parseCsv(fileContent, {
            columns: true,
            bom: true,
            delimiter,
            relax_quotes: false,
          });
        } catch {
          // If strict parsing fails, try with relaxed quotes
          rows = parseCsv(fileContent, {
            columns: true,
            bom: true,
            delimiter,
            relax_quotes: true,
          });
        }
      }
    } catch (err) {
      // Add helpful context to the error message
      const e = err as { code?: string; message: string };
      if (e.code === 'CSV_INVALID_OPENING_QUOTE') {
        throw new Error(e.message);
      }
      throw e;
    }
  } else if (fileExtension === 'json') {
    telemetry.recordAndSendOnce('feature_used', {
      feature: 'json tests file',
    });
    rows = yaml.load(fs.readFileSync(resolvedVarsPath, 'utf-8')) as unknown as any;
  } else if (fileExtension === 'yaml' || fileExtension === 'yml') {
    telemetry.recordAndSendOnce('feature_used', {
      feature: 'yaml tests file',
    });
    rows = yaml.load(fs.readFileSync(resolvedVarsPath, 'utf-8')) as unknown as any;
  }
  return rows.map((row, idx) => {
    const test = testCaseFromCsvRow(row);
    test.description ||= `Row #${idx + 1}`;
    return test;
  });
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
): Promise<TestCase> {
  let testCase: TestCase;

  if (typeof test === 'string') {
    const testFilePath = path.resolve(basePath, test);
    const testBasePath = path.dirname(testFilePath);
    const rawTestCase = yaml.load(fs.readFileSync(testFilePath, 'utf-8')) as TestCaseWithVarsFile;
    testCase = await loadTestWithVars(rawTestCase, testBasePath);
  } else {
    testCase = await loadTestWithVars(test, basePath);
  }

  if (testCase.provider && typeof testCase.provider !== 'function') {
    // Load provider
    if (typeof testCase.provider === 'string') {
      testCase.provider = await loadApiProvider(testCase.provider);
    } else if (typeof testCase.provider.id === 'string') {
      testCase.provider = await loadApiProvider(testCase.provider.id, {
        options: testCase.provider as ProviderOptions,
        basePath,
      });
    }
  }

  if (
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
    telemetry.recordAndSendOnce('feature_used', {
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

  // Check for possible function names in the path
  const pathWithoutFunction: string = resolvedPath.split(':')[0];
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

  const ret: TestCase<Record<string, string | string[] | object>>[] = [];
  if (testFiles.length < 1) {
    logger.error(`No test files found for path: ${loadTestsGlob}`);
    return ret;
  }
  for (const testFile of testFiles) {
    let testCases: TestCase[] | undefined;
    const pathWithoutFunction: string = testFile.split(':')[0];

    if (
      testFile.endsWith('.csv') ||
      testFile.startsWith('https://docs.google.com/spreadsheets/') ||
      isJavascriptFile(pathWithoutFunction) ||
      pathWithoutFunction.endsWith('.py')
    ) {
      testCases = await readStandaloneTestsFile(testFile, basePath);
    } else if (testFile.endsWith('.yaml') || testFile.endsWith('.yml')) {
      testCases = yaml.load(fs.readFileSync(testFile, 'utf-8')) as TestCase[];
      testCases = await _deref(testCases, testFile);
    } else if (testFile.endsWith('.jsonl')) {
      const fileContent = fs.readFileSync(testFile, 'utf-8');
      testCases = fileContent
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));
      testCases = await _deref(testCases, testFile);
    } else if (testFile.endsWith('.json')) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      testCases = await _deref(require(testFile), testFile);
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
    // Points to a tests file with multiple test cases
    if (tests.endsWith('yaml') || tests.endsWith('yml')) {
      return loadTestsFromGlob(tests, basePath);
    }
    // Points to a tests.{csv,json,yaml,yml,py,js,ts,mjs} or Google Sheet
    return readStandaloneTestsFile(tests, basePath);
  }
  if (Array.isArray(tests)) {
    for (const globOrTest of tests) {
      if (typeof globOrTest === 'string') {
        const pathWithoutFunction: string = globOrTest.split(':')[0];
        // For Python and JS files, or files with potential function names, use readStandaloneTestsFile
        if (
          isJavascriptFile(pathWithoutFunction) ||
          pathWithoutFunction.endsWith('.py') ||
          globOrTest.replace(/^file:\/\//, '').includes(':')
        ) {
          ret.push(...(await readStandaloneTestsFile(globOrTest, basePath)));
        } else {
          // Resolve globs for other file types
          ret.push(...(await loadTestsFromGlob(globOrTest, basePath)));
        }
      } else {
        // Load individual TestCase
        ret.push(await readTest(globOrTest, basePath));
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
