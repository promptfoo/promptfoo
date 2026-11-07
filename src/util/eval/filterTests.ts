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
 * @module util/eval/filterTests
 */

import logger from '../../logger';
import { ResultFailureReason } from '../../types/index';
import { deduplicateTestCases, filterRuntimeVars } from '../../util/comparison';
import { filterByRange } from '../../util/filterRange';
import { warnEmptyFilterRange } from '../../util/filterRangeWarn';
import { providerToIdentifier } from '../provider';
import { filterTestsByResults, type ResultMatchContext } from './filterTestsUtil';

import type { TestCase, TestSuite } from '../../types/index';

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
  /** Metadata filters: comma-separated values use OR; separate filters use AND, even for the same key. */
  metadata?: string | string[];
  /** Exact metadata filters: comma-separated values use OR; separate filters use AND. */
  metadataExact?: string | string[];
  /** Metadata inherited from defaults and scenario config when applying exact filters. */
  inheritedMetadata?: TestCase['metadata'];
  /** Restricts stored-result matching and extraction to the selected scenario variant. */
  resultMatchContext?: ResultMatchContext;
  /** Regular expression pattern to filter tests by description */
  pattern?: string;
  /** Zero-based test index range in start:end format. End is exclusive. */
  range?: string;
  /** Number of random tests to sample */
  sample?: number | string;
  /** Seed used to make random sampling repeatable */
  sampleSeed?: number;
}

type Tests = NonNullable<TestSuite['tests']>;
type TestFilterFn = (test: TestCase) => boolean;

function deduplicateTestsWithMetadata(tests: Tests, context: ResultMatchContext): Tests {
  const seenAuthored = new Set<TestCase>();
  const seenExtracted = new Set<string>();
  return tests.filter((test) => {
    const authoredTest = context.authoredTestFor?.(test);
    if (authoredTest) {
      if (seenAuthored.has(authoredTest)) {
        return false;
      }
      seenAuthored.add(authoredTest);
      return true;
    }
    const key = JSON.stringify({
      vars: filterRuntimeVars(test.vars),
      metadata: test.metadata,
      provider: providerToIdentifier(test.provider),
      extractedIdentity: context.extractedIdentityFor?.(test),
      prompts: test.prompts,
      providers: test.providers,
    });
    if (seenExtracted.has(key)) {
      return false;
    }
    seenExtracted.add(key);
    return true;
  });
}

/**
 * Splits a metadata filter value into its alternatives. Commas separate alternatives, and
 * `\,` stands for a comma inside one.
 *
 * Backslashes are only special in a run directly before a comma, where each pair stands for
 * one backslash: `a\\,b` is the alternatives `a\` and `b`, and `a\\\,b` is the single value
 * `a\,b`. Anywhere else they are literal, so paths such as `C:\dir` need no escaping.
 */
function splitMetadataFilterValue(value: string): string[] {
  const alternatives = [''];
  let index = 0;
  while (index < value.length) {
    let end = index;
    while (value[end] === '\\') {
      end++;
    }
    const backslashes = end - index;
    if (value[end] === ',') {
      alternatives[alternatives.length - 1] += '\\'.repeat(Math.floor(backslashes / 2));
      if (backslashes % 2 === 1) {
        alternatives[alternatives.length - 1] += ',';
      } else {
        alternatives.push('');
      }
    } else {
      // Not before a comma: the backslashes and the character after them are literal.
      alternatives[alternatives.length - 1] += value.slice(index, end + 1);
    }
    index = end + 1;
  }
  return alternatives;
}

function parseMetadataFilters(
  filters: string[],
  optionName: string,
  includeInvalidFilterInError = true,
) {
  return filters.map((filter) => {
    const [key, ...valueParts] = filter.split('=');
    const value = valueParts.join('=');
    if (!key || value === '') {
      throw new Error(`${optionName} must be specified in key=value format`);
    }
    const values = splitMetadataFilterValue(value);
    if (values.includes('')) {
      const detail = includeInvalidFilterInError
        ? ` in "${filter}"`
        : '. Use key=value with non-empty values.';
      throw new Error(`${optionName} has an empty value${detail}`);
    }
    return { key, values };
  });
}

function stringifyMetadataScalar(value: unknown): string | undefined {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'object' ||
    typeof value === 'function'
  ) {
    return undefined;
  }
  return String(value);
}

function createSeededRandom(seed: number): () => number {
  const stringSeed = String(seed);
  let state = 2166136261;
  for (let i = 0; i < stringSeed.length; i++) {
    state = Math.imul(state ^ stringSeed.charCodeAt(i), 16777619);
  }

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Filters a test suite to only include all tests that did not pass (failures + errors)
 * @param testSuite - The test suite containing all tests
 * @param pathOrId - Either a file path to a JSON results file or an eval ID
 * @returns A filtered array of tests that failed in the specified eval
 */
async function filterFailingTests(
  testSuite: TestSuite,
  pathOrId: string,
  extractedTestFilter?: TestFilterFn,
  resultMatchContext?: ResultMatchContext,
): Promise<Tests> {
  // Filter for all non-successful results (both assertion failures and errors)
  return filterTestsByResults(
    testSuite,
    pathOrId,
    (result) => !result.success,
    extractedTestFilter,
    resultMatchContext,
  );
}

/**
 * Filters a test suite to only include tests that failed assertions (excludes errors)
 * @param testSuite - The test suite containing all tests
 * @param pathOrId - Either a file path to a JSON results file or an eval ID
 * @returns A filtered array of tests that failed assertions (not errors) in the specified eval
 */
async function filterFailingOnlyTests(
  testSuite: TestSuite,
  pathOrId: string,
  extractedTestFilter?: TestFilterFn,
  resultMatchContext?: ResultMatchContext,
): Promise<Tests> {
  // Filter for assertion failures only, excluding errors
  return filterTestsByResults(
    testSuite,
    pathOrId,
    (result) => !result.success && result.failureReason !== ResultFailureReason.ERROR,
    extractedTestFilter,
    resultMatchContext,
  );
}

/**
 * Filters a test suite to only include tests that resulted in errors from a specific eval
 * @param testSuite - The test suite containing all tests
 * @param pathOrId - Either a file path to a JSON results file or an eval ID
 * @returns A filtered array of tests that resulted in errors in the specified evaluation
 */
async function filterErrorTests(
  testSuite: TestSuite,
  pathOrId: string,
  extractedTestFilter?: TestFilterFn,
  resultMatchContext?: ResultMatchContext,
): Promise<Tests> {
  return filterTestsByResults(
    testSuite,
    pathOrId,
    (result) => result.failureReason === ResultFailureReason.ERROR,
    extractedTestFilter,
    resultMatchContext,
  );
}

/**
 * Applies multiple filters to a test suite based on the provided options.
 * Filters are applied in the following order:
 * 1. Metadata filter
 * 2. Failing tests filter
 * 3. Error tests filter
 * 4. Pattern filter
 * 5. Range filter
 * 6. First N filter
 * 7. Random sample filter
 *
 * @param testSuite - The test suite containing all tests
 * @param options - Configuration options for filtering
 * @returns A filtered array of tests that match all the specified criteria
 * @throws {Error} If metadata filter format is invalid or if numeric filters contain non-numeric values
 */
export async function filterTests(testSuite: TestSuite, options: FilterOptions): Promise<Tests> {
  let tests = testSuite.tests || [];
  let metadataFilter: TestFilterFn | undefined;
  let exactMetadataFilter: TestFilterFn | undefined;

  const loggableOptions = { ...options };
  delete loggableOptions.metadata;
  delete loggableOptions.metadataExact;
  delete loggableOptions.inheritedMetadata;
  delete loggableOptions.resultMatchContext;
  logger.debug('Starting filterTests with options', loggableOptions);
  logger.debug(`Initial test count: ${tests.length}`);

  if (Object.keys(options).length === 0) {
    logger.debug('No filter options provided, returning all tests');
    return tests;
  }

  if (options.metadata) {
    // Normalize to array for consistent handling
    const metadataFilters = Array.isArray(options.metadata) ? options.metadata : [options.metadata];

    const parsedFilters = parseMetadataFilters(metadataFilters, '--filter-metadata');

    logger.debug(`Filtering for ${parsedFilters.length} legacy metadata condition(s)`);
    logger.debug(`Before metadata filter: ${tests.length} tests`);

    // Preserve legacy-only behavior; mixed mode skips nullish values as exact mode requires.
    const skipNullLegacyValues = options.metadataExact !== undefined;
    metadataFilter = (test) => {
      if (!test.metadata) {
        logger.debug(`Test has no metadata: ${test.description || 'unnamed test'}`);
        return false;
      }

      // Every filter must match, including separate filters for the same key.
      for (const { key, values } of parsedFilters) {
        const testValue = test.metadata[key];
        const matches = values.some((value) => {
          if (Array.isArray(testValue)) {
            // For array metadata, check if any value includes the search term
            return testValue.some((v) => {
              if (skipNullLegacyValues && (v === null || v === undefined)) {
                return false;
              }
              return v.toString().includes(value);
            });
          }
          // For single value metadata, check if it includes the search term
          return (
            testValue !== undefined &&
            !(skipNullLegacyValues && testValue === null) &&
            testValue.toString().includes(value)
          );
        });

        if (!matches) {
          logger.debug('Test did not match a legacy metadata condition');
          return false;
        }
      }

      return true;
    };
  }

  if (options.metadataExact !== undefined) {
    const metadataFilters = Array.isArray(options.metadataExact)
      ? options.metadataExact
      : [options.metadataExact];
    const parsedFilters = parseMetadataFilters(metadataFilters, '--filter-metadata-exact', false);
    const inheritedMetadata = options.inheritedMetadata;

    logger.debug(`Filtering for ${parsedFilters.length} exact metadata condition(s)`);

    exactMetadataFilter = (test) => {
      const effectiveMetadata = { ...inheritedMetadata, ...test.metadata };
      for (const { key, values } of parsedFilters) {
        const testValue = effectiveMetadata[key];
        const candidateValues = Array.isArray(testValue) ? testValue : [testValue];
        const matches = candidateValues.some((value) => {
          const scalar = stringifyMetadataScalar(value);
          return scalar !== undefined && values.includes(scalar);
        });

        if (!matches) {
          logger.debug('Test did not match exact metadata conditions');
          return false;
        }
      }
      return true;
    };
  }

  const combinedMetadataFilter =
    metadataFilter || exactMetadataFilter
      ? (test: TestCase) =>
          (!exactMetadataFilter || exactMetadataFilter(test)) &&
          (!metadataFilter || metadataFilter(test))
      : undefined;
  if (combinedMetadataFilter) {
    tests = tests.filter(combinedMetadataFilter);
    if (metadataFilter) {
      logger.debug(`After metadata filter: ${tests.length} tests remain`);
    }
    if (exactMetadataFilter) {
      logger.debug(`After exact metadata filter: ${tests.length} tests remain`);
    }
  }

  const resultFilterTestSuite = combinedMetadataFilter ? { ...testSuite, tests } : testSuite;

  // Handle failing, failingOnly, and errorsOnly filters
  // - failing: all non-successful results (failures + errors)
  // - failingOnly: assertion failures only (excludes errors)
  // - errorsOnly: errors only
  // When failingOnly and errorsOnly are both provided, combine results (union)
  if (options.failingOnly && options.errorsOnly) {
    logger.debug(
      'Using both --filter-failing-only and --filter-errors-only together (equivalent to --filter-failing)',
    );
    const failingOnlyTests = await filterFailingOnlyTests(
      resultFilterTestSuite,
      options.failingOnly,
      combinedMetadataFilter,
      options.resultMatchContext,
    );
    const errorTests = await filterErrorTests(
      resultFilterTestSuite,
      options.errorsOnly,
      combinedMetadataFilter,
      options.resultMatchContext,
    );

    // Create a union of both sets, deduplicating by test identity
    tests = options.resultMatchContext
      ? deduplicateTestsWithMetadata(
          [...failingOnlyTests, ...errorTests],
          options.resultMatchContext,
        )
      : deduplicateTestCases([...failingOnlyTests, ...errorTests]);

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
    tests = await filterFailingTests(
      resultFilterTestSuite,
      options.failing,
      combinedMetadataFilter,
      options.resultMatchContext,
    );
    if (tests.length === 0) {
      logNoTestsWarning('filter-failing', options.failing, 'no failures/errors');
    }
  } else if (options.failingOnly) {
    // --filter-failing-only includes only assertion failures (excludes errors)
    tests = await filterFailingOnlyTests(
      resultFilterTestSuite,
      options.failingOnly,
      combinedMetadataFilter,
      options.resultMatchContext,
    );
    if (tests.length === 0) {
      logNoTestsWarning(
        'filter-failing-only',
        options.failingOnly,
        'no assertion failures (only errors)',
      );
    }
  } else if (options.errorsOnly) {
    tests = await filterErrorTests(
      resultFilterTestSuite,
      options.errorsOnly,
      combinedMetadataFilter,
      options.resultMatchContext,
    );
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

  if (options.range !== undefined) {
    tests = filterByRange(tests, options.range, warnEmptyFilterRange);
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
    const random =
      options.sampleSeed === undefined ? Math.random : createSeededRandom(options.sampleSeed);
    const shuffled = [...tests];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    tests = shuffled.slice(0, count);
  }

  return tests;
}
