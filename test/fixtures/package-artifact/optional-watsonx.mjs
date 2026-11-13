import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const [format, state] = process.argv.slice(2);
const { loadApiProvider } = format === 'cjs' ? require('promptfoo') : await import('promptfoo');

const echo = await loadApiProvider('echo');
assert.equal((await echo.callApi('ordinary evaluation')).output, 'ordinary evaluation');

const requests = [];
const server = createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
  }
  requests.push({
    url: request.url,
    method: request.method,
    authorization: request.headers.authorization,
    body: JSON.parse(body),
  });
  const chat = request.url.startsWith('/ml/v1/text/chat?');
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(
    JSON.stringify(
      chat
        ? {
            id: 'fixture-chat',
            model_id: 'fixture-model',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'fixture answer' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
          }
        : {
            model_id: 'fixture-model',
            model_version: '1.0.0',
            created_at: '2026-01-01T00:00:00Z',
            results: [
              {
                generated_text: 'fixture answer',
                input_token_count: 3,
                generated_token_count: 2,
                stop_reason: 'eos_token',
              },
            ],
          },
    ),
  );
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

try {
  const config = {
    apiBearerToken: 'fixture-bearer',
    projectId: 'fixture-project',
    serviceUrl: `http://127.0.0.1:${server.address().port}`,
    version: '2023-05-29',
    cost: 0,
  };
  for (const id of ['watsonx:fixture-model', 'watsonx:chat:fixture-model']) {
    // Provider construction and package imports remain safe without the SDKs.
    const provider = await loadApiProvider(id, { options: { config } });
    if (state === 'installed') {
      const firstClient = await provider.getClient();
      assert.equal(await provider.getClient(), firstClient);
      const result = await provider.callApi('fixture prompt');
      assert.equal(result.error, undefined);
      assert.equal(result.output, 'fixture answer');
      assert.deepEqual(result.tokenUsage, { prompt: 3, completion: 2, total: 5 });
      assert.equal(result.cost, 0);
    } else {
      const packageName = state.endsWith('-ai') ? '@ibm-cloud/watsonx-ai' : 'ibm-cloud-sdk-core';
      if (state.startsWith('missing')) {
        assert.throws(() => require.resolve(packageName), { code: 'MODULE_NOT_FOUND' });
      }
      await assert.rejects(provider.callApi('fixture prompt'), (error) => {
        assert(error.message.includes(packageName));
        assert.match(
          error.message,
          /npm install promptfoo @ibm-cloud\/watsonx-ai@\^1\.7\.16 ibm-cloud-sdk-core@5\.6\.2\nnpm install --save-exact ibm-cloud-sdk-core@5\.6\.2/,
        );
        assert.match(
          error.message,
          state.startsWith('incompatible') ? /found 0\.0\.0/ : /package is required/,
        );
        return true;
      });
    }
  }
  if (state === 'installed') {
    assert.equal(requests.length, 2);
    for (const [index, request] of requests.entries()) {
      assert.equal(
        request.url,
        `/ml/v1/text/${index === 0 ? 'generation' : 'chat'}?version=2023-05-29`,
      );
      assert.equal(request.method, 'POST');
      assert.equal(request.authorization, 'Bearer fixture-bearer');
      assert.equal(request.body.project_id, 'fixture-project');
      assert.equal(request.body.model_id, 'fixture-model');
      if (index === 0) {
        assert.equal(request.body.input, 'fixture prompt');
      } else {
        assert.deepEqual(request.body.messages, [{ role: 'user', content: 'fixture prompt' }]);
      }
    }
    // Construct IAM authentication without obtaining a token from an external service.
    const iam = await loadApiProvider('watsonx:fixture-model', {
      options: { config: { ...config, apiKey: 'fixture-api-key', apiBearerToken: undefined } },
    });
    assert((await iam.getAuth()) instanceof require('ibm-cloud-sdk-core').IamAuthenticator);
  } else {
    assert.equal(requests.length, 0, 'Unavailable SDKs must fail before contacting WatsonX');
  }
} finally {
  server.closeAllConnections();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

console.log(`WatsonX ${format} ${state}: ordinary provider and optional SDK checks passed`);
