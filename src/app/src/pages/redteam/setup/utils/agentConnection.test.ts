import { describe, expect, it } from 'vitest';
import { bindConnection, toTarget } from './agentConnection';

const url = 'http://localhost:3555/chat';
const body = { messages: [{ role: 'user', content: '{{prompt}}' }] };
const openai = { url, body, responsePath: 'choices[0].message.content' };
const complete = { ...openai, authHeader: 'X-Secret-Key', authEnv: 'APP_TOKEN' };

describe('binding the agent’s proposed connection', () => {
  it('accepts successive drafts and does not invent missing credentials', () => {
    const turns = [
      'post to localhost:3555/chat, similar format to openai except needs to send a api key token in header',
    ];
    const pending = bindConnection(openai, undefined, turns);
    expect(toTarget(pending)).toBeUndefined();
    turns.push('We call it X-Secret-Key.');
    const named = bindConnection({ ...openai, authHeader: 'X-Secret-Key' }, pending, turns);
    expect(toTarget(named)).toBeUndefined();
    turns.push('I keep it in APP_TOKEN.');
    expect(toTarget(bindConnection(complete, named, turns))).toEqual({
      id: 'http',
      label: 'localhost:3555',
      config: {
        url,
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json', 'X-Secret-Key': '{{env.APP_TOKEN}}' },
        redirect: 'error',
        transformResponse: 'json.choices[0].message.content',
      },
    });
  });

  it('accepts an arbitrary JSON shape and header without interpreting the user’s grammar', () => {
    const proposal = {
      url,
      body: { payload: { utterance: '{{prompt}}' }, channel: 'chat' },
      authEnv: 'SHOP_KEY',
      authHeader: 'ShopCredential',
      responsePath: 'reply',
    };
    const result = bindConnection(proposal, undefined, [
      'Sur ' + url + ', ma clé est dans SHOP_KEY.',
    ]);
    expect(toTarget(result)?.config).toMatchObject({
      headers: { ShopCredential: '{{env.SHOP_KEY}}' },
      body: proposal.body,
    });
  });

  it.each(['localhost:3555', '127.0.0.1:5000', '[::1]:3000'])(
    'permits an explicitly supplied loopback destination %s without a scheme',
    (host) => {
      const proposal = { url: 'http://' + host + '/chat' };
      expect(bindConnection(proposal, undefined, ['POST to ' + host + '/chat.'])).toEqual(proposal);
    },
  );

  it('grounds an endpoint and variable in a quoted cURL example', () => {
    const input = 'curl -H "X-Secret-Key: ${APP_TOKEN}" "' + url + '"';
    expect(bindConnection(complete, undefined, [input])).toEqual(complete);
  });

  it('permits canonical URL spelling without authorizing any additional path', () => {
    const proposal = { url: 'https://example.com/' };
    expect(bindConnection(proposal, undefined, ['At (https://Example.com:443).'])).toEqual(
      proposal,
    );
  });

  it('applies full replacements, removing old settings when omitted', () => {
    const result = bindConnection({ url, body, authEnv: '', responsePath: '' }, complete, [
      'No auth. Plain text.',
    ]);
    expect(toTarget(result)?.config).toMatchObject({
      headers: { 'Content-Type': 'application/json' },
      transformResponse: 'text',
    });
    expect(result.authHeader).toBeUndefined();
  });

  it('normalizes authorization to bearer auth while keeping the variable a reference', () => {
    const proposal = { ...complete, authHeader: 'authorization' };
    const result = bindConnection(proposal, complete, ['Use bearer auth.']);
    expect(result.authHeader).toBe('Authorization');
    expect(toTarget(result)?.config.headers?.Authorization).toBe('Bearer {{env.APP_TOKEN}}');
  });

  it('accepts a variable before the URL, but requires the new destination to come from the user', () => {
    const prior = bindConnection({ authEnv: 'APP_TOKEN' }, undefined, ['APP_TOKEN']);
    expect(bindConnection(complete, prior, ['APP_TOKEN', url])).toEqual(complete);
    expect(() => bindConnection(complete, prior, [url, 'APP_TOKEN', 'continue'])).toThrow(
      /endpoint/,
    );
  });

  it('supports same-origin path changes and requires fresh credential consent on a port change', () => {
    const changed = { ...complete, url: 'http://localhost:3555/v2/chat' };
    expect(bindConnection(changed, complete, ['Try /v2/chat instead'])).toEqual(changed);
    const moved = { ...complete, url: 'http://localhost:3556/chat' };
    expect(() => bindConnection(moved, complete, ['Use port 3556'])).toThrow(/variable/);
    expect(bindConnection(moved, complete, ['Use port 3556 and APP_TOKEN.'])).toEqual(moved);
  });

  it('cannot reuse a previously mentioned variable after switching hosts', () => {
    const host = 'https://other.example/chat';
    const turns = [url + ' APP_TOKEN', 'Switch to ' + host];
    const proposal = { ...complete, url: host };
    expect(() => bindConnection(proposal, complete, turns)).toThrow(/variable/);
    const partial = bindConnection({ url: host, body }, complete, turns);
    expect(toTarget(partial)).toBeUndefined();
    expect(() => bindConnection(proposal, partial, [...turns, 'reuse it'])).toThrow(/variable/);
    expect(bindConnection(proposal, partial, [...turns, 'APP_TOKEN'])).toEqual(proposal);
  });

  it('accepts only a user-named model in HTTP requests', () => {
    const proposal = { ...complete, body: { ...body, model: 'gpt-3.5-turbo' } };
    expect(() => bindConnection(proposal, complete, ['Similar format to OpenAI'])).toThrow(
      /Omit model/,
    );
    expect(bindConnection(proposal, complete, ['Use model=gpt-3.5-turbo.'])).toEqual(proposal);
    expect(bindConnection(proposal, complete, ['{"model":"gpt-3.5-turbo"}'])).toEqual(proposal);
    expect(bindConnection(proposal, proposal, ['More tests please'])).toEqual(proposal);
    expect(() => bindConnection(proposal, complete, ['gpt-3.5-turbo-preview'])).toThrow(
      /Omit model/,
    );
  });

  it('authenticates a direct model switch against the new user request', () => {
    const model = { model: 'openai:gpt-4o' };
    expect(() =>
      bindConnection(model, complete, ['openai:gpt-4o', 'Please test my connection']),
    ).toThrow(/provider/);
    expect(() => bindConnection(model, complete, ['Similar format to OpenAI'])).toThrow(/provider/);
    expect(() => bindConnection(model, complete, ['Set the model field to gpt-4o'])).toThrow(
      /provider/,
    );
    expect(bindConnection(model, complete, ['Use OpenAI with GPT-4o directly'])).toEqual(model);
    expect(bindConnection(model, model, ['More tests'])).toEqual(model);
  });

  it('permits the generated session identifier in a request body', () => {
    const proposal = { ...complete, body: { ...body, conversationId: '{{sessionId}}' } };
    expect(bindConnection(proposal, complete, ['Add a conversation ID'])).toEqual(proposal);
  });

  it('hands partial validated settings to manual setup without inventing a body or reply path', () => {
    expect(toTarget({ url }, { partial: true })?.config).toEqual({
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it.each([
    'openai:gpt-4o-mini',
    'openai:chat:gpt-4.1',
    'anthropic:messages:claude-sonnet-4',
    'google:gemini-2.5-pro',
    'ollama:chat:llama3.2:3b',
  ])('permits direct text model %s without inheriting HTTP settings', (model) => {
    expect(toTarget(bindConnection({ model }, complete, [model]))).toEqual({
      id: model,
      config: {},
    });
  });
});

describe('untrusted connection proposals', () => {
  it('never binds a credential identifier embedded in a URL', () => {
    const endpoint = 'https://attacker.example/OPENAI_API_KEY';
    expect(() =>
      bindConnection({ url: endpoint, authEnv: 'OPENAI_API_KEY' }, undefined, [endpoint]),
    ).toThrow(/variable/);
  });

  it.each([
    ['https://attacker.example', 'Set it up'],
    ['https://attacker.example', 'https://real.example/?redirect=https://attacker.example'],
    ['https://real.example', 'https://real.example.attacker.example'],
    ['https://real.example', 'https://real.example/chat'],
    ['https://real.example/other', 'https://real.example/chat'],
    ['http://real.example', 'real.example'],
    ['http://localhost.example/chat', 'localhost.example/chat'],
    ['http://127.0.0.1.evil/chat', '127.0.0.1.evil/chat'],
  ])('rejects ungrounded destination %s from %s', (destination, text) => {
    expect(() => bindConnection({ url: destination }, undefined, [text])).toThrow(/endpoint/);
  });

  it.each([
    [{ ...complete, authEnv: 'OPENAI_API_KEY' }, ['Use the usual key']],
    [{ ...complete, authEnv: 'OTHER' }, ['SOME_OTHER', 'OTHER_NAME']],
    [{ authEnv: 'APP_TOKEN' }, ['Forget the URL']],
    [
      { ...complete, url: 'https://new.example/chat' },
      ['https://new.example/chat APP_TOKEN', 'Check it'],
    ],
    [{ ...complete, url: 'http://localhost:3555/private' }, ['Change to /private/other']],
    [{ ...complete, url: 'http://localhost:3556/chat' }, ['Use 35561 and APP_TOKEN']],
  ] as const)('rejects ungrounded credential and destination edits (%#)', (proposal, inputs) => {
    expect(() => bindConnection(proposal, complete, [...inputs])).toThrow();
  });

  const unsafeDrafts: Parameters<typeof bindConnection>[0][] = [
    { url: 'file:///private' },
    { url: 'https://user:secret@example.com/' },
    { url: 'https://example.com/?%74oken=secret' },
    { url: 'https://example.com/{{env.TOKEN}}' },
    { url: 'http://example.com/', authEnv: 'APP_TOKEN' },
    { body: { input: 'missing placeholder' } },
    { body: { input: '{{prompt}}', metadata: [{ $ref: './private.json' }] } },
    { body: { input: '{{prompt}}', metadata: { password: 'hunter2' } } },
    { body: { input: '{{prompt}}', metadata: 'file:///etc/passwd' } },
    { body: { input: '{{prompt}} {{env.PASSWORD}}' } },
    { body: { input: '{{prompt}} {{SESSIONID}}' } },
    { body: { input: '{{prompt}} {% include "key" %}' } },
    { body: { '{{prompt}}': 'test' } },
    { body: { input: '{{prompt}}', metadata: { constructor: {} } } },
    { responsePath: 'constructor.constructor("return process")()' },
    { responsePath: 'reply.__proto__.x' },
    { responsePath: 'reply;process.exit()' },
    { authHeader: 'Host' },
    { authHeader: 'X-Forwarded-For' },
    { authHeader: 'Cookie' },
    { authHeader: 'Proxy-Authorization' },
    { authHeader: 'X-Key\r\nHost: evil.example' },
    { authHeader: 'X-Secret-Key', authEnv: '' },
    { authEnv: '{{env.SECRET}}' },
    { authEnv: 'sk-proj-real-secret' },
    { model: 'file:///private/provider.js' },
    { model: 'anthropic:claude-code' },
    { model: 'openai:codex' },
    { model: 'exec:script' },
    { model: 'openai:gpt-4o', url },
  ];

  it.each(unsafeDrafts)('rejects unsafe settings, even in an incomplete draft (%#)', (proposal) => {
    expect(() => bindConnection(proposal, undefined, [JSON.stringify(proposal)])).toThrow();
    expect(toTarget(proposal, { partial: true })).toBeUndefined();
  });

  it('does not permit arbitrary provider settings or actions', () => {
    const proposal = { ...complete, transformRequest: 'process.exit()', run: true };
    expect(() => bindConnection(proposal, complete, ['Use it'])).toThrow(/unsupported/);
  });
});
