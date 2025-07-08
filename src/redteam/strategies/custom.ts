import type { TestCase } from '../../types';

export function addCustom(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
  strategyId: string = 'custom',
): TestCase[] {
  // Extract variant from strategy ID (e.g., 'custom:aggressive' -> 'aggressive')
  const variant = strategyId.includes(':') ? strategyId.split(':')[1] : '';
  const displayName = variant ? `Custom:${variant}` : 'Custom';

  return testCases.map((testCase) => {
    const originalText = String(testCase.vars![injectVar]);
    return {
      ...testCase,
      provider: {
        id:
          strategyId === 'custom' ? 'promptfoo:redteam:custom' : `promptfoo:redteam:${strategyId}`,
        config: {
          injectVar,
          variant,
          ...config,
        },
      },
      assert: testCase.assert?.map((assertion) => ({
        ...assertion,
        metric: `${assertion.metric}/${displayName}`,
      })),
      metadata: {
        ...testCase.metadata,
        strategyId,
        originalText,
      },
    };
  });
}
