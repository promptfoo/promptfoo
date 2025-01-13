import logger from '../../logger';
import type { TestCase, TestCaseWithPlugin } from '../../types';
import { neverGenerateRemote } from '../remoteGeneration';

export async function addLikertTestCases(
  testCases: TestCaseWithPlugin[],
  injectVar: string,
  config: Record<string, unknown>,
): Promise<TestCase[]> {
  if (neverGenerateRemote()) {
    throw new Error('Likert jailbreak strategy requires remote generation to be enabled');
  }
  logger.debug('Adding Likert test cases');
  return testCases.map((testCase) => ({
    ...testCase,
    provider: {
      id: 'promptfoo:redteam:likert',
      config: {
        injectVar,
        ...config,
      },
    },
    assert: testCase.assert?.map((assertion) => ({
      ...assertion,
      metric: `${assertion.metric}/Likert`,
    })),
  }));
}
