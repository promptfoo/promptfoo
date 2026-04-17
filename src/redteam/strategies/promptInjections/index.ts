import data from './data';

import type { TestCase } from '../../../types/index';

export async function addInjections(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
): Promise<TestCase[]> {
  const sampleSize = config.sample || 1;
  const harmfulOnly = config.harmfulOnly || false;
  const injections =
    sampleSize === 1
      ? // Take skeleton key (the first one) by default
        [(prompt: string) => data[0].replace(/__PROMPT__/g, prompt)]
      : // Otherwise, take random samples
        data
          .sort(() => 0.5 - Math.random())
          .slice(0, sampleSize)
          .map((injection) => (prompt: string) => injection.replace(/__PROMPT__/g, prompt));

  const filteredTests = harmfulOnly
    ? testCases.filter((t) => t.metadata?.pluginId?.startsWith('harmful:'))
    : testCases;

  return filteredTests.flatMap((testCase) =>
    injections.map((fn) => {
      const originalText = String(testCase.vars![injectVar]);
      return {
        ...testCase,
        assert: testCase.assert?.map((assert) => ({
          ...assert,
          metric: 'Harmful/Injection',
        })),
        vars: {
          ...testCase.vars,
          [injectVar]: `${fn(originalText)}`,
        },
        metadata: {
          ...testCase.metadata,
          strategyId: 'jailbreak-templates',
          originalText,
        },
      };
    }),
  );
}
