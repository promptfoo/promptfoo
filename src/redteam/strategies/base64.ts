import type { TestCase } from '../../types';

export function addBase64Encoding(testCases: TestCase[], injectVar: string): TestCase[] {
  return testCases.map((testCase) => ({
    ...testCase,
    assert: testCase.assert?.map((assertion) => ({
      ...assertion,
      metric: `${assertion.metric}/Base64`,
    })),
    vars: {
      ...testCase.vars,
      [injectVar]: Buffer.from(String(testCase.vars![injectVar])).toString('base64'),
    },
  }));
}
