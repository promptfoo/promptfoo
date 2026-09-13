import crypto from 'crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCacheEnabled } from '../../src/cache';
import cliState from '../../src/cliState';
import { getScriptCacheKey } from '../../src/providers/scriptCompletion';

vi.mock('../../src/cache', () => ({ isCacheEnabled: vi.fn(() => true) }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(isCacheEnabled).mockReturnValue(true);
});

describe('script cache identity', () => {
  it.each([
    { config: { apiKey: 'private-key' } },
    { config: { headers: { Authorization: 'Bearer private-token' } } },
    { config: { headers: { 'X-Tenant-Token': 'private-token' } } },
    { config: { url: 'https://example.com?token=private-token' } },
    { vars: { password: 'private-password' } },
  ])('does not hash credential-bearing inputs: %j', (inputs) => {
    const hash = vi.spyOn(crypto, 'createHash');
    expect(getScriptCacheKey('exec', 'a'.repeat(64), inputs)).toBeUndefined();
    expect(hash).not.toHaveBeenCalled();
  });

  it.each(['provider', 'suite', 'file'])('does not hash inputs with a %s environment', (layer) => {
    const hash = vi.spyOn(crypto, 'createHash');
    const env = { PROMPTFOO_REVIEW_ENV_PROBE: 'tenant-value' };
    const key =
      layer === 'provider'
        ? getScriptCacheKey('exec', 'a'.repeat(64), {}, env)
        : layer === 'suite'
          ? cliState.withEnv(env, () => getScriptCacheKey('exec', 'a'.repeat(64), {}))
          : cliState.withEnvFileOverrides(env, () => getScriptCacheKey('exec', 'a'.repeat(64), {}));
    expect(key).toBeUndefined();
    expect(hash).not.toHaveBeenCalled();
  });

  it('reuses reordered non-secret inputs and distinguishes changed values', () => {
    const key = getScriptCacheKey('exec', 'a'.repeat(64), {
      vars: { a: 1, b: 2 },
      config: { model: 'fixture' },
    });
    expect(key).toMatch(/^exec:[a-f0-9]{64}$/);
    expect(
      getScriptCacheKey('exec', 'a'.repeat(64), {
        config: { model: 'fixture' },
        vars: { b: 2, a: 1 },
      }),
    ).toBe(key);
    expect(
      getScriptCacheKey('exec', 'a'.repeat(64), {
        vars: { a: 1, b: 3 },
        config: { model: 'fixture' },
      }),
    ).not.toBe(key);
    expect(
      getScriptCacheKey('python', 'a'.repeat(64), {
        vars: { a: 1, b: 2 },
        config: { model: 'fixture' },
      }),
    ).not.toBe(key);
  });

  it('allows empty and undefined environment overrides', () => {
    const key = getScriptCacheKey('exec', 'a'.repeat(64), {});
    expect(
      cliState.withEnvFileOverrides({}, () =>
        cliState.withEnv({ PROMPTFOO_REVIEW_ENV_PROBE: undefined }, () =>
          getScriptCacheKey('exec', 'a'.repeat(64), {}, {}),
        ),
      ),
    ).toBe(key);
  });

  it('does not hash inputs when caching is disabled', () => {
    vi.mocked(isCacheEnabled).mockReturnValue(false);
    const hash = vi.spyOn(crypto, 'createHash');
    expect(getScriptCacheKey('exec', 'a'.repeat(64), {})).toBeUndefined();
    expect(hash).not.toHaveBeenCalled();
  });
});
