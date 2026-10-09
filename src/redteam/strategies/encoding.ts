import { appendMetricSuffix } from './assertions';

import type { TestCase } from '../../types/index';

export function addEncoding(
  testCases: TestCase[],
  injectVar: string,
  strategyId: string,
  metricSuffix: string,
  encode: (text: string) => string,
  encodingType?: string,
): TestCase[] {
  return testCases.map((testCase) => {
    const originalText = String(testCase.vars![injectVar]);
    return {
      ...testCase,
      assert: appendMetricSuffix(testCase, metricSuffix),
      vars: {
        ...testCase.vars,
        [injectVar]: encode(originalText),
      },
      metadata: {
        ...testCase.metadata,
        strategyId,
        ...(encodingType === undefined ? {} : { encodingType }),
        originalText,
      },
    };
  });
}
