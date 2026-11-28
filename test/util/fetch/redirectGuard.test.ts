import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockProcessEnv } from '../utils';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));
vi.mock('../../../src/util/fetch/monkeyPatchFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/util/fetch/monkeyPatchFetch')>();
  return {
    ...actual,
    monkeyPatchFetch: vi.fn(),
  };
});
const mockGetProxyForUrl = vi.hoisted(() => vi.fn((_url: string) => ''));
vi.mock('proxy-from-env', () => ({
  getProxyForUrl: (url: string) => mockGetProxyForUrl(url),
}));

import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';

import logger from '../../../src/logger';
import { CloudAuthRedirectError } from '../../../src/util/fetch/cloudAuthRedirects';
import { withPrivateRangeGuard } from '../../../src/util/fetch/guardContext';
import { fetchWithProxy, fetchWithRetries } from '../../../src/util/fetch/index';

// Guarded-route calls run inside the guard context (see guardContext.ts);
// the env flag alone no longer switches fetchWithProxy into validation mode.
const guardedFetch = (...args: Parameters<typeof fetchWithProxy>) =>
  withPrivateRangeGuard(() => fetchWithProxy(...args));

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
    mockGetProxyForUrl.mockReturnValue('');
  });

  afterEach(() => {
    restoreEnv?.();
    vi.resetAllMocks();
  });

  it.each(['follow', 'manual', 'error'] as const)(
    'validates the initial URL before dispatch in %s mode',
    async (redirect) => {
      await expect(guardedFetch('http://127.0.0.1/', { redirect })).rejects.toThrow(
        PrivateRangeBlockedError,
      );
      expect(mockedMonkeyPatchFetch).not.toHaveBeenCalled();
    },
  );

  it('refuses a redirect from a public URL into link-local space', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    mockedMonkeyPatchFetch.mockResolvedValueOnce(
      redirectResponse('http://169.254.169.254/latest/meta-data'),
    );

    await expect(guardedFetch('https://public.example.com/start')).rejects.toThrow(
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

    const response = await guardedFetch('https://public.example.com/start', {
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

    const response = await guardedFetch('https://public.example.com/start', {
      method: 'POST',
      body: 'x',
    });

    expect(response.status).toBe(200);
    const secondOptions = mockedMonkeyPatchFetch.mock.calls[1][1] as RequestInit;
    expect(secondOptions.method).toBe('POST');
    expect(secondOptions.body).toBe('x');
  });

  it('preserves Request-owned method and body in the guarded path', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    mockedMonkeyPatchFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }));

    // The guarded path forwards only the URL string plus an options
    // object, so a Request passed to fetchWithProxy must have its
    // method and body seeded into those options, or a POST would
    // silently downgrade to a GET while the guard is active.
    const request = new Request('https://public.example.com/submit', {
      method: 'POST',
      body: 'x',
    });
    const response = await guardedFetch(request);

    expect(response.status).toBe(200);
    const firstOptions = mockedMonkeyPatchFetch.mock.calls[0][1] as RequestInit;
    expect(firstOptions.method).toBe('POST');
    expect(firstOptions.body).not.toBeUndefined();
  });

  it('preserves a Request-owned manual redirect mode in the guarded path', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    mockedMonkeyPatchFetch.mockResolvedValueOnce(
      redirectResponse('https://public.example.com/next'),
    );
    mockedMonkeyPatchFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }));

    // Without seeding, fetchWithRedirectValidation sees the default
    // follow mode and follows the redirect; a manual Request must get
    // the 302 itself, so it can inspect the Location.
    const request = new Request('https://public.example.com/start', {
      redirect: 'manual',
    });
    const response = await guardedFetch(request);

    expect(response.status).toBe(302);
    expect(mockedMonkeyPatchFetch).toHaveBeenCalledTimes(1);
  });

  it('preserves a Request-owned error redirect mode in the guarded path', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    mockedMonkeyPatchFetch.mockResolvedValueOnce(
      redirectResponse('https://public.example.com/next'),
    );
    mockedMonkeyPatchFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const request = new Request('https://public.example.com/start', {
      redirect: 'error',
    });
    await expect(guardedFetch(request)).rejects.toThrow(/redirects are not allowed/);
  });

  it('lets an explicit init redirect mode win over the Request-owned mode', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    mockedMonkeyPatchFetch.mockResolvedValueOnce(
      redirectResponse('https://public.example.com/next'),
    );
    mockedMonkeyPatchFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }));

    // Explicit options win, mirroring fetch(Request, init): the manual
    // Request mode is overridden, so the public redirect is followed.
    const request = new Request('https://public.example.com/start', {
      redirect: 'manual',
    });
    const response = await guardedFetch(request, { redirect: 'follow' });

    expect(response.status).toBe(200);
    expect(mockedMonkeyPatchFetch).toHaveBeenCalledTimes(2);
  });

  it('does not intercept redirects when the flag is unset', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: undefined });
    mockedMonkeyPatchFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }));

    await fetchWithProxy('https://public.example.com/start');

    expect(mockedMonkeyPatchFetch).toHaveBeenCalledTimes(1);
    expect(mockedMonkeyPatchFetch.mock.calls[0][1]).not.toMatchObject({ redirect: 'manual' });
  });

  it('does not intercept redirects for unscoped callers when the flag is set', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    mockedMonkeyPatchFetch.mockResolvedValueOnce(redirectResponse('http://127.0.0.1:11434/api'));

    const response = await fetchWithProxy('https://public.example.com/start');

    // Outside a guarded server-route context, the flag alone changes nothing:
    // an eval-style call in the same process keeps default redirect handling.
    expect(response.status).toBe(302);
    expect(mockedMonkeyPatchFetch).toHaveBeenCalledTimes(1);
    expect(mockedMonkeyPatchFetch.mock.calls[0][1]).not.toMatchObject({ redirect: 'manual' });
  });

  it('refuses redirect chains past the hop limit', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    mockedMonkeyPatchFetch.mockImplementation(async () =>
      redirectResponse('https://public.example.com/loop'),
    );

    await expect(guardedFetch('https://public.example.com/start')).rejects.toThrow(
      /more than 5 redirects/,
    );
  });

  it('cancels redirect response bodies instead of buffering them', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    let cancelled = false;
    // A body that never produces data and never ends: draining it with
    // arrayBuffer() would stall the guarded request forever, so the loop
    // must cancel the stream instead.
    const neverEndingBody = new ReadableStream({
      cancel() {
        cancelled = true;
      },
    });
    mockedMonkeyPatchFetch
      .mockResolvedValueOnce(
        new Response(neverEndingBody, {
          status: 302,
          headers: { location: 'https://public.example.com/next' },
        }),
      )
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const response = await guardedFetch('https://public.example.com/start');

    expect(response.status).toBe(200);
    expect(cancelled).toBe(true);
  });

  it('redacts an opaque path credential from the guarded redirect log entry', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    const credential = '2e163f4d-28e2-4f84-b6d2-05e13058d6aa';
    mockedMonkeyPatchFetch
      .mockResolvedValueOnce(
        redirectResponse(`https://public.example.com/v1/${credential}/responses`),
      )
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const debugSpy = vi.spyOn(logger, 'debug');
    let redirectLogs: Array<[string, unknown?]>;
    try {
      const response = await guardedFetch('https://public.example.com/start');
      expect(response.status).toBe(200);
      redirectLogs = debugSpy.mock.calls.filter(
        ([message]) => message === '[fetchWithProxy] Following guarded redirect',
      );
    } finally {
      debugSpy.mockRestore();
    }
    expect(redirectLogs).toHaveLength(1);
    const logged = redirectLogs[0][1] as { from: string; to: string };
    expect(logged.to).toContain('%5BREDACTED%5D');
    expect(logged.to).not.toContain(credential);
    expect(logged.from).toBe('https://public.example.com/start');
  });

  it('redacts credentials from the redirect-limit error message', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    mockedMonkeyPatchFetch.mockImplementation(async () =>
      redirectResponse('https://public.example.com/loop'),
    );

    const error = await guardedFetch(
      'https://public.example.com/start?api_key=supersecretvalue',
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PrivateRangeBlockedError);
    expect((error as Error).message).toMatch(/more than 5 redirects/);
    expect((error as Error).message).not.toContain('supersecretvalue');
  });

  it('refuses a cross-origin redirect for a cloud-authenticated request', async () => {
    // A custom cloud-auth header binds the request to its initial origin in
    // the native-follow path; the guarded path must honor that instead of
    // rebinding the dispatcher per hop and leaking the header.
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    mockedMonkeyPatchFetch.mockResolvedValueOnce(
      redirectResponse('https://other.example.com/next'),
    );

    await expect(
      guardedFetch('https://public.example.com/start', {
        headers: { 'x-custom-auth': 'Bearer test-token' },
        skipCloudAuthInjection: true,
      }),
    ).rejects.toThrow(CloudAuthRedirectError);
    // The redirect destination is never requested.
    expect(mockedMonkeyPatchFetch).toHaveBeenCalledTimes(1);
  });

  it('follows a same-origin redirect for a cloud-authenticated request', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    mockedMonkeyPatchFetch
      .mockResolvedValueOnce(redirectResponse('https://public.example.com/next'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const response = await guardedFetch('https://public.example.com/start', {
      headers: { 'x-custom-auth': 'Bearer test-token' },
      skipCloudAuthInjection: true,
    });

    expect(response.status).toBe(200);
    expect(mockedMonkeyPatchFetch).toHaveBeenCalledTimes(2);
  });

  it('still follows cross-origin redirects without cloud auth', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    mockedMonkeyPatchFetch
      .mockResolvedValueOnce(redirectResponse('https://other.example.com/next'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const response = await guardedFetch('https://public.example.com/start');

    expect(response.status).toBe(200);
    expect(mockedMonkeyPatchFetch).toHaveBeenCalledTimes(2);
  });

  it('bars Cloud auth injection on every hop when the initial request is not Cloud-bound', async () => {
    // A caller-controlled public URL that 307-redirects into the Cloud
    // origin must not pick up the saved Cloud token on the later hop.
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    mockedMonkeyPatchFetch
      .mockResolvedValueOnce(redirectResponse('https://api.promptfoo.app/api/v1/users/me', 307))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const response = await guardedFetch('https://public.example.com/start');

    expect(response.status).toBe(200);
    expect(mockedMonkeyPatchFetch).toHaveBeenCalledTimes(2);
    for (const call of mockedMonkeyPatchFetch.mock.calls) {
      expect(call[1]).toMatchObject({ skipCloudAuthInjection: true });
    }
  });

  it('does not retry a private-range policy failure from a guarded redirect', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    mockedLookup.mockImplementation(async (hostname: string) => {
      if (hostname === 'internal.example.com') {
        return [{ address: '10.1.2.3', family: 4 } as LookupAddress];
      }
      return [{ address: '93.184.216.34', family: 4 } as LookupAddress];
    });
    mockedMonkeyPatchFetch.mockResolvedValueOnce(
      redirectResponse('http://internal.example.com/latest'),
    );

    await expect(
      withPrivateRangeGuard(() =>
        fetchWithRetries(
          'https://public.example.com/start',
          { method: 'POST', body: 'x' },
          10_000,
          4,
        ),
      ),
    ).rejects.toThrow(PrivateRangeBlockedError);
    // The policy failure is final: the original POST must not be replayed
    // against the public endpoint that redirected into private space.
    expect(mockedMonkeyPatchFetch).toHaveBeenCalledTimes(1);
  });

  it('returns the first response untouched for a manual redirect caller', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    mockedMonkeyPatchFetch.mockResolvedValueOnce(
      redirectResponse('https://public.example.com/next'),
    );

    const response = await guardedFetch('https://public.example.com/start', {
      redirect: 'manual',
    });

    // The caller inspects the Location itself; the guard must not follow it.
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://public.example.com/next');
    expect(mockedMonkeyPatchFetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a redirect response for an error redirect caller', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    mockedMonkeyPatchFetch.mockResolvedValueOnce(
      redirectResponse('https://public.example.com/next'),
    );

    await expect(
      guardedFetch('https://public.example.com/start', { redirect: 'error' }),
    ).rejects.toThrow(TypeError);
    // The redirect destination is never requested.
    expect(mockedMonkeyPatchFetch).toHaveBeenCalledTimes(1);
  });

  it('passes a non-redirect response through for an error redirect caller', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    mockedMonkeyPatchFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const response = await guardedFetch('https://public.example.com/start', {
      redirect: 'error',
    });

    expect(response.status).toBe(200);
    expect(mockedMonkeyPatchFetch).toHaveBeenCalledTimes(1);
  });

  it('keeps Cloud auth injection eligible when the initial request is Cloud-bound', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    mockedMonkeyPatchFetch
      .mockResolvedValueOnce(redirectResponse('https://api.promptfoo.app/api/v1/next', 307))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const response = await guardedFetch('https://api.promptfoo.app/start');

    expect(response.status).toBe(200);
    expect(mockedMonkeyPatchFetch).toHaveBeenCalledTimes(2);
    for (const call of mockedMonkeyPatchFetch.mock.calls) {
      expect(call[1]).not.toMatchObject({ skipCloudAuthInjection: true });
    }
  });

  it('recomputes the proxy dispatcher per redirect hop', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    // Only the redirect destination sits behind the proxy. If the
    // dispatcher fetchWithProxy bound for the initial URL is reused as
    // the caller dispatcher, the per-hop recomputation never runs and
    // the second hop goes direct when it should use the proxy.
    mockGetProxyForUrl.mockImplementation((url: string) =>
      url === 'https://public.example.com/next' ? 'http://proxy.example.com:8080' : '',
    );
    mockedMonkeyPatchFetch
      .mockResolvedValueOnce(redirectResponse('https://public.example.com/next', 307))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const response = await guardedFetch('https://public.example.com/start', {
      method: 'POST',
      body: 'x',
    });

    expect(response.status).toBe(200);
    expect(mockedMonkeyPatchFetch).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = mockedMonkeyPatchFetch.mock.calls;
    expect((secondCall[1] as { dispatcher?: unknown }).dispatcher).not.toBe(
      (firstCall[1] as { dispatcher?: unknown }).dispatcher,
    );
    expect(mockGetProxyForUrl).toHaveBeenCalledWith('https://public.example.com/next');
  });

  it('leaves native Request body ownership intact outside guarded routes', async () => {
    const request = new Request('https://public.example.com/submit', {
      method: 'POST',
      body: 'replayable',
    });
    mockedMonkeyPatchFetch.mockResolvedValueOnce(new Response('ok'));

    await fetchWithProxy(request);

    const [input, init] = mockedMonkeyPatchFetch.mock.calls[0];
    expect(input).toBe(request);
    expect(init?.body).toBeUndefined();
    expect(await request.text()).toBe('replayable');
  });

  it('replays a Request stream body across a 307 redirect', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    // A real fetch consumes the body stream, so the mock consumes it too:
    // reusing the same stream object on the second hop must fail exactly
    // like undici, with the disturbed-stream error, instead of silently
    // replaying a body the mock never touched.
    let hops = 0;
    mockedMonkeyPatchFetch.mockImplementation(async (_url, options) => {
      const body = (options as { body?: unknown }).body;
      if (body instanceof ReadableStream) {
        await new Response(body).text();
      }
      hops += 1;
      return hops === 1
        ? redirectResponse('https://public.example.com/next', 307)
        : new Response('ok', { status: 200 });
    });

    const request = new Request('https://public.example.com/submit', {
      method: 'POST',
      body: 'x',
    });
    const response = await guardedFetch(request);

    expect(response.status).toBe(200);
    expect(mockedMonkeyPatchFetch).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = mockedMonkeyPatchFetch.mock.calls;
    const secondBody = (secondCall[1] as { body?: unknown }).body;
    expect(secondBody).toBeInstanceOf(ReadableStream);
    expect(secondBody).not.toBe((firstCall[1] as { body?: unknown }).body);
  });
});
