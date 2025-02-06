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
import telemetry from '../telemetry';
import type {
  CsvRow,
  TestCase,
  TestCaseWithVarsFile,
  TestSuiteConfig,
  ProviderOptions,
} from '../types';

function parseJson(json: string): any | undefined {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
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

export async function readStandaloneTestsFile(
  varsPath: string,
  basePath: string = '',
): Promise<TestCase[]> {
  // This function is confusingly named - it reads a CSV, JSON, or YAML file of
  // TESTS or test equivalents.
  const resolvedVarsPath = path.resolve(basePath, varsPath.replace(/^file:\/\//, ''));
  const fileExtension = parsePath(resolvedVarsPath).ext.slice(1);
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
    rows = parseCsv(fs.readFileSync(resolvedVarsPath, 'utf-8'), {
      columns: true,
      bom: true,
      delimiter,
    });
  } else if (fileExtension === 'json') {
    telemetry.recordAndSendOnce('feature_used', {
      feature: 'json tests file',
    });
    rows = parseJson(fs.readFileSync(resolvedVarsPath, 'utf-8'));
  } else if (fileExtension === 'yaml' || fileExtension === 'yml') {
    telemetry.recordAndSendOnce('feature_used', {
      feature: 'yaml tests file',
    });
    rows = yaml.load(fs.readFileSync(resolvedVarsPath, 'utf-8')) as unknown as any;
  } else if (fileExtension === 'js' || fileExtension === 'ts' || fileExtension === 'mjs') {
    telemetry.recordAndSendOnce('feature_used', {
      feature: 'js tests file',
    });
    return await importModule(resolvedVarsPath);
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
    ret.vars = await readVarsFiles(testCase.vars, testBasePath);
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

export async function readTests(
  tests: TestSuiteConfig['tests'],
  basePath: string = '',
): Promise<TestCase[]> {
  const ret: TestCase[] = [];

  const loadTestsFromGlob = async (loadTestsGlob: string) => {
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
    const testFiles = globSync(resolvedPath, {
      windowsPathsNoEscape: true,
    });

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
      if (
        testFile.endsWith('.csv') ||
        testFile.startsWith('https://docs.google.com/spreadsheets/')
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
  };

  if (typeof tests === 'string') {
    if (tests.endsWith('yaml') || tests.endsWith('yml')) {
      // Points to a tests file with multiple test cases
      return loadTestsFromGlob(tests);
    } else {
      // Points to a tests.{csv,json,yaml,yml,js} or Google Sheet
      return readStandaloneTestsFile(tests, basePath);
    }
  } else if (Array.isArray(tests)) {
    for (const globOrTest of tests) {
      if (typeof globOrTest === 'string') {
        // Resolve globs
        ret.push(...(await loadTestsFromGlob(globOrTest)));
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
