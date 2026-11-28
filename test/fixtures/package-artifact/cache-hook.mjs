import assert from 'node:assert/strict';

import { cache, loadApiProvider } from 'promptfoo';
export async function beforeEach({ test }) {
  assert.equal(cache.isCacheEnabled(), !process.argv.includes('--no-cache'));
  const provider = await loadApiProvider(test.vars.url, {
    options: { config: { method: 'GET', maxRetries: 0, transformResponse: 'json.output' } },
  });
  return { test: { ...test, provider } };
}
