/**
 * Test filtering module for the eval command.
 *
 * This module provides functions to filter test cases based on previous evaluation results.
 * The filtering functions are named to match their corresponding CLI flags:
 *
 * - `--filter-failing` -> `filterFailingTests`: Returns all non-passing tests (failures + errors)
 * - `--filter-failing-only` -> `filterFailingOnlyTests`: Returns only assertion failures (excludes errors)
 * - `--filter-errors-only` -> `filterErrorTests`: Returns only tests that resulted in errors
 *
 * Runtime variables (like `_conversation`, `sessionId`) are automatically filtered out when
 * matching test cases to results, ensuring proper matching even when multi-turn strategies
 * add runtime state to test vars.
 *
 * @module commands/eval/filterTests
 */

import logger from '../../logger';
import { ResultFailureReason } from '../../types/index';
import { getTestCaseDeduplicationKey } from '../../util/comparison';
import { filterTestsByResults } from './filterTestsUtil';

import type { TestSuite } from '../../types/index';

/**
 * Logs a warning when a filter returns no tests.
 * @param filterType - The CLI flag name (e.g., 'filter-failing')
 * @param pathOrId - The path or eval ID that was filtered
 * @param reason - Description of what the filter was looking for (e.g., 'no failures/errors')
 */
function logNoTestsWarning(filterType: string, pathOrId: string, reason: string): void {
  logger.warn(
    `--${filterType} returned no tests. The evaluation "${pathOrId}" may have ${reason}, ` +
      'or the test suite may have changed since the evaluation was run.',
  );
}

/**
 * Options for filtering test cases in a test suite.
 */
export interface FilterOptions {
  /** Path or ID to filter tests that resulted in errors */
  errorsOnly?: string;
  /** Path or ID to filter tests that did not pass (failed from assert or errors) */
  failing?: string;
  /** Path or ID to filter tests that failed assertions only (excludes errors) */
  failingOnly?: string;
  /** Number of tests to take from the beginning */
  firstN?: number | string;
  /** Key-value pair(s) (format: "key=value") to filter tests by metadata. Multiple values use AND logic. */
  metadata?: string | string[];
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
async function filterFailingTests(testSuite: TestSuite, pathOrId: string): Promise<Tests> {
  // Filter for all non-successful results (both assertion failures and errors)
  return filterTestsByResults(testSuite, pathOrId, (result) => !result.success);
}

/**
 * Filters a test suite to only include tests that failed assertions (excludes errors)
 * @param testSuite - The test suite containing all tests
 * @param pathOrId - Either a file path to a JSON results file or an eval ID
 * @returns A filtered array of tests that failed assertions (not errors) in the specified eval
 */
async function filterFailingOnlyTests(testSuite: TestSuite, pathOrId: string): Promise<Tests> {
  // Filter for assertion failures only, excluding errors
  return filterTestsByResults(
    testSuite,
    pathOrId,
    (result) => !result.success && result.failureReason !== ResultFailureReason.ERROR,
  );
}

/**
 * Filters a test suite to only include tests that resulted in errors from a specific eval
 * @param testSuite - The test suite containing all tests
 * @param pathOrId - Either a file path to a JSON results file or an eval ID
 * @returns A filtered array of tests that resulted in errors in the specified evaluation
 */
async function filterErrorTests(testSuite: TestSuite, pathOrId: string): Promise<Tests> {
  return filterTestsByResults(
    testSuite,
    pathOrId,
    (result) => result.failureReason === ResultFailureReason.ERROR,
  );
}

/**
 * Parses metadata filter strings into key-value pairs.
 * Throws if any filter is not in "key=value" format.
 */
function parseMetadataFilters(metadata: string | string[]): Array<{ key: string; value: string }> {
  const metadataFilters = Array.isArray(metadata) ? metadata : [metadata];
  const parsedFilters: Array<{ key: string; value: string }> = [];

  for (const filter of metadataFilters) {
    const [key, ...valueParts] = filter.split('=');
    const value = valueParts.join('='); // Rejoin in case value contains '='
    if (!key || value === undefined || value === '') {
      throw new Error('--filter-metadata must be specified in key=value format');
    }
    parsedFilters.push({ key, value });
  }

  return parsedFilters;
}

/**
 * Returns true if the test matches all the given metadata filters (AND logic).
 */
function testMatchesMetadataFilters(
  test: Tests[number],
  filters: Array<{ key: string; value: string }>,
): boolean {
  if (!test.metadata) {
    logger.debug(`Test has no metadata: ${test.description || 'unnamed test'}`);
    return false;
  }

  for (const { key, value } of filters) {
    const testValue = test.metadata[key];
    let matches = false;

    if (Array.isArray(testValue)) {
      matches = testValue.some((v) => v.toString().includes(value));
    } else if (testValue !== undefined) {
      matches = testValue.toString().includes(value);
    }

    if (!matches) {
      logger.debug(
        `Test "${test.description || 'unnamed test'}" metadata doesn't match. Expected ${key} to include ${value}, got ${JSON.stringify(test.metadata)}`,
      );
      return false;
    }
  }

  return true;
}

/**
 * Applies the metadata filter to a list of tests.
 */
function applyMetadataFilter(tests: Tests, metadata: string | string[]): Tests {
  const parsedFilters = parseMetadataFilters(metadata);

  logger.debug(
    `Filtering for metadata conditions (AND logic): ${parsedFilters.map((f) => `${f.key}=${f.value}`).join(', ')}`,
  );
  logger.debug(`Before metadata filter: ${tests.length} tests`);

  const result = tests.filter((test) => testMatchesMetadataFilters(test, parsedFilters));

  logger.debug(`After metadata filter: ${result.length} tests remain`);
  return result;
}

/**
 * Applies the failing/error filters based on options.
 * Handles the combination of failingOnly + errorsOnly as a union.
 */
async function applyFailingFilters(
  testSuite: TestSuite,
  tests: Tests,
  options: FilterOptions,
): Promise<Tests> {
  if (options.failingOnly && options.errorsOnly) {
    return applyBothFailingAndErrorFilter(testSuite, options.failingOnly, options.errorsOnly);
  }

  if (options.failing) {
    const filtered = await filterFailingTests(testSuite, options.failing);
    if (filtered.length === 0) {
      logNoTestsWarning('filter-failing', options.failing, 'no failures/errors');
    }
    return filtered;
  }

  if (options.failingOnly) {
    const filtered = await filterFailingOnlyTests(testSuite, options.failingOnly);
    if (filtered.length === 0) {
      logNoTestsWarning(
        'filter-failing-only',
        options.failingOnly,
        'no assertion failures (only errors)',
      );
    }
    return filtered;
  }

  if (options.errorsOnly) {
    const filtered = await filterErrorTests(testSuite, options.errorsOnly);
    if (filtered.length === 0) {
      logNoTestsWarning('filter-errors-only', options.errorsOnly, 'no errors');
    }
    return filtered;
  }

  return tests;
}

/**
 * Applies both failingOnly and errorsOnly filters and returns their union.
 */
async function applyBothFailingAndErrorFilter(
  testSuite: TestSuite,
  failingOnlyPath: string,
  errorsOnlyPath: string,
): Promise<Tests> {
  logger.debug(
    'Using both --filter-failing-only and --filter-errors-only together (equivalent to --filter-failing)',
  );
  const failingOnlyTests = await filterFailingOnlyTests(testSuite, failingOnlyPath);
  const errorTests = await filterErrorTests(testSuite, errorsOnlyPath);

  // Create a union of both sets, deduplicating by test identity
  const seen = new Set<string>();
  const combined = [...failingOnlyTests, ...errorTests].filter((test) => {
    const key = getTestCaseDeduplicationKey(test);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  logger.debug(
    `Combined failingOnly (${failingOnlyTests.length}) and errors (${errorTests.length}) filters: ${combined.length} unique tests`,
  );
  if (combined.length === 0) {
    logger.warn(
      'Combined --filter-failing-only and --filter-errors-only returned no tests. ' +
        'The specified evaluations may have no failures or errors, or the test suite may have changed.',
    );
  }

  return combined;
}

/**
 * Applies the pattern (regex description) filter.
 */
function applyPatternFilter(tests: Tests, pattern: string): Tests {
  let compiledPattern: RegExp;
  try {
    compiledPattern = new RegExp(pattern);
  } catch (e) {
    throw new Error(
      `Invalid regex pattern "${pattern}": ${e instanceof Error ? e.message : 'Unknown error'}`,
    );
  }
  return tests.filter((test) => test.description && compiledPattern.test(test.description));
}

/**
 * Applies the firstN filter, taking the first N tests.
 */
function applyFirstNFilter(tests: Tests, firstN: number | string): Tests {
  const count = typeof firstN === 'number' ? firstN : Number.parseInt(firstN);
  if (Number.isNaN(count)) {
    throw new Error(`firstN must be a number, got: ${firstN}`);
  }
  return tests.slice(0, count);
}

/**
 * Applies the sample filter using Fisher-Yates shuffle.
 */
function applySampleFilter(tests: Tests, sample: number | string): Tests {
  const count = typeof sample === 'number' ? sample : Number.parseInt(sample);
  if (Number.isNaN(count)) {
    throw new Error(`sample must be a number, got: ${sample}`);
  }

  const shuffled = [...tests];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
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
    tests = applyMetadataFilter(tests, options.metadata);
  }

  const hasFailingFilter = options.failing || options.failingOnly || options.errorsOnly;
  if (hasFailingFilter) {
    tests = await applyFailingFilters(testSuite, tests, options);
  }

  if (options.pattern) {
    tests = applyPatternFilter(tests, options.pattern);
  }

  if (options.firstN !== undefined) {
    tests = applyFirstNFilter(tests, options.firstN);
  }

  if (options.sample !== undefined) {
    tests = applySampleFilter(tests, options.sample);
  }

  return tests;
}
