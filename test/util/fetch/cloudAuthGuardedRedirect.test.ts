import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockProcessEnv } from '../utils';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';

import { fetchWithProxy } from '../../../src/util/fetch/index';

const mockedLookup = vi.mocked(
  lookup as unknown as (hostname: string, options: { all: true }) => Promise<LookupAddress[]>,
);

const CLOUD_TOKEN = 'test-cloud-api-key';
const CLOUD_ME = 'https://api.promptfoo.app/api/v1/users/me';

function redirectResponse(location: string, status = 307): Response {
  return new Response(null, { status, headers: { location } });
}

/**
 * Exercises the real monkeyPatchFetch (no module mock) with a stubbed global
 * fetch, so the tests observe the actual Authorization headers that would go
 * on the wire for each guarded redirect hop.
 */
describe('guarded redirects and Cloud auth injection (PROMPTFOO_BLOCK_PRIVATE_RANGES)', () => {
  let restoreEnv: () => void;
  let fetchStub: ReturnType<typeof vi.fn>;
  let seenAuthHeaders: (string | null)[];
  let scriptedResponses: Response[];

  beforeEach(() => {
    vi.resetAllMocks();
    mockedLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 } as LookupAddress]);
    seenAuthHeaders = [];
    scriptedResponses = [];
    fetchStub = vi.fn(async (_url: unknown, init?: RequestInit) => {
      seenAuthHeaders.push(new Headers(init?.headers).get('authorization'));
      const next = scriptedResponses.shift();
      if (!next) {
        throw new Error('fetch stub has no scripted response left');
      }
      return next;
    });
    vi.stubGlobal('fetch', fetchStub);
  });

  afterEach(() => {
    restoreEnv?.();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it('does not inject the Cloud token when a public URL redirects into the Cloud origin', async () => {
    restoreEnv = mockProcessEnv({
      PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true',
      PROMPTFOO_API_KEY: CLOUD_TOKEN,
    });
    scriptedResponses.push(
      redirectResponse(CLOUD_ME),
      new Response('{"user":"me"}', { status: 200 }),
    );

    const response = await fetchWithProxy('https://public.example.com/start');

    expect(response.status).toBe(200);
    expect(fetchStub).toHaveBeenCalledTimes(2);
    // Hop 1: public origin, never carried the token.
    expect(seenAuthHeaders[0]).toBeNull();
    // Hop 2: the Cloud origin hop must stay unauthenticated: the original
    // request did not start Cloud-bound.
    expect(seenAuthHeaders[1]).toBeNull();
  });

  it('still injects the Cloud token when the initial request is Cloud-bound', async () => {
    restoreEnv = mockProcessEnv({
      PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true',
      PROMPTFOO_API_KEY: CLOUD_TOKEN,
    });
    scriptedResponses.push(
      redirectResponse('https://api.promptfoo.app/api/v1/next'),
      new Response('ok', { status: 200 }),
    );

    const response = await fetchWithProxy('https://api.promptfoo.app/start');

    expect(response.status).toBe(200);
    expect(fetchStub).toHaveBeenCalledTimes(2);
    expect(seenAuthHeaders[0]).toBe(`Bearer ${CLOUD_TOKEN}`);
    expect(seenAuthHeaders[1]).toBe(`Bearer ${CLOUD_TOKEN}`);
  });
});
