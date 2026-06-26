import { describe, expect, it } from 'vitest';
import { redactEnvValues } from '../src/envOverrides';

describe('redactEnvValues', () => {
  it('redacts common rendered variants of sensitive values', () => {
    const secret = '  Sk-Live/Secret+abcdefghijklmnop  ';
    const message = [
      secret,
      secret.trim(),
      secret.trim().toLowerCase(),
      secret.trim().toUpperCase(),
      encodeURIComponent(secret.trim()),
    ].join('|');

    const redacted = redactEnvValues(message, { PATH_SECRET: secret });

    expect(redacted).not.toContain('Sk-Live');
    expect(redacted).not.toContain('sk-live');
    expect(redacted).not.toContain('SK-LIVE');
    expect(redacted).not.toContain('Sk-Live%2FSecret');
    expect(redacted).toContain('[REDACTED]');
  });

  it('does not rescan replacement markers for short secrets', () => {
    const redacted = redactEnvValues('AAAA', { TOKEN: 'A' });

    expect(redacted).toBe('[REDACTED][REDACTED][REDACTED][REDACTED]');
  });

  it('handles malformed Unicode in environment overrides', () => {
    expect(redactEnvValues(`prefix-\uD800-suffix`, { TOKEN: '\uD800' })).toBe(
      'prefix-[REDACTED]-suffix',
    );
  });

  it('leaves non-sensitive environment values visible', () => {
    expect(redactEnvValues('tenant-alpha', { TENANT: 'tenant-alpha' })).toBe('tenant-alpha');
  });
});
