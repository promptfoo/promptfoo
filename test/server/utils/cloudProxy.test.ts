import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEnvBool } from '../../../src/envars';
import { setEnvOverridesProvider } from '../../../src/envOverrides';
import { allowLocalCloudProxyRequests } from '../../../src/server/utils/cloudProxy';

describe('allowLocalCloudProxyRequests', () => {
  afterEach(() => {
    setEnvOverridesProvider(undefined);
    vi.unstubAllEnvs();
  });

  it('defaults to denied even when the caller omits the flag', () => {
    vi.stubEnv('PROMPTFOO_ALLOW_LOCAL_CLOUD_PROXY', undefined);
    expect(allowLocalCloudProxyRequests()).toBe(false);
  });

  it.each(['false', '0', 'off', 'nonsense'])('denies process setting %s', (value) => {
    vi.stubEnv('PROMPTFOO_ALLOW_LOCAL_CLOUD_PROXY', value);
    expect(allowLocalCloudProxyRequests()).toBe(false);
  });

  it.each(['true', '1', 'yes'])('accepts explicit operator process setting %s', (value) => {
    vi.stubEnv('PROMPTFOO_ALLOW_LOCAL_CLOUD_PROXY', value);
    expect(allowLocalCloudProxyRequests()).toBe(true);
  });

  it('cannot be enabled by an eval suite or file-level env override', () => {
    vi.stubEnv('PROMPTFOO_ALLOW_LOCAL_CLOUD_PROXY', undefined);
    setEnvOverridesProvider(() => ({ PROMPTFOO_ALLOW_LOCAL_CLOUD_PROXY: 'true' }));

    // Ordinary environment lookups are overridable, but server permission is not.
    expect(getEnvBool('PROMPTFOO_ALLOW_LOCAL_CLOUD_PROXY')).toBe(true);
    expect(allowLocalCloudProxyRequests()).toBe(false);
  });

  it('operator denial wins over conflicting eval suite env', () => {
    vi.stubEnv('PROMPTFOO_ALLOW_LOCAL_CLOUD_PROXY', 'false');
    setEnvOverridesProvider(() => ({ PROMPTFOO_ALLOW_LOCAL_CLOUD_PROXY: 'true' }));
    expect(allowLocalCloudProxyRequests()).toBe(false);
  });
});
