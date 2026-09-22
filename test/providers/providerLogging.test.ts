import { describe, expect, it } from 'vitest';
import {
  escapeProviderRegexLiteral,
  getHeaderCredentialForms,
  isShortNumericProviderRedaction,
  redactCredential,
  redactCredentials,
  redactProviderText,
} from '../../src/providers/providerLogging';
import { REDACTED } from '../../src/util/sanitizer';
import { escapeRegExp } from '../../src/util/text';

describe('provider text redaction', () => {
  it('escapes the same regex metacharacters as the general text utility', () => {
    for (const value of ['^$.*+?()[]{}|\\-/', 'plain text', '$1', 'a[0].b\\c']) {
      const escaped = escapeProviderRegexLiteral(value);
      expect(escaped).toBe(escapeRegExp(value));
      expect(new RegExp(`^${escaped}$`).test(value)).toBe(true);
    }
  });

  it('redacts literal and regex matches and can preserve a public prefix', () => {
    expect(redactProviderText('a[secret] a[secret]', 'a[secret]')).toBe(`${REDACTED} ${REDACTED}`);
    expect(
      redactProviderText('Bearer  hidden', /(Bearer)\s+\S+/, (_match, prefix) => `${prefix} `),
    ).toBe(`Bearer ${REDACTED}`);
    expect(redactProviderText('x1 x2', /x\d/g)).toBe(`${REDACTED} ${REDACTED}`);
    expect(redactProviderText('x1 x2', /x\d/g, (_match, prefix) => prefix)).toBe(
      `${REDACTED} ${REDACTED}`,
    );
  });

  it('distinguishes short numeric date fragments from whole values and longer or nonnumeric secrets', () => {
    expect(
      isShortNumericProviderRedaction(
        '2026-01-01T00:00:00.098Z',
        `2026-01-01T00:00:00.${REDACTED}Z`,
      ),
    ).toBe(true);
    expect(isShortNumericProviderRedaction('2026-01-01T00:00:00.098Z', REDACTED)).toBe(false);
    expect(isShortNumericProviderRedaction('prefix1234suffix', `prefix${REDACTED}suffix`)).toBe(
      false,
    );
    expect(isShortNumericProviderRedaction('prefixkeysuffix', `prefix${REDACTED}suffix`)).toBe(
      false,
    );
    expect(isShortNumericProviderRedaction('plain', 'plain')).toBe(false);
  });
});

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
  ])('redacts %s', (_label, text, credential, expected) => {
    expect(redactCredential(text, credential)).toBe(expected);
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
  });
});
