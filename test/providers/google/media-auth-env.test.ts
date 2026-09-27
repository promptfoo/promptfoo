import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { GoogleAuth } from 'google-auth-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import cliState from '../../../src/cliState';
import { loadApiProvider } from '../../../src/providers';
import { GoogleAuthManager } from '../../../src/providers/google/auth';
import { GeminiImageProvider } from '../../../src/providers/google/gemini-image';
import { GoogleImageProvider } from '../../../src/providers/google/image';
import { GoogleVideoProvider } from '../../../src/providers/google/video';
import { getProviderFromCloud } from '../../../src/util/cloud';
import { fetchWithTimeout } from '../../../src/util/fetch/index';
import { mockProcessEnv } from '../../util/utils';

import type { EnvOverrides } from '../../../src/types/env';
import type { ApiProvider, ProviderOptions } from '../../../src/types/providers';

vi.mock('google-auth-library', () => ({ GoogleAuth: vi.fn() }));
vi.mock('../../../src/cache', async (original) => ({
  ...(await original()),
  fetchWithCache: vi.fn(),
}));
vi.mock('../../../src/util/fetch/index', async (original) => ({
  ...(await original()),
  fetchWithTimeout: vi.fn(),
}));
vi.mock('../../../src/util/cloud', async (original) => ({
  ...(await original()),
  getProviderFromCloud: vi.fn(),
}));

const routes = [
  ['google:image:imagen-4.0-generate-001', GoogleImageProvider, 'imagen-4.0-generate-001'],
  ['google:gemini-2.5-flash-image', GeminiImageProvider, 'gemini-2.5-flash-image'],
  ['google:video:veo-3.0-generate-001', GoogleVideoProvider, 'veo-3.0-generate-001'],
] as const;
const lowerVertex = {
  GOOGLE_CLOUD_PROJECT: 'fixture-project',
  GOOGLE_APPLICATION_CREDENTIALS: 'fixture-adc.json',
};
const request = vi.fn();
let restoreEnv: () => void;
let tempDir: string;

beforeEach(() => {
  restoreEnv = mockProcessEnv({
    GOOGLE_API_KEY: undefined,
    GEMINI_API_KEY: undefined,
    PALM_API_KEY: undefined,
    GOOGLE_GENERATIVE_AI_API_KEY: undefined,
    VERTEX_API_KEY: undefined,
    GOOGLE_APPLICATION_CREDENTIALS: undefined,
    VERTEX_PROJECT_ID: undefined,
    GOOGLE_PROJECT_ID: undefined,
    GOOGLE_CLOUD_PROJECT: undefined,
    GOOGLE_GENAI_USE_VERTEXAI: undefined,
  });
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'google-media-mode-'));
  GoogleAuthManager.clearCache();
  request
    .mockReset()
    .mockRejectedValue(Object.assign(new Error('fixture complete'), { response: { status: 400 } }));
  vi.mocked(GoogleAuth)
    .mockReset()
    .mockImplementation(function () {
      return {
        getClient: async () => ({ request }),
        getProjectId: async () => 'fixture-project',
      } as unknown as GoogleAuth;
    });
  vi.mocked(fetchWithCache)
    .mockReset()
    .mockResolvedValue({ data: {}, cached: false, status: 200, statusText: 'OK' });
  vi.mocked(fetchWithTimeout)
    .mockReset()
    .mockImplementation(async () =>
      Response.json({ error: { message: 'fixture complete' } }, { status: 400 }),
    );
  vi.mocked(getProviderFromCloud).mockReset();
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network request'));
});

afterEach(() => {
  restoreEnv();
  vi.restoreAllMocks();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function expectRoute(provider: ApiProvider, vertex: boolean) {
  await provider.callApi('A synthetic blue square');
  if (vertex) {
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0].url).toContain('aiplatform.googleapis.com');
    expect(fetchWithCache).not.toHaveBeenCalled();
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  } else {
    expect(request).not.toHaveBeenCalled();
    expect(GoogleAuth).not.toHaveBeenCalled();
    const calls = [
      ...vi.mocked(fetchWithCache).mock.calls,
      ...vi.mocked(fetchWithTimeout).mock.calls,
    ];
    expect(calls).toHaveLength(1);
    expect(String(calls[0][0])).toContain('generativelanguage.googleapis.com');
    expect(calls[0][1]?.headers).toMatchObject({ 'x-goog-api-key': 'fixture-key' });
  }
}

describe.each(routes)('%s authentication mode', (id, Provider, model) => {
  it.each(['direct', 'loaded'] as const)(
    'uses a higher API key before lower project/ADC for a %s provider',
    async (kind) => {
      await cliState.withEnv(lowerVertex, async () => {
        const options = { env: { GOOGLE_API_KEY: 'fixture-key' } };
        const provider =
          kind === 'direct' ? new Provider(model, options) : await loadApiProvider(id, { options });
        await expectRoute(provider, false);
      });
    },
  );

  it.each([
    ['higher project', lowerVertex, { GOOGLE_API_KEY: 'fixture-key' }, {}],
    ['same-layer project', { ...lowerVertex, GOOGLE_API_KEY: 'fixture-key' }, {}, {}],
    ['explicit Vertex', { GOOGLE_API_KEY: 'fixture-key' }, lowerVertex, { vertexai: true }],
    ['empty key mask', { GOOGLE_API_KEY: '' }, { ...lowerVertex, GEMINI_API_KEY: 'lower-key' }, {}],
    [
      'blank key mask',
      { GOOGLE_API_KEY: ' \t ' },
      { ...lowerVertex, GEMINI_API_KEY: 'lower-key' },
      {},
    ],
  ] satisfies [string, EnvOverrides, EnvOverrides, ProviderOptions['config']][])(
    'preserves %s selection',
    async (_name, env, suite, config) => {
      await cliState.withEnv(suite, async () => {
        const provider = await loadApiProvider(id, { options: { env, config } });
        await expectRoute(provider, true);
      });
    },
  );

  it.each(['direct', 'loaded'] as const)(
    'uses a different usable alias after a blank key for a %s provider',
    async (kind) => {
      await cliState.withEnv(
        { GOOGLE_API_KEY: 'masked-key', GEMINI_API_KEY: 'fixture-key' },
        async () => {
          const options = { env: { GOOGLE_API_KEY: ' \t ' } };
          const provider =
            kind === 'direct'
              ? new Provider(model, options)
              : await loadApiProvider(id, { options });
          await expectRoute(provider, false);
        },
      );
    },
  );

  it('keeps an explicit project above a lower environment mode flag', async () => {
    const provider = await cliState.withEnv({ GOOGLE_GENAI_USE_VERTEXAI: 'false' }, () =>
      loadApiProvider(id, { options: { config: { projectId: 'explicit-project' } } }),
    );
    await expectRoute(provider, true);
    expect(request.mock.calls[0][0].url).toContain('/projects/explicit-project/');
  });

  it('rejects an explicit empty ADC identity instead of using a lower API key', async () => {
    const provider = await cliState.withEnv({ GOOGLE_API_KEY: 'fixture-key' }, () =>
      loadApiProvider(id, { options: { env: { GOOGLE_APPLICATION_CREDENTIALS: '' } } }),
    );
    const result = await provider.callApi('A synthetic blue square');
    expect(result.error).toBeDefined();
    expect(GoogleAuth).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(fetchWithCache).not.toHaveBeenCalled();
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });

  it('masks a project alias across layers without suppressing a different API-key alias', async () => {
    await cliState.withEnvFileOverrides({ GEMINI_API_KEY: 'fixture-key' }, () =>
      cliState.withEnv({ VERTEX_PROJECT_ID: 'masked-project' }, async () => {
        const provider = await loadApiProvider(id, { options: { env: { VERTEX_PROJECT_ID: '' } } });
        await expectRoute(provider, false);
      }),
    );
  });

  it('honors an explicit API key without changing caller configuration', async () => {
    const config = Object.freeze({ apiKey: 'fixture-key' });
    const provider = await cliState.withEnv(lowerVertex, () =>
      loadApiProvider(id, { options: { config } }),
    );
    expect(config).toEqual({ apiKey: 'fixture-key' });
    await expectRoute(provider, false);
  });

  it('treats a host-empty ADC filename as unset when a host API key is available', async () => {
    const restore = mockProcessEnv({
      GOOGLE_APPLICATION_CREDENTIALS: '',
      GOOGLE_API_KEY: 'fixture-key',
    });
    try {
      const provider = await loadApiProvider(id);
      await expectRoute(provider, false);
    } finally {
      restore();
    }
  });

  it('keeps host-only loading unbound to an inferred mode', async () => {
    const provider = await loadApiProvider(id);
    expect(provider.config?.vertexai).toBeUndefined();
    await cliState.withEnv(lowerVertex, () => expectRoute(provider, true));
  });

  it('retains mode and complete template inputs through a cloud wrapper', async () => {
    vi.mocked(getProviderFromCloud).mockResolvedValue({ id, env: lowerVertex });
    const config = Object.freeze({
      headers: { 'x-fixture-project': '{{ env.GOOGLE_CLOUD_PROJECT }}' },
    });
    const provider = await loadApiProvider(
      'promptfoo://provider/12345678-1234-1234-1234-123456789abc',
      {
        options: { config, env: { GOOGLE_API_KEY: 'fixture-key' } },
      },
    );
    expect(config.headers['x-fixture-project']).toBe('{{ env.GOOGLE_CLOUD_PROJECT }}');
    expect(provider.config?.headers['x-fixture-project']).toBe('fixture-project');
    await expectRoute(provider, false);
  });

  it('preserves priority through two provider-file wrappers', async () => {
    const inner = path.join(tempDir, 'inner.yaml');
    const outer = path.join(tempDir, 'outer.yaml');
    fs.writeFileSync(inner, JSON.stringify({ id, env: lowerVertex }));
    fs.writeFileSync(
      outer,
      JSON.stringify({
        id: '{{ env.OPENAI_BASE_URL }}',
        env: { GOOGLE_API_KEY: 'fixture-key' },
      }),
    );
    const provider = await loadApiProvider('file://' + outer, {
      env: { OPENAI_BASE_URL: 'file://' + inner },
    });
    await expectRoute(provider, false);
  });
});

describe('loaded video prompt overrides', () => {
  it.each([
    [{ GOOGLE_API_KEY: 'fixture-key' }, { projectId: 'prompt-project' }, true],
    [lowerVertex, { apiKey: 'fixture-key' }, false],
  ] satisfies [EnvOverrides, ProviderOptions['config'], boolean][])(
    'keeps explicit prompt config ahead of inferred environment mode (%j)',
    async (env, config, vertex) => {
      const provider = await loadApiProvider('google:video:veo-3.0-generate-001', {
        options: { env },
      });
      await provider.callApi('A synthetic blue square', {
        vars: {},
        prompt: { raw: 'A synthetic blue square', label: 'fixture', config },
      });
      expect(request).toHaveBeenCalledTimes(vertex ? 1 : 0);
      expect(fetchWithTimeout).toHaveBeenCalledTimes(vertex ? 0 : 1);
      if (vertex) {
        expect(request.mock.calls[0][0].url).toContain('/projects/prompt-project/');
      } else {
        expect(vi.mocked(fetchWithTimeout).mock.calls[0][1]?.headers).toMatchObject({
          'x-goog-api-key': 'fixture-key',
        });
      }
    },
  );
});
