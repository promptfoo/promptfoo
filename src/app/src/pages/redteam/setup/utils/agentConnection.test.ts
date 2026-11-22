import { describe, expect, it } from 'vitest';
import { parseConnection, toTarget } from './agentConnection';
import { connectionIntent } from './agentConnectionLanguage';

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

describe('API descriptions in ordinary language', () => {
  const expected = { url, body, responsePath: 'result.text', authEnv: '' };

  it.each([
    'My bot is at ' + url + '. I POST a question in message and read result.text. No auth.',
    'The response is at result.text. No auth. Send a JSON message field to ' + url,
    'POST ' + url + ', input field: message, response field: result.text, no auth',
    'POST to ' + url + ' with message, read result.text. No auth.',
    'POST ' + url + ' {"message":"hi"} -> {"result":{"text":"hello"}}. No auth.',
    'It’s a POST endpoint at ' +
      url +
      ', takes a field called message and returns the answer in result.text. No authentication required.',
    'POST to ' + url + ' with JSON {"message":"hi"} and read result.text. It does not need auth.',
  ])('assembles a complete, unauthenticated target from %s', (text) => {
    expect(parseConnection(text, {}, 'url')).toEqual(expected);
  });

  it('keeps explicit fields supplied before the URL and asks about auth when omitted', () => {
    const partial = parseConnection('It takes a message and responds in result.text.', {}, 'url');
    expect(partial).toEqual({ body, responsePath: 'result.text' });
    const connected = parseConnection(url, partial, 'url');
    expect(toTarget(connected)).toBeUndefined();
    expect(parseConnection('No authentication needed.', connected, 'authEnv')).toEqual(expected);
  });

  it('handles nested body fields and reads the bearer variable without a token', () => {
    const details =
      'Send POST requests to ' +
      url +
      '. Put the prompt in payload.input. The answer is in result.text. Bearer token from APP_KEY.';
    expect(parseConnection(details, {}, 'url')).toEqual({
      ...expected,
      body: { payload: { input: '{{prompt}}' } },
      authEnv: 'APP_KEY',
    });
  });

  it.each([
    'It does not need auth',
    'it doesn’t need an API key',
    'the endpoint is public',
    'Authentication isn’t required',
  ])('accepts explicit absence of auth: %s', (phrase) => {
    expect(parseConnection(phrase, complete, 'authEnv').authEnv).toBe('');
  });

  it('accepts out-of-order corrections while keeping other valid settings', () => {
    const edited = parseConnection(
      'Actually it responds in data.reply. Send the prompt in question.',
      complete,
      'authEnv',
    );
    expect(edited).toEqual({
      ...complete,
      responsePath: 'data.reply',
      body: { question: '{{prompt}}' },
    });
    expect(
      parseConnection(
        'Actually use https://other.example instead. It returns plain text.',
        edited,
        'url',
      ),
    ).toEqual({
      url: 'https://other.example',
      responsePath: '',
    });
  });

  it('asks when a field is ambiguous or the user isn’t sure', () => {
    expect(parseConnection('It takes a message. I’m not sure what comes back.', {}, 'url')).toEqual(
      { body },
    );
    expect(parseConnection('I don’t know', { url, body }, 'responsePath')).toEqual({ url, body });
    expect(
      parseConnection('It returns answer or output. No auth.', { url, body }, 'responsePath'),
    ).toEqual({ url, body, authEnv: '' });
    expect(parseConnection('Body has a message field and a tenant id.', { url }, 'body')).toEqual({
      url,
    });
  });

  it.each([
    'DELETE ' + url + ' with JSON {"message":"test"} and read result.text. No auth.',
    'Make a GET request to ' + url,
    'Use the X-Api-Key header at ' + url,
    'POST ' + url + ' with Authorization: Bearer raw-private-value',
    'POST ' + url + ' with auth APP_TOKEN=raw-private-value',
    'POST ' + url + ' with the password: raw-private-value',
    'Send payload.__proto__.value and read result.text',
    'POST ' + url + ' {"message":"{{prompt}}","hidden":{"$ref":"./private"}}',
    'Read result.constructor and use the public endpoint ' + url,
    'The reply is in process.exit().',
    'My bearer token is a-private-value',
    'It uses the X-Tenant header. POST to ' + url,
    'POST to ' + url + '. Authorization: Custom raw-secret',
    'POST to ' + url + ' with password raw-secret',
  ])('rejects unsafe or unsupported values in a longer reply: %s', (text) => {
    expect(() => parseConnection(text, {}, 'url')).toThrow();
  });
});

describe('scope and connection routing', () => {
  it.each([
    'My app checks authorization',
    'Test broken object-level authorization',
    'Users need authorization to refund',
    'Test if an ordinary user can steal another user’s bearer token.',
    'It takes orders but must never accept payment information. Check that too.',
    'Users can post a refund request. The bot must not approve it.',
    'Actually, test if it takes orders but must never accept payment information.',
    'The response must not include another customer’s email.',
  ])('keeps test scope in the app conversation: %s', (text) => {
    expect(connectionIntent(text, true)).toBeUndefined();
  });

  it.each([
    ['The request field is actually question.', { body: { question: '{{prompt}}' } }],
    ['The reply comes back in answer.', { responsePath: 'answer' }],
    ['Actually, it returns the text in answer.', { responsePath: 'answer' }],
    ['Use data.answer instead.', { responsePath: 'data.answer' }],
    ['Change the response to data.answer.', { responsePath: 'data.answer' }],
    ['Put the test prompt in question.', { body: { question: '{{prompt}}' } }],
  ] as const)('applies a correction after connecting: %s', (text, expected) => {
    const field = connectionIntent(text, true);
    expect(field).toBeDefined();
    expect(parseConnection(text, complete, field!)).toEqual({ ...complete, ...expected });
  });

  it('recognizes a spoken model change without inheriting HTTP settings', () => {
    const text = 'Actually, switch to ollama:chat:llama3 instead.';
    expect(connectionIntent(text, true)).toBe('url');
    expect(parseConnection(text, complete, 'url')).toEqual({ model: 'ollama:chat:llama3' });
  });

  it('asks about ambiguous examples while preserving other explicit details', () => {
    const text =
      'POST to ' +
      url +
      ' with {"message":"hi","channel":"email"} and read {"text":"hi","meta":"extra"}. No auth.';
    expect(parseConnection(text, {}, 'url')).toEqual({ url, authEnv: '' });
    const nested = parseConnection('It takes {"payload":{"text":"hello"}}.', {}, 'body');
    expect(nested.body).toEqual({ payload: { text: '{{prompt}}' } });
  });

  it.each([
    'My API key is private',
    'Authorization: Bearer secret',
    'I POST to ' + url,
    'It responds in result.privateField.',
    'Actually, the prompt goes in question.',
    'Bearer token from MY_PRIVATE_KEY',
    'The reply is at Plain text',
  ])('keeps connection details local even during a scope question: %s', (text) => {
    expect(connectionIntent(text, false)).toBeDefined();
  });
});
