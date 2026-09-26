import * as fs from 'node:fs/promises';

import { getProxyForUrl } from 'proxy-from-env';
import { Agent, ProxyAgent } from 'undici';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEnvOverridesProvider, setEnvOverridesProvider } from '../src/envOverrides';
import { clearAgentCache, fetchWithProxy } from '../src/util/fetch/index';
import * as fips from '../src/util/fips';
import { mockProcessEnv } from './util/utils';

vi.mock('proxy-from-env', () => ({ getProxyForUrl: vi.fn() }));
vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }));
vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<typeof import('undici')>();
  const createAgent = function (options: unknown) {
    return {
      options,
      close: vi.fn(),
      compose() {
        return this;
      },
    };
  };
  return { ...actual, Agent: vi.fn(createAgent), ProxyAgent: vi.fn(createAgent) };
});

function lastDispatcher(): unknown {
  return (
    vi.mocked(globalThis.fetch).mock.calls.at(-1)?.[1] as { dispatcher?: unknown } | undefined
  )?.dispatcher;
}

let restoreEnv: () => void;
let previousOverrides: ReturnType<typeof getEnvOverridesProvider>;

beforeEach(() => {
  restoreEnv = mockProcessEnv({
    PROMPTFOO_INSECURE_SSL: undefined,
    NODE_TLS_REJECT_UNAUTHORIZED: undefined,
    PROMPTFOO_CA_CERT_PATH: undefined,
  });
  previousOverrides = getEnvOverridesProvider();
  setEnvOverridesProvider(undefined);
  vi.spyOn(fips, 'isFipsEnabled').mockReturnValue(true);
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
  vi.mocked(getProxyForUrl).mockReset().mockReturnValue('');
  vi.mocked(fs.readFile).mockReset();
  vi.mocked(Agent).mockClear();
  vi.mocked(ProxyAgent).mockClear();
  clearAgentCache();
});

afterEach(() => {
  clearAgentCache();
  setEnvOverridesProvider(previousOverrides);
  restoreEnv();
  vi.restoreAllMocks();
});

describe('FIPS fetch policy with the real environment parser', () => {
  it.each([false, true])(
    'requires verification with proxy=%s when no override is set',
    async (proxy) => {
      if (proxy) {
        vi.mocked(getProxyForUrl).mockReturnValue('https://proxy.example.test');
      }
      await fetchWithProxy('https://example.test');
      if (proxy) {
        expect(ProxyAgent).toHaveBeenCalledWith(
          expect.objectContaining({
            requestTls: { rejectUnauthorized: true },
            proxyTls: { rejectUnauthorized: true },
          }),
        );
      } else {
        expect(Agent).toHaveBeenCalledWith(
          expect.objectContaining({ connect: { rejectUnauthorized: true } }),
        );
      }
    },
  );

  it.each(['true', '1', 'yes', 'YePpErS'])(
    'rejects the insecure override %s before fetching',
    async (value) => {
      mockProcessEnv({ PROMPTFOO_INSECURE_SSL: value });
      await expect(fetchWithProxy('https://example.test')).rejects.toThrow(
        'FIPS mode requires TLS',
      );
      expect(globalThis.fetch).not.toHaveBeenCalled();
    },
  );

  it.each(['suite', 'file'])('rejects insecure %s environment overrides', async (layer) => {
    setEnvOverridesProvider((requested) =>
      requested === layer ? { PROMPTFOO_INSECURE_SSL: 'true' } : undefined,
    );
    await expect(fetchWithProxy('https://example.test')).rejects.toThrow('FIPS mode requires TLS');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('rejects an insecure process setting even if the suite masks it', async () => {
    mockProcessEnv({ NODE_TLS_REJECT_UNAUTHORIZED: '0' });
    setEnvOverridesProvider(() => ({ NODE_TLS_REJECT_UNAUTHORIZED: '1' }));
    await expect(fetchWithProxy('https://example.test')).rejects.toThrow('FIPS mode requires TLS');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'isolates TLS verification and CA changes with proxy=%s',
    async (proxy) => {
      if (proxy) {
        vi.mocked(getProxyForUrl).mockReturnValue('https://proxy.example.test');
      }
      const constructor = proxy ? ProxyAgent : Agent;
      vi.mocked(fips.isFipsEnabled).mockReturnValue(false);
      await fetchWithProxy('https://example.test');
      const legacy = lastDispatcher();
      vi.mocked(fips.isFipsEnabled).mockReturnValue(true);
      await fetchWithProxy('https://example.test');
      const secure = lastDispatcher();
      expect(secure).not.toBe(legacy);
      mockProcessEnv({ PROMPTFOO_CA_CERT_PATH: '/fixture-ca.pem' });
      vi.mocked(fs.readFile).mockResolvedValue('CA-A');
      await fetchWithProxy('https://example.test');
      const withCA = lastDispatcher();
      expect(withCA).not.toBe(secure);
      await fetchWithProxy('https://example.test');
      expect(lastDispatcher()).toBe(withCA);
      vi.mocked(fs.readFile).mockResolvedValue('CA-B');
      await fetchWithProxy('https://example.test');
      expect(lastDispatcher()).not.toBe(withCA);
      expect(constructor).toHaveBeenCalledTimes(4);
    },
  );

  it('fails before fetching if the configured CA cannot be read', async () => {
    mockProcessEnv({ PROMPTFOO_CA_CERT_PATH: '/missing-ca.pem' });
    vi.mocked(fs.readFile).mockRejectedValue(new Error('fixture missing CA'));
    await expect(fetchWithProxy('https://example.test')).rejects.toThrow(
      'configured CA certificate in FIPS mode',
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each([false, true])('closes evicted TLS pools with proxy=%s', async (proxy) => {
    if (proxy) {
      vi.mocked(getProxyForUrl).mockReturnValue('https://proxy.example.test');
    }
    mockProcessEnv({ PROMPTFOO_CA_CERT_PATH: '/rotating-ca.pem' });
    vi.mocked(fs.readFile).mockResolvedValue('CA-first');
    await fetchWithProxy('https://example.test');
    const first = lastDispatcher() as { close: ReturnType<typeof vi.fn> };
    for (let index = 0; index < 40; index++) {
      vi.mocked(fs.readFile).mockResolvedValue(`CA-${index}`);
      await fetchWithProxy('https://example.test');
    }
    expect(first.close).toHaveBeenCalledOnce();
    const latest = lastDispatcher() as { close: ReturnType<typeof vi.fn> };
    expect(latest.close).not.toHaveBeenCalled();
    await fetchWithProxy('https://example.test');
    expect(lastDispatcher()).toBe(latest);
    vi.mocked(fs.readFile).mockResolvedValue('CA-first');
    await fetchWithProxy('https://example.test');
    expect(lastDispatcher()).not.toBe(first);
    clearAgentCache();
    expect(latest.close).toHaveBeenCalledOnce();
    expect(first.close).toHaveBeenCalledOnce();
  });

  it('preserves the existing default outside FIPS mode', async () => {
    vi.mocked(fips.isFipsEnabled).mockReturnValue(false);
    await fetchWithProxy('https://example.test');
    expect(Agent).toHaveBeenCalledWith(
      expect.objectContaining({ connect: { rejectUnauthorized: false } }),
    );
  });
});
