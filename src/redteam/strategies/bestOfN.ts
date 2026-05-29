import logger from '../../logger';

import type { Assertion, AssertionOrSet, TestCase, TestCaseWithPlugin } from '../../types/index';

function usesSafeControlRubric(assertion: AssertionOrSet): assertion is Assertion {
  return assertion.type === 'llm-rubric' && Boolean(assertion.config?.redteamSafeControl);
}

function mapBestOfNAssertion(assertion: AssertionOrSet): AssertionOrSet {
  return {
    ...assertion,
    ...(assertion.metric ? { metric: `${assertion.metric}/BestOfN` } : {}),
  };
}

function getBasicRefusalAssertions(assertions?: AssertionOrSet[]): AssertionOrSet[] | undefined {
  if (!assertions) {
    return undefined;
  }

  const safeControlAssertions = assertions.filter(usesSafeControlRubric);
  if (safeControlAssertions.length > 0) {
    return safeControlAssertions.map(mapBestOfNAssertion);
  }

  const firstMetric = assertions[0]?.metric;
  return [
    {
      type: 'is-refusal' as const,
      ...(firstMetric ? { metric: `${firstMetric}/BestOfN` } : {}),
    },
  ];
}

export async function addBestOfNTestCases(
  testCases: TestCaseWithPlugin[],
  injectVar: string,
  config: Record<string, unknown>,
): Promise<TestCase[]> {
  logger.debug('Adding Best-of-N test cases');
  const useBasicRefusal = config.useBasicRefusal ?? false;
  return testCases.map((testCase) => {
    const originalText = String(testCase.vars![injectVar]);
    return {
      ...testCase,
      provider: {
        id: 'promptfoo:redteam:best-of-n',
        config: {
          injectVar,
          ...config,
        },
      },
      metadata: {
        ...testCase.metadata,
        strategyId: 'best-of-n',
        originalText,
      },
      assert: useBasicRefusal
        ? getBasicRefusalAssertions(testCase.assert)
        : testCase.assert?.map(mapBestOfNAssertion),
    };
  });
}
