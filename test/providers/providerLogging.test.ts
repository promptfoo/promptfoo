import { describe, expect, it } from 'vitest';
import {
  escapeProviderRegexLiteral,
  isShortNumericProviderRedaction,
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
