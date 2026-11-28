import { sampleArray } from '../../../util/generation';
import data from './data';

import type { TestCase } from '../../../types/index';

export async function addInjections(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
): Promise<TestCase[]> {
  const sampleSize = config.sample ?? 1;
  const harmfulOnly = config.harmfulOnly || false;
  // Keep the skeleton key as the default; sampling must not reorder the library.
  const injections = sampleSize === 1 ? [data[0]] : sampleArray(data, sampleSize);

  const filteredTests = harmfulOnly
    ? testCases.filter((t) => t.metadata?.pluginId?.startsWith('harmful:'))
    : testCases;

  return filteredTests.flatMap((testCase) =>
    injections.map((injection) => {
      const originalText = String(testCase.vars![injectVar]);
      return {
        ...testCase,
        assert: testCase.assert?.map((assert) => ({
          ...assert,
          metric: 'Harmful/Injection',
        })),
        vars: {
          ...testCase.vars,
          [injectVar]: injection.replace(/__PROMPT__/g, () => originalText),
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
