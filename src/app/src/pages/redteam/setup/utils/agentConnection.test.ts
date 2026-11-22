import { describe, expect, it } from 'vitest';
import { parseConnection, toTarget } from './agentConnection';

const url = 'http://localhost:9001/chat';
const body = { message: '{{prompt}}' };
const complete = { url, body, responsePath: 'reply', authEnv: 'APP_KEY' };

describe('local connection conversation', () => {
  it('assembles a POST target from successive answers, with only an env reference for auth', () => {
    let draft = parseConnection('POST ' + url, {}, 'url');
    expect(toTarget(draft)).toBeUndefined();
    draft = parseConnection('{"messages":[{"role":"user","content":"{{prompt}}"}]}', draft, 'body');
    draft = parseConnection('The reply is at result.answers[0].text', draft, 'responsePath');
    draft = parseConnection('Bearer $LOCAL_TOKEN', draft, 'authEnv');
    expect(toTarget(draft)).toEqual({
      id: 'http',
      label: 'localhost:9001',
      config: {
        url,
        method: 'POST',
        body: { messages: [{ role: 'user', content: '{{prompt}}' }] },
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer {{env.LOCAL_TOKEN}}',
        },
        transformResponse: 'json.result.answers[0].text',
      },
    });
  });

  it.each(['message', 'the prompt goes in message', '{"message":"hello"}'])(
    'uses the specified input field for %s',
    (value) => {
      expect(parseConnection(value, {}, 'body').body).toEqual(body);
    },
  );

  it.each([
    ['plain text', 'text'],
    ['text', 'json.text'],
    ['it returns answer', 'json.answer'],
    ['{"result":{"text":"Hi"}}', 'json.result.text'],
    ['{"choices":[{"message":{"content":"Hi"}}]}', 'json.choices[0].message.content'],
    ['$.result.reply', 'json.result.reply'],
  ])('reads only the selected response field for %s', (example, expected) => {
    const draft = parseConnection(example, complete, 'responsePath');
    expect(toTarget(draft)?.config.transformResponse).toBe(expected);
  });

  it('carries only same-origin settings across URL edits', () => {
    expect(parseConnection(url + '2', complete, 'url')).toEqual({ ...complete, url: url + '2' });
    expect(parseConnection('https://other.example', complete, 'url')).toEqual({
      url: 'https://other.example',
    });
    expect(parseConnection('No auth', complete, 'authEnv').authEnv).toBe('');
    expect(parseConnection('No authentication required.', complete, 'authEnv').authEnv).toBe('');
    expect(parseConnection('Bearer token in APP_TOKEN', complete, 'authEnv').authEnv).toBe(
      'APP_TOKEN',
    );
    expect(parseConnection("It's at " + url, {}, 'url')).toEqual({ url });
  });

  it('reads a multiline cURL without executing it, preserving the token reference', () => {
    const curl = [
      "curl -X POST '" + url + "'",
      "-H 'Content-Type: application/json'",
      '-H "Authorization: Bearer ${APP_KEY}"',
      '--data-raw \'{"message":"hello"}\'',
    ].join(' \\\n');
    expect(parseConnection(curl, {}, 'url')).toEqual({ url, body, authEnv: 'APP_KEY' });
    expect(parseConnection('curl ' + url + ' --json \'{"message":"hi"}\'', {}, 'url').authEnv).toBe(
      '',
    );
  });

  it.each([
    'openai:gpt-4o-mini',
    'openai:chat:gpt-4.1',
    'anthropic:messages:claude-sonnet-4',
    'google:gemini-2.5-pro',
    'ollama:chat:llama3.2:3b',
  ])('uses %s without inheriting HTTP settings', (id) => {
    expect(toTarget(parseConnection(id, complete, 'url'))).toEqual({ id, config: {} });
  });

  it.each([
    ['url', 'file:///private'],
    ['url', 'exec:script'],
    ['url', 'anthropic:claude-code'],
    ['url', 'http://u:p@localhost'],
    ['url', url + '?access_token=secret'],
    ['url', url + '?%74oken=secret'],
    ['url', url + '#fragment'],
    ['url', url + '/{{env.TOKEN}}'],
    ['url', 'https://'],
    ['url', 'curl -X DELETE ' + url],
    ['url', 'curl ' + url + ' -d @private.json'],
    ['url', 'curl ' + url + ' -H "Authorization: Bearer raw-secret" -d input'],
    ['url', 'curl ' + url + ' -H "X-Api-Key: secret"'],
    ['url', 'curl ' + url + ' -L'],
    ['url', 'curl ' + url],
    ['body', '{"foo":"hi","bar":"hi"}'],
    ['body', '{"message":9}'],
    ['body', '[]'],
    ['body', '{"__proto__":"{{prompt}}"}'],
    ['body', '{"request":{"api_key":"secret","input":"{{prompt}}"}}'],
    ['body', '{"message":"{{prompt}}","metadata":[{"$ref":"./private.json"}]}'],
    [
      'url',
      'curl ' + url + ' -d \'{"message":"{{prompt}}","metadata":{"$ref":"./private.json"}}\'',
    ],
    ['body', '{"input":"{{prompt}} {{env.PASSWORD}}"}'],
    ['body', '{"input":"file:///etc/passwd"}'],
    ['responsePath', 'reply.constructor.constructor("return process")()'],
    ['responsePath', 'reply.__proto__.x'],
    ['responsePath', '{"data":{"reply":"one","info":"two"}}'],
    ['responsePath', '{"field-name":"x"}'],
    ['responsePath', '{"answer":42}'],
    ['responsePath', 'a[01]'],
    ['responsePath', 'x;process.exit()'],
    ['authEnv', 'Bearer sk-real-secret'],
    ['authEnv', '{{env.APP_KEY}} {{env.OTHER_KEY}}'],
  ] as const)('rejects ambiguous or unsafe %s inputs (%#)', (field, value) => {
    expect(() => parseConnection(value, {}, field)).toThrow();
  });
});
