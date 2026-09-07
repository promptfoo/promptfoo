import type { TestCase } from '../../types/index';

interface EncodingOptions {
  transform: (text: string) => string;
  metricSuffix: string;
  metadata: Record<string, unknown>;
}

export function mapEncodingTestCases(
  testCases: TestCase[],
  injectVar: string,
  { transform, metricSuffix, metadata }: EncodingOptions,
): TestCase[] {
  return testCases.map((testCase) => {
    const originalText = String(testCase.vars![injectVar]);
    return {
      ...testCase,
      assert: testCase.assert?.map((assertion) => ({
        ...assertion,
        metric: assertion.metric ? `${assertion.metric}/${metricSuffix}` : assertion.metric,
      })),
      vars: {
        ...testCase.vars,
        [injectVar]: transform(originalText),
      },
      metadata: {
        ...testCase.metadata,
        ...metadata,
        originalText,
      },
    };
  });
}
