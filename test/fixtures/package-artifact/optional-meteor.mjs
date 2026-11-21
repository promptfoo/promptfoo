import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const [format, state] = process.argv.slice(2);
const { evaluate } = format === 'esm' ? await import('promptfoo') : require('promptfoo');
const installed = state === 'installed';
if (state === 'missing') {
  assert.throws(() => require.resolve('natural'), { code: 'MODULE_NOT_FOUND' });
}
const record = await evaluate(
  {
    prompts: ['{{candidate}}'],
    writeLatestResults: false,
    sharing: false,
    providers: [{ id: () => 'echo', callApi: async (prompt) => ({ output: prompt }) }],
    tests: [
      {
        vars: { candidate: 'ordinary eval' },
        assert: [{ type: 'equals', value: 'ordinary eval' }],
      },
      {
        vars: { candidate: 'running jumped tests' },
        assert: [{ type: 'meteor', value: 'runs jumping test' }],
      },
      {
        vars: { candidate: 'the fast car crossed the rug' },
        assert: [{ type: 'meteor', value: 'the quick motorcar crossed the carpet' }],
      },
    ],
  },
  { cache: false, maxConcurrency: 1 },
);
const { results } = await record.toEvaluateSummary();
assert.equal(results.length, 3);
assert.equal(results[0].success, true);
for (const [index, score] of [
  [1, 0.9814814814814815],
  [2, 0.9976851851851852],
]) {
  assert.equal(results[index].success, installed);
  if (installed) {
    assert.equal(results[index].score, score);
  } else {
    assert.match(results[index].gradingResult.reason, /npm install promptfoo natural/);
    assert.match(results[index].gradingResult.reason, /npm install -g promptfoo natural/);
    if (state === 'incompatible') {
      assert.match(results[index].gradingResult.reason, /found 0[.]0[.]0/);
    }
    assert.equal(results[index].score, 0);
  }
}
