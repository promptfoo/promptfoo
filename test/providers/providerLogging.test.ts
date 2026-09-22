import { describe, expect, it } from 'vitest';
import {
  getHeaderCredentialForms,
  getHeadersCredentialForms,
  isCredentialName,
  redactCredentials,
  redactDiagnosticText,
} from '../../src/providers/providerLogging';
import { REDACTED } from '../../src/util/sanitizer';

describe('credential redaction', () => {
  it.each([
    [
      'long values anywhere',
      'id=prefix-longsecret1-suffix',
      'longsecret1',
      `id=prefix-${REDACTED}-suffix`,
    ],
    [
      'short whole tokens',
      'api-key abc, "k":"abc", user:abc@host.',
      'abc',
      `api-key ${REDACTED}, "k":"${REDACTED}", user:${REDACTED}@host.`,
    ],
    ['short values after = and before a sentence end', 'key=abc.', 'abc', `key=${REDACTED}.`],
    [
      'not short values inside longer tokens',
      'abcdef x-abc abc.def',
      'abc',
      'abcdef x-abc abc.def',
    ],
    ['single-character whole tokens', 'a and a2', 'a', `${REDACTED} and a2`],
    [
      'lowercase and nested percent encodings without changing literal case',
      'aB%2fdefgh aB%252Fdefgh aB%25252fdefgh ab%2fdefgh',
      'aB%2Fdefgh',
      `${REDACTED} ${REDACTED} ${REDACTED} ab%2fdefgh`,
    ],
    ['short nested percent encodings', 'x=%252f.', '%2F', `x=${REDACTED}.`],
  ])('redacts %s', (_label, text, credential, expected) => {
    expect(redactCredentials(text, [credential])).toBe(expected);
  });

  it('redacts the longest credential first and unconfigured bearer or OpenAI-style keys', () => {
    expect(
      redactCredentials('outer-secret-value Bearer upstream-token-1 sk-proj-abcdefghijklmnop', [
        'secret',
        'outer-secret-value',
      ]),
    ).toBe(`${REDACTED} Bearer ${REDACTED} ${REDACTED}`);
  });

  it('derives the bare token, parameters, and decoded Basic parts from header values', () => {
    expect(getHeaderCredentialForms(' Bearer tok-123 ')).toEqual(['Bearer tok-123', 'tok-123']);
    expect(getHeaderCredentialForms('Digest username="u", response="r%2B1"')).toEqual(
      expect.arrayContaining(['"r%2B1"', 'r%2B1', 'r+1']),
    );
    const basic = `Basic ${Buffer.from('user:p@ss').toString('base64')}`;
    expect(getHeaderCredentialForms(basic)).toEqual(
      expect.arrayContaining(['user:p@ss', 'user', 'p@ss', 'p%40ss']),
    );
    expect(
      getHeadersCredentialForms({ Accept: 'application/json', 'X-Gateway': 'Token gateway-1' }),
    ).toEqual(['Token gateway-1', 'gateway-1']);
  });

  it.each([
    ...['apiKey', 'x-api-key', 'FAL_KEY', 'AWS_SECRET_ACCESS_KEY', 'database.password'],
    ...['myAuthToken', 'Proxy-Authorization', 'set-cookie', 'sig'],
  ])('treats %s as a credential name', (name) => {
    expect(isCredentialName(name)).toBe(true);
  });

  it.each(['total_tokens', 'MAX_TOKENS', 'TOKENIZERS_PARALLELISM', 'providerID', 'PORTKEY_URL'])(
    'does not treat %s as a credential name',
    (name) => {
      expect(isCredentialName(name)).toBe(false);
    },
  );
});

describe('redactDiagnosticText', () => {
  it.each([
    ['bearer and OpenAI-style keys', 'Bearer upstream-bearer-1 sk-proj-upstreamkey1234567'],
    [
      'bare, quoted, and spaced fields',
      'token=upstream-1; secret="upstream 2"; api_key: upstream-3',
    ],
    [
      'env-style fields',
      'FAL_KEY=upstream-1 AWS_SECRET_ACCESS_KEY=upstream-2 db_password=upstream-3',
    ],
    ['header-style fields', 'x-api-key: upstream-1, X_AUTH_TOKEN=upstream-2'],
    [
      'JSON and JSON-escaped fields',
      '{"api_key":"upstream-1"} body={\\"token\\":\\"upstream-2\\"}',
    ],
    ['escaped quotes inside a quoted value', '"password": "upstream-1\\" upstream-2"'],
    [
      'twice-escaped JSON fields and their unreliable tails',
      JSON.stringify(JSON.stringify(JSON.stringify({ FAL_KEY: 'upstream-1 "upstream-2"' }))),
    ],
    ['multi-token authorization', 'Authorization: Token upstream-1 upstream-2; context'],
    [
      'digest authorization',
      'Proxy-Authorization: Digest username="upstream-1", response="upstream-2"',
    ],
    ['cookies', 'Cookie: sid=upstream-1; csrf=upstream-2, context'],
    ['set-cookie', 'set-cookie: sid=upstream-1; Path=/'],
    [
      'URL userinfo and query',
      'GET https://upstream-1:upstream-2@api.test/v1?access_token=upstream-3',
    ],
    ['unterminated quoted values', 'Authorization: "Token upstream-1'],
  ])('redacts upstream-only %s', (_label, text) => {
    const redacted = redactDiagnosticText(`${text} useful context`, []);
    expect(redacted).toContain(REDACTED);
    expect(redacted).not.toMatch(/upstream-|sk-proj-/);
  });

  it('keeps ordinary diagnostic context', () => {
    const text =
      'HTTP 429: total_tokens=17; usage.input_tokens=19; model: claude; see https://opencode.ai/docs' +
      ` ${JSON.stringify(JSON.stringify({ total_tokens: 7 }))}`;
    expect(redactDiagnosticText(text, [])).toBe(text);
    expect(redactDiagnosticText('Authorization: Token a1b2c3d4; useful context', [])).toBe(
      `Authorization: ${REDACTED}; useful context`,
    );
  });

  it.each([
    ':'.repeat(100_000),
    'a_'.repeat(100_000),
    '"api_key": "'.repeat(20_000),
    `${'a'.repeat(30)}://`.repeat(10_000),
    'token= '.repeat(40_000),
    '\\"x\\"='.repeat(40_000),
  ])('stays linear on adversarial input %#', (text) => {
    const started = performance.now();
    redactDiagnosticText(text, ['known-credential-1']);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
