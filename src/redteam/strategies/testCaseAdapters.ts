import type { TestCase } from '../../types/index';
import type { Inputs } from '../../types/shared';

interface StrategyDefinition {
  strategyId: string;
  metricSuffix: string;
}

export function addEncodedTestCases(
  testCases: TestCase[],
  injectVar: string,
  definition: StrategyDefinition & {
    encode: (text: string) => string;
    encodingType?: string;
  },
): TestCase[] {
  return testCases.map((testCase) => {
    const originalText = String(testCase.vars![injectVar]);
    return {
      ...testCase,
      assert: testCase.assert?.map((assertion) => ({
        ...assertion,
        metric: assertion.metric
          ? `${assertion.metric}/${definition.metricSuffix}`
          : assertion.metric,
      })),
      vars: {
        ...testCase.vars,
        [injectVar]: definition.encode(originalText),
      },
      metadata: {
        ...testCase.metadata,
        strategyId: definition.strategyId,
        ...(definition.encodingType !== undefined && { encodingType: definition.encodingType }),
        originalText,
      },
    };
  });
}

export function addProviderTestCases(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, unknown>,
  definition: StrategyDefinition & {
    providerName: string;
    forwardPluginInputs?: boolean;
  },
): TestCase[] {
  return testCases.map((testCase) => {
    const originalText = String(testCase.vars![injectVar]);
    const pluginConfig = testCase.metadata?.pluginConfig as Record<string, unknown> | undefined;
    const inputs = definition.forwardPluginInputs ? (pluginConfig?.inputs as Inputs) : undefined;

    return {
      ...testCase,
      provider: {
        id: definition.providerName,
        config: {
          injectVar,
          ...config,
          ...(inputs && { inputs }),
        },
      },
      assert: testCase.assert?.map((assertion) => ({
        ...assertion,
        metric: assertion.metric
          ? `${assertion.metric}/${definition.metricSuffix}`
          : assertion.metric,
      })),
      metadata: {
        ...testCase.metadata,
        strategyId: definition.strategyId,
        originalText,
      },
    };
  });
}
