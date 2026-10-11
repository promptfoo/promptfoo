import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { writeFile } = vi.hoisted(() => ({ writeFile: vi.fn() }));
vi.mock('node:fs/promises', () => ({ writeFile }));

const scriptPath = fileURLToPath(new URL('../../site/scripts/fetch-stats.mjs', import.meta.url));
const outputPath = fileURLToPath(new URL('../../site/src/.generated-stats.json', import.meta.url));
const fetchMock = vi.fn<typeof fetch>();

function response(data: unknown, headers?: HeadersInit) {
  return new Response(JSON.stringify(data), { headers });
}

async function runScript() {
  await import(scriptPath);
  await vi.runAllTimersAsync();
}

function writtenStats() {
  expect(writeFile).toHaveBeenCalledOnce();
  expect(writeFile.mock.calls[0][0]).toBe(outputPath);
  return JSON.parse(writeFile.mock.calls[0][1] as string);
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  writeFile.mockReset().mockResolvedValue(undefined);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('GITHUB_TOKEN', 'test-github-token');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  // Native AbortSignal.timeout uses internal timers; make its deadline controllable.
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((delay) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), delay);
    return controller.signal;
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('site statistics pre-build script', () => {
  it('writes successful statistics and sends the token only to GitHub', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes('/contributors')) {
        return response([], { link: '<https://api.github.com/contributors?page=421>; rel="last"' });
      }
      return new URL(String(url)).hostname === 'api.github.com'
        ? response({ stargazers_count: 12500 })
        : response({ downloads: 123456 });
    });

    await runScript();

    expect(writtenStats()).toEqual({
      GITHUB_STARS_DISPLAY: '12.5k',
      CONTRIBUTOR_COUNT: 421,
      WEEKLY_DOWNLOADS_DISPLAY: '123,000',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [url, options] of fetchMock.mock.calls) {
      expect(options?.headers).toEqual({
        'User-Agent': 'promptfoo-site-build',
        ...(new URL(String(url)).hostname === 'api.github.com'
          ? { Authorization: 'Bearer test-github-token' }
          : {}),
      });
    }
  });

  it.each(['headers', 'body'])(
    'times out stalled %s while retaining successful sources',
    async (stage) => {
      fetchMock.mockImplementation(async (url, options) => {
        if (String(url).includes('/contributors')) {
          return response([{}, {}]);
        }
        if (new URL(String(url)).hostname === 'api.npmjs.org') {
          return response({ downloads: 2000 });
        }
        const pending = () =>
          new Promise<never>((_resolve, reject) => {
            options!.signal!.addEventListener('abort', () => reject(options!.signal!.reason), {
              once: true,
            });
          });
        return stage === 'headers'
          ? pending()
          : Object.assign(response({}), { json: vi.fn(pending) });
      });

      await import(scriptPath);
      await vi.advanceTimersByTimeAsync(9999);
      expect(writeFile).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);

      expect(writtenStats()).toEqual({ CONTRIBUTOR_COUNT: 2, WEEKLY_DOWNLOADS_DISPLAY: '2,000' });
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch GitHub stars'),
      );
      expect(AbortSignal.timeout).toHaveBeenCalledWith(10000);
    },
  );

  it('falls back when HTTP, JSON, and network requests fail', async () => {
    vi.stubEnv('GITHUB_TOKEN', '');
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes('/contributors')) {
        return new Response('invalid JSON');
      }
      if (new URL(String(url)).hostname === 'api.npmjs.org') {
        throw new Error('Network unavailable');
      }
      return new Response('unavailable', { status: 503, statusText: 'Service Unavailable' });
    });

    await runScript();

    expect(writtenStats()).toEqual({});
    expect(console.warn).toHaveBeenCalledTimes(3);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('HTTP 503 Service Unavailable'),
    );
    expect(console.log).toHaveBeenCalledWith(
      '[fetch-stats] No stats fetched; fallback values will be used',
    );
    for (const [, options] of fetchMock.mock.calls) {
      expect(options?.headers).not.toHaveProperty('Authorization');
    }
  });

  it('reports output write errors without rejecting the script', async () => {
    fetchMock.mockResolvedValue(response({}));
    writeFile.mockRejectedValue(new Error('Disk full'));

    await runScript();

    expect(console.warn).toHaveBeenCalledWith('[fetch-stats] Unexpected error: Disk full');
  });
});
