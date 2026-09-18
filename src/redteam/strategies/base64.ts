import { mapEncodingTestCases } from './encoding';

import type { TestCase } from '../../types/index';

export function addBase64Encoding(testCases: TestCase[], injectVar: string): TestCase[] {
  return mapEncodingTestCases(testCases, injectVar, {
    transform: (text) => Buffer.from(text).toString('base64'),
    metricSuffix: 'Base64',
    metadata: { strategyId: 'base64' },
  });
}
