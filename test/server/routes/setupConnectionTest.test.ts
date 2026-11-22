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

  it.each([
    [302, 'final URL'],
    [401, 'token'],
    [403, 'token'],
    [422, 'body'],
    [404, 'URL'],
    [429, 'rate limited'],
    [500, 'endpoint'],
  ] as const)('explains HTTP %s without echoing error bodies', async (status, hint) => {
    fetchTarget.mockResolvedValue(new Response('private detail', { status }));
    const { body } = await test();
    expect(body.success).toBe(false);
    expect(body.message).toContain('HTTP ' + status);
    expect(body.message).toContain(hint);
    expect(body.message).not.toContain('private detail');
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
