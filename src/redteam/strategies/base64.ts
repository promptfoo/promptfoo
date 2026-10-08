import { addEncodedTestCases } from './testCaseAdapters';

import type { TestCase } from '../../types/index';

export function addBase64Encoding(testCases: TestCase[], injectVar: string): TestCase[] {
  return addEncodedTestCases(testCases, injectVar, {
    strategyId: 'base64',
    metricSuffix: 'Base64',
    encode: (text) => Buffer.from(text).toString('base64'),
  });
}
