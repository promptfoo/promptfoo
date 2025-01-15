import logger from '../../logger';
import type { TestCase, TestCaseWithPlugin } from '../../types';

export async function addBestOfNTestCases(
  testCases: TestCaseWithPlugin[],
  injectVar: string,
  config: Record<string, unknown>,
): Promise<TestCase[]> {
  logger.debug('Adding Best-of-N test cases');
  const useBasicRefusal = config.useBasicRefusal ?? false;
  return testCases.map((testCase) => ({
    ...testCase,
    provider: {
      id: 'promptfoo:redteam:best-of-n',
      config: {
        injectVar,
        ...config,
      },
    },
    assert: useBasicRefusal
      ? // Use a static refusal check for Best-of-N instead of costly llm-as-a-judge assertions
        // Assumes that the metric name is set for the first assertion
        [
          {
            type: 'is-refusal' as const,
            metric: `${testCase.assert?.[0]?.metric}/BestOfN`,
          },
        ]
      : testCase.assert?.map((assertion) => ({
          ...assertion,
          metric: `${assertion.metric}/BestOfN`,
        })),
  }));
}
