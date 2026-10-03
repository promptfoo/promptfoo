import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearCache, withCacheEnabled } from '../../../src/cache';
import cliState from '../../../src/cliState';
import { getEnvString } from '../../../src/envars';
import { VertexChatProvider } from '../../../src/providers/google/vertex';

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
