import type { Strategy } from './types';

type StrategyTestCases = Awaited<ReturnType<Strategy['action']>>;

interface EncodingOptions {
  transform: (text: string) => string;
  metricSuffix: string;
  metadata: Record<string, unknown>;
}

export function mapEncodingTestCases(
  testCases: StrategyTestCases,
  injectVar: string,
  { transform, metricSuffix, metadata }: EncodingOptions,
): StrategyTestCases {
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
