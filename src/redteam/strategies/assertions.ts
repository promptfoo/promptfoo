import type { TestCase } from '../../types/index';

export function appendMetricSuffix(testCase: TestCase, suffix: string) {
  return testCase.assert?.map((assertion) => ({
    ...assertion,
    metric: assertion.metric ? `${assertion.metric}/${suffix}` : assertion.metric,
  }));
}

export function appendPluginMetricSuffix(testCase: TestCase, suffix: string) {
  return testCase.assert?.map((assertion) => ({
    ...assertion,
    metric: assertion.type?.startsWith('promptfoo:redteam:')
      ? `${assertion.type?.split(':').pop() || assertion.metric}/${suffix}`
      : assertion.metric,
  }));
}
