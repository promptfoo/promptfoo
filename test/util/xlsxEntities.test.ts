import path from 'path';

import { describe, expect, it } from 'vitest';
import { parseXlsxFile } from '../../src/util/xlsx';

// These tests deliberately exercise the REAL `read-excel-file` parser rather than
// mocking it (as `xlsx.test.ts` does), because the defect they guard against lives
// entirely in the dependency: `read-excel-file` 9.3.0 swapped its DOM XML parser
// for a SAX parser and stopped decoding XML character entities, so every cell
// containing `&`, `<`, `>`, `"` or `'` was returned still-escaped
// (`AT&amp;T` instead of `AT&T`). `src/util/xlsx.ts` was unchanged, so a mocked
// test could not have caught it. Fixed upstream in 9.3.3; the dependency floor is
// pinned at `^9.3.3` to keep the broken 9.3.0-9.3.2 range unresolvable.
//
// The fixture is a minimal .xlsx whose shared-strings table stores the escaped
// forms `q&amp;a`, `Does AT&amp;T &lt;b&gt; work?` and
// `5 &gt; 3 &amp;&amp; &quot;quoted&quot; &apos;ok&apos;`.
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

    // Headers become the keys of every returned row, so an undecoded header
    // silently renames the variable a test case binds to.
    expect(Object.keys(rows[0]).sort()).toEqual(['expected', 'q&a']);
  });

  it('leaves no escaped entities anywhere in the parsed output', async () => {
    const rows = await parseXlsxFile(FIXTURE);

    const serialized = JSON.stringify(rows);
    expect(serialized).not.toMatch(/&(amp|lt|gt|quot|apos);/);
  });
});
