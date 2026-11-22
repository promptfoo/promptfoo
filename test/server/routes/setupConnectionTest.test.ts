import { createServer } from 'node:http';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  containsSetupSecret,
  targetExecutionIssue,
} from '../../../src/node/redteamSetupConnection';
import { createApp } from '../../../src/server/server';
import { httpTargetValidationIssue } from '../../../src/types/api/redteam';
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
        paths: ['choices[0].message.content', 'id'],
      });
      expect(res.text).not.toMatch(/private message|secret_value|apiKey|unsafe/);
    }
    expect(
      (await test({ transformResponse: 'json.choices[0].message.content' })).body.success,
    ).toBe(true);
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
    for (const value of ['...abc', '...=', 'private-value', '…secret']) {
      expect(containsSetupSecret(question.replace('...', value))).toBe(true);
    }
  });

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
    { body: { input: 'Hello' } },
    { headers: { Authorization: 'Bearer secret' } },
    { headers: { 'X-Secret-Key': 'private-canary' } },
    { headers: { Authorization: 'Bearer {{env.APP_KEY}}' }, redirect: undefined },
    { headers: { ApiKey: '{{env.APP_KEY}}', apikey: '{{env.OTHER}}' } },
    { headers: { Leaf: '{{env.APP_KEY | trim}}' } },
    { headers: { 'Content-Type': 'text/plain' } },
    { request: 'file:///tmp/request' },
    { transformRequest: 'file:///tmp/pwn.js' },
    { method: 'DELETE' },
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
    expect(httpTargetValidationIssue(auth)).toBeUndefined();
    expect(httpTargetValidationIssue({ id: 'http', config: { url } })).toContain('body');
    expect(httpTargetValidationIssue({ id: 'http', config: { method: 'GET' } })).toContain('URL');
    expect(httpTargetValidationIssue({ id: 'http', config: { url, headers: { N: 1 } } })).toContain(
      'headers',
    );
    expect(httpTargetValidationIssue({ id: 'http', config: { url, unknown: true } })).toContain(
      'config.unknown',
    );
    const scripted = {
      id: 'http',
      config: { ...target, transformResponse: 'file:///untrusted.js' },
    };
    expect(httpTargetValidationIssue(scripted)).toBeUndefined();
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
    for (const text of ['/APP_KEY', 'ollama:APP_KEY', 'payload.APP_KEY', 'APP_KEY.second']) {
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
    ['http://localhost.example/chat', 'localhost.example/chat'],
  ])('rejects an invented URL %s from %s', (destination, typed) => {
    expect(
      targetExecutionIssue({ id: 'http', config: { ...target, url: destination } }, [typed]),
    ).toMatchObject({ repairable: true });
  });

  it('allows one message to authorize several destinations, without extending a grant to another turn’s host', () => {
    const second = 'https://second.example/chat';
    const both = [url + ' and ' + second + ' both use APP_KEY and APP_TOKEN'];
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
