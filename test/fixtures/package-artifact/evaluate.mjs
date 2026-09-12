import assert from 'node:assert/strict';
import fs from 'node:fs';

// Shared assertions, but each caller loads its own public ESM or CJS entrypoint.
export async function checkEvaluate(api, mode) {
  assert.equal(api.default.evaluate, api.evaluate);
  assert.equal(api.default.loadApiProvider, api.loadApiProvider);
  const provider = await api.loadApiProvider('echo');
  assert.equal(provider.id(), 'echo');
  assert.equal((await provider.callApi('local artifact')).output, 'local artifact');

  const outputPath = `${mode}-results.json`;
  const record = await api.evaluate(
    {
      prompts: ['Hello {{name}}'],
      providers: ['echo'],
      tests: [
        { vars: { name: 'artifact' }, assert: [{ type: 'equals', value: 'Hello artifact' }] },
        { vars: { name: 'failure' }, assert: [{ type: 'equals', value: 'deliberate mismatch' }] },
      ],
      writeLatestResults: false,
      sharing: false,
      outputPath,
    },
    { cache: false, maxConcurrency: 1 },
  );
  assert.equal(typeof record.id, 'string');
  assert.equal(typeof record.toEvaluateSummary, 'function');
  const summary = await record.toEvaluateSummary();
  const exported = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  for (const results of [summary.results, exported.results.results]) {
    assert.equal(results.length, 2);
    for (const [index, result] of results.entries()) {
      assert.equal(result.success, index === 0);
      assert.equal(result.score, index === 0 ? 1 : 0);
      assert.equal(result.response.output, index === 0 ? 'Hello artifact' : 'Hello failure');
      assert.equal(result.response.error, undefined);
      assert.equal(result.provider.id, 'echo');
    }
  }
  assert.equal(summary.stats.successes, 1);
  assert.equal(summary.stats.failures, 1);

  // A custom provider error must remain an error result rather than a passing assertion.
  const failed = await api.evaluate(
    {
      prompts: ['local error'],
      providers: [
        {
          id: () => 'artifact-error',
          callApi: async () => ({ error: 'artifact provider failure' }),
        },
      ],
      tests: [{ vars: {} }],
      writeLatestResults: false,
      sharing: false,
    },
    { cache: false },
  );
  const errors = (await failed.toEvaluateSummary()).results;
  assert.equal(errors.length, 1);
  assert.equal(errors[0].success, false);
  assert.equal(errors[0].score, 0);
  assert.match(errors[0].error, /artifact provider failure/);
  assert.equal(errors[0].response.error, 'artifact provider failure');

  console.log(`Verified ${mode} root API: pass=1 fail=1 provider-error=1`);
}
