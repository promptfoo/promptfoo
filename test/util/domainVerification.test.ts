import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';

import { request } from 'undici';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyGithubRepo, verifyHttpUrl } from '../../src/util/domainVerification';

const recordLookup = vi.hoisted(() => vi.fn());

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<typeof import('undici')>();
  return {
    ...actual,
    Agent: class extends actual.Agent {
      constructor(options: import('undici').Agent.Options) {
        super(options);
        if (typeof options.connect === 'object' && 'lookup' in options.connect) {
          recordLookup(options.connect.lookup);
        }
      }
    },
    request: vi.fn(),
  };
});

const mockedRequest = vi.mocked(request, { partial: true });
const lookupAll = vi.mocked(
  lookup as (host: string, options: { all: true }) => Promise<LookupAddress[]>,
);

beforeEach(() => {
  for (const key of [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'NO_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
    'no_proxy',
  ]) {
    vi.stubEnv(key, undefined);
  }
});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe('domainVerification', () => {
  it.each([
    [200, true],
    [404, false],
    [410, false],
    [301, true],
    [403, null],
    [405, null],
    [429, null],
    [503, null],
  ])('classifies HTTP status %s', async (status, exists) => {
    mockedRequest.mockResolvedValue({ statusCode: Number(status), headers: {} });
    await expect(verifyHttpUrl('https://public.example/')).resolves.toMatchObject({
      status,
      exists,
    });
  });

  it('verifies a slug at the GitHub API without using credential-aware fetch', async () => {
    mockedRequest.mockResolvedValue({ statusCode: 200, headers: {} });
    await expect(verifyGithubRepo('promptfoo', 'promptfoo')).resolves.toMatchObject({
      exists: true,
    });
    expect(mockedRequest).toHaveBeenCalledWith(
      new URL('https://api.github.com/repos/promptfoo/promptfoo'),
      expect.objectContaining({
        method: 'HEAD',
        headers: { 'User-Agent': 'promptfoo-redteam' },
      }),
    );
  });

  it('rejects repository text that could change the GitHub API route', async () => {
    await expect(verifyGithubRepo('owner', '..')).resolves.toMatchObject({ exists: null });
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it.each([
    'http://127.0.0.1/',
    'http://0x7f000001/',
    'http://2130706433/',
    'http://169.254.169.254/',
    'http://168.63.129.16/',
    'http://100.100.100.200/',
    'http://192.168.1.1/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[fc00::1]/',
    'http://[fe80::1]/',
    'http://[2002:7f00:1::]/',
    'http://localhost/',
    'http://service.internal./',
    'http://service.home.arpa/',
    'https://user:pass@public.example/',
    'https://public.example:8443/',
    'file:///tmp/data',
    'not a URL',
  ])('never dispatches to prohibited URL %s', async (url) => {
    await expect(verifyHttpUrl(url)).resolves.toMatchObject({ exists: null });
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('hands the resolved public address to the actual socket lookup callback', async () => {
    const publicAnswer = { address: '93.184.216.34', family: 4 };
    lookupAll.mockResolvedValue([publicAnswer]);
    mockedRequest.mockResolvedValue({ statusCode: 200, headers: {} });
    await verifyHttpUrl('https://public.example/a');

    const guardedLookup = recordLookup.mock.lastCall?.[0];
    const address = await new Promise((resolve, reject) => {
      guardedLookup('public.example', { all: true }, (error: Error | null, answer: unknown) =>
        error ? reject(error) : resolve(answer),
      );
    });

    expect(lookup).toHaveBeenCalledExactlyOnceWith('public.example', { all: true });
    expect(address).toEqual([publicAnswer]);
  });

  it('rejects mixed public and private DNS answers before allowing the socket to connect', async () => {
    lookupAll.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);
    const actual = await vi.importActual<typeof import('undici')>('undici');
    mockedRequest.mockImplementation(actual.request);

    await expect(verifyHttpUrl('https://public.example/a')).resolves.toMatchObject({
      exists: null,
      error: 'Reference resolves to a non-public address',
    });
    expect(lookup).toHaveBeenCalledExactlyOnceWith('public.example', { all: true });
  });

  it('does not make the second request when a public response redirects to an internal service', async () => {
    mockedRequest.mockResolvedValueOnce({
      statusCode: 302,
      headers: { location: 'http://[::ffff:127.0.0.1]/' },
    });

    await expect(verifyHttpUrl('https://public.example/')).resolves.toMatchObject({
      exists: null,
      error: 'Reference resolves to a non-public address',
    });
    expect(mockedRequest).toHaveBeenCalledTimes(1);
  });

  it('rejects a redirect hostname whose socket lookup returns a private address', async () => {
    const actual = await vi.importActual<typeof import('undici')>('undici');
    lookupAll.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
    mockedRequest
      .mockResolvedValueOnce({
        statusCode: 302,
        headers: { location: 'http://other.example/service' },
      })
      .mockImplementationOnce(actual.request);

    await expect(verifyHttpUrl('https://public.example/')).resolves.toMatchObject({
      exists: null,
      error: 'Reference resolves to a non-public address',
    });
    expect(lookup).toHaveBeenCalledExactlyOnceWith('other.example', { all: true });
  });

  it('uses a distinct dispatcher on every redirect hop, and classifies the final response', async () => {
    mockedRequest
      .mockResolvedValueOnce({
        statusCode: 302,
        headers: { location: 'https://other.example/moved' },
      })
      .mockResolvedValueOnce({ statusCode: 404, headers: {} });

    await expect(verifyHttpUrl('https://public.example/')).resolves.toMatchObject({
      exists: false,
    });
    expect(mockedRequest.mock.calls.map(([destination]) => String(destination))).toEqual([
      'https://public.example/',
      'https://other.example/moved',
    ]);
    expect(mockedRequest.mock.calls[0][1]?.dispatcher).not.toBe(
      mockedRequest.mock.calls[1][1]?.dispatcher,
    );
  });

  it('caps redirects even when each response supplies a valid public URL', async () => {
    mockedRequest.mockResolvedValue({ statusCode: 302, headers: { location: '/again' } });

    await expect(verifyHttpUrl('https://public.example/')).resolves.toMatchObject({
      exists: null,
      error: 'Reference exceeded the redirect limit',
    });
    expect(mockedRequest).toHaveBeenCalledTimes(5);
  });

  it('does not bypass configured HTTP proxies', async () => {
    vi.stubEnv('HTTPS_PROXY', 'http://proxy.example');
    await expect(verifyHttpUrl('https://public.example/')).resolves.toMatchObject({ exists: null });
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('honors NO_PROXY and checks the route again after a redirect', async () => {
    vi.stubEnv('HTTPS_PROXY', 'http://proxy.example');
    vi.stubEnv('NO_PROXY', 'public.example');
    mockedRequest.mockResolvedValueOnce({
      statusCode: 302,
      headers: { location: 'https://other.example/' },
    });

    await expect(verifyHttpUrl('https://public.example/')).resolves.toMatchObject({
      exists: null,
      error: 'Reference verification is unavailable through a configured HTTP proxy',
    });
    expect(mockedRequest).toHaveBeenCalledTimes(1);
  });

  it('uses a single timeout budget for the entire redirect chain', async () => {
    mockedRequest
      .mockResolvedValueOnce({ statusCode: 302, headers: { location: '/slow' } })
      .mockImplementationOnce(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            if (options?.signal instanceof AbortSignal) {
              options.signal.addEventListener('abort', () => reject(new Error('aborted')));
            }
          }),
      );

    await expect(verifyHttpUrl('https://public.example/', 25)).resolves.toMatchObject({
      exists: null,
      error: 'timeout',
    });
    expect(mockedRequest.mock.calls[0][1]?.signal).toBe(mockedRequest.mock.calls[1][1]?.signal);
  });
});
