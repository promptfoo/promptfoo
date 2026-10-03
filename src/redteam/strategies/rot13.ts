import { addEncoding } from './encoding';

import type { TestCase } from '../../types/index';

export function addRot13(testCases: TestCase[], injectVar: string): TestCase[] {
  const rot13 = (str: string): string => {
    return str.replace(/[a-zA-Z]/g, (char) => {
      const code = char.charCodeAt(0);
      const base = char.toLowerCase() === char ? 97 : 65;
      return String.fromCharCode(((code - base + 13) % 26) + base);
    });
  };

  return addEncoding(testCases, injectVar, 'rot13', 'Rot13', rot13);
}
