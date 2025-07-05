import type { TestCase } from '../../types';

export function addPandamonium(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
): TestCase[] {
  const plugins = new Set(testCases.map((testCase) => testCase.metadata?.pluginId));
  const originalText = String(testCases[0].vars![injectVar]);

  return [
    {
      ...testCases[0],
      provider: {
        id: 'promptfoo:redteam:pandamonium',
        config: {
          injectVar,
          ...config,
        },
      },
      metadata: {
        ...testCases[0].metadata,
        pluginIds: Array.from(plugins),
        strategyId: 'pandamonium',
        originalText,
      },
      assert: testCases[0].assert?.map((assertion) => ({
        ...assertion,
        metric: `${assertion.metric}/Pandamonium`,
      })),
    },
  ];
}
