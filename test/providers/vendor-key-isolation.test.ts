import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { loadApiProvider } from '../../src/providers/index';
import { mockProcessEnv } from '../util/utils';

import type { OpenAiGenericProvider } from '../../src/providers/openai';
import type { ApiProvider } from '../../src/types/providers';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));

let restoreEnv: () => void;
beforeEach(() => {
  restoreEnv = mockProcessEnv({
    OPENAI_API_KEY: 'process-openai',
    NSCALE_SERVICE_TOKEN: undefined,
    NSCALE_API_KEY: undefined,
    COMETAPI_KEY: undefined,
    SELECTED_VENDOR_KEY: undefined,
    MISSING_VENDOR_KEY: undefined,
  });
  vi.mocked(fetchWithCache).mockReset();
  vi.mocked(fetchWithCache).mockResolvedValue({
    data: {
      choices: [{ message: { content: 'Hello' }, text: 'Hello', finish_reason: 'stop' }],
      data: [{ embedding: [0.1, 0.2], url: 'https://example.invalid/image.png' }],
    },
    cached: false,
    status: 200,
    statusText: 'OK',
  });
});
afterEach(() => {
  restoreEnv();
  vi.resetAllMocks();
});

const routes = ['nscale', 'cometapi'].flatMap((family) =>
  ['chat:', 'completion:', 'embedding:', 'embeddings:', ''].map((mode) => ({
    family,
    mode,
    path: `${family}:${mode}private/model:tag`,
    vendorKey: family === 'nscale' ? 'NSCALE_SERVICE_TOKEN' : 'COMETAPI_KEY',
  })),
);

async function invoke(provider: ApiProvider) {
  return provider.callEmbeddingApi ? provider.callEmbeddingApi('Hello') : provider.callApi('Hello');
}

describe.each(routes)('$path credential isolation', ({ path, family, mode, vendorKey }) => {
  it.each([
    undefined,
    'scoped-openai',
  ])('rejects unrelated OpenAI credentials, scoped=%s', async (key) => {
    const provider = await loadApiProvider(path, {
      options: { env: { OPENAI_API_KEY: key } },
    });
    expect((provider as OpenAiGenericProvider).getApiKey()).toBeUndefined();
    const result = await invoke(provider).catch((error: Error) => ({ error: error.message }));
    expect(result.error).toContain('API key is not set');
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('preserves explicit, selected and native credential precedence', async () => {
    const restore = mockProcessEnv({
      [vendorKey]: 'process-vendor',
      SELECTED_VENDOR_KEY: 'process-selected',
    });
    try {
      for (const [config, expected] of [
        [{}, 'scoped-vendor'],
        [{ apiKey: 'explicit-key', apiKeyEnvar: 'SELECTED_VENDOR_KEY' }, 'explicit-key'],
        [{ apiKeyEnvar: 'SELECTED_VENDOR_KEY' }, 'scoped-selected'],
        [{ apiKeyEnvar: 'OPENAI_API_KEY' }, 'scoped-openai'],
        [{ apiKeyEnvar: 'MISSING_VENDOR_KEY' }, undefined],
        [{ apiKeyEnvar: 'MISSING_VENDOR_KEY', useDefaultApiKey: true }, undefined],
      ] as const) {
        const provider = await loadApiProvider(path, {
          options: {
            config,
            env: {
              [vendorKey]: 'scoped-vendor',
              SELECTED_VENDOR_KEY: 'scoped-selected',
              OPENAI_API_KEY: 'scoped-openai',
              MISSING_VENDOR_KEY: undefined,
            },
          },
        });
        expect((provider as OpenAiGenericProvider).getApiKey()).toBe(expected);
        if ('apiKeyEnvar' in config && !('apiKey' in config)) {
          expect(JSON.stringify(provider.config)).not.toMatch(/process-selected|scoped-selected/);
        }
      }
    } finally {
      restore();
    }
  });

  it('sends only the explicitly selected credential in the request', async () => {
    const provider = await loadApiProvider(path, {
      options: {
        config: { apiKeyEnvar: 'SELECTED_VENDOR_KEY', useDefaultApiKey: false },
        env: { [vendorKey]: 'scoped-vendor', SELECTED_VENDOR_KEY: 'selected-key' },
      },
    });
    const result = await invoke(provider);
    expect(result.error).toBeUndefined();
    const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
    expect(url).toBe(
      `${family === 'nscale' ? 'https://inference.api.nscale.com/v1' : 'https://api.cometapi.com/v1'}/${mode.startsWith('embedding') ? 'embeddings' : mode === 'completion:' ? 'completions' : 'chat/completions'}`,
    );
    expect(request?.headers).toMatchObject({ Authorization: 'Bearer selected-key' });
    const body = JSON.parse(request?.body as string);
    expect(body.model).toBe('private/model:tag');
    expect(body).not.toHaveProperty('useDefaultApiKey');
    expect(JSON.stringify(body)).not.toMatch(/selected-key|scoped-vendor|process-openai/);
  });
});

describe.each(
  routes.filter(({ family }) => family === 'nscale'),
)('$path native credential serialization', ({ path }) => {
  it('prefers a process service token over a scoped legacy key', async () => {
    const restore = mockProcessEnv({ NSCALE_SERVICE_TOKEN: 'process-service-token' });
    try {
      const provider = await loadApiProvider(path, {
        options: { env: { NSCALE_API_KEY: 'scoped-legacy-key' } },
      });
      expect(JSON.stringify(provider.config)).not.toMatch(
        /process-service-token|scoped-legacy-key/,
      );
      const result = await invoke(provider);
      expect(result.error).toBeUndefined();
      expect(vi.mocked(fetchWithCache).mock.calls[0]?.[1]?.headers).toMatchObject({
        Authorization: 'Bearer process-service-token',
      });
    } finally {
      restore();
    }
  });

  it.each([
    ['NSCALE_SERVICE_TOKEN', 'scoped'],
    ['NSCALE_API_KEY', 'scoped'],
    ['NSCALE_SERVICE_TOKEN', 'process'],
    ['NSCALE_API_KEY', 'process'],
  ] as const)('keeps %s from %s outside config', async (variable, source) => {
    const restore = mockProcessEnv({
      [variable]: source === 'process' ? 'native-token-value' : undefined,
    });
    try {
      const provider = await loadApiProvider(path, {
        options: {
          env: source === 'scoped' ? { [variable]: 'native-token-value' } : {},
        },
      });
      expect(JSON.stringify(provider.config)).not.toContain('native-token-value');
      const result = await invoke(provider);
      expect(result.error).toBeUndefined();
      expect(vi.mocked(fetchWithCache).mock.calls[0]?.[1]?.headers).toMatchObject({
        Authorization: 'Bearer native-token-value',
      });
    } finally {
      restore();
    }
  });
});

describe.each(['nscale', 'cometapi'])('%s image credentials', (family) => {
  it('keeps unrelated OpenAI credentials out of image requests', async () => {
    const provider = await loadApiProvider(`${family}:image:private/model`, {
      options: { env: { OPENAI_API_KEY: 'scoped-openai' } },
    });
    expect((provider as OpenAiGenericProvider).getApiKey()).toBeUndefined();
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('honors an explicitly selected environment key', async () => {
    const provider = await loadApiProvider(`${family}:image:private/model`, {
      options: {
        config: { apiKeyEnvar: 'SELECTED_VENDOR_KEY', response_format: 'url' },
        env: {
          SELECTED_VENDOR_KEY: 'selected-key',
          COMETAPI_KEY: 'other-comet',
          NSCALE_SERVICE_TOKEN: 'other-nscale',
        },
      },
    });
    const result = await provider.callApi('Hello');
    expect(result.error).toBeUndefined();
    expect(vi.mocked(fetchWithCache).mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer selected-key',
    });
  });
});
