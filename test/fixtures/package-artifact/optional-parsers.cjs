const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const [mode, format] = process.argv.slice(2);

// A complete, local PDF lets the public file-variable path exercise real extraction.
function writePdf(filename) {
  const stream = 'BT /F1 12 Tf 20 100 Td (Optional parser fixture) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  fs.writeFileSync(filename, pdf);
}

async function main() {
  const { evaluate } = format === 'esm' ? await import('promptfoo') : require('promptfoo');
  if (mode === 'missing') {
    for (const parser of ['pdf-parse', 'node-sql-parser']) {
      assert.throws(() => require.resolve(parser), { code: 'MODULE_NOT_FOUND' });
    }
  }
  async function run(suite) {
    try {
      const record = await evaluate(
        { providers: ['echo'], writeLatestResults: false, sharing: false, ...suite },
        { cache: false, maxConcurrency: 1 },
      );
      return await record.toEvaluateSummary();
    } catch (error) {
      return { error: String(error) };
    }
  }
  const ordinary = await run({
    prompts: ['ordinary evaluation'],
    tests: [{ assert: [{ type: 'equals', value: 'ordinary evaluation' }] }],
  });
  assert.equal(ordinary.results?.[0].success, true, JSON.stringify(ordinary));

  const filename = path.join(process.cwd(), 'optional-parser-fixture.pdf');
  writePdf(filename);
  const pdf = await run({
    prompts: ['{{ document }}'],
    tests: [
      {
        vars: { document: `file://${filename}` },
        assert: [{ type: 'contains', value: 'Optional parser fixture' }],
      },
    ],
  });
  const sql = await run({
    prompts: ['SELECT name FROM users'],
    tests: [{ assert: [{ type: 'is-sql', value: { allowedTables: ['select::null::users'] } }] }],
  });
  if (mode === 'installed') {
    for (const result of [pdf, sql]) {
      assert.equal(result.results?.[0].success, true, JSON.stringify(result));
      assert.equal(result.results[0].score, 1);
    }
    const denied = await run({
      prompts: ['SELECT secret FROM secrets'],
      tests: [{ assert: [{ type: 'is-sql', value: { allowedTables: ['select::null::users'] } }] }],
    });
    assert.equal(denied.results?.[0].success, false, JSON.stringify(denied));
    assert.equal(denied.results[0].score, 0);
  } else {
    for (const [parser, range, result] of [
      ['pdf-parse', '^2.4.5', pdf],
      ['node-sql-parser', '^5.4.0', sql],
    ]) {
      const serialized = JSON.stringify(result);
      assert.ok(serialized.includes(`npm install promptfoo ${parser}@${range}`), serialized);
      assert.ok(
        serialized.includes(mode === 'missing' ? 'is not installed' : 'is not supported'),
        serialized,
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
