import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockProcessEnv } from '../utils';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));
vi.mock('../../../src/util/fetch/monkeyPatchFetch', () => ({
  monkeyPatchFetch: vi.fn(),
}));

import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';

import { fetchWithProxy } from '../../../src/util/fetch/index';
import { monkeyPatchFetch } from '../../../src/util/fetch/monkeyPatchFetch';
import { PrivateRangeBlockedError } from '../../../src/util/privateNetwork';

const mockedMonkeyPatchFetch = vi.mocked(monkeyPatchFetch);
const mockedLookup = vi.mocked(
  lookup as unknown as (hostname: string, options: { all: true }) => Promise<LookupAddress[]>,
);

function redirectResponse(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

describe('fetchWithProxy guarded redirects (PROMPTFOO_BLOCK_PRIVATE_RANGES)', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.resetAllMocks();
    mockedLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 } as LookupAddress]);
  });

  afterEach(() => {
    restoreEnv?.();
    vi.resetAllMocks();
  });

  it('refuses a redirect from a public URL into link-local space', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    mockedMonkeyPatchFetch.mockResolvedValueOnce(
      redirectResponse('http://169.254.169.254/latest/meta-data'),
    );

    await expect(fetchWithProxy('https://public.example.com/start')).rejects.toThrow(
      PrivateRangeBlockedError,
    );
    // The private hop is never requested.
    expect(mockedMonkeyPatchFetch).toHaveBeenCalledTimes(1);
    // Manual mode so the guard observes every hop.
    expect(mockedMonkeyPatchFetch.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });

  it('follows a redirect to a public destination, downgrading POST to GET', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    mockedMonkeyPatchFetch
      .mockResolvedValueOnce(redirectResponse('https://public.example.com/next'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const response = await fetchWithProxy('https://public.example.com/start', {
      method: 'POST',
      body: 'x',
    });

    expect(response.status).toBe(200);
    expect(mockedMonkeyPatchFetch).toHaveBeenCalledTimes(2);
    const secondOptions = mockedMonkeyPatchFetch.mock.calls[1][1] as RequestInit;
    expect(secondOptions.method).toBe('GET');
    expect(secondOptions.body).toBeUndefined();
  });

  it('preserves method and body across 307 redirects', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    mockedMonkeyPatchFetch
      .mockResolvedValueOnce(redirectResponse('https://public.example.com/next', 307))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const response = await fetchWithProxy('https://public.example.com/start', {
      method: 'POST',
      body: 'x',
    });

    expect(response.status).toBe(200);
    const secondOptions = mockedMonkeyPatchFetch.mock.calls[1][1] as RequestInit;
    expect(secondOptions.method).toBe('POST');
    expect(secondOptions.body).toBe('x');
  });

  it('does not intercept redirects when the flag is unset', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: undefined });
    mockedMonkeyPatchFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }));

    await fetchWithProxy('https://public.example.com/start');

    expect(mockedMonkeyPatchFetch).toHaveBeenCalledTimes(1);
    expect(mockedMonkeyPatchFetch.mock.calls[0][1]).not.toMatchObject({ redirect: 'manual' });
  });

  it('refuses redirect chains past the hop limit', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    mockedMonkeyPatchFetch.mockImplementation(async () =>
      redirectResponse('https://public.example.com/loop'),
    );

    await expect(fetchWithProxy('https://public.example.com/start')).rejects.toThrow(
      /more than 5 redirects/,
    );
  });
});
