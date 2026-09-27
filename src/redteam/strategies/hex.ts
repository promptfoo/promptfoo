import { addEncodedTestCases } from './testCaseAdapters';

import type { TestCase } from '../../types/index';

export function addHexEncoding(testCases: TestCase[], injectVar: string): TestCase[] {
  return addEncodedTestCases(testCases, injectVar, {
    strategyId: 'hex',
    metricSuffix: 'Hex',
    encode: (text) =>
      Array.from(Buffer.from(text, 'utf8'))
        .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
        .join(' '),
  });
}
