import { createHmac } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fingerprintCacheIdentity } from '../../src/providers/cacheFingerprint';
import * as fips from '../../src/util/fips';

afterEach(() => vi.restoreAllMocks());

describe('cache identity fingerprints', () => {
  it.each(['', 'us', 'default', 'fixture-api-key-with-more-than-14-bytes'])(
    'preserves the legacy namespace outside FIPS mode for %j',
    (value) => {
      vi.spyOn(fips, 'isFipsEnabled').mockReturnValue(false);
      expect(fingerprintCacheIdentity(value, 'provider-context')).toBe(
        createHmac('sha256', value).update('provider-context').digest('hex'),
      );
    },
  );

  it('accepts arbitrary metadata while separating values and provider contexts in FIPS mode', () => {
    vi.spyOn(fips, 'isFipsEnabled').mockReturnValue(true);
    const values = ['', 'us', 'default', 'prod', 'fixture-secret'];
    const fingerprints = values.map((value) => fingerprintCacheIdentity(value, 'provider-a'));
    expect(new Set(fingerprints).size).toBe(values.length);
    values.forEach((value, index) => {
      expect(fingerprints[index]).toMatch(/^[a-f0-9]{64}$/);
      expect(fingerprintCacheIdentity(value, 'provider-a')).toBe(fingerprints[index]);
      expect(fingerprintCacheIdentity(value, 'provider-b')).not.toBe(fingerprints[index]);
    });
    expect(fingerprintCacheIdentity('b:c', 'a')).not.toBe(fingerprintCacheIdentity('c', 'a:b'));
  });

  it('does not reuse a credential namespace after the module is reloaded', async () => {
    vi.spyOn(fips, 'isFipsEnabled').mockReturnValue(true);
    const first = fingerprintCacheIdentity('fixture-secret', 'provider');
    vi.resetModules();
    const freshFips = await import('../../src/util/fips');
    vi.spyOn(freshFips, 'isFipsEnabled').mockReturnValue(true);
    const fresh = await import('../../src/providers/cacheFingerprint');
    expect(fresh.fingerprintCacheIdentity('fixture-secret', 'provider')).not.toBe(first);
  });
});
