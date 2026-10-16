import path from 'path';

import { describe, expect, it } from 'vitest';
import { parseXlsxFile } from '../../src/util/xlsx';

const FIXTURE = path.join(__dirname, '../fixtures/xlsx-hash-sheet-names.xlsx');

describe('parseXlsxFile worksheet names with hashes', () => {
  it.each(['Data#2026', 'Data#2026#Q1', '#Start', 'End#'])(
    'selects the complete worksheet name %s using the real Excel reader',
    async (sheetName) => {
      expect(await parseXlsxFile(`${FIXTURE}#${sheetName}`)).toEqual([{ input: sheetName }]);
    },
  );

  it.each([
    ['', 'Data'],
    ['#Data', 'Data'],
    ['#2', 'Data#2026'],
  ])('preserves the existing selector %s', async (selector, expected) => {
    expect(await parseXlsxFile(`${FIXTURE}${selector}`)).toEqual([{ input: expected }]);
  });
});
