import type { TestCase } from '../../types/index';

// Map of standard characters to homoglyph unicode characters
export const homoglyphMap: { [key: string]: string } = {
  a: 'а', // Cyrillic а (U+0430)
  b: 'Ƅ', // Latin small letter b with topbar
  c: 'с', // Cyrillic с (U+0441)
  d: 'ԁ', // Cyrillic д (U+0501)
  e: 'е', // Cyrillic е (U+0435)
  f: 'ƒ', // Latin small letter f with hook (U+0192)
  g: 'ɡ', // Latin small letter script g
  h: 'һ', // Cyrillic һ (U+04BB)
  i: 'і', // Cyrillic і (U+0456)
  j: 'ј', // Cyrillic ј (U+0458)
  k: 'κ', // Greek kappa
  l: 'ӏ', // Cyrillic palochka
  m: 'ｍ', // Fullwidth Latin m
  n: 'ո', // Armenian n
  o: 'о', // Cyrillic о (U+043E)
  p: 'р', // Cyrillic р (U+0440)
  q: 'ԛ', // Cyrillic q-like character
  r: 'г', // Cyrillic г (U+0433)
  s: 'ѕ', // Cyrillic ѕ (U+0455)
  t: 'τ', // Greek tau
  u: 'υ', // Greek upsilon
  v: 'ν', // Greek nu
  w: 'ԝ', // Cyrillic w-like character
  x: 'х', // Cyrillic х (U+0445)
  y: 'у', // Cyrillic у (U+0443)
  z: 'ż', // Latin z with dot above
  A: 'Α', // Greek Alpha
  B: 'В', // Cyrillic В (U+0412)
  C: 'С', // Cyrillic С (U+0421)
  D: 'Ꭰ', // Cherokee letter A
  E: 'Е', // Cyrillic Е (U+0415)
  F: 'Ϝ', // Greek Digamma
  G: 'Ԍ', // Cyrillic Ge
  H: 'Н', // Cyrillic Н (U+041D)
  I: 'Ι', // Greek Iota
  J: 'Ј', // Cyrillic J (U+0408)
  K: 'К', // Cyrillic К (U+041A)
  L: 'Ꮮ', // Cherokee letter L
  M: 'М', // Cyrillic М (U+041C)
  N: 'Ν', // Greek Nu
  O: 'О', // Cyrillic О (U+041E)
  P: 'Р', // Cyrillic Р (U+0420)
  Q: 'Ԛ', // Cyrillic Q-like
  R: 'Я', // Cyrillic Ya
  S: 'Ѕ', // Cyrillic S (U+0405)
  T: 'Т', // Cyrillic Т (U+0422)
  U: 'Ս', // Armenian U
  V: 'Ѵ', // Cyrillic Izhitsa
  W: 'Ԝ', // Cyrillic W-like
  X: 'Х', // Cyrillic Х (U+0425)
  Y: 'Υ', // Greek Upsilon
  Z: 'Ꮓ', // Cherokee letter Z
  '0': '𝟶', // Mathematical monospace 0
  '1': '𝟷', // Mathematical monospace 1
  '2': '𝟸', // Mathematical monospace 2
  '3': '𝟹', // Mathematical monospace 3
  '4': '𝟺', // Mathematical monospace 4
  '5': '𝟻', // Mathematical monospace 5
  '6': '𝟼', // Mathematical monospace 6
  '7': '𝟽', // Mathematical monospace 7
  '8': '𝟾', // Mathematical monospace 8
  '9': '𝟿', // Mathematical monospace 9
};

/**
 * Convert text to homoglyphs (visually similar Unicode characters)
 */
export function toHomoglyphs(text: string): string {
  return text
    .split('')
    .map((char) => homoglyphMap[char] || char)
    .join('');
}

/**
 * Add homoglyph encoding to test cases
 */
export function addHomoglyphs(testCases: TestCase[], injectVar: string): TestCase[] {
  return testCases.map((testCase) => {
    const originalText = String(testCase.vars![injectVar]);
    return {
      ...testCase,
      assert: testCase.assert?.map((assertion) => ({
        ...assertion,
        metric: `${assertion.metric}/Homoglyph`,
      })),
      vars: {
        ...testCase.vars,
        [injectVar]: toHomoglyphs(originalText),
      },
      metadata: {
        ...testCase.metadata,
        strategyId: 'homoglyph',
        originalText,
      },
    };
  });
}
