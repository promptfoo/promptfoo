import path from 'path';

import { describe, expect, it } from 'vitest';
import { parseXlsxFile } from '../../src/util/xlsx';

// Exercise the real parser because versions 9.3.0-9.3.2 left XML entities escaped.
const FIXTURE = path.join(__dirname, '../fixtures/xlsx-xml-entities.xlsx');

describe('parseXlsxFile XML entity decoding', () => {
  it('decodes XML character entities in cell values', async () => {
    const rows = await parseXlsxFile(FIXTURE);

    expect(rows).toHaveLength(1);
    expect(rows[0]['q&a']).toBe('Does AT&T <b> work?');
    expect(rows[0].expected).toBe(`5 > 3 && "quoted" 'ok'`);
  });

  it('decodes XML character entities in column headers', async () => {
    const rows = await parseXlsxFile(FIXTURE);

    expect(Object.keys(rows[0]).sort()).toEqual(['expected', 'q&a']);
  });

  it('leaves no escaped entities anywhere in the parsed output', async () => {
    const rows = await parseXlsxFile(FIXTURE);

    const serialized = JSON.stringify(rows);
    expect(serialized).not.toMatch(/&(amp|lt|gt|quot|apos);/);
  });
});
