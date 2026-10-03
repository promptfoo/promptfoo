import { addEncoding } from './encoding';

import type { TestCase } from '../../types/index';

export function addBase64Encoding(testCases: TestCase[], injectVar: string): TestCase[] {
  return addEncoding(testCases, injectVar, 'base64', 'Base64', (text) =>
    Buffer.from(text).toString('base64'),
  );
}
