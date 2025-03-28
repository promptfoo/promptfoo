import dedent from 'dedent';
import * as path from 'path';
import { testCaseFromCsvRow } from '../csv';
import { getEnvBool } from '../envars';
import { fetchHuggingFaceDataset } from '../integrations/huggingfaceDatasets';
import logger from '../logger';
import { loadApiProvider } from '../providers';
import telemetry from '../telemetry';
import type {
  CsvRow,
  ProviderOptions,
  TestCase,
  TestCaseWithVarsFile,
  TestSuiteConfig,
} from '../types';
import { isJavascriptFile } from './file';
import { loadFile, loadFilesFromGlob, readFiles } from './fileLoader';

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
  // For Hugging Face datasets, use the specialized function
  if (varsPath.startsWith('huggingface://datasets/')) {
    telemetry.recordAndSendOnce('feature_used', {
      feature: 'huggingface dataset',
    });
    return await fetchHuggingFaceDataset(varsPath);
  }

  // Check for Python files for backward compatibility
  // This is needed because Python files have different error handling
  if (varsPath.endsWith('.py') || (varsPath.includes('.py:') && !varsPath.includes('.py:/'))) {
    // Python files are expected to always return an array
    // If not, we should throw a specific error for backward compatibility
    const content = await loadFile(varsPath, { basePath });
    if (!Array.isArray(content)) {
      throw new Error(
        `Python test function must return a list of test cases, got ${typeof content}`,
      );
    }
    return content;
  }

  // Use the generic file loader
  const content = await loadFile(varsPath, { basePath });

  // Check if the result is an array of objects (from JS, Python, JSON, YAML, etc.)
  if (Array.isArray(content) && content.length > 0 && typeof content[0] === 'object') {
    return content.map((row, idx) => {
      // If this is already a TestCase, return it directly
      if (
        row.vars !== undefined ||
        row.assert !== undefined ||
        row.description !== undefined ||
        row.options !== undefined
      ) {
        return row;
      }

      // Otherwise, convert from CSV row or other format to TestCase
      const test = testCaseFromCsvRow(row);
      test.description ||= `Row #${idx + 1}`;
      return test;
    });
  }

  // Handle CSV-like data (array of objects with column headers)
  if (typeof content === 'object' && !Array.isArray(content)) {
    const rows = content as unknown as CsvRow[];
    return rows.map((row, idx) => {
      const test = testCaseFromCsvRow(row);
      test.description ||= `Row #${idx + 1}`;
      return test;
    });
  }

  // If we couldn't parse it into test cases, return an empty array
  return [];
}

async function loadTestWithVars(
  testCase: TestCaseWithVarsFile,
  testBasePath: string,
): Promise<TestCase> {
  const ret: TestCase = { ...testCase, vars: undefined };
  if (typeof testCase.vars === 'string' || Array.isArray(testCase.vars)) {
    ret.vars = await readFiles(testCase.vars, testBasePath);
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

    // Load the test file content
    const fileContent = await loadFile(testFilePath);

    // If the content is not an object, it can't be a valid test case
    if (typeof fileContent !== 'object' || Array.isArray(fileContent)) {
      throw new Error(`Expected test file to contain an object, got ${typeof fileContent}`);
    }

    const rawTestCase = fileContent as TestCaseWithVarsFile;
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
  // Use the generic file loader to get file contents
  const contents = await loadFilesFromGlob(loadTestsGlob, { basePath });

  const ret: TestCase<Record<string, string | string[] | object>>[] = [];

  for (const content of contents) {
    let testCases: TestCase[] | undefined;

    // If content is already an array of test cases
    if (Array.isArray(content)) {
      testCases = content;
    } else if (content && typeof content === 'object' && !Array.isArray(content)) {
      // Single test case object
      testCases = [content as TestCase];
    }

    if (testCases) {
      for (const testCase of testCases) {
        // Further process each test case (load vars, providers, etc.)
        ret.push(await readTest(testCase, basePath));
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
