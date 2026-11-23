import { createServer } from 'node:http';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  containsSetupSecret,
  localReviewField,
  sameProbeScope,
  targetExecutionIssue,
  testSetupConnection,
} from '../../../src/node/redteamSetupConnection';
import { createApp } from '../../../src/server/server';
import { RedteamSchemas } from '../../../src/types/api/redteam';
import { fetchWithProxy } from '../../../src/util/fetch/index';

vi.mock('../../../src/util/fetch/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/util/fetch/index')>()),
  fetchWithProxy: vi.fn(),
}));

const path = '/api/redteam/setup/connection-test';
const target = {
  url: 'https://test.example/chat',
  body: { input: '{{prompt}}' },
  transformResponse: 'json.result.answer',
  method: 'POST',
  redirect: 'error',
};
const fetchTarget = vi.mocked(fetchWithProxy);
let app: ReturnType<typeof createApp>;
const test = (data: object = {}) =>
  request(app)
    .post(path)
    .send({ id: 'http', config: { ...target, ...data } });

describe('local chat connection test', () => {
  beforeEach(() => {
    app = createApp();
    fetchTarget.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('keeps literal header values scoped to the local test request and masks echoes', async () => {
    const name = 'PROMPTFOO_CHAT_KEY_' + 'A'.repeat(32);
    const config = { ...target, headers: { 'X-Boner-42': '{{env.' + name + '}}' } };
    const received: string[] = [];
    fetchTarget.mockImplementation(async (_, options) => {
      const value = new Headers(options?.headers).get('x-boner-42')!;
      received.push(value);
      return Response.json({ [value]: 'private', text: 'hello' });
    });
    const probe = (keys?: Record<string, string>) =>
      request(app).post(path).send({ id: 'http', config, localKeys: keys });
    const results = await Promise.all([
      probe({ [name]: 'foobar' }),
      probe({ [name]: 'different' }),
    ]);
    expect(received.sort()).toEqual(['different', 'foobar']);
    expect(results.every((r) => !/different|foobar/.test(r.text))).toBe(true);
    expect((await probe()).body.success).toBe(false);
    expect((await probe({ PATH: 'override' })).status).toBe(400);
    expect((await probe({ [name]: '{{env.SECRET}}' })).status).toBe(400);
    expect(fetchTarget).toHaveBeenCalledTimes(2);
    expect(process.env[name]).toBeUndefined();
  });

  it('sends one Hello with the requested auth, no redirects, retries, Cloud auth or grading', async () => {
    vi.stubEnv('PRIVATE_CHAT_TOKEN', 'secret_value');
    fetchTarget.mockResolvedValue(
      Response.json({ result: { answer: 'private response secret_value' } }),
    );
    const res = await test({
      headers: { Authorization: 'Bearer {{env.PRIVATE_CHAT_TOKEN}}' },
      body: { input: '{{prompt}}', session: '{{sessionId}}' },
    });
    expect(res.body).toEqual({ success: true, message: expect.stringContaining('result.answer') });
    expect(res.text).not.toMatch(/secret_value|private response/);
    expect(fetchTarget).toHaveBeenCalledTimes(1);
    const [url, options] = fetchTarget.mock.calls[0];
    expect(url).toBe(target.url);
    expect(options).toMatchObject({
      method: 'POST',
      headers: { authorization: 'Bearer secret_value' },
      disableTransientRetries: true,
      skipCloudAuthInjection: true,
      redirect: 'manual',
    });
    expect(JSON.parse(String(options?.body))).toEqual({
      input: 'Hello',
      session: expect.stringMatching(/^[a-f0-9-]{36}$/),
    });
  });

  it('only suggests safe paths to non-empty text when the reply field is unknown or wrong', async () => {
    vi.stubEnv('PRIVATE_CHAT_TOKEN', 'secret_value');
    fetchTarget.mockImplementation(async () =>
      Response.json({
        id: '123',
        choices: [{ message: { content: 'private message' } }],
        count: 2,
        empty: '',
        apiKey: 'key',
        secret_value: 'echoed credential key',
        'foo()': 'malicious',
        constructor: { answer: 'unsafe' },
      }),
    );
    for (const transformResponse of [undefined, 'json.wrong.answer']) {
      const res = await test({
        transformResponse,
        headers: { Authorization: 'Bearer {{env.PRIVATE_CHAT_TOKEN}}' },
      });
      expect(res.body).toMatchObject({
        success: transformResponse === undefined,
        paths: ['id', 'choices[0].message.content'],
      });
      expect(res.text).not.toMatch(/private message|secret_value|apiKey|unsafe/);
    }
    expect(
      (await test({ transformResponse: 'json.choices[0].message.content' })).body.success,
    ).toBe(true);
  });

  it('discovers reply paths past metadata and in later array elements without guessing a ranking', async () => {
    const metadata = Object.fromEntries(
      Array.from({ length: 21 }, (_, i) => ['field' + i, 'private metadata']),
    );
    const nested = Array.from({ length: 10 }).reduce<unknown>((child) => ({ inner: child }), {
      'reply-text': 'private answer',
    });
    const response = {
      metadata,
      events: [{ type: 'notice' }, { data: nested }],
      'X-Api-Key': { echo: 'private key' },
    };
    fetchTarget.mockImplementation(async () => Response.json(response));
    const field = 'events[1].data.' + 'inner.'.repeat(9) + 'inner["reply-text"]';
    const result = await test({ transformResponse: 'json.wrong' });
    expect(result.body.paths).toEqual([
      ...Object.keys(metadata).map((key) => 'metadata.' + key),
      'events[0].type',
      field,
    ]);
    expect(result.text).not.toContain('private');
    expect((await test({ transformResponse: 'json.' + field })).body.success).toBe(true);
  });

  it('caps the serialized path evidence and tells the agent about omitted fields', async () => {
    fetchTarget.mockResolvedValue(
      Response.json(
        Object.fromEntries(Array.from({ length: 500 }, (_, i) => ['row-' + i, 'private'])),
      ),
    );
    const { body } = await test({ transformResponse: undefined });
    expect(body.paths.length).toBeGreaterThan(16);
    expect(JSON.stringify(body.paths).length).toBeLessThanOrEqual(2048);
    expect(body.message).toContain('More fields omitted');
    expect(
      RedteamSchemas.SetupConnectionTest.Response.safeParse({
        ...body,
        paths: [...body.paths, 'a'.repeat(200)],
      }).success,
    ).toBe(false);
  });

  it('never passes an echoed credential from any header back as a discovered field', async () => {
    vi.stubEnv('KEY_ONE', 'secret_a');
    vi.stubEnv('KEY_TWO', 'secret_b');
    fetchTarget.mockResolvedValue(
      Response.json({ secret_a: 'one', secret_b: 'two', text: 'private' }),
    );
    const res = await test({
      transformResponse: undefined,
      headers: {
        'X-Secret-Key': '{{env.KEY_ONE}}',
        'Acme-Access': '{{env.KEY_TWO}}',
      },
    });
    expect(res.body.paths).toEqual(['text']);
    expect(res.text).not.toMatch(/secret_a|secret_b|private/);
  });

  it('renders a native GET query and leaves out the body', async () => {
    fetchTarget.mockResolvedValue(Response.json({ result: { answer: 'Hi' } }));
    const res = await test({
      method: 'GET',
      body: undefined,
      queryParams: { q: '{{ prompt }}', lang: 'en' },
    });
    expect(res.body.success).toBe(true);
    const [url, options] = fetchTarget.mock.calls[0];
    expect(url).toBe(target.url + '?q=Hello&lang=en');
    expect(options).toMatchObject({ method: 'GET', headers: {}, suppressLogging: true });
    expect(options?.body).toBeUndefined();
  });

  it('renders a custom prompt as data without evaluating templates or loading files in it', async () => {
    vi.stubEnv('PRIVATE_TOKEN', 'private-value');
    const prompt = '{{env.PRIVATE_TOKEN}} file:///etc/passwd';
    const connection = RedteamSchemas.SetupConnectionTest.Request.parse({
      id: 'http',
      config: { ...target, queryParams: { q: '{{prompt}}' } },
    });
    fetchTarget.mockResolvedValue(Response.json({ result: { answer: 'OK' } }));
    const result = await testSetupConnection(connection, new AbortController().signal, prompt);
    expect(result.success).toBe(true);
    const [url, options] = fetchTarget.mock.calls[0];
    expect(new URL(String(url)).searchParams.get('q')).toBe(prompt);
    expect(JSON.parse(String(options?.body))).toEqual({ input: prompt });
  });

  it('can check a static payload or GET endpoint without inventing a prompt variable', async () => {
    fetchTarget.mockImplementation(async () => Response.json({ result: { answer: 'OK' } }));
    expect((await test({ body: { input: 'status' } })).body.success).toBe(true);
    expect(fetchTarget.mock.calls[0][1]?.body).toBe('{"input":"status"}');
    expect((await test({ method: 'GET', body: undefined })).body.success).toBe(true);
    expect(fetchTarget.mock.calls[1][1]?.body).toBeUndefined();
  });

  it('never silently sends a static request instead of a requested custom prompt', async () => {
    const connection = RedteamSchemas.SetupConnectionTest.Request.parse({
      id: 'http',
      config: { ...target, body: { input: 'status' } },
    });
    const result = await testSetupConnection(
      connection,
      new AbortController().signal,
      'test my order',
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain('Add {{prompt}}');
    expect(fetchTarget).not.toHaveBeenCalled();
  });

  it('reproduces plain text requests without JSON quoting', async () => {
    fetchTarget.mockResolvedValue(new Response('Hi'));
    expect(
      (
        await test({
          body: ' {{ prompt }} ',
          headers: { 'Content-Type': 'text/plain' },
          transformResponse: 'text',
        })
      ).body.success,
    ).toBe(true);
    expect(fetchTarget.mock.calls[0][1]).toMatchObject({
      body: 'Hello',
      headers: { 'content-type': 'text/plain' },
    });
    expect(
      (await test({ body: '{{prompt}}', headers: { 'Content-Type': 'application/json' } })).status,
    ).toBe(400);
    expect(fetchTarget).toHaveBeenCalledOnce();
  });

  it('checks the whole JSON reply when requested, including the legacy responseParser alias', async () => {
    fetchTarget.mockResolvedValueOnce(new Response('not json'));
    expect((await test({ transformResponse: 'json' })).body.success).toBe(false);
    fetchTarget.mockResolvedValueOnce(Response.json({ count: 1 }));
    expect(
      (await test({ transformResponse: undefined, responseParser: 'json' })).body.success,
    ).toBe(true);
  });

  it('accepts a Markdown bearer placeholder in a 401 follow-up, never a pasted credential', () => {
    const question =
      'The target responded with HTTP 401, so the endpoint is reachable but authentication failed. Does this API expect `X-Client-Token`, or a different scheme such as `Authorization: Bearer ...`?';
    expect(containsSetupSecret(question)).toBe(false);
    expect(containsSetupSecret(question.replace('...', '…'))).toBe(false);
    for (const value of ['<token>', '<api-key>', '…', '...', '{{env.APP_TOKEN}}']) {
      expect(containsSetupSecret(question.replace('...', value))).toBe(false);
      expect(containsSetupSecret('Use `X-Client-Token: ' + value + '`?')).toBe(false);
    }
    for (const value of [
      '...abc',
      '...=',
      'private-value',
      '…secret',
      '<token>secret',
      '<private-value>',
    ]) {
      expect(containsSetupSecret('X-API-Key: ' + value)).toBe(true);
      expect(containsSetupSecret(question.replace('...', value))).toBe(true);
    }
  });

  it('screens credentials in agent prose without treating illustrative assignments as pasted keys', () => {
    const example = 'Your API may expect X-Api-Key: replace-with-your-key';
    expect(containsSetupSecret(example, 'assistant')).toBe(false);
    expect(containsSetupSecret(example, 'user')).toBe(true);
    for (const value of [
      'sk-proj-syntheticvalueonly',
      'https://example.com/?api_key=private',
      'https://private@example.com/',
    ]) {
      expect(containsSetupSecret(value, 'assistant')).toBe(true);
    }
  });

  it('recognizes standalone filtered and case-sensitive references without hiding adjacent literals', () => {
    for (const value of [
      '{{prompt | trim}}',
      '{{requestToken | urlencode}}',
      '{{env.mixedCase}}',
      '$mixedCase',
      'process.env.mixedCase',
    ]) {
      expect(containsSetupSecret('token: ' + value)).toBe(false);
    }
    for (const value of [
      '{{prompt | trim}}SECRET',
      'SECRET{{requestToken}}',
      '{{env.secret}}-private',
      '{{prompt | default("private")}}',
    ]) {
      expect(containsSetupSecret('token: ' + value)).toBe(true);
    }
  });

  it('accepts ordinary custom header and inference options without misclassifying them as pasted credentials', () => {
    for (const input of [
      'Set header X-Request-Mode: compact',
      '{"maxTokens":500,"max_output_tokens":32,"tokenEstimation":{"enabled":true}}',
      'prompt_cache_key: batch-1',
      'Authorization: Bearer {{env["CHAT_KEY"]}}',
    ]) {
      expect(containsSetupSecret(input), input).toBe(false);
    }
    for (const input of [
      'Acme-Access: private-value',
      'mySecretKey: private-value',
      'accessToken: private-value',
      JSON.stringify({ body: JSON.stringify({ password: 'private-value' }) }),
    ]) {
      expect(containsSetupSecret(input), input).toBe(true);
    }
  });

  it('probes native options with a custom method, media type and safe optional reply path', async () => {
    fetchTarget.mockResolvedValueOnce(Response.json([{ 'answer-text': 'hi' }]));
    const res = await test({
      method: 'PATCH',
      headers: { 'content-type': 'application/xml', 'X-Request-Mode': 'compact' },
      body: '<message>{{prompt}}</message>',
      transformResponse: 'json?.[0]?.["answer-text"]',
      tokenEstimation: { enabled: true, multiplier: 1.1 },
      maxRetries: 2,
    });
    expect(res.body.success).toBe(true);
    expect(fetchTarget.mock.calls[0][1]).toMatchObject({
      method: 'PATCH',
      body: '<message>Hello</message>',
      headers: { 'content-type': 'application/xml', 'x-request-mode': 'compact' },
      disableTransientRetries: true,
    });
  });

  it('renders native stringified JSON containing tool definitions and a bracketed header reference', async () => {
    vi.stubEnv('CUSTOM_KEY', 'private-value');
    fetchTarget.mockResolvedValueOnce(Response.json({ result: { answer: 'Hi' } }));
    const tools = [{ type: 'function', function: { name: 'lookup' } }];
    const res = await test({
      tools,
      tool_choice: 'auto',
      headers: { 'Content-Type': 'application/json', 'Acme-Access': "{{env['CUSTOM_KEY']}}" },
      body: JSON.stringify({
        message: '{{prompt}}',
        tools: '{{tools}}',
        choice: '{{tool_choice}}',
      }),
    });
    expect(res.body.success).toBe(true);
    expect(fetchTarget.mock.calls[0][1]?.headers).toMatchObject({ 'acme-access': 'private-value' });
    expect(JSON.parse(String(fetchTarget.mock.calls[0][1]?.body))).toEqual({
      message: 'Hello',
      tools,
      choice: 'auto',
    });
  });

  it('sends inline multipart fields with native POST default and a generated boundary', async () => {
    fetchTarget.mockResolvedValueOnce(Response.json({ result: { answer: 'Hi' } }));
    const res = await test({
      method: undefined,
      body: undefined,
      multipart: { parts: [{ kind: 'field', name: 'message', value: '{{prompt}}' }] },
    });
    expect(res.body.success).toBe(true);
    const options = fetchTarget.mock.calls[0][1];
    expect(options?.method).toBe('POST');
    expect((options?.body as FormData).get('message')).toBe('Hello');
  });

  it.each([400, 401, 403, 404, 406, 415, 422, 302, 408, 429, 500, 502, 503])(
    'classifies only actionable HTTP rejections as retryable (%i)',
    async (status) => {
      fetchTarget.mockResolvedValueOnce(new Response('private', { status }));
      const { body } = await test();
      expect(body.success).toBe(false);
      expect(body.retryable ?? false).toBe([400, 401, 403, 404, 406, 415, 422].includes(status));
    },
  );

  it('reports HTTP evidence without guessing the cause or revealing the key', async () => {
    vi.stubEnv('PRIVATE_CHAT_TOKEN', 'private-value');
    const chat = {
      headers: { 'X-API-Key': '{{env.PRIVATE_CHAT_TOKEN}}' },
      body: { messages: [{ role: 'user', content: '{{prompt}}' }] },
    };
    fetchTarget.mockResolvedValueOnce(new Response('private-value', { status: 401 }));
    const auth = await test(chat);
    expect(auth.body.message).toBe('HTTP 401 Unauthorized.');
    expect(auth.text).not.toContain('private-value');
    fetchTarget.mockResolvedValueOnce(new Response('private-value', { status: 400 }));
    const model = await test(chat);
    expect(model.body.message).toBe('HTTP 400 Bad Request.');
    expect(model.text).not.toContain('private-value');
  });

  it.each(['X-API-Key', 'X-Secret-Key', 'Acme-Access'])(
    'posts a Chat Completions message with %s to a real local endpoint',
    async (header) => {
      vi.stubEnv('LOCAL_CHAT_KEY', 'fixture-only');
      vi.stubEnv('SECONDARY_CHAT_KEY', 'fixture-two');
      vi.stubEnv('NO_PROXY', '127.0.0.1');
      const transport = await vi.importActual<typeof import('../../../src/util/fetch/index')>(
        '../../../src/util/fetch/index',
      );
      fetchTarget.mockImplementationOnce(transport.fetchWithProxy);
      const received: unknown[] = [];
      const server = createServer(async (req, res) => {
        let body = '';
        for await (const chunk of req) {
          body += chunk;
        }
        received.push([
          req.method,
          req.url,
          req.headers[header.toLowerCase()],
          req.headers.authorization,
          req.headers['x-tenant-id'],
          req.headers['x-promptfoo-silent'],
          JSON.parse(body),
        ]);
        res.end(JSON.stringify({ choices: [{ message: { content: 'private reply' } }] }));
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      try {
        const address = server.address() as import('node:net').AddressInfo;
        const res = await test({
          url: `http://127.0.0.1:${address.port}/chat`,
          body: { messages: [{ role: 'user', content: '{{prompt}}' }] },
          transformResponse: 'json.choices[0].message.content',
          headers: {
            [header]: '{{env.LOCAL_CHAT_KEY}}',
            Authorization: 'Bearer {{ env.SECONDARY_CHAT_KEY }}',
            'X-Tenant-Id': 'north',
          },
        });
        expect(received).toEqual([
          [
            'POST',
            '/chat',
            'fixture-only',
            'Bearer fixture-two',
            'north',
            undefined,
            { messages: [{ role: 'user', content: 'Hello' }] },
          ],
        ]);
        expect(res.body).toEqual({
          success: true,
          message: 'HTTP 200. Found text at choices[0].message.content.',
        });
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    },
  );

  it.each([
    ['Hello', '', true, 'non-empty text'],
    ['Hello', 'result.answer', false, 'plain text'],
    ['Hello', undefined, true, 'plain text'],
    ['{"result":{"answer":42}}', 'result.answer', false, 'text field'],
    ['{"result":{"answer":""}}', 'result.answer', false, 'text field'],
    ['', '', false, 'empty'],
    ['<!DOCTYPE html><html>login</html>', '', false, 'web page'],
  ] as const)('inspects %s for %s', async (reply, responsePath, success, hint) => {
    fetchTarget.mockResolvedValue(new Response(reply));
    const transformResponse = responsePath === '' ? 'text' : responsePath && 'json.' + responsePath;
    expect((await test({ transformResponse })).body).toMatchObject({
      success,
      message: expect.stringContaining(hint),
    });
  });

  it('never echoes the target’s status text or error body', async () => {
    fetchTarget.mockResolvedValue(
      new Response('private detail', { status: 429, statusText: 'private token' }),
    );
    const { body } = await test();
    expect(body).toEqual({ success: false, message: 'HTTP 429 Too Many Requests.' });
  });

  it('bounds response size and hides transport errors', async () => {
    fetchTarget.mockResolvedValueOnce(new Response('x'.repeat(256 * 1024 + 1)));
    expect((await test()).body.message).toMatch(/too large/);
    fetchTarget.mockRejectedValueOnce(new Error('credential: secret_value'));
    expect((await test()).body).toEqual({
      success: false,
      message: expect.stringMatching(/^Couldn’t reach the endpoint\./),
    });
  });

  it('never sends a missing, disabled or unencrypted remote credential', async () => {
    vi.stubEnv('PRIVATE_CHAT_TOKEN', '');
    expect(
      (await test({ headers: { Authorization: 'Bearer {{env.PRIVATE_CHAT_TOKEN}}' } })).body
        .message,
    ).toContain('Set PRIVATE_CHAT_TOKEN');
    vi.stubEnv('PRIVATE_CHAT_TOKEN', 'secret_value');
    expect(
      (
        await test({
          headers: { Authorization: 'Bearer {{env.PRIVATE_CHAT_TOKEN}}' },
          url: 'http://example.com',
        })
      ).status,
    ).toBe(400);
    vi.stubEnv('PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS', 'true');
    expect(
      (await test({ headers: { Authorization: 'Bearer {{env.PRIVATE_CHAT_TOKEN}}' } })).body
        .message,
    ).toContain('disabled');
    vi.stubEnv('PROMPTFOO_DISABLE_TEMPLATING', 'true');
    expect((await test()).body.message).toContain('Templates are disabled');
    expect(fetchTarget).not.toHaveBeenCalled();
  });

  const invalid: Record<string, unknown>[] = [
    { url: 'file:///tmp/private' },
    { url: 'bad' },
    { url: 'https://user:password@example.com' },
    { url: 'https://example.com/#fragment' },
    { transformResponse: 'json.constructor.constructor' },
    { transformResponse: 'json.messages[0].__proto__' },
    { transformResponse: 'res()' },
    { body: { input: '{{prompt}}', token: '{{env.PRIVATE}}' } },
    { body: { input: '{{prompt}}', more: { $ref: 'local.json' } } },
    { body: { input: '{{unknown}}' } },
    { headers: { Authorization: 'Bearer secret' } },
    { headers: { 'X-Secret-Key': 'private-canary' } },
    { headers: { Authorization: 'Bearer {{env.APP_KEY}}' }, redirect: undefined },
    { headers: { ApiKey: '{{env.APP_KEY}}', apikey: '{{env.OTHER}}' } },
    { headers: { Leaf: '{{env.APP_KEY | trim}}' } },
    { headers: { 'Content-Type': 'text/plain' } },
    { request: 'file:///tmp/request' },
    { transformRequest: 'file:///tmp/pwn.js' },
    { method: 'CONNECT' },
    { method: 'trace' },
    { method: 'POST\r\nDELETE' },
    { body: { input: '{{prompt}}', more: '{{env | dump}}' } },
    { body: { input: '{{prompt}}', more: '{{constructor | dump}}' } },
    { tools: [{ detail: '{{env.SECRET}}' }] },
    { tools: [{ detail: { $ref: '/tmp/private' } }] },
    {
      body: undefined,
      multipart: {
        parts: [{ kind: 'file', name: 'x', source: { type: 'path', path: '/etc/hosts' } }],
      },
    },
    { transformResponse: 'json["constructor"].name' },
    { transformResponse: 'json?.[process.exit()]' },
    { headers: { Secret: '{{env.constructor}}' } },
    { headers: { 'Content-Type-Other': 'application/json' } },
    {
      headers: { 'Content-Type': 'application/json' },
      body: String.raw`{"input":"{{prompt}}","private":"\u007b\u007benv.SECRET\u007d\u007d"}`,
    },
    { queryParams: { key: '{{env.TOKEN}}' } },
    { session: { url: 'https://example.com', responseParser: 'json.token' } },
    { headers: { Host: '{{env.KEY}}' } },
    { headers: { 'X-Api-Key\r\nHost: private.example': '{{env.KEY}}' } },
    { headers: { 'Proxy-Authorization': '{{env.KEY}}' } },
    { headers: { 'X-Forwarded-Host': '{{env.KEY}}' } },
    { headers: { 'X-Promptfoo-Silent': '{{env.KEY}}' } },
    { headers: { X_Forwarded_Host: '{{env.KEY}}' } },
    { headers: { 'X-HTTP-Method-Override': '{{env.KEY}}' } },
    { headers: { 'Content-Length': '{{env.KEY}}' } },
    { headers: { Cookie: '{{env.KEY}}' } },
    { headers: { 'X-Tenant-Id': '{{env.KEY}}' } },
    { headers: { constructor: '{{env.KEY}}' } },
    { providerOptions: { id: 'exec:script.sh' } },
  ];
  it.each(invalid)(
    'rejects invalid or executable input before contacting the target %j',
    async (data) => {
      expect((await test(data)).status).toBe(400);
      expect(fetchTarget).not.toHaveBeenCalled();
    },
  );

  it('rejects DNS rebinding hosts and cross-site browser requests', async () => {
    expect((await test().set('Host', 'untrusted.example')).status).toBe(403);
    expect((await test().set('Origin', 'https://untrusted.example')).status).toBe(403);
    expect(fetchTarget).not.toHaveBeenCalled();
  });
});

describe('native target validation and permission to execute', () => {
  const url = 'http://localhost:3555/chat';
  const auth = {
    id: 'http',
    config: {
      ...target,
      url,
      headers: {
        'X-Secret-Key': '{{env.APP_KEY}}',
        'Acme-Access': '{{env.APP_TOKEN}}',
        'X-Tenant-Id': 'north',
      },
    },
  };
  const initial = [
    'POST to localhost:3555/chat, similar format to OpenAI.',
    'APP_KEY and APP_TOKEN',
  ];

  it('validates native configs without running any user code', () => {
    expect(RedteamSchemas.SetupConnectionTest.validationIssue(auth)).toBeUndefined();
    for (const partial of [
      { url },
      { url, method: 'POST' },
      { method: 'GET' },
      { method: 'POST', body: '{{prompt}}' },
    ]) {
      const draft = { id: 'http', config: partial };
      expect(RedteamSchemas.SetupConnectionTest.validationIssue(draft)).toBeUndefined();
      expect(targetExecutionIssue(draft, initial)).toMatchObject({ repairable: false });
      expect(RedteamSchemas.SetupConnectionTest.Request.safeParse(draft).success).toBe(false);
    }
    expect(
      RedteamSchemas.SetupConnectionTest.validationIssue({
        id: 'http',
        config: { url, method: 'GET', body: 'data' },
      }),
    ).toContain('body');
    expect(
      RedteamSchemas.SetupConnectionTest.validationIssue({
        id: 'http',
        config: { url, headers: { N: 1 } },
      }),
    ).toContain('headers');
    expect(
      RedteamSchemas.SetupConnectionTest.validationIssue({
        id: 'http',
        config: { url, unknown: true },
      }),
    ).toContain('config.unknown');
    const scripted = {
      id: 'http',
      config: { ...target, transformResponse: 'file:///untrusted.js' },
    };
    expect(RedteamSchemas.SetupConnectionTest.validationIssue(scripted)).toBeUndefined();
    expect(targetExecutionIssue(scripted, [target.url])).toMatchObject({ repairable: false });
  });

  it('accepts multiple explicitly named credentials before or after the destination', () => {
    for (const turns of [initial, [...initial].reverse()]) {
      expect(targetExecutionIssue(auth, [...turns, 'Now propose tests'])).toBeUndefined();
    }
    const inline = { id: url, config: { ...auth.config, url: undefined } };
    expect(targetExecutionIssue(inline, initial)).toBeUndefined();
    expect(targetExecutionIssue(auth, [url + ' APP_KEY APP_TOKEN'])).toBeUndefined();
  });

  it('accepts compact assignments for environment names and locally masked values', () => {
    const name = 'PROMPTFOO_CHAT_KEY_' + 'A'.repeat(32);
    const reference = '{{env.' + name + '}}';
    const masked = { ...auth, config: { ...auth.config, headers: { 'X-Secret-Key': reference } } };
    expect(targetExecutionIssue(masked, [url, 'X-Secret-Key:' + reference])).toBeUndefined();
    expect(
      targetExecutionIssue(auth, [url, 'X-Secret-Key=APP_KEY Acme-Access:$APP_TOKEN']),
    ).toBeUndefined();
  });

  it('asks for native syntax instead of sending a shell variable as a literal header', () => {
    for (const value of ['$myToken', 'Bearer ${myToken}', 'process.env.myToken']) {
      const connection = { ...auth, config: { ...auth.config, headers: { 'X-Custom': value } } };
      expect(RedteamSchemas.SetupConnectionTest.validationIssue(connection)).toContain(
        '{{env.name}}',
      );
      expect(RedteamSchemas.SetupConnectionTest.Request.safeParse(connection).success).toBe(false);
    }
  });

  it('requires case-sensitive names for explicit lower-case credential references', () => {
    const reference = {
      ...auth,
      config: { ...auth.config, headers: { 'X-Key': '{{env.myKey}}' } },
    };
    expect(targetExecutionIssue(reference, [url, 'X-Key=$myKey'])).toBeUndefined();
    expect(targetExecutionIssue(reference, [url, 'X-Key=$MYKEY'])).toBeDefined();
  });

  it('requires a grounded URL and every credential even if a previous draft named them', () => {
    expect(targetExecutionIssue(auth, ['APP_KEY APP_TOKEN'], auth)).toMatchObject({
      repairable: true,
    });
    expect(targetExecutionIssue(auth, [url, 'SOME_APP_KEY APP_TOKEN'], auth)).toMatchObject({
      repairable: true,
    });
    const hidden = 'https://attacker.example/APP_KEY?param=APP_TOKEN';
    expect(
      targetExecutionIssue({ ...auth, config: { ...auth.config, url: hidden } }, [hidden]),
    ).toMatchObject({ repairable: true });
  });

  it('never treats a path, model identifier or nested property as a credential grant', () => {
    for (const text of [
      '/APP_KEY',
      'ollama:APP_KEY',
      'payload.APP_KEY',
      'APP_KEY.second',
      '/chat?X-Key=APP_KEY',
      'https://other.example/?key=APP_KEY',
      'ollama:chat:APP_KEY',
      'payload.key=APP_KEY',
      'property:APP_KEY',
      '{"APP_KEY": "a property"}',
    ]) {
      expect(targetExecutionIssue(auth, [url, text + ' APP_TOKEN'])).toMatchObject({
        repairable: true,
      });
    }
    expect(
      targetExecutionIssue(auth, [url, 'Use {{ env.APP_KEY }} and ${APP_TOKEN}']),
    ).toBeUndefined();
  });

  it('no prior grant can silently move between origins, even across multiple attempts', () => {
    const other = 'https://other.example/chat';
    const moved = { ...auth, config: { ...auth.config, url: other } };
    const turns = [...initial, 'Move to ' + other];
    expect(targetExecutionIssue(moved, turns, auth)).toMatchObject({ repairable: true });
    expect(targetExecutionIssue(moved, [...turns, 'Retry'], moved)).toMatchObject({
      repairable: true,
    });
    expect(targetExecutionIssue(moved, [...turns, 'APP_KEY'], moved)).toMatchObject({
      repairable: true,
    });
    expect(
      targetExecutionIssue(moved, [...turns, 'Use APP_KEY and APP_TOKEN'], moved),
    ).toBeUndefined();
    expect(
      targetExecutionIssue(moved, [url + ' and ' + other, 'APP_KEY and APP_TOKEN']),
    ).toMatchObject({ repairable: true });
  });

  it.each([
    ['https://attacker.example', 'https://real.example/?redirect=https://attacker.example'],
    ['https://real.example', 'https://real.example.attacker.example'],
    ['https://real.example/other', 'https://real.example/chat'],
    ['http://real.example', 'real.example'],
    ['http://real.example/chat', 'real.example/chat'],
    ['https://evil.example/chat', 'https://real.example/?redirect=evil.example/chat'],
    ['https://config.yaml', 'config.yaml'],
    ['https://config.yaml/chat', 'config.yaml/chat'],
    ['https://real.example/admin', 'real.example/chat'],
    ['http://localhost.example/chat', 'localhost.example/chat'],
  ])('rejects an invented URL %s from %s', (destination, typed) => {
    expect(
      targetExecutionIssue({ id: 'http', config: { ...target, url: destination } }, [typed]),
    ).toMatchObject({ repairable: true });
  });

  it('grounds an unambiguous bare DNS host and path using HTTPS', () => {
    const destination = 'api.example.net/chat';
    expect(
      targetExecutionIssue({ ...auth, config: { ...auth.config, url: 'https://' + destination } }, [
        'POST ' + destination + ' using APP_KEY and APP_TOKEN.',
      ]),
    ).toBeUndefined();
  });

  it('requires individual grants when sharing keys across destinations', () => {
    const second = 'https://second.example/chat';
    const both = [url + ' APP_KEY APP_TOKEN\n' + second + ' APP_KEY APP_TOKEN'];
    expect(targetExecutionIssue(auth, both)).toBeUndefined();
    expect(
      targetExecutionIssue({ ...auth, config: { ...auth.config, url: second } }, both),
    ).toBeUndefined();
    expect(
      targetExecutionIssue({ ...auth, config: { ...auth.config, url: target.url } }, [
        ...both,
        target.url,
      ]),
    ).toMatchObject({ repairable: true });
  });

  it('never grants every key to every origin named in the initial message', () => {
    const other = 'https://staging.example/chat';
    const prod = {
      ...auth,
      config: { ...auth.config, headers: { Authorization: 'Bearer {{env.PROD_KEY}}' } },
    };
    const swapped = { ...prod, config: { ...prod.config, url: other } };
    const ambiguous = ['Use PROD_KEY at ' + url + ' and STAGING_KEY at ' + other];
    expect(targetExecutionIssue(swapped, ambiguous)).toMatchObject({ repairable: true });
    expect(targetExecutionIssue(swapped, [...ambiguous, 'Test staging.'])).toBeDefined();
    const identified = [...ambiguous, url + ' PROD_KEY\n' + other + ' STAGING_KEY'];
    expect(targetExecutionIssue(prod, identified)).toBeUndefined();
    expect(targetExecutionIssue(swapped, identified)).toBeDefined();
  });

  it('refuses dynamic destinations and nested credential references', () => {
    for (const edit of [
      { url: url + '/{{env.HOST}}' },
      { body: { prompt: '{{prompt}}', payload: [{ nested: '{{env.APP_KEY}}' }] } },
      { headers: { 'Acme-Access': '{{env[other]}}' } },
      { transformResponse: 'json[process.env.KEY]' },
      { queryParams: { path: '{{env.PRIVATE}}' } },
    ]) {
      expect(
        targetExecutionIssue({ ...auth, config: { ...auth.config, ...edit } }, initial),
      ).toMatchObject({ repairable: false });
    }
  });

  it('permits a literal path edit within the same origin', () => {
    expect(
      targetExecutionIssue(
        { ...auth, config: { ...auth.config, url: url + '/v2' } },
        [...initial, 'Use /chat/v2'],
        auth,
      ),
    ).toBeUndefined();
  });

  it('allows inferring a path for a named origin, while preserving a user-supplied exact path', () => {
    const proposal = { id: 'http', config: { ...target, url, method: 'PUT' } };
    expect(targetExecutionIssue(proposal, ['Use localhost:3555'])).toBeUndefined();
    expect(
      targetExecutionIssue(proposal, ['Use localhost:3555', 'Send requests to /admin']),
    ).toMatchObject({ repairable: true });
    expect(
      targetExecutionIssue(proposal, [
        'Use localhost:3555/admin',
        'Use https://other.example',
        'Send requests to /chat',
      ]),
    ).toMatchObject({ repairable: true });
    expect(targetExecutionIssue(proposal, ['Use localhost:3555/admin'])).toMatchObject({
      repairable: true,
    });
  });

  it('keeps the public demo accessible without granting a credential or another endpoint', () => {
    const demo = 'https://customer-service-chatbot-example.promptfoo.app';
    expect(
      targetExecutionIssue({ id: 'http', config: { ...target, url: demo } }, ['Try the demo']),
    ).toBeUndefined();
    expect(
      targetExecutionIssue({ id: 'http', config: { ...auth.config, url: demo } }, initial),
    ).toBeDefined();
    expect(
      targetExecutionIssue({ id: 'http', config: { ...target, url: demo + '/admin' } }, initial),
    ).toBeDefined();
  });

  it('accepts opaque model IDs on native inference routes and explicit provider switches', () => {
    for (const id of [
      'openai:chat:ft:gpt-4o-mini:org:orders:AB12',
      'anthropic:messages:org/experimental-42',
      'openrouter:vendor/model:free',
      'groq:openai/gpt-oss-120b',
      'google:chat:custom-model',
    ]) {
      expect(targetExecutionIssue(id, [id])).toBeUndefined();
    }
    expect(
      targetExecutionIssue('anthropic:messages:future', ['Switch to Claude.'], 'openai:gpt-4o'),
    ).toBeUndefined();
    expect(targetExecutionIssue('openai:gpt-4o', ['Use openrouter:openai/gpt-4o'])).toBeDefined();
    expect(
      targetExecutionIssue('unknown:custom', ['Change providers'], 'openai:gpt-4o'),
    ).toMatchObject({ repairable: false });
    expect(localReviewField({ targets: ['openai:gpt-4o'] })).toBeUndefined();
  });

  it('lets the agent choose model versions and inference options within the named service', () => {
    expect(
      targetExecutionIssue(
        {
          id: 'openai:responses:custom-model-v4',
          config: {
            reasoning_effort: 'medium',
            max_output_tokens: 800,
            verbosity: 'low',
          },
        },
        ['Use a small OpenAI model'],
      ),
    ).toBeUndefined();
    expect(
      targetExecutionIssue({ id: 'ollama:chat:myteam/model:1', config: { num_predict: 80 } }, [
        'Use Ollama',
      ]),
    ).toBeUndefined();
    expect(
      targetExecutionIssue(
        {
          id: 'openai:responses',
          config: { model: 'custom-v42', reasoning: { effort: 'medium' } },
        },
        ['Use GPT'],
      ),
    ).toBeUndefined();
    expect(targetExecutionIssue('anthropic:messages:custom-v42', ['Try Claude'])).toBeUndefined();
    expect(targetExecutionIssue('openai:chat:custom-v42', ['Try Claude'])).toBeDefined();
    for (const config of [
      { apiHost: 2130706433 },
      { effort: 'high' }, // Anthropic option on an OpenAI target
      { unrecognized: true },
      { response_format: 'file:///private/schema.json' },
      { passthrough: { tools: [{ type: 'mcp', server_url: 'https://other.example' }] } },
      { apiKeyEnvar: 'OTHER_KEY' },
      { functionToolCallbacks: { f: 'process.exit()' } },
      { mcp: { enabled: true } },
    ]) {
      expect(
        targetExecutionIssue({ id: 'openai:chat:test', config }, ['Use OpenAI']),
      ).toBeDefined();
    }
  });

  it('allows an explicit scan with native tool conversions or custom test variables the probe cannot reproduce', () => {
    for (const change of [
      {
        transformToolsFormat: 'anthropic',
        tools: [{ type: 'function', function: { name: 'lookup' } }],
      },
      { body: { question: '{{custom_question}}' } },
    ]) {
      const proposal = { ...auth, config: { ...auth.config, ...change } };
      expect(targetExecutionIssue(proposal, initial)).toBeUndefined();
      expect(sameProbeScope(proposal, proposal)).toBe(false);
    }
  });

  it('compares the same session query across a response-field repair', () => {
    const session = { ...auth, config: { ...auth.config, queryParams: { sid: '{{sessionId}}' } } };
    const repaired = {
      ...session,
      config: { ...session.config, transformResponse: 'json.result' },
    };
    expect(sameProbeScope(session, repaired)).toBe(true);
    expect(
      sameProbeScope(session, {
        ...repaired,
        config: { ...repaired.config, queryParams: { sid: 'other' } },
      }),
    ).toBe(false);
  });

  it('limits an automatic repair to the same effective destination, method and credentials', () => {
    const changed = (edits: object) => ({ ...auth, config: { ...auth.config, ...edits } });
    expect(
      sameProbeScope(
        auth,
        changed({
          body: { message: '{{prompt}}' },
          headers: { 'X-New-Name': '{{env.APP_KEY}}', 'Acme-Access': '{{env.APP_TOKEN}}' },
        }),
      ),
    ).toBe(true);
    for (const edit of [
      { url: 'https://other.example/chat' },
      { url: url + '/admin' },
      { method: 'DELETE' },
      { queryParams: { mode: 'admin' } },
      { headers: { 'X-Secret-Key': '{{env.OTHER}}' } },
      { headers: { 'Acme-Access': '{{env.APP_KEY}}', 'X-Secret-Key': '{{env.APP_TOKEN}}' } },
      { headers: { ...auth.config.headers, 'X-Additional': '{{env.APP_TOKEN}}' } },
      { transformResponse: 'process.exit()' },
    ]) {
      expect(sameProbeScope(auth, changed(edit))).toBe(false);
    }
    const withTools = (name: string) =>
      changed({ queryParams: { tool: '{{tools}}' }, tools: [{ name }] });
    expect(sameProbeScope(withTools('a'), withTools('b'))).toBe(false);
    expect(
      sameProbeScope(
        changed({ url: url + '?q=Hello' }),
        changed({ queryParams: { q: '{{prompt}}' } }),
      ),
    ).toBe(false);
    expect(
      sameProbeScope(
        changed({ queryParams: { q: '{{prompt | trim}}' } }),
        changed({ queryParams: { q: '{{prompt}}' } }),
      ),
    ).toBe(false);
    expect(sameProbeScope(undefined, auth)).toBe(false);
  });

  it('requires disabling redirects for credentials', () => {
    const { redirect: _, ...config } = auth.config;
    expect(targetExecutionIssue({ ...auth, config }, initial)).toMatchObject({
      repairable: true,
      message: expect.stringContaining('redirect'),
    });
  });

  it('allows model suggestions in the payload but requires consent to switch to a direct provider', () => {
    const http = { ...auth, config: { ...auth.config, body: { ...target.body, model: 'gpt-4o' } } };
    expect(targetExecutionIssue(http, [...initial, 'Pick a model for my gateway'])).toBeUndefined();
    expect(
      targetExecutionIssue('openai:gpt-4o', [...initial, 'Set the model to gpt-4o'], auth),
    ).toMatchObject({ repairable: true });
    expect(
      targetExecutionIssue('openai:gpt-4o', ['Use OpenAI gpt-4o directly'], auth),
    ).toBeUndefined();
    expect(
      targetExecutionIssue({ id: 'ollama:chat:llama3', config: { temperature: 0.5 } }, [
        'ollama:chat:llama3',
      ]),
    ).toBeUndefined();
  });

  it.each([
    'exec:script.sh',
    'file://private.js',
    'anthropic:claude-code',
    'openai:codex',
    'openai:codex-sdk:custom',
    'openai:agents:example',
    'anthropic:claude-agent-sdk:example',
    'google:chat:../secret',
    'azure:foundry-agent:example',
    'openai:chat:file:///tmp/agent.js',
    { id: 'openrouter:vendor/name', config: { apiKeyEnvar: 'OTHER_KEY' } },
    { id: 'groq:responses:vendor/name', config: { apiBaseUrl: 'https://other.example' } },
    { id: 'openai:gpt-4o', config: { apiBaseUrl: 'https://attacker.example' } },
    { id: 'openai:gpt-4o', config: 'file://leak.json' },
    { id: 'http', label: '{{env.KEY}}', config: target },
    { id: 'http', transform: 'file://payload.js', config: target },
    { id: 'http', config: { ...target, body: { input: '{{prompt}}', meta: { $ref: 'secret' } } } },
  ])(
    'preserves an unsupported target for local review, without granting execution (%#)',
    (proposal) => {
      expect(targetExecutionIssue(proposal, [JSON.stringify(proposal)])).toMatchObject({
        repairable: false,
      });
    },
  );
});
