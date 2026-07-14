import type { TestCase } from '../../types/index';

export function addHexEncoding(testCases: TestCase[], injectVar: string): TestCase[] {
  return testCases.map((testCase) => {
    const originalText = String(testCase.vars![injectVar]);
    return {
      ...testCase,
      assert: testCase.assert?.map((assertion) => ({
        ...assertion,
        metric: assertion.metric ? `${assertion.metric}/Hex` : assertion.metric,
      })),
      vars: {
        ...testCase.vars,
        [injectVar]: Array.from(Buffer.from(originalText, 'utf8'))
          .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
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
