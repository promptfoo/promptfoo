import { addEncoding } from './encoding';

import type { TestCase } from '../../types/index';

export function addHexEncoding(testCases: TestCase[], injectVar: string): TestCase[] {
  return addEncoding(testCases, injectVar, 'hex', 'Hex', (text) =>
    Array.from(Buffer.from(text, 'utf8'))
      .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
      .join(' '),
  );
}
