import { describe, expect, it } from 'vitest';
import { captureKeys, displayKeys, exportWithKeys, keysForTargets } from './chatCredentials';

describe('chat header values', () => {
  it.each([
    ['X-Boner-42. the key is "foobar"', 'foobar'],
    ['The API key is foo123.', 'foo123'],
    ['The key is foo!bar. Test it.', 'foo!bar'],
    ['The key is foo#bar, can you try that?', 'foo#bar'],
    ['Authorization: Bearer foo$@bar%b. Test it.', 'foo$@bar%b'],
    ['X-Boner-42: foo?bar&baz!', 'foo?bar&baz'],
    ['The key is foo123. Please test the connection.', 'foo123'],
    ['The key is foo123 please test it', 'foo123'],
    ['The key is "foo123', 'foo123'],
    ['The key is "$ecret123"', '$ecret123'],
    ['The key is foo123 and please test and fix the connection', 'foo123'],
    ['Test using X-Boner-42: foo123 in the header', 'foo123'],
    ['Use Authorization: Bearer foo123 with my API', 'foo123'],
    ['{"Partner-Access": "foo123"}', 'foo123'],
    ['key is "a\\\"quoted\\\"key"', 'a"quoted"key'],
    ['key is "one\\\\two"', 'one\\two'],
    ['Authorization: Bearer my-local-token', 'my-local-token'],
    ['Authorization: "Bearer private123"', 'private123'],
    ['key is "UPPER_CASE_DEMO"', 'UPPER_CASE_DEMO'],
    ["Send X-Custom: 'a/b+C=123'", 'a/b+C=123'],
    ['{"X-API-Key": "test-with-quotes"}', 'test-with-quotes'],
  ])('masks %s before sending', (message, value) => {
    const { content, keys } = captureKeys(message);
    expect(content).not.toContain(value);
    expect(content).not.toContain(JSON.stringify(value).slice(1, -1));
    expect(Object.values(keys)).toEqual([value]);
    expect(displayKeys(content)).toContain('[provided key]');
    expect(captureKeys(message, keys).keys).toEqual(keys);
  });

  it.each([
    'It needs a key in the header.',
    'The key is in the header.',
    'The key is optional.',
    'The key is wrong. Can you help?',
    'The key is the same one as before.',
    'X-Org-Id: finance',
    'idempotency-key: retry-234',
    'prompt_cache_key: support',
    'Use bearer authentication with that key.',
    'Use bearer auth',
    'The API key is MY_APP_KEY',
    'Authorization: Bearer {{env.MY_APP_KEY}}',
    'X-Tenant-Id: north',
    'Send X-Secret-Key from LOCAL_TOKEN.',
  ])('preserves %s', (message) => {
    expect(captureKeys(message)).toEqual({ content: message, keys: {} });
  });

  it('keeps a supplied key masked when mentioned again in punctuation or prose', () => {
    const { keys } = captureKeys('key is "my-key.plus+"');
    const reply = captureKeys('Can you try (my-key.plus+) or [my-key.plus+]?', keys);
    expect(reply.content).not.toContain('my-key.plus+');
    expect(reply.keys).toEqual(keys);
  });

  it('supports singleton providers and masks bracket-form references', () => {
    const { keys } = captureKeys('key is "demo-key"');
    const ref = "{{env['" + Object.keys(keys)[0] + "']}}";
    const config = { providers: { config: { headers: { Authorization: 'Bearer ' + ref } } } };
    expect(displayKeys(ref)).toBe('[provided key]');
    expect(exportWithKeys(config, keys, [0])).toEqual({
      providers: { config: { headers: { Authorization: 'Bearer demo-key' } } },
    });
  });

  it('substitutes values only into approved headers, preserving normal env references', () => {
    const { keys } = captureKeys('key is "demo-key"');
    const ref = '{{env.' + Object.keys(keys)[0] + '}}';
    expect(captureKeys('Keep using demo-key.', keys).content).toBe('Keep using ' + ref + '.');
    const headers = { Authorization: 'Bearer ' + ref, 'X-Other': '{{env.REAL_KEY}}' };
    const config = {
      targets: [{ config: { headers } }, { config: { headers: { ...headers } } }],
      description: ref,
    };
    expect(keysForTargets([config.targets[0]], keys)).toEqual(keys);
    expect(keysForTargets(['ollama:chat:llama3'], keys)).toBeUndefined();
    expect(exportWithKeys(config, keys, [0])).toEqual({
      targets: [
        { config: { headers: { ...headers, Authorization: 'Bearer demo-key' } } },
        config.targets[1],
      ],
      description: ref,
    });
    expect(JSON.stringify(config)).not.toContain('demo-key');
  });
});
