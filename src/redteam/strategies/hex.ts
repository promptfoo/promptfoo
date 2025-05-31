import type { TestCase } from '../../types';

export function addHexEncoding(testCases: TestCase[], injectVar: string): TestCase[] {
  return testCases.map((testCase) => {
    const originalText = String(testCase.vars![injectVar]);
    return {
      ...testCase,
      assert: testCase.assert?.map((assertion) => ({
        ...assertion,
        metric: `${assertion.metric}/Hex`,
      })),
      vars: {
        ...testCase.vars,
        [injectVar]: originalText
          .split('')
          .map((char) => char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'))
          .join(' '),
      },
      metadata: {
        ...testCase.metadata,
        strategyId: 'hex',
        originalText,
      },
    };
  });
}
