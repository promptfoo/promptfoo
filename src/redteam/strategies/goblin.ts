import type { TestCase } from '../../types/index';
import type { Inputs } from '../../types/shared';

/**
 * Adds Goblin's Hydra-compatible adaptive provider to every generated case.
 * The provider and cloud task own the per-turn IICL-inspired behavior.
 */
export function addGoblin(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
): TestCase[] {
  const providerName = 'promptfoo:redteam:goblin';
  const metricSuffix = 'Goblin';
  const strategyId = 'jailbreak:goblin';
  const scanId = crypto.randomUUID();

  return testCases.map((testCase) => {
    const originalText = String(testCase.vars![injectVar]);
    const pluginConfig = testCase.metadata?.pluginConfig as Record<string, unknown> | undefined;
    const inputs = pluginConfig?.inputs as Inputs | undefined;

    return {
      ...testCase,
      provider: {
        id: providerName,
        config: {
          injectVar,
          scanId,
          ...config,
          ...(inputs && { inputs }),
        },
      },
      assert: testCase.assert?.map((assertion) => ({
        ...assertion,
        metric: `${assertion.metric}/${metricSuffix}`,
      })),
      metadata: {
        ...testCase.metadata,
        strategyId,
        originalText,
      },
    };
  });
}
