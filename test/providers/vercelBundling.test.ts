import { afterEach, expect, it, vi } from 'vitest';
import { withWebpackBundle } from '../helpers/webpack';

import type { VercelAiProvider } from '../../src/providers/vercel';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('loads the optional AI SDK at runtime after consumer bundling', async () => {
  const fetch = vi.fn(async () =>
    Response.json({
      content: [{ type: 'text', text: 'bundled fixture response' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: { total: 7, noCache: 7, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 3, text: 3, reasoning: 0 },
      },
      warnings: [],
    }),
  );
  vi.stubGlobal('fetch', fetch);
  vi.stubEnv('PROMPTFOO_CACHE_ENABLED', 'false');
  await withWebpackBundle<{ VercelAiProvider: typeof VercelAiProvider }>(
    new URL('../../src/providers/vercel.ts', import.meta.url),
    async ({ VercelAiProvider }) => {
      const provider = new VercelAiProvider('fixture/model', {
        config: {
          apiKey: 'fixture-key',
          baseUrl: 'https://gateway.example.test/v1/ai',
          maxRetries: 0,
        },
      });
      const result = await provider.callApi('hello');
      expect(result.error).toBeUndefined();
      expect(result.output).toBe('bundled fixture response');
      expect(fetch).toHaveBeenCalledOnce();
    },
    ['ai', 'ai/package.json'],
  );
});
