import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';
import { loadApiProvider } from '../../../src/providers';
import { createApp } from '../../../src/server/server';
import { setConfigDirectoryPath } from '../../../src/util/config/manage';
import { setupTestServer } from '../../util/testServer';

describe('UI provider catalog credentials', () => {
  const authorization = 'Bearer synthetic-catalog-key';
  const tenantHeader = 'synthetic-catalog-tenant';
  const requests: { path: string | undefined; auth: string | undefined; tenant: unknown }[] = [];
  let directory: string;
  let target: string;
  let redirectedHost: string;
  const redirectedRequests: (string | undefined)[] = [];
  const redirectSink = createServer((req, res) => {
    redirectedRequests.push(req.url);
    res.end('Unexpected fixture destination');
  });
  const upstream = createServer((req, res) => {
    requests.push({
      path: req.url,
      auth: req.headers.authorization,
      tenant: req.headers['x-tenant'],
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ reply: 'catalog fixture' }));
  });

  const api = setupTestServer(createApp, async () => {
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    const address = upstream.address();
    if (!address || typeof address === 'string') {
      throw new Error('Synthetic provider failed to start');
    }
    target = `http://127.0.0.1:${address.port}`;
    await new Promise<void>((resolve) => redirectSink.listen(0, '127.0.0.1', resolve));
    const sinkAddress = redirectSink.address();
    if (!sinkAddress || typeof sinkAddress === 'string') {
      throw new Error('Synthetic redirect sink failed to start');
    }
    redirectedHost = `127.0.0.1:${sinkAddress.port}`;
    directory = await mkdtemp(path.join(tmpdir(), 'provider-catalog-'));
    setConfigDirectoryPath(directory);
    const fixtureModule = path.join(directory, 'fixture.cjs');
    await writeFile(
      fixtureModule,
      `module.exports = class {
      constructor(options) { this.config = options.config; }
      id() { return 'fixture'; }
      async callApi() { return {
        error: 'synthetic-secret', tokenUsage: { total: 9, secret: 'synthetic-secret' },
        cost: 0.25, incurredCost: 0.125, cached: false,
        metadata: { http: { status: 429, headers: { 'retry-after': '2', authorization: 'synthetic-secret' } } },
        raw: 'synthetic-secret'
      }; }
    }`,
    );
    // JSON syntax is also valid YAML.
    await writeFile(
      path.join(directory, 'ui-providers.yaml'),
      JSON.stringify({
        providers: [
          {
            id: 'http',
            label: 'Catalog Fixture',
            prompts: ['Hello'],
            config: {
              url: `${target}/configured`,
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: authorization,
                'X-Tenant': '{{ env.EXTERNAL_TENANT }}',
                'X-Installation': 'synthetic-header-prefix {{ input }}',
              },
              body: { prompt: '{{ prompt }}' },
            },
            env: { EXTERNAL_TENANT: tenantHeader },
          },
          {
            id: 'http',
            label: 'Raw Catalog Fixture',
            config: {
              request: [
                'GET /{{ resource }} HTTP/1.1',
                `Host: ${new URL(target).host}`,
                `Authorization: ${authorization}`,
                '',
                '',
              ].join('\r\n'),
            },
          },
          { id: 'file://' + fixtureModule, label: 'Metered fixture', config: { maxRetries: '0' } },
        ],
      }),
    );
  });

  function waitForJob(id: string, expected: 'complete' | 'error') {
    return vi.waitFor(
      async () => {
        const response = await api.get(`/api/eval/job/${id}`).expect(200);
        expect(response.body.status, response.text).toBe(expected);
        return response;
      },
      { timeout: 25_000 },
    );
  }

  afterAll(async () => {
    setConfigDirectoryPath(undefined);
    await new Promise<void>((resolve, reject) =>
      upstream.close((error) => (error ? reject(error) : resolve())),
    );
    await new Promise<void>((resolve, reject) =>
      redirectSink.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(directory, { recursive: true, force: true });
  });

  it('keeps catalog secrets on the server during selection and evaluation', async () => {
    const first = await api
      .post('/api/eval/job')
      .send({
        prompts: ['Hello'],
        providers: ['ui-catalog:missing'],
        env: { PROMPTFOO_CONFIG_DIR: '/tmp/synthetic-other-catalog', OPENAI_API_KEY: 123 },
        tests: [{}],
        sharing: false,
      })
      .expect(200);
    await waitForJob(first.body.id, 'error');

    const catalog = await api.get('/api/providers').expect(200);
    const [reference] = catalog.body.data.providers;
    expect(catalog.body.data).toEqual({
      hasCustomConfig: true,
      providers: [
        { id: expect.stringMatching(/^ui-catalog:/), label: 'Catalog Fixture' },
        { id: expect.stringMatching(/^ui-catalog:/), label: 'Raw Catalog Fixture' },
        { id: expect.stringMatching(/^ui-catalog:/), label: 'Metered fixture' },
      ],
    });
    expect(catalog.text).not.toContain(authorization);
    expect(catalog.text).not.toContain(tenantHeader);

    const job = await api
      .post('/api/eval/job')
      .send({
        prompts: [{ raw: 'Hello', label: 'Hello', config: { url: `${target}/prompt-override` } }],
        providers: [
          {
            ...reference,
            config: { url: `${target}/provider-override` },
            env: { EXTERNAL_TENANT: 'browser' },
          },
        ],
        env: { EXTERNAL_TENANT: 'browser-suite' },
        tests: [{ assert: [{ type: 'contains', value: 'catalog fixture' }] }],
        sharing: false,
      })
      .expect(200);

    const result = await waitForJob(job.body.id, 'complete');
    expect(requests).toEqual([{ path: '/configured', auth: authorization, tenant: tenantHeader }]);
    expect(result.text).not.toContain(authorization);
    expect(result.text).not.toContain(tenantHeader);

    const table = await api.get(`/api/eval/${result.body.evalId}/table`).expect(200);
    expect(table.text).toContain(reference.id);
    expect(table.text).not.toContain(authorization);
    expect(table.text).not.toContain(tenantHeader);

    const replay = await api
      .post('/api/eval/replay')
      .send({ evaluationId: result.body.evalId, prompt: 'Another prompt' })
      .expect(200);
    expect(replay.body.output).toContain('catalog fixture');
    expect(replay.text).not.toContain(authorization);
    expect(replay.text).not.toContain(tenantHeader);
    expect(requests.map(({ path }) => path)).toEqual(['/configured', '/configured']);

    const malformed = await api
      .post('/api/eval/job')
      .send({
        prompts: ['Hello'],
        providers: [reference],
        tests: [{ vars: { input: 'first\nsecond' } }],
        sharing: false,
      })
      .expect(200);
    const rejected = await waitForJob(malformed.body.id, 'complete');
    expect(rejected.text).toContain(
      'The configured catalog provider could not complete the request.',
    );
    expect(rejected.text).not.toContain('synthetic-header-prefix');

    const rawJob = await api
      .post('/api/eval/job')
      .send({
        prompts: ['Hello'],
        providers: [catalog.body.data.providers[1]],
        tests: [
          { vars: { resource: 'same-host' } },
          { vars: { resource: `/placeholder//${redirectedHost}/blocked` } },
        ],
        sharing: false,
      })
      .expect(200);
    const rawResult = await waitForJob(rawJob.body.id, 'complete');
    expect(requests).toContainEqual({ path: '/same-host', auth: authorization, tenant: undefined });
    expect(redirectedRequests).toEqual([]);
    expect(rawResult.text).toContain(
      'The configured catalog provider could not complete the request.',
    );
    expect(rawResult.text).not.toContain(authorization);
  });

  it('preserves safe failure accounting and retry settings for catalog calls', async () => {
    const catalog = await api.get('/api/providers').expect(200);
    const provider = await loadApiProvider(catalog.body.data.providers[2].id);
    expect(provider.config).toEqual({ maxRetries: 0 });
    const response = await provider.callApi('synthetic prompt');
    expect(response).toEqual({
      error: 'The configured catalog provider could not complete the request.',
      tokenUsage: { total: 9 },
      cost: 0.25,
      incurredCost: 0.125,
      cached: false,
      metadata: {
        rateLimitRetryable: true,
        rateLimitKind: 'rate_limit',
        headers: { 'retry-after-ms': '2000' },
      },
    });
  });
});
