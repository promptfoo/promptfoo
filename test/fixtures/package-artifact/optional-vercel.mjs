import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const [format, state] = process.argv.slice(2);
const { loadApiProvider } = format === 'cjs' ? require('promptfoo') : await import('promptfoo');
const echo = await loadApiProvider('echo');
assert.equal((await echo.callApi('ordinary evaluation')).output, 'ordinary evaluation');

if (state === 'installed') {
  const usage = {
    inputTokens: { total: 7, noCache: 7, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 3, text: 3, reasoning: 0 },
  };
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) {
      body += chunk;
    }
    requests.push({ url: request.url, headers: request.headers, body: JSON.parse(body) });
    response.setHeader('Content-Type', 'application/json');
    if (request.headers['ai-language-model-id'] === 'fixture/error') {
      response.writeHead(400);
      response.end(JSON.stringify({ error: { message: 'fixture gateway failure' } }));
    } else if (request.url === '/v1/ai/embedding-model') {
      response.end(JSON.stringify({ embeddings: [[0.25, 0.75]], usage: { tokens: 3 } }));
    } else {
      const text =
        JSON.parse(body).responseFormat?.type === 'json' ? '{"answer":"Hello"}' : 'Hello';
      const finishReason = { unified: 'stop', raw: 'stop' };
      if (request.headers['ai-language-model-streaming'] === 'true') {
        response.setHeader('Content-Type', 'text/event-stream');
        const parts = [
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 'text' },
          { type: 'text-delta', id: 'text', delta: text },
          { type: 'text-end', id: 'text' },
          { type: 'finish', finishReason, usage },
        ];
        response.end(parts.map((part) => `data: ${JSON.stringify(part)}\n\n`).join(''));
      } else {
        response.end(
          JSON.stringify({ content: [{ type: 'text', text }], finishReason, usage, warnings: [] }),
        );
      }
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const config = {
      apiKey: 'fixture-key',
      baseUrl: `http://127.0.0.1:${server.address().port}/v1/ai`,
      maxRetries: 0,
    };
    for (const mode of ['text', 'streaming', 'structured']) {
      const provider = await loadApiProvider('vercel:fixture/model', {
        options: {
          config: {
            ...config,
            streaming: mode === 'streaming',
            ...(mode === 'structured'
              ? {
                  responseSchema: {
                    type: 'object',
                    properties: { answer: { type: 'string' } },
                    required: ['answer'],
                  },
                }
              : {}),
          },
        },
      });
      const result = await provider.callApi('Hello');
      assert.equal(result.error, undefined);
      assert.deepEqual(result.output, mode === 'structured' ? { answer: 'Hello' } : 'Hello');
      assert.equal(result.finishReason, 'stop');
      assert.deepEqual(result.tokenUsage, { prompt: 7, completion: 3, total: 10, numRequests: 1 });
    }
    const errorProvider = await loadApiProvider('vercel:fixture/error', { options: { config } });
    const error = (await errorProvider.callApi('Hello')).error;
    assert.match(error, /fixture gateway failure/);
    assert.doesNotMatch(error, /optional ai package/);
    const embedding = await loadApiProvider('vercel:embedding:fixture/embedding', {
      options: { config },
    });
    assert.deepEqual(await embedding.callEmbeddingApi('Hello'), {
      embedding: [0.25, 0.75],
      tokenUsage: { total: 3 },
    });
    assert.equal(requests.length, 5);
    assert(requests.every((request) => request.headers.authorization === 'Bearer fixture-key'));
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
} else {
  if (state === 'missing') {
    assert.throws(() => require.resolve('ai'), { code: 'MODULE_NOT_FOUND' });
  }
  const pattern =
    state === 'incompatible'
      ? /installed ai package [(]0[.]0[.]0[)] is incompatible/
      : /requires the optional ai package/;
  for (const config of [{}, { streaming: true }, { responseSchema: { type: 'object' } }]) {
    const provider = await loadApiProvider('vercel:fixture/model', { options: { config } });
    const response = await provider.callApi('optional SDK fixture');
    assert.match(response.error, pattern);
    assert.match(response.error, /npm install promptfoo/);
  }
  const embedding = await loadApiProvider('vercel:embedding:fixture/model');
  assert.match((await embedding.callEmbeddingApi('fixture')).error, pattern);
}
console.log(`Vercel ${format} ${state}: ordinary provider and optional SDK checks passed`);
