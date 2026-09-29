import { lookup } from 'node:dns/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSafeStructuredImageOutputs } from '../../../src/providers/openai/image';
import { getFetchTlsOptions, getProxyUrlForTarget } from '../../../src/util/fetch/index';
import type { Dispatcher } from 'undici';

const transport = vi.hoisted(() => ({
  constructors: [] as Array<{ kind: string; options: Record<string, unknown> }>,
  requests: [] as Dispatcher.DispatchOptions[],
}));

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<typeof import('undici')>();
  class ImageTransport extends actual.MockAgent {
    constructor(kind: string, options: Record<string, unknown>) {
      super();
      this.disableNetConnect();
      transport.constructors.push({ kind, options });
    }

    dispatch(options: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler) {
      transport.requests.push(options);
      this.get(String(options.origin))
        .intercept({ path: options.path, method: options.method })
        .reply(200, Buffer.alloc(1024), { headers: { 'content-type': 'image/png' } });
      return super.dispatch(options, handler);
    }

    async destroy() {
      await this.close();
    }
  }
  return {
    ...actual,
    Agent: class extends ImageTransport {
      constructor(options: Record<string, unknown>) {
        super('direct', options);
      }
    },
    ProxyAgent: class extends ImageTransport {
      constructor(options: Record<string, unknown>) {
        super('proxy', options);
      }
    },
  };
});
vi.mock('../../../src/util/fetch/index', () => ({
  fetchWithProxy: (url: string, options: RequestInit) => fetch(url, options),
  getFetchTlsOptions: vi.fn(),
  getProxyUrlForTarget: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  transport.constructors.length = 0;
  transport.requests.length = 0;
  vi.mocked(lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
  vi.mocked(getFetchTlsOptions).mockReturnValue({ rejectUnauthorized: true });
});
afterEach(() => vi.restoreAllMocks());

describe('image download dispatcher', () => {
  it.each(['direct', 'proxy'])(
    'pins the address and preserves the hostname with %s transport',
    async (kind) => {
      vi.mocked(getProxyUrlForTarget).mockReturnValue(
        kind === 'proxy' ? 'http://proxy.example' : '',
      );

      const result = await buildSafeStructuredImageOutputs({
        data: [{ url: 'https://images.example/picture.png' }],
      });

      expect(result?.[0]).toMatchObject({ mimeType: 'image/png' });
      expect(lookup).toHaveBeenCalledWith('images.example', { all: true, verbatim: true });
      expect(transport.requests).toHaveLength(1);
      const request = transport.requests[0];
      expect(String(request.origin)).toBe('https://93.184.216.34');
      expect(request).toMatchObject({ servername: 'images.example' });
      expect(request.headers).toMatchObject({ host: 'images.example' });
      expect(transport.constructors).toEqual([
        {
          kind,
          options:
            kind === 'proxy'
              ? {
                  uri: 'http://proxy.example',
                  proxyTls: { rejectUnauthorized: true },
                  requestTls: { rejectUnauthorized: true, servername: 'images.example' },
                }
              : { connect: { rejectUnauthorized: true, servername: 'images.example' } },
        },
      ]);
    },
  );
});
