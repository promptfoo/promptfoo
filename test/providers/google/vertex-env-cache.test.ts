import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearCache, withCacheEnabled } from '../../../src/cache';
import cliState from '../../../src/cliState';
import { getEnvString } from '../../../src/envars';
import { loadApiProvider } from '../../../src/providers';
import { VertexChatProvider } from '../../../src/providers/google/vertex';
import { mockProcessEnv } from '../../util/utils';

afterEach(() => vi.restoreAllMocks());

describe('Vertex scoped credential cache ownership', () => {
  it('keeps same-instance reuse while separating SDK owners and respecting bypass and clear', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network access'));
    await cliState.withEnv({ PROMPTFOO_CACHE_TYPE: 'memory' }, () =>
      withCacheEnabled(true, async () => {
        const requests = vi.fn();
        const makeProvider = (label: string) => {
          const provider = new VertexChatProvider('gemini-2.5-flash', {
            config: { projectId: 'same-project', region: 'us-central1', expressMode: false },
            env: { GOOGLE_APPLICATION_CREDENTIALS: `${label}.json` },
          });
          vi.spyOn(provider, 'getProjectId').mockResolvedValue('same-project');
          vi.spyOn(provider, 'getClientWithCredentials').mockResolvedValue({
            request: async () => {
              requests(label);
              return {
                data: {
                  candidates: [
                    { content: { parts: [{ text: label }], role: 'model' }, finishReason: 'STOP' },
                  ],
                  usageMetadata: {
                    promptTokenCount: 1,
                    candidatesTokenCount: 1,
                    totalTokenCount: 2,
                  },
                },
              };
            },
          });
          return provider;
        };
        const first = makeProvider('first');
        expect(await first.callApi('same prompt')).toMatchObject({ output: 'first' });
        expect(await first.callApi('same prompt')).toMatchObject({ output: 'first', cached: true });
        expect(requests).toHaveBeenCalledTimes(1);
        expect(await makeProvider('second').callApi('same prompt')).toMatchObject({
          output: 'second',
        });
        expect(requests).toHaveBeenCalledTimes(2);
        await withCacheEnabled(false, () => first.callApi('same prompt'));
        expect(requests).toHaveBeenCalledTimes(3);
        await clearCache();
        await first.callApi('same prompt');
        expect(requests).toHaveBeenCalledTimes(4);
      }),
    );
  });
  it('separates invocations when the same provider resolves ADC for each request', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network access'));
    const provider = new VertexChatProvider('gemini-2.5-flash', {
      config: { projectId: 'same-project', expressMode: false },
    });
    const request = vi.fn(async () => ({
      data: {
        candidates: [
          {
            content: {
              parts: [{ text: getEnvString('GOOGLE_APPLICATION_CREDENTIALS') }],
              role: 'model',
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
      },
    }));
    vi.spyOn(provider, 'getProjectId').mockResolvedValue('same-project');
    vi.spyOn(provider, 'getClientWithCredentials').mockResolvedValue({ request });
    await withCacheEnabled(true, async () => {
      for (const filename of ['first.json', 'second.json']) {
        await cliState.withEnvFileOverrides({ GOOGLE_APPLICATION_CREDENTIALS: filename }, () =>
          cliState.withEnv({ PROMPTFOO_CACHE_TYPE: 'memory' }, async () => {
            expect(await provider.callApi('same prompt')).toMatchObject({ output: filename });
            expect(await provider.callApi('same prompt')).toMatchObject({
              output: filename,
              cached: true,
            });
          }),
        );
      }
    });
    expect(request).toHaveBeenCalledTimes(2);
  });
});

describe('Vertex scoped ADC routing', () => {
  it.each([
    ['provider', false],
    ['suite', false],
    ['file', false],
    ['provider', true],
    ['suite', true],
    ['file', true],
    ['shell', true],
  ] as const)('uses %s ADC with a same-scope API key: %s', async (scope, sameScopeKey) => {
    const restore = mockProcessEnv({
      GOOGLE_API_KEY: 'host-key',
      VERTEX_API_KEY: undefined,
      GOOGLE_APPLICATION_CREDENTIALS: scope === 'shell' ? '/fixture/scoped-adc.json' : undefined,
    });
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected express request'));
    const adc = {
      GOOGLE_APPLICATION_CREDENTIALS: '/fixture/scoped-adc.json',
      ...(sameScopeKey ? { GOOGLE_API_KEY: 'same-scope-key' } : {}),
    };
    try {
      await cliState.withEnvFileOverrides(
        scope === 'file' ? adc : scope === 'shell' ? {} : { GOOGLE_API_KEY: 'file-key' },
        () =>
          cliState.withEnv(scope === 'suite' ? adc : {}, async () => {
            const provider = (await loadApiProvider('vertex:gemini-2.5-flash', {
              env: scope === 'provider' ? { GOOGLE_API_KEY: 'suite-key' } : undefined,
              options: {
                env: scope === 'provider' ? adc : undefined,
                config: { projectId: 'fixture-project' },
              },
            })) as VertexChatProvider;
            const client = {
              request: vi.fn(async () => ({
                data: {
                  candidates: [
                    {
                      content: { parts: [{ text: 'scoped ADC' }], role: 'model' },
                      finishReason: 'STOP',
                    },
                  ],
                },
              })),
            };
            vi.spyOn(provider, 'getClientWithCredentials').mockResolvedValue(client);
            vi.spyOn(provider, 'getProjectId').mockResolvedValue('fixture-project');
            await withCacheEnabled(false, async () => {
              expect(await provider.callApi('fixture')).toMatchObject({ output: 'scoped ADC' });
            });
            expect(provider.getRegion()).toBe('global');
            expect(client.request).toHaveBeenCalledOnce();
            expect(fetch).not.toHaveBeenCalled();
          }),
      );
    } finally {
      restore();
    }
  });

  it('rejects an empty scoped ADC filename instead of using a lower API key', async () => {
    const restore = mockProcessEnv({ GOOGLE_API_KEY: 'host-key', VERTEX_API_KEY: undefined });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected express request'));
    try {
      const provider = (await loadApiProvider('vertex:gemini-2.5-flash', {
        options: { env: { GOOGLE_APPLICATION_CREDENTIALS: '' } },
      })) as VertexChatProvider;
      expect(await provider.getAuthHeaders()).not.toHaveProperty('x-goog-api-key');
      await expect(provider.getClientWithCredentials()).rejects.toThrow(
        'Scoped GOOGLE_APPLICATION_CREDENTIALS is empty',
      );
    } finally {
      restore();
    }
  });

  it.each(['env', 'config'])(
    'keeps an explicit provider %s API key ahead of lower scoped ADC',
    async (source) => {
      await cliState.withEnv(
        { GOOGLE_APPLICATION_CREDENTIALS: '/fixture/suite-adc.json' },
        async () => {
          const provider = (await loadApiProvider('vertex:gemini-2.5-flash', {
            env: { GOOGLE_APPLICATION_CREDENTIALS: '/fixture/suite-adc.json' },
            options:
              source === 'env'
                ? { env: { GOOGLE_API_KEY: 'provider-key' } }
                : { config: { apiKey: 'provider-key' } },
          })) as VertexChatProvider;
          expect(await provider.getAuthHeaders()).toMatchObject({
            'x-goog-api-key': 'provider-key',
          });
        },
      );
    },
  );
});
