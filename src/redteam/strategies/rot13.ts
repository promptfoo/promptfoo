import type { TestCase } from '../../types';

export function addRot13(testCases: TestCase[], injectVar: string): TestCase[] {
  const rot13 = (str: string): string => {
    return str.replace(/[a-zA-Z]/g, (char) => {
      const code = char.charCodeAt(0);
      const base = char.toLowerCase() === char ? 97 : 65;
      return String.fromCharCode(((code - base + 13) % 26) + base);
    });
  };

  return testCases.map((testCase) => ({
    ...testCase,
    assert: testCase.assert?.map((assertion) => ({
      ...assertion,
      metric: `${assertion.metric}/Rot13`,
    })),
    vars: {
      ...testCase.vars,
      [injectVar]: rot13(String(testCase.vars![injectVar])),
    },
  }));
}
