import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../../../src/logger';
import { monkeyPatchFetch } from '../../../src/util/fetch/monkeyPatchFetch';

vi.mock('../../../src/globalConfig/cloud', () => ({
  cloudConfig: {
    getApiHost: vi.fn(),
    getApiKey: vi.fn(),
    getAuthHeaderName: vi.fn(),
    getCurrentOrganizationId: vi.fn(),
    getCurrentTeamId: vi.fn(),
  },
}));

import { cloudConfig } from '../../../src/globalConfig/cloud';

describe('monkeyPatchFetch manual-redirect body logging', () => {
  let debugSpy: ReturnType<typeof vi.spyOn>;

  function apiRequestLogObjects(): Array<Record<string, unknown>> {
    const calls = debugSpy.mock.calls as Array<[string, unknown?]>;
    return calls
      .filter(([message]) => message === 'Api Request' || message === 'API request')
      .map(([, logObject]) => logObject as Record<string, unknown>);
  }

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.promptfoo.app');
    vi.mocked(cloudConfig.getApiKey).mockReturnValue(undefined);
    vi.mocked(cloudConfig.getAuthHeaderName).mockReturnValue('Authorization');
    debugSpy = vi.spyOn(logger, 'debug');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    debugSpy.mockRestore();
    vi.resetAllMocks();
  });

  it('does not drain the body of a manual-redirect 3xx response', async () => {
    // Regression test: fetchWithRedirectValidation cancels the original
    // branch of an intermediate redirect body before following it. The
    // fire-and-forget request logger must not keep its own clone draining,
    // or a caller-controlled 3xx with a huge or never-ending body keeps the
    // network active after the cancel. Without the fix, the logger's
    // response.clone().text() never resolves on this body, so the 'Api
    // Request' debug entry below is never emitted.
    const neverEndingBody = new ReadableStream({});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(neverEndingBody, {
          status: 302,
          headers: { location: 'https://public.example.com/next' },
        });
      }),
    );

    const response = await monkeyPatchFetch('https://public.example.com/start', {
      redirect: 'manual',
    });
    expect(response.status).toBe(302);

    // Let the fire-and-forget logRequestResponse run: it must log the hop
    // without touching the discarded body.
    await vi.waitFor(() => {
      expect(apiRequestLogObjects()).toHaveLength(1);
    });

    const logged = apiRequestLogObjects();
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ status: 302 });
    expect(logged[0]).not.toHaveProperty('response');

    await response.body?.cancel();
  });

  it('still logs the body of a non-redirect manual response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('ok-body', { status: 200 })),
    );

    const response = await monkeyPatchFetch('https://public.example.com/start', {
      redirect: 'manual',
    });
    expect(response.status).toBe(200);

    await vi.waitFor(() => {
      expect(apiRequestLogObjects()).toHaveLength(1);
    });
    const logged = apiRequestLogObjects();
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ status: 200, response: 'ok-body' });

    await response.text();
  });

  it('still logs the body of a final response in follow mode', async () => {
    // Sanity check: the skip applies only to manual-redirect 3xx hops, not
    // to responses in the default follow path.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('final-body', { status: 200 })),
    );

    const response = await monkeyPatchFetch('https://public.example.com/start');
    expect(response.status).toBe(200);

    await vi.waitFor(() => {
      expect(apiRequestLogObjects()).toHaveLength(1);
    });
    const logged = apiRequestLogObjects();
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ status: 200, response: 'final-body' });

    await response.text();
  });
});
