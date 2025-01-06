import logger from '../../logger';
import type { TestSuite } from '../../types';
import { filterErrorTests } from './filterErrorTests';
import { filterFailingTests } from './filterFailingTests';

interface FilterOptions {
  failing?: string;
  firstN?: number | string;
  metadata?: string;
  pattern?: string;
  sample?: number | string;
  errorsOnly?: string;
}

type Tests = TestSuite['tests'];

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
