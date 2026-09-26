import * as fs from 'node:fs/promises';

import { Agent, ProxyAgent } from 'undici';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import { clearAgentCache, fetchWithProxy } from '../../../src/util/fetch/index';
import { mockProcessEnv, PROXY_ENV_KEYS } from '../utils';

vi.mock('undici', () => {
  const create = (options: unknown) => {
    const dispatcher = { options, close: vi.fn().mockResolvedValue(undefined), compose: vi.fn() };
    dispatcher.compose.mockReturnValue(dispatcher);
    return dispatcher;
  };
  return {
    Agent: vi.fn(function (options: unknown) {
      return create(options);
    }),
    ProxyAgent: vi.fn(function (options: unknown) {
      return create(options);
    }),
    interceptors: { decompress: vi.fn() },
  };
});
vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
  readFile: vi.fn(),
}));
vi.mock('../../../src/logger', () => ({
  default: { debug: vi.fn(), warn: vi.fn() },
  logRequestResponse: vi.fn(),
}));

let restore = () => {};
const request = () => fetchWithProxy('https://fixture.example/test');
const receivedDispatcher = () =>
  (
    vi.mocked(global.fetch).mock.calls.at(-1)?.[1] as
      | (RequestInit & { dispatcher?: unknown })
      | undefined
  )?.dispatcher;

beforeEach(() => {
  clearAgentCache();
  vi.clearAllMocks();
  vi.mocked(fs.readFile).mockReset();
  restore = mockProcessEnv(
    Object.fromEntries(
      [
        ...PROXY_ENV_KEYS,
        'PROMPTFOO_INSECURE_SSL',
        'PROMPTFOO_CA_CERT_PATH',
        'PROMPTFOO_FETCH_CONNECTIONS',
        'REQUEST_TIMEOUT_MS',
      ].map((key) => [key, undefined]),
    ),
  );
  vi.spyOn(global, 'fetch').mockImplementation(async () => new Response('ok'));
});
afterEach(() => {
  clearAgentCache();
  vi.restoreAllMocks();
  restore();
});

describe('HTTP agent configuration ownership', () => {
  it.each([false, true])(
    'separates TLS settings and reuses equal settings (proxy=%s)',
    async (proxy) => {
      await cliState.withEnvFileOverrides(
        proxy ? { HTTPS_PROXY: 'http://proxy.example:8080' } : {},
        async () => {
          await cliState.withEnv({ PROMPTFOO_INSECURE_SSL: 'false' }, request);
          const first = receivedDispatcher();
          await cliState.withEnv({ PROMPTFOO_INSECURE_SSL: 'true' }, request);
          expect(receivedDispatcher()).not.toBe(first);
          await cliState.withEnv({ PROMPTFOO_INSECURE_SSL: 'false' }, request);
          expect(receivedDispatcher()).toBe(first);
          const ctor = proxy ? ProxyAgent : Agent;
          expect(ctor).toHaveBeenCalledTimes(2);
          expect(ctor).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining(
              proxy
                ? {
                    requestTls: { rejectUnauthorized: true },
                    proxyTls: { rejectUnauthorized: true },
                  }
                : { connect: { rejectUnauthorized: true } },
            ),
          );
        },
      );
    },
  );

  it('separates request timeouts across simultaneous scopes', async () => {
    await Promise.all(
      ['1000', '2000'].map((REQUEST_TIMEOUT_MS) =>
        cliState.withEnv({ REQUEST_TIMEOUT_MS }, request),
      ),
    );
    expect(Agent).toHaveBeenCalledTimes(2);
    expect(Agent).toHaveBeenCalledWith(expect.objectContaining({ headersTimeout: 1000 }));
    expect(Agent).toHaveBeenCalledWith(expect.objectContaining({ headersTimeout: 2000 }));
    const calls = vi.mocked(global.fetch).mock.calls;
    expect((calls[0][1] as RequestInit & { dispatcher?: unknown }).dispatcher).not.toBe(
      (calls[1][1] as RequestInit & { dispatcher?: unknown }).dispatcher,
    );
  });

  it('refreshes an agent when CA contents change at the same path', async () => {
    vi.mocked(fs.readFile)
      .mockResolvedValueOnce('fixture CA one')
      .mockResolvedValueOnce('fixture CA two');
    await cliState.withEnv({ PROMPTFOO_CA_CERT_PATH: '/fixture/ca.pem' }, async () => {
      await request();
      const first = receivedDispatcher();
      await request();
      expect(receivedDispatcher()).not.toBe(first);
    });
    expect(Agent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ connect: expect.objectContaining({ ca: 'fixture CA two' }) }),
    );
  });

  it('uses invocation-file proxy and suite NO_PROXY settings', async () => {
    await cliState.withEnvFileOverrides({ HTTPS_PROXY: 'http://proxy.example:8080' }, async () => {
      await cliState.withEnv({}, request);
      expect(ProxyAgent).toHaveBeenCalledWith(
        expect.objectContaining({ uri: 'http://proxy.example:8080' }),
      );
      await cliState.withEnv({ NO_PROXY: 'fixture.example' }, request);
      expect(Agent).toHaveBeenCalledTimes(1);
    });
  });

  it('bounds retained configurations and closes evicted agents gracefully', async () => {
    for (let count = 1; count <= 33; count++) {
      await cliState.withEnv({ PROMPTFOO_FETCH_CONNECTIONS: String(count) }, request);
    }
    const first = vi.mocked(Agent).mock.results[0].value;
    const second = vi.mocked(Agent).mock.results[1].value;
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(second.close).not.toHaveBeenCalled();
    await cliState.withEnv({ PROMPTFOO_FETCH_CONNECTIONS: '2' }, request);
    expect(receivedDispatcher()).toBe(second);
  });

  it.each(['eviction', 'clear'])(
    'keeps an authenticating request alive during %s',
    async (action) => {
      let authenticate!: () => void;
      const pending = fetchWithProxy('https://fixture.example/test', {
        getAuthHeaders: () =>
          new Promise((resolve) => {
            authenticate = () => resolve({});
          }),
      });
      const first = vi.mocked(Agent).mock.results[0].value;
      if (action === 'eviction') {
        for (let count = 10; count < 42; count++) {
          await cliState.withEnv({ PROMPTFOO_FETCH_CONNECTIONS: String(count) }, request);
        }
      } else {
        clearAgentCache();
      }
      expect(first.close).not.toHaveBeenCalled();
      vi.mocked(global.fetch).mockImplementationOnce(async (_url, options) => {
        expect((options as RequestInit & { dispatcher: unknown }).dispatcher).toBe(first);
        expect(first.close).not.toHaveBeenCalled();
        return new Response('ok');
      });
      authenticate();
      expect(await (await pending).text()).toBe('ok');
      expect(first.close).toHaveBeenCalledTimes(1);
    },
  );

  it('releases an evicted agent when authentication fails', async () => {
    let rejectAuthentication!: (error: Error) => void;
    const pending = fetchWithProxy('https://fixture.example/test', {
      getAuthHeaders: () =>
        new Promise((_resolve, reject) => {
          rejectAuthentication = reject;
        }),
    });
    const first = vi.mocked(Agent).mock.results[0].value;
    clearAgentCache();
    expect(first.close).not.toHaveBeenCalled();
    rejectAuthentication(new Error('fixture authentication failed'));
    await expect(pending).rejects.toThrow('fixture authentication failed');
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
