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
    // Normalize to array for consistent handling
    const metadataFilters = Array.isArray(options.metadata) ? options.metadata : [options.metadata];

    // Validate all filters first
    const parsedFilters: Array<{ key: string; value: string }> = [];
    for (const filter of metadataFilters) {
      const [key, ...valueParts] = filter.split('=');
      const value = valueParts.join('='); // Rejoin in case value contains '='
      if (!key || value === undefined || value === '') {
        throw new Error('--filter-metadata must be specified in key=value format');
      }
      parsedFilters.push({ key, value });
    }

    logger.debug(
      `Filtering for metadata conditions (AND logic): ${parsedFilters.map((f) => `${f.key}=${f.value}`).join(', ')}`,
    );
    logger.debug(`Before metadata filter: ${tests.length} tests`);

    tests = tests.filter((test) => {
      if (!test.metadata) {
        logger.debug(`Test has no metadata: ${test.description || 'unnamed test'}`);
        return false;
      }

      // ALL conditions must match (AND logic)
      for (const { key, value } of parsedFilters) {
        const testValue = test.metadata[key];
        let matches = false;

        if (Array.isArray(testValue)) {
          // For array metadata, check if any value includes the search term
          matches = testValue.some((v) => v.toString().includes(value));
        } else if (testValue !== undefined) {
          // For single value metadata, check if it includes the search term
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
    });

    logger.debug(`After metadata filter: ${tests.length} tests remain`);
  }

  // Handle failing, failingOnly, and errorsOnly filters
  // - failing: all non-successful results (failures + errors)
  // - failingOnly: assertion failures only (excludes errors)
  // - errorsOnly: errors only
  // When failingOnly and errorsOnly are both provided, combine results (union)
  if (options.failingOnly && options.errorsOnly) {
    logger.debug(
      'Using both --filter-failing-only and --filter-errors-only together (equivalent to --filter-failing)',
    );
    const failingOnlyTests = await filterFailingOnlyTests(testSuite, options.failingOnly);
    const errorTests = await filterErrorTests(testSuite, options.errorsOnly);

    // Create a union of both sets, deduplicating by test identity
    const seen = new Set<string>();

    tests = [...failingOnlyTests, ...errorTests].filter((test) => {
      const key = getTestCaseDeduplicationKey(test);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    logger.debug(
      `Combined failingOnly (${failingOnlyTests.length}) and errors (${errorTests.length}) filters: ${tests.length} unique tests`,
    );
    if (tests.length === 0) {
      logger.warn(
        'Combined --filter-failing-only and --filter-errors-only returned no tests. ' +
          'The specified evaluations may have no failures or errors, or the test suite may have changed.',
      );
    }
  } else if (options.failing) {
    // --filter-failing includes both failures and errors
    tests = await filterFailingTests(testSuite, options.failing);
    if (tests.length === 0) {
      logNoTestsWarning('filter-failing', options.failing, 'no failures/errors');
    }
  } else if (options.failingOnly) {
    // --filter-failing-only includes only assertion failures (excludes errors)
    tests = await filterFailingOnlyTests(testSuite, options.failingOnly);
    if (tests.length === 0) {
      logNoTestsWarning(
        'filter-failing-only',
        options.failingOnly,
        'no assertion failures (only errors)',
      );
    }
  } else if (options.errorsOnly) {
    tests = await filterErrorTests(testSuite, options.errorsOnly);
    if (tests.length === 0) {
      logNoTestsWarning('filter-errors-only', options.errorsOnly, 'no errors');
    }
  }

  if (options.pattern) {
    let pattern: RegExp;
    try {
      pattern = new RegExp(options.pattern);
    } catch (e) {
      throw new Error(
        `Invalid regex pattern "${options.pattern}": ${e instanceof Error ? e.message : 'Unknown error'}`,
      );
    }
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
