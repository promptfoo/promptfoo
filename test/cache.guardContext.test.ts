import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, enableCache, fetchWithCache } from '../src/cache';
import { cloudConfig } from '../src/globalConfig/cloud';
import { getConfigDirectoryPath } from '../src/util/config/manage';
import { fetchWithRetries } from '../src/util/fetch/index';
import { withPrivateRangeGuard } from '../src/util/fetch/guardContext';
import { mockProcessEnv } from './util/utils';

vi.mock('../src/util/config/manage', () => ({
  getConfigDirectoryPath: vi.fn().mockReturnValue('/mock/config/path'),
}));

vi.mock('../src/globalConfig/cloud', () => ({
  cloudConfig: {
    getApiHost: vi.fn().mockReturnValue('https://api.promptfoo.app'),
    getApiKey: vi.fn(() => process.env.PROMPTFOO_API_KEY),
    getAuthHeaderName: vi.fn().mockReturnValue('Authorization'),
    getCurrentOrganizationId: vi.fn().mockReturnValue('org-1'),
    getCurrentTeamId: vi.fn(),
  },
}));

// Transport-level double: the real fetchWithRetries is bypassed so this test
// only observes whether fetchWithCache consults the shared response cache.
vi.mock('../src/util/fetch/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/util/fetch/index')>()),
  fetchWithRetries: vi.fn(),
}));

const mockedFetchWithRetries = vi.mocked(fetchWithRetries);

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchWithCache inside the private-range guard context', () => {
  let restoreEnv: () => void;

  beforeEach(async () => {
    // Re-establish the hoisted factory-mock implementations: clearAllMocks
    // below keeps them, but a stray reset would wipe them back to undefined.
    vi.mocked(cloudConfig.getAuthHeaderName).mockReturnValue('Authorization');
    vi.mocked(cloudConfig.getApiKey).mockImplementation(() => process.env.PROMPTFOO_API_KEY);
    vi.mocked(getConfigDirectoryPath).mockReturnValue('/mock/config/path');
    enableCache();
    await clearCache();
    mockedFetchWithRetries.mockReset();
    mockedFetchWithRetries.mockImplementation(async () => jsonResponse({ ok: true }));
  });

  afterEach(() => {
    restoreEnv?.();
    // clearAllMocks: clears call history only, so factory-mock implementations survive.
    vi.clearAllMocks();
  });

  it('bypasses the shared cache for guarded requests', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    const url = 'https://public.example.com/data';

    // Prime the cache outside the guard context.
    const first = await fetchWithCache(url, {}, 5000, 'json');
    expect(first.data).toEqual({ ok: true });
    expect(mockedFetchWithRetries).toHaveBeenCalledTimes(1);

    // The same URL requested inside the guard context must go back to the
    // transport instead of reusing the unguarded cached response, whose
    // redirect chain was never guard-validated.
    const guarded = await withPrivateRangeGuard(() => fetchWithCache(url, {}, 5000, 'json'));
    expect(guarded.data).toEqual({ ok: true });
    expect(mockedFetchWithRetries).toHaveBeenCalledTimes(2);

    // The guarded call must not have polluted the cache either: the unguarded
    // entry is still served, and the transport is not hit a third time.
    const third = await fetchWithCache(url, {}, 5000, 'json');
    expect(third.data).toEqual({ ok: true });
    expect(third.cached).toBe(true);
    expect(mockedFetchWithRetries).toHaveBeenCalledTimes(2);
  });

  it('does not coalesce guarded requests with unguarded in-flight work', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    const url = 'https://public.example.com/slow';

    // A slow unguarded request stays in flight while the guarded one starts.
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockedFetchWithRetries.mockImplementationOnce(async () => {
      await gate;
      return jsonResponse({ ok: true });
    });

    const unguarded = fetchWithCache(url, {}, 5000, 'json');
    const guarded = withPrivateRangeGuard(() => fetchWithCache(url, {}, 5000, 'json'));
    release();
    const [unguardedResult, guardedResult] = await Promise.all([unguarded, guarded]);

    expect(unguardedResult.data).toEqual({ ok: true });
    expect(guardedResult.data).toEqual({ ok: true });
    // The guarded request must not have joined the unguarded in-flight work.
    expect(guardedResult.coalesced).not.toBe(true);
    expect(mockedFetchWithRetries).toHaveBeenCalledTimes(2);
  });
});
