import { createServer } from 'node:http';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/server/server';
import { fetchWithProxy } from '../../../src/util/fetch/index';

vi.mock('../../../src/util/fetch/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/util/fetch/index')>()),
  fetchWithProxy: vi.fn(),
}));

const path = '/api/redteam/setup/connection-test';
const target = {
  url: 'https://test.example/chat',
  body: { input: '{{prompt}}' },
  responsePath: 'result.answer',
  authEnv: '',
};
const fetchTarget = vi.mocked(fetchWithProxy);
let app: ReturnType<typeof createApp>;
const test = (data: object = {}) =>
  request(app)
    .post(path)
    .send({ ...target, ...data });

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
      authEnv: 'PRIVATE_CHAT_TOKEN',
      body: { input: '{{prompt}}', session: '{{sessionId}}' },
    });
    expect(res.body).toEqual({ success: true, message: expect.stringContaining('result.answer') });
    expect(res.text).not.toMatch(/secret_value|private response/);
    expect(fetchTarget).toHaveBeenCalledTimes(1);
    const [url, options] = fetchTarget.mock.calls[0];
    expect(url).toBe(target.url);
    expect(options).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer secret_value' },
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
    for (const responsePath of [undefined, 'wrong.answer']) {
      const res = await test({ responsePath, authEnv: 'PRIVATE_CHAT_TOKEN' });
      expect(res.body).toMatchObject({
        success: responsePath === undefined,
        paths: ['choices[0].message.content', 'id'],
      });
      expect(res.text).not.toMatch(/private message|secret_value|apiKey|unsafe/);
    }
    expect((await test({ responsePath: 'choices[0].message.content' })).body.success).toBe(true);
  });

  it('reports HTTP evidence without guessing the cause or revealing the key', async () => {
    vi.stubEnv('PRIVATE_CHAT_TOKEN', 'private-value');
    const chat = {
      authEnv: 'PRIVATE_CHAT_TOKEN',
      authHeader: 'X-API-Key',
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
          responsePath: 'choices[0].message.content',
          authEnv: 'LOCAL_CHAT_KEY',
          authHeader: header,
        });
        expect(received).toEqual([
          [
            'POST',
            '/chat',
            'fixture-only',
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
    expect((await test({ responsePath })).body).toMatchObject({
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
    expect((await test({ authEnv: 'PRIVATE_CHAT_TOKEN' })).body.message).toContain(
      'Set PRIVATE_CHAT_TOKEN',
    );
    vi.stubEnv('PRIVATE_CHAT_TOKEN', 'secret_value');
    expect(
      (await test({ authEnv: 'PRIVATE_CHAT_TOKEN', url: 'http://example.com' })).body.message,
    ).toContain('HTTPS');
    vi.stubEnv('PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS', 'true');
    expect((await test({ authEnv: 'PRIVATE_CHAT_TOKEN' })).body.message).toContain('disabled');
    vi.stubEnv('PROMPTFOO_DISABLE_TEMPLATING', 'true');
    expect((await test()).body.message).toContain('Templates are disabled');
    expect(fetchTarget).not.toHaveBeenCalled();
  });

  it.each([
    { url: 'file:///tmp/private' },
    { url: 'bad' },
    { url: 'https://user:password@example.com' },
    { url: 'https://example.com/#fragment' },
    { responsePath: 'constructor.constructor' },
    { responsePath: 'messages[0].__proto__' },
    { responsePath: 'res()' },
    { body: { input: '{{prompt}}', token: '{{env.PRIVATE}}' } },
    { body: { input: '{{prompt}}', more: { $ref: 'local.json' } } },
    { body: { input: 'Hello' } },
    { authEnv: 'Bearer secret' },
    { authHeader: 'X-API-Key', authEnv: '' },
    { authHeader: 'Host', authEnv: 'KEY' },
    { authHeader: 'X-Api-Key\r\nHost: private.example', authEnv: 'KEY' },
    { authHeader: 'Proxy-Authorization', authEnv: 'KEY' },
    { authHeader: 'X-Forwarded-Host', authEnv: 'KEY' },
    { authHeader: 'X-Promptfoo-Silent', authEnv: 'KEY' },
    { authHeader: 'X_Forwarded_Host', authEnv: 'KEY' },
    { authHeader: 'X-HTTP-Method-Override', authEnv: 'KEY' },
    { authHeader: 'Content-Length', authEnv: 'KEY' },
    { authHeader: 'Cookie', authEnv: 'KEY' },
    { authHeader: 'X-Tenant-Id', authEnv: 'KEY' },
    { authHeader: 'constructor', authEnv: 'KEY' },
    { providerOptions: { id: 'exec:script.sh' } },
  ])('rejects invalid or executable input before contacting the target %j', async (data) => {
    expect((await test(data)).status).toBe(400);
    expect(fetchTarget).not.toHaveBeenCalled();
  });

  it('rejects DNS rebinding hosts and cross-site browser requests', async () => {
    expect((await test().set('Host', 'untrusted.example')).status).toBe(403);
    expect((await test().set('Origin', 'https://untrusted.example')).status).toBe(403);
    expect(fetchTarget).not.toHaveBeenCalled();
  });
});
