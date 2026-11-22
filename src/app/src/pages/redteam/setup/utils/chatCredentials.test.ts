import { describe, expect, it } from 'vitest';
import { captureKeys, displayKeys, exportWithKeys, keysForTargets } from './chatCredentials';

describe('chat header values', () => {
  it.each([
    ['X-Boner-42. the key is "foobar"', 'foobar'],
    ['The API key is foo123.', 'foo123'],
    ['Authorization: Bearer my-local-token', 'my-local-token'],
    ['Authorization: "Bearer private123"', 'private123'],
    ['key is "UPPER_CASE_DEMO"', 'UPPER_CASE_DEMO'],
    ["Send X-Custom: 'a/b+C=123'", 'a/b+C=123'],
    ['{"X-API-Key": "test-with-quotes"}', 'test-with-quotes'],
  ])('masks %s before sending', (message, value) => {
    const { content, keys } = captureKeys(message);
    expect(content).not.toContain(value);
    expect(Object.values(keys)).toEqual([value]);
    expect(displayKeys(content)).toContain('[provided key]');
    expect(captureKeys(message, keys).keys).toEqual(keys);
  });

  it.each([
    'It needs a key in the header.',
    'The key is in the header.',
    'The key is optional.',
    'Use bearer auth',
    'The API key is MY_APP_KEY',
    'Authorization: Bearer {{env.MY_APP_KEY}}',
    'X-Tenant-Id: north',
    'Send X-Secret-Key from LOCAL_TOKEN.',
  ])('preserves %s', (message) => {
    expect(captureKeys(message)).toEqual({ content: message, keys: {} });
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
