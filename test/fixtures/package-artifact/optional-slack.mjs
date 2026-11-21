import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const [format, state] = process.argv.slice(2);
const { loadApiProvider } = format === 'cjs' ? require('promptfoo') : await import('promptfoo');

const echo = await loadApiProvider('echo');
assert.equal((await echo.callApi('ordinary evaluation')).output, 'ordinary evaluation');

const options = { options: { config: { token: 'fixture-token' } } };
if (state === 'installed') {
  // Construction exercises the real SDK without sending a Slack request.
  for (const id of ['slack:C123', 'slack:channel:C123', 'slack:user:U123']) {
    const provider = await loadApiProvider(id, options);
    assert.equal(provider.id(), 'slack');
  }
  await assert.rejects(loadApiProvider('slack:C123'), /Slack provider requires a token/);
} else {
  if (state === 'missing') {
    assert.throws(() => require.resolve('@slack/web-api'), { code: 'MODULE_NOT_FOUND' });
  }
  await assert.rejects(loadApiProvider('slack:C123', options), (error) => {
    assert.match(error.message, /npm install promptfoo @slack\/web-api@\^8\.1\.1/);
    assert.match(error.message, state === 'incompatible' ? /found 0\.0\.0/ : /package is required/);
    return true;
  });
}

console.log(`Slack ${format} ${state}: ordinary provider and optional SDK checks passed`);
