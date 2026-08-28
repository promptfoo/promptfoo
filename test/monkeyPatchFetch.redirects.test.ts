import { MockAgent } from 'undici';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cloudConfig } from '../src/globalConfig/cloud';
import { monkeyPatchFetch } from '../src/util/fetch/monkeyPatchFetch';

import type { FetchOptions } from '../src/util/fetch/types';

vi.mock('../src/globalConfig/cloud', () => ({
  cloudConfig: {
    getApiHost: vi.fn(),
    getApiKey: vi.fn(),
    getAuthHeaderName: vi.fn(),
    getCurrentOrganizationId: vi.fn(),
    getCurrentTeamId: vi.fn(),
  },
}));

vi.mock('../src/logger', () => ({
  default: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logRequestResponse: vi.fn(),
}));

const origin = 'https://cloud.example.test';
const headerName = 'X-Promptfoo-Api-Key';
const credential = 'Bearer synthetic-cloud-key';
const redirectStatuses = [301, 302, 303, 307, 308];
const destinations = [
  { name: 'same origin', origin, keepCredential: true },
  { name: 'different hostname', origin: 'https://other.example.test', keepCredential: false },
  { name: 'different port', origin: 'https://cloud.example.test:8443', keepCredential: false },
  { name: 'HTTP downgrade', origin: 'http://cloud.example.test', keepCredential: false },
];

describe('Cloud authentication across redirects', () => {
  let agent: MockAgent;

  beforeEach(() => {
    vi.resetAllMocks();
    agent = new MockAgent();
    agent.disableNetConnect();
    vi.mocked(cloudConfig.getApiHost).mockReturnValue(origin);
    vi.mocked(cloudConfig.getApiKey).mockReturnValue('synthetic-cloud-key');
    vi.mocked(cloudConfig.getAuthHeaderName).mockReturnValue(headerName);
  });

  afterEach(async () => {
    await agent.close();
    vi.restoreAllMocks();
  });

  async function request(url: string | Request, options: FetchOptions = {}) {
    const optionsWithDispatcher = { ...options, dispatcher: agent };
    return monkeyPatchFetch(url, optionsWithDispatcher);
  }

  function echoHeaders(destination: string, path = '/landing') {
    agent
      .get(destination)
      .intercept({ path, method: 'GET' })
      .reply((request) => ({ statusCode: 200, data: JSON.stringify(request.headers) }));
  }

  describe.each(['saved', 'explicit', 'new login', 'rotation'] as const)(
    '%s credential',
    (mode) => {
      it.each(
        redirectStatuses.flatMap((status) =>
          destinations.map((destination) => ({ status, ...destination })),
        ),
      )('handles $status to $name', async ({ status, origin: destination, keepCredential }) => {
        const options: FetchOptions = {};
        if (mode !== 'saved') {
          options.headers = { [headerName.toLowerCase()]: credential, 'X-Request-Id': 'request-1' };
        }
        if (mode === 'new login' || mode === 'rotation') {
          options.skipCloudAuthInjection = true;
          vi.mocked(cloudConfig.getApiHost).mockReturnValue('https://old-cloud.example.test');
          vi.mocked(cloudConfig.getAuthHeaderName).mockReturnValue('X-Previous-Auth');
          vi.mocked(cloudConfig.getApiKey).mockReturnValue(
            mode === 'rotation' ? 'previous-synthetic-key' : undefined,
          );
        }

        agent
          .get(origin)
          .intercept({ path: '/start', method: 'GET' })
          .reply(status, '', { headers: { location: `${destination}/landing` } });
        const dispatch = vi.spyOn(agent, 'dispatch');
        if (keepCredential) {
          echoHeaders(destination);
          const response = await request(`${origin}/start`, options);
          const received = new Headers(await response.json());
          expect(received.get(headerName)).toBe(credential);
          expect(received.has('X-Previous-Auth')).toBe(false);
          if (mode !== 'saved') {
            expect(received.get('X-Request-Id')).toBe('request-1');
          }
        } else {
          await expect(request(`${origin}/start`, options)).rejects.toThrow(
            'Cloud authentication cannot follow a redirect to a different origin',
          );
          expect(dispatch).toHaveBeenCalledTimes(1);
        }
        if (mode !== 'saved') {
          expect(new Headers(options.headers).get(headerName)).toBe(credential);
        }
        agent.assertNoPendingInterceptors();
      });
    },
  );

  it.each(['saved', 'rotation'] as const)(
    'blocks a foreign hop after a same-origin redirect with a %s credential',
    async (mode) => {
      const otherOrigin = 'https://other.example.test';
      agent
        .get(origin)
        .intercept({ path: '/start', method: 'GET' })
        .reply(302, '', { headers: { location: `${origin}/redirect-out` } });
      agent
        .get(origin)
        .intercept({ path: '/redirect-out', method: 'GET', headers: { [headerName]: credential } })
        .reply(302, '', { headers: { location: `${otherOrigin}/landing` } });

      const dispatch = vi.spyOn(agent, 'dispatch');
      await expect(
        request(
          `${origin}/start`,
          mode === 'rotation'
            ? { headers: { [headerName]: credential }, skipCloudAuthInjection: true }
            : {},
        ),
      ).rejects.toThrow('Cloud authentication cannot follow a redirect to a different origin');
      expect(dispatch).toHaveBeenCalledTimes(2);
      agent.assertNoPendingInterceptors();
    },
  );

  it('protects an explicitly supplied Cloud header at an alternate configured endpoint', async () => {
    vi.mocked(cloudConfig.getApiHost).mockReturnValue('https://account.example.test');
    agent
      .get(origin)
      .intercept({ path: '/start', method: 'GET' })
      .reply(302, '', { headers: { location: 'https://other.example.test/landing' } });
    await expect(
      request(`${origin}/start`, { headers: { [headerName]: credential } }),
    ).rejects.toThrow('Cloud authentication cannot follow a redirect to a different origin');
    agent.assertNoPendingInterceptors();
  });

  it.each(['Authorization', 'X-Provider-Auth'])('preserves existing %s handling', async (name) => {
    vi.mocked(cloudConfig.getApiKey).mockReturnValue(undefined);
    agent
      .get(origin)
      .intercept({ path: '/start', method: 'GET' })
      .reply(302, '', { headers: { location: 'https://other.example.test/landing' } });
    echoHeaders('https://other.example.test');

    const response = await request(`${origin}/start`, {
      headers: { [name]: 'Bearer provider-key' },
    });

    expect(new Headers(await response.json()).get(name)).toBe(
      name === 'Authorization' ? null : 'Bearer provider-key',
    );
    agent.assertNoPendingInterceptors();
  });

  it.each([307, 308])(
    'preserves POST bodies and headers on a same-origin %s redirect',
    async (status) => {
      const body = JSON.stringify({ prompt: 'hello' });
      agent
        .get(origin)
        .intercept({ path: '/start', method: 'POST', body })
        .reply(status, '', { headers: { location: `${origin}/landing` } });
      agent
        .get(origin)
        .intercept({ path: '/landing', method: 'POST', body })
        .reply((request) => ({
          statusCode: 200,
          data: JSON.stringify({ body: request.body, headers: request.headers }),
        }));

      const response = await request(`${origin}/start`, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json' },
      });
      const received = await response.json();

      expect(received.body).toBe(body);
      expect(new Headers(received.headers).get('Content-Type')).toBe('application/json');
      expect(new Headers(received.headers).get(headerName)).toBe(credential);
      agent.assertNoPendingInterceptors();
    },
  );

  it.each(redirectStatuses)(
    'does not dispatch the POST body or credential across origins on %s',
    async (status) => {
      const body = JSON.stringify({ prompt: 'private input' });
      agent
        .get(origin)
        .intercept({ path: '/start', method: 'POST', body })
        .reply(status, '', { headers: { location: 'https://other.example.test/landing' } });
      const dispatch = vi.spyOn(agent, 'dispatch');

      await expect(request(`${origin}/start`, { method: 'POST', body })).rejects.toThrow(
        'Cloud authentication cannot follow a redirect to a different origin',
      );

      expect(dispatch).toHaveBeenCalledTimes(1);
      agent.assertNoPendingInterceptors();
    },
  );

  it.each([301, 302, 303])(
    'preserves native POST-to-GET behavior on a same-origin %s redirect',
    async (status) => {
      agent
        .get(origin)
        .intercept({ path: '/start', method: 'POST', body: 'hello' })
        .reply(status, '', { headers: { location: `${origin}/landing` } });
      echoHeaders(origin);

      const response = await request(`${origin}/start`, {
        method: 'POST',
        body: 'hello',
        headers: { 'Content-Type': 'text/plain' },
      });
      const headers = new Headers(await response.json());

      expect(headers.get(headerName)).toBe(credential);
      expect(headers.has('Content-Type')).toBe(false);
      agent.assertNoPendingInterceptors();
    },
  );

  it.each(['manual', 'error'] as const)('honors redirect: %s', async (redirect) => {
    agent
      .get(origin)
      .intercept({ path: '/start', method: 'GET' })
      .reply(302, '', { headers: { location: 'https://other.example.test/landing' } });

    const response = request(`${origin}/start`, { redirect });
    if (redirect === 'manual') {
      expect((await response).status).toBe(302);
    } else {
      await expect(response).rejects.toThrow();
    }
    agent.assertNoPendingInterceptors();
  });

  it('supports a frozen caller dispatcher and preserves its transport metadata', async () => {
    agent.get(origin).intercept({ path: '/start', method: 'POST', body: 'hello' }).reply(200, 'ok');
    const dispatcher = Object.freeze({
      get isMockActive() {
        return true;
      },
      dispatch: agent.dispatch.bind(agent),
    });
    const options = { method: 'POST', body: 'hello', dispatcher };

    expect(await (await monkeyPatchFetch(`${origin}/start`, options)).text()).toBe('ok');
    agent.assertNoPendingInterceptors();
  });

  it('protects credentials carried by a Request object without changing its headers', async () => {
    agent
      .get(origin)
      .intercept({ path: '/start', method: 'GET' })
      .reply(302, '', { headers: { location: 'https://other.example.test/landing' } });
    const input = new Request(`${origin}/start`, { headers: { [headerName]: credential } });

    await expect(request(input)).rejects.toThrow(
      'Cloud authentication cannot follow a redirect to a different origin',
    );
    expect(input.headers.get(headerName)).toBe(credential);
    agent.assertNoPendingInterceptors();
  });

  it('honors cancellation before dispatch', async () => {
    const controller = new AbortController();
    controller.abort(new Error('request cancelled'));
    const dispatch = vi.spyOn(agent, 'dispatch');

    await expect(request(`${origin}/start`, { signal: controller.signal })).rejects.toThrow(
      'request cancelled',
    );
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('keeps redirect state local to each request when reusing a dispatcher', async () => {
    agent
      .get(origin)
      .intercept({ path: '/start', method: 'GET' })
      .reply(302, '', { headers: { location: 'https://other.example.test/landing' } });
    echoHeaders(origin);

    const redirected = request(`${origin}/start`);
    const direct = request(`${origin}/landing`);

    await expect(redirected).rejects.toThrow(
      'Cloud authentication cannot follow a redirect to a different origin',
    );
    expect(new Headers(await (await direct).json()).get(headerName)).toBe(credential);
    agent.assertNoPendingInterceptors();
  });
});
