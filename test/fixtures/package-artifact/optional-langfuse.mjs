import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const [format, state] = process.argv.slice(2);
const { evaluate, loadApiProvider } =
  format === 'cjs' ? require('promptfoo') : await import('promptfoo');

const echo = await loadApiProvider('echo');
assert.equal((await echo.callApi('ordinary evaluation')).output, 'ordinary evaluation');
if (state === 'missing') {
  assert.throws(() => require.resolve('@langfuse/client'), { code: 'MODULE_NOT_FOUND' });
}

const requests = [];
const server = createServer((request, response) => {
  requests.push({ url: request.url, authorization: request.headers.authorization });
  const chat = request.url.startsWith('/api/public/v2/prompts/artifact-chat');
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(
    JSON.stringify({
      name: chat ? 'artifact-chat' : 'artifact-text',
      type: chat ? 'chat' : 'text',
      version: 2,
      prompt: chat ? [{ role: 'user', content: 'Hello {{name}}' }] : 'Hello {{name}}',
      labels: ['production'],
      tags: [],
      config: {},
    }),
  );
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

try {
  const config = {
    env: {
      LANGFUSE_PUBLIC_KEY: 'fixture-public',
      LANGFUSE_SECRET_KEY: 'fixture-secret',
      LANGFUSE_HOST: `http://127.0.0.1:${server.address().port}`,
    },
    prompts: ['langfuse://artifact-text:2:text', 'langfuse://artifact-chat@production:chat'],
    providers: ['echo'],
    tests: ['first', 'second'].map((name) => ({
      vars: { name },
      assert: [{ type: 'contains', value: `Hello ${name}` }],
    })),
    writeLatestResults: false,
    sharing: false,
  };
  for (let attempt = 0; attempt < (state === 'installed' ? 2 : 1); attempt++) {
    const record = await evaluate(config, { cache: false, maxConcurrency: 4 });
    const { results } = await record.toEvaluateSummary();
    assert.equal(results.length, 4);
    for (const result of results) {
      if (state === 'installed') {
        assert.equal(result.success, true);
        assert.equal(result.score, 1);
        assert.equal(result.error, undefined);
        assert.equal(result.response.error, undefined);
        assert.match(result.response.output, /Hello (first|second)/);
        assert.doesNotMatch(result.response.output, /\{\{name\}\}/);
      } else {
        assert.equal(result.success, false);
        assert.match(result.error, /npm install promptfoo @langfuse\/client@\^5\.11\.1/);
        assert.match(
          result.error,
          state === 'incompatible' ? /found 0\.0\.0/ : /package is required/,
        );
      }
    }
  }
  if (state === 'installed') {
    // Concurrent renders share their initial fetch, then the SDK cache handles later evals.
    assert.deepEqual(requests.map(({ url }) => url).sort(), [
      '/api/public/v2/prompts/artifact-chat?label=production',
      '/api/public/v2/prompts/artifact-text?version=2',
    ]);
    for (const request of requests) {
      assert.equal(
        request.authorization,
        `Basic ${Buffer.from('fixture-public:fixture-secret').toString('base64')}`,
      );
    }
  } else {
    assert.equal(requests.length, 0, 'Unavailable SDKs must fail before contacting Langfuse');
  }
} finally {
  server.closeAllConnections();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

console.log(`Langfuse ${format} ${state}: ordinary provider and optional SDK checks passed`);
