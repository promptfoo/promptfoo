import type { TestCase } from '../../types';

export function addLeetspeak(testCases: TestCase[], injectVar: string): TestCase[] {
  const leetMap: { [key: string]: string } = {
    a: '4',
    e: '3',
    i: '1',
    o: '0',
    s: '5',
    t: '7',
    l: '1',
    A: '4',
    E: '3',
    I: '1',
    O: '0',
    S: '5',
    T: '7',
    L: '1',
  };

  const toLeetspeak = (text: string): string => {
    return text
      .split('')
      .map((char) => leetMap[char] || char)
      .join('');
  };

  return testCases.map((testCase) => ({
    ...testCase,
    assert: testCase.assert?.map((assertion) => ({
      ...assertion,
      metric: `${assertion.metric}/Leetspeak`,
    })),
    vars: {
      ...testCase.vars,
      [injectVar]: toLeetspeak(String(testCase.vars![injectVar])),
    },
  }));
}
