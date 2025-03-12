import logger from '../../logger';
import type { TestSuite } from '../../types';
import { ResultFailureReason } from '../../types';
import { filterTestsByResults } from './filterTestsUtil';

/**
 * Options for filtering test cases in a test suite.
 */
export interface FilterOptions {
  /** Path or ID to filter tests that resulted in errors */
  errorsOnly?: string;
  /** Path or ID to filter tests that did not pass (failed from assert or errors) */
  failing?: string;
  /** Number of tests to take from the beginning */
  firstN?: number | string;
  /** Key-value pair (format: "key=value") to filter tests by metadata */
  metadata?: string;
  /** Regular expression pattern to filter tests by description */
  pattern?: string;
  /** Number of random tests to sample */
  sample?: number | string;
}

type Tests = NonNullable<TestSuite['tests']>;

/**
 * Filters a test suite to only include all tests that did not pass (failures + errors)
 * @param testSuite - The test suite containing all tests
 * @param pathOrId - Either a file path to a JSON results file or an eval ID
 * @returns A filtered array of tests that failed in the specified eval
 */
export async function filterFailingTests(testSuite: TestSuite, pathOrId: string): Promise<Tests> {
  return filterTestsByResults(testSuite, pathOrId, (result) => !result.success);
}

/**
 * Filters a test suite to only include tests that resulted in errors from a specific eval
 * @param testSuite - The test suite containing all tests
 * @param pathOrId - Either a file path to a JSON results file or an eval ID
 * @returns A filtered array of tests that resulted in errors in the specified evaluation
 */
export async function filterErrorTests(testSuite: TestSuite, pathOrId: string): Promise<Tests> {
  return filterTestsByResults(
    testSuite,
    pathOrId,
    (result) => result.failureReason === ResultFailureReason.ERROR,
  );
}

/**
 * Applies multiple filters to a test suite based on the provided options.
 * Filters are applied in the following order:
 * 1. Metadata filter
 * 2. Failing tests filter
 * 3. Error tests filter
 * 4. Pattern filter
 * 5. First N filter
 * 6. Random sample filter
 *
 * @param testSuite - The test suite containing all tests
 * @param options - Configuration options for filtering
 * @returns A filtered array of tests that match all the specified criteria
 * @throws {Error} If metadata filter format is invalid or if numeric filters contain non-numeric values
 */
export async function filterTests(testSuite: TestSuite, options: FilterOptions): Promise<Tests> {
  let tests = testSuite.tests || [];

  logger.debug(`Starting filterTests with options: ${JSON.stringify(options)}`);
  logger.debug(`Initial test count: ${tests.length}`);

  if (Object.keys(options).length === 0) {
    logger.debug('No filter options provided, returning all tests');
    return tests;
  }

  if (options.metadata) {
    const [key, value] = options.metadata.split('=');
    if (!key || value === undefined) {
      throw new Error('--filter-metadata must be specified in key=value format');
    }
    logger.debug(`Filtering for metadata ${key}=${value}`);
    logger.debug(`Before metadata filter: ${tests.length} tests`);

    tests = tests.filter((test) => {
      if (!test.metadata) {
        logger.debug(`Test has no metadata: ${test.description || 'unnamed test'}`);
        return false;
      }
      const matches = test.metadata[key] === value;
      if (!matches) {
        logger.debug(
          `Test "${test.description || 'unnamed test'}" metadata doesn't match. Expected ${key}=${value}, got ${JSON.stringify(test.metadata)}`,
        );
      }
      return matches;
    });

    logger.debug(`After metadata filter: ${tests.length} tests remain`);
  }

  if (options.failing) {
    tests = await filterFailingTests(testSuite, options.failing);
  }

  if (options.errorsOnly) {
    tests = await filterErrorTests(testSuite, options.errorsOnly);
  }

  if (options.pattern) {
    const pattern = new RegExp(options.pattern);
    tests = tests.filter((test) => test.description && pattern.test(test.description));
  }

  if (options.firstN !== undefined) {
    const count =
      typeof options.firstN === 'number' ? options.firstN : Number.parseInt(options.firstN);

    if (Number.isNaN(count)) {
      throw new Error(`firstN must be a number, got: ${options.firstN}`);
    }

    tests = tests.slice(0, count);
  }

  if (options.sample !== undefined) {
    const count =
      typeof options.sample === 'number' ? options.sample : Number.parseInt(options.sample);

    if (Number.isNaN(count)) {
      throw new Error(`sample must be a number, got: ${options.sample}`);
    }

    // Fisher-Yates shuffle and take first n elements
    const shuffled = [...tests];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    tests = shuffled.slice(0, count);
  }

  return tests;
}
