import type { TestCase } from '../../types';

export function addBase64Encoding(testCases: TestCase[], injectVar: string): TestCase[] {
  return testCases.map((testCase) => {
    const originalText = String(testCase.vars![injectVar]);
    return {
      ...testCase,
      assert: testCase.assert?.map((assertion) => ({
        ...assertion,
        metric: `${assertion.metric}/Base64`,
      })),
      vars: {
        ...testCase.vars,
        [injectVar]: Buffer.from(originalText).toString('base64'),
      },
      metadata: {
        ...testCase.metadata,
        strategyId: 'base64',
        originalText,
      },
    };
  });
}
