import type { TestCase } from '../../types';

export function addCustom(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
): TestCase[] {
  return testCases.map((testCase) => {
    const originalText = String(testCase.vars![injectVar]);
    return {
      ...testCase,
      provider: {
        id: 'promptfoo:redteam:custom',
        config: {
          injectVar,
          ...config,
        },
      },
      assert: testCase.assert?.map((assertion) => ({
        ...assertion,
        metric: `${assertion.metric}/Custom`,
      })),
      metadata: {
        ...testCase.metadata,
        strategyId: 'custom',
        originalText,
      },
    };
  });
}
