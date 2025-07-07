import type { TestCase } from '../../types';

export function addPlaybook(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
  strategyId: string = 'playbook',
): TestCase[] {
  // Extract variant from strategy ID (e.g., 'playbook:aggressive' -> 'aggressive')
  const variant = strategyId.includes(':') ? strategyId.split(':')[1] : '';
  const displayName = variant ? `Playbook:${variant}` : 'Playbook';

  return testCases.map((testCase) => {
    const originalText = String(testCase.vars![injectVar]);
    return {
      ...testCase,
      provider: {
        id:
          strategyId === 'playbook'
            ? 'promptfoo:redteam:playbook'
            : `promptfoo:redteam:${strategyId}`,
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
