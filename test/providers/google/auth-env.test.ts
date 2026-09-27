import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { GoogleAuth } from 'google-auth-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import { getEnvString } from '../../../src/envars';
import { loadApiProvider } from '../../../src/providers';
import { GoogleAuthManager } from '../../../src/providers/google/auth';
import { getGoogleAccessToken } from '../../../src/providers/google/util';
import { VertexChatProvider } from '../../../src/providers/google/vertex';
import { providerRegistry } from '../../../src/providers/providerRegistry';
import { CreateJobRequestSchema } from '../../../src/types/api/eval';
import { getProviderFromCloud } from '../../../src/util/cloud';
import { mockProcessEnv } from '../../util/utils';

import type { EnvOverrides } from '../../../src/types/env';

const makeClient = (value: string) => ({
  quotaProjectId: 'host-quota',
  getAccessToken: vi.fn(async () => ({ token: value })),
});
vi.mock('google-auth-library', () => ({ GoogleAuth: vi.fn() }));
vi.mock('../../../src/util/cloud', async (importOriginal) => ({
  ...(await importOriginal()),
  getProviderFromCloud: vi.fn(),
}));
let restore: () => void;
beforeEach(() => {
  restore = mockProcessEnv({
    GOOGLE_API_KEY: undefined,
    GEMINI_API_KEY: undefined,
    PALM_API_KEY: undefined,
    VERTEX_API_KEY: undefined,
    GOOGLE_APPLICATION_CREDENTIALS: undefined,
    GOOGLE_CLOUD_PROJECT: undefined,
    GCLOUD_PROJECT: undefined,
    GOOGLE_CLOUD_QUOTA_PROJECT: undefined,
  });
  GoogleAuthManager.clearCache();
  vi.mocked(getProviderFromCloud).mockReset();
  vi.mocked(GoogleAuth).mockReset();
  vi.mocked(GoogleAuth).mockImplementation(function (options) {
    return {
      getClient: vi.fn(async () => {
        if (options?.keyFilename === 'missing.json') {
          throw new Error('fixture absent');
        }
        return makeClient(String(options?.keyFilename));
      }),
      fromJSON: vi.fn(async (data) => makeClient(data.client_id)),
      getProjectId: vi.fn(async () => options?.projectId),
    } as unknown as GoogleAuth;
  });
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network access'));
});
afterEach(() => {
  restore();
  vi.restoreAllMocks();
});

describe('Google scoped ADC inputs', () => {
  it.each(['vertex:gemini-2.5-flash', 'google:live:gemini-3.8-live'])(
    '%s retains lower ADC after a loaded higher blank key',
    async (route) => {
      const provider = await loadApiProvider(route, {
        env: {
          GOOGLE_APPLICATION_CREDENTIALS: 'scoped.json',
          VERTEX_API_KEY: 'lower-vertex-key',
          GEMINI_API_KEY: 'lower-studio-key',
        },
        options: { env: { GOOGLE_API_KEY: ' \t ' } },
      });
      if (provider instanceof VertexChatProvider) {
        expect(provider.getApiKey()).toBeUndefined();
        expect(await provider.getAuthHeaders()).not.toHaveProperty('x-goog-api-key');
        await provider.getClientWithCredentials();
      } else {
        const result = await Reflect.get(provider, 'getConnection').call(provider, provider.config);
        expect(new URL(result.url).searchParams.get('access_token')).toBe('scoped.json');
        expect(new URL(result.url).searchParams.has('key')).toBe(false);
      }
      expect(GoogleAuth).toHaveBeenCalledWith(
        expect.objectContaining({ keyFilename: 'scoped.json' }),
      );
    },
  );

  it.each([
    ['provider Google mask', { GOOGLE_API_KEY: '' }, {}, { VERTEX_API_KEY: 'file-key' }],
    ['suite Google mask', {}, { GOOGLE_API_KEY: '' }, { VERTEX_API_KEY: 'file-key' }],
    ['provider Vertex mask', { VERTEX_API_KEY: '' }, {}, { GOOGLE_API_KEY: 'file-key' }],
    ['suite Vertex mask', {}, { VERTEX_API_KEY: '' }, { GOOGLE_API_KEY: 'file-key' }],
    [
      'masked intermediate Google alias',
      { GOOGLE_API_KEY: '' },
      { GOOGLE_API_KEY: 'masked-suite-key' },
      { VERTEX_API_KEY: 'file-key' },
    ],
    [
      'masked intermediate Vertex alias',
      { VERTEX_API_KEY: '' },
      { VERTEX_API_KEY: 'masked-suite-key' },
      { GOOGLE_API_KEY: 'file-key' },
    ],
  ] satisfies [string, EnvOverrides, EnvOverrides, EnvOverrides][])(
    'selects lower Vertex ADC before its API key after a %s',
    async (_name, env, suite, file) => {
      await cliState.withEnvFileOverrides(
        { ...file, GOOGLE_APPLICATION_CREDENTIALS: 'file.json' },
        () =>
          cliState.withEnv(suite, async () => {
            const provider = new VertexChatProvider('gemini-2.5-flash', { env });
            expect(provider.getApiKey()).toBeUndefined();
            expect(await provider.getAuthHeaders()).not.toHaveProperty('x-goog-api-key');
            await provider.getClientWithCredentials();
            expect(GoogleAuth).toHaveBeenCalledWith(
              expect.objectContaining({ keyFilename: 'file.json' }),
            );
          }),
      );
    },
  );

  it.each(['provider', 'suite', 'config'] as const)(
    'keeps a usable %s API key above lower Vertex ADC',
    async (scope) => {
      await cliState.withEnvFileOverrides({ GOOGLE_APPLICATION_CREDENTIALS: 'file.json' }, () =>
        cliState.withEnv(scope === 'suite' ? { GOOGLE_API_KEY: 'higher-key' } : {}, async () => {
          const provider = new VertexChatProvider('gemini-2.5-flash', {
            env: scope === 'provider' ? { GOOGLE_API_KEY: 'higher-key' } : {},
            config: scope === 'config' ? { apiKey: 'higher-key' } : {},
          });
          expect(await provider.getAuthHeaders()).toHaveProperty('x-goog-api-key', 'higher-key');
          expect(GoogleAuth).not.toHaveBeenCalled();
        }),
      );
    },
  );

  it.each(['scoped.json', ''])(
    'keeps same-layer host ADC %j ahead of an API key while allowing SDK discovery',
    async (adc) => {
      mockProcessEnv({ GOOGLE_APPLICATION_CREDENTIALS: adc, GOOGLE_API_KEY: 'host-key' });
      const provider = new VertexChatProvider('gemini-2.5-flash');
      expect(await provider.getAuthHeaders()).not.toHaveProperty('x-goog-api-key');
      await provider.getClientWithCredentials();
      expect(GoogleAuth).toHaveBeenCalledOnce();
      expect(vi.mocked(GoogleAuth).mock.calls[0][0]?.keyFilename).toBe(adc);
    },
  );

  it('keeps explicit config API keys and AI Studio independent of same-layer ADC', async () => {
    const env = { GOOGLE_APPLICATION_CREDENTIALS: 'scoped.json', GOOGLE_API_KEY: 'scoped-key' };
    const explicit = new VertexChatProvider('gemini-2.5-flash', {
      config: { apiKey: 'config-key' },
      env,
    });
    expect(await explicit.getAuthHeaders()).toHaveProperty('x-goog-api-key', 'config-key');
    expect(GoogleAuthManager.getApiKey({}, env)).toEqual({
      apiKey: 'scoped-key',
      source: 'GOOGLE_API_KEY',
    });
  });

  it('keeps forced OAuth when a higher config API key is available', async () => {
    await cliState.withEnvFileOverrides(
      { GOOGLE_APPLICATION_CREDENTIALS: 'file.json' },
      async () => {
        const provider = new VertexChatProvider('gemini-2.5-flash', {
          config: { apiKey: 'config-key', expressMode: false },
        });
        expect(await provider.getAuthHeaders()).not.toHaveProperty('x-goog-api-key');
        await provider.getClientWithCredentials();
        expect(GoogleAuth).toHaveBeenCalledWith(
          expect.objectContaining({ keyFilename: 'file.json' }),
        );
      },
    );
  });

  it('reuses the Live OAuth client for repeated and concurrent calls within an invocation', async () => {
    await cliState.withEnv({ GOOGLE_APPLICATION_CREDENTIALS: 'scoped.json' }, async () => {
      expect(await Promise.all([getGoogleAccessToken(), getGoogleAccessToken()])).toEqual([
        'scoped.json',
        'scoped.json',
      ]);
      expect(await getGoogleAccessToken()).toBe('scoped.json');
      expect(GoogleAuth).toHaveBeenCalledOnce();
    });
  });

  it('isolates Live OAuth clients across concurrent invocation environments', async () => {
    const createClient = vi
      .spyOn(GoogleAuthManager, 'getOAuthClient')
      .mockImplementation(async (options) => ({
        client: makeClient(
          typeof options === 'object'
            ? (options.env?.GOOGLE_APPLICATION_CREDENTIALS ??
                getEnvString('GOOGLE_APPLICATION_CREDENTIALS') ??
                'absent')
            : 'absent',
        ),
        projectId: undefined,
      }));
    expect(
      await Promise.all(
        ['first.json', 'second.json'].map((filename) =>
          cliState.withEnv({ GOOGLE_APPLICATION_CREDENTIALS: filename }, async () => [
            await getGoogleAccessToken(),
            await getGoogleAccessToken(),
          ]),
        ),
      ),
    ).toEqual([
      ['first.json', 'first.json'],
      ['second.json', 'second.json'],
    ]);
    expect(createClient).toHaveBeenCalledTimes(2);
  });

  it('starts a new Live client for a new resource lifetime under the same environment', async () => {
    await cliState.withEnv({ GOOGLE_APPLICATION_CREDENTIALS: 'scoped.json' }, async () => {
      for (let invocation = 0; invocation < 2; invocation++) {
        await providerRegistry.withScope(async () => {
          expect(await getGoogleAccessToken()).toBe('scoped.json');
          expect(await getGoogleAccessToken()).toBe('scoped.json');
        });
      }
      expect(GoogleAuth).toHaveBeenCalledTimes(2);
    });
  });

  it('replaces the Live OAuth client when explicit credentials or retained environment changes', async () => {
    await cliState.withEnv({}, async () => {
      expect(
        await getGoogleAccessToken(undefined, { GOOGLE_APPLICATION_CREDENTIALS: 'first.json' }),
      ).toBe('first.json');
      expect(
        await getGoogleAccessToken(undefined, { GOOGLE_APPLICATION_CREDENTIALS: 'second.json' }),
      ).toBe('second.json');
      expect(await getGoogleAccessToken(JSON.stringify({ client_id: 'explicit' }))).toBe(
        'explicit',
      );
      expect(await getGoogleAccessToken(JSON.stringify({ client_id: 'explicit' }))).toBe(
        'explicit',
      );
      expect(GoogleAuth).toHaveBeenCalledTimes(3);
    });
  });

  it.each(['GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_QUOTA_PROJECT'])(
    'replaces the Live client when %s changes',
    async (key) => {
      await cliState.withEnv({}, async () => {
        await getGoogleAccessToken(undefined, { [key]: 'first' });
        await getGoogleAccessToken(undefined, { [key]: 'first' });
        expect(GoogleAuth).toHaveBeenCalledOnce();
        await getGoogleAccessToken(undefined, { [key]: 'second' });
        expect(GoogleAuth).toHaveBeenCalledTimes(2);
        expect(GoogleAuth).toHaveBeenLastCalledWith(
          expect.objectContaining(
            key === 'GOOGLE_CLOUD_PROJECT'
              ? { projectId: 'second' }
              : { clientOptions: { quotaProjectId: 'second' } },
          ),
        );
      });
    },
  );

  it('retries a failed Live OAuth client initialization within the same invocation', async () => {
    vi.mocked(GoogleAuth).mockImplementationOnce(function () {
      return {
        getClient: async () => {
          throw new Error('temporary credentials failure');
        },
      } as unknown as GoogleAuth;
    });
    await cliState.withEnv({ GOOGLE_APPLICATION_CREDENTIALS: 'scoped.json' }, async () => {
      await expect(getGoogleAccessToken()).rejects.toThrow('temporary credentials failure');
      expect(await getGoogleAccessToken()).toBe('scoped.json');
      expect(await getGoogleAccessToken()).toBe('scoped.json');
      expect(GoogleAuth).toHaveBeenCalledTimes(2);
    });
  });

  it.each(['provider', 'suite', 'file'] as const)(
    'preserves invalid %s ADC diagnostics for Live connections',
    async (scope) => {
      const { GoogleLiveProvider } = await import('../../../src/providers/google/live');
      for (const [filename, error] of [
        ['', 'Scoped GOOGLE_APPLICATION_CREDENTIALS is empty'],
        ['missing.json', 'fixture absent'],
      ]) {
        const env = { GOOGLE_APPLICATION_CREDENTIALS: filename };
        const provider = new GoogleLiveProvider('gemini-3.8-live', {
          env: scope === 'provider' ? env : undefined,
        });
        await cliState.withEnvFileOverrides(scope === 'file' ? env : {}, () =>
          cliState.withEnv(scope === 'suite' ? env : {}, async () => {
            await expect(
              Reflect.get(provider, 'getConnection').call(provider, provider.config),
            ).rejects.toThrow(error);
          }),
        );
      }
    },
  );

  it('keeps ambient ADC discovery failures optional for Live', async () => {
    mockProcessEnv({ GOOGLE_APPLICATION_CREDENTIALS: 'missing.json' });
    await cliState.withEnv({}, async () => {
      expect(await getGoogleAccessToken()).toBeUndefined();
    });
  });

  it('does not reuse a previous Live client when ADC is explicitly masked', async () => {
    await cliState.withEnv({}, async () => {
      expect(
        await getGoogleAccessToken(undefined, { GOOGLE_APPLICATION_CREDENTIALS: 'scoped.json' }),
      ).toBe('scoped.json');
      await expect(
        getGoogleAccessToken(undefined, { GOOGLE_APPLICATION_CREDENTIALS: '' }),
      ).rejects.toThrow('Scoped GOOGLE_APPLICATION_CREDENTIALS is empty');
      expect(GoogleAuth).toHaveBeenCalledOnce();
    });
  });

  it('preserves SDK discovery for an empty host ADC variable without weakening scoped masks', async () => {
    mockProcessEnv({ GOOGLE_APPLICATION_CREDENTIALS: '' });
    vi.mocked(GoogleAuth).mockImplementation(function () {
      return { getClient: async () => makeClient('discovered') } as unknown as GoogleAuth;
    });
    await cliState.withEnv({}, async () => {
      expect(await getGoogleAccessToken()).toBe('discovered');
      await expect(
        getGoogleAccessToken(undefined, { GOOGLE_APPLICATION_CREDENTIALS: '' }),
      ).rejects.toThrow('Scoped GOOGLE_APPLICATION_CREDENTIALS is empty');
      expect(GoogleAuth).toHaveBeenCalledOnce();
    });
  });

  it('reloads explicit credential files before comparing Live client settings', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-live-oauth-'));
    const file = path.join(directory, 'credentials.json');
    try {
      await cliState.withEnv({}, async () => {
        fs.writeFileSync(file, JSON.stringify({ client_id: 'first' }));
        expect(await getGoogleAccessToken(`file://${file}`)).toBe('first');
        fs.writeFileSync(file, JSON.stringify({ client_id: 'second' }));
        expect(await getGoogleAccessToken(`file://${file}`)).toBe('second');
        expect(await getGoogleAccessToken(`file://${file}`)).toBe('second');
        expect(GoogleAuth).toHaveBeenCalledTimes(2);
      });
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('allows the SDK to retry a token refresh without discarding the client', async () => {
    const client = makeClient('refreshed-token');
    client.getAccessToken.mockRejectedValueOnce(new Error('temporary refresh failure'));
    vi.mocked(GoogleAuth).mockImplementation(function () {
      return { getClient: async () => client } as unknown as GoogleAuth;
    });
    await cliState.withEnv({}, async () => {
      expect(await getGoogleAccessToken()).toBeUndefined();
      expect(await getGoogleAccessToken()).toBe('refreshed-token');
      expect(GoogleAuth).toHaveBeenCalledOnce();
    });
  });

  it('keeps a newer Live client when an earlier initialization fails', async () => {
    let rejectFirst!: (error: Error) => void;
    const createClient = vi.spyOn(GoogleAuthManager, 'getOAuthClient');
    createClient.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectFirst = reject;
        }),
    );
    createClient.mockResolvedValue({ client: makeClient('second'), projectId: undefined });
    await cliState.withEnv({}, async () => {
      const first = getGoogleAccessToken('first');
      expect(await getGoogleAccessToken('second')).toBe('second');
      rejectFirst(new Error('first failed late'));
      expect(await first).toBeUndefined();
      expect(await getGoogleAccessToken('second')).toBe('second');
      expect(createClient).toHaveBeenCalledTimes(2);
    });
  });

  it.each([
    ['direct', 'scoped.json'],
    ['file', 'scoped.json'],
    ['cloud', 'scoped.json'],
    ['direct', ''],
    ['file', ''],
    ['cloud', ''],
  ])('retains %s provider ADC %j when express mode is disabled', async (source, adc) => {
    mockProcessEnv({ GOOGLE_APPLICATION_CREDENTIALS: 'host.json' });
    const options = {
      config: { expressMode: false, projectId: 'fixture-project' },
      env: { GOOGLE_API_KEY: 'provider-key' },
    };
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-forced-oauth-'));
    const file = path.join(directory, 'provider.json');
    const definition = { id: 'vertex:gemini-2.5-flash', ...options };
    fs.writeFileSync(file, JSON.stringify(definition));
    vi.mocked(getProviderFromCloud).mockResolvedValue(definition);
    try {
      const provider = (await loadApiProvider(
        source === 'file'
          ? `file://${file}`
          : source === 'cloud'
            ? 'promptfoo://provider/12345678-1234-1234-1234-123456789abc'
            : 'vertex:gemini-2.5-flash',
        {
          env: { GOOGLE_APPLICATION_CREDENTIALS: adc },
          ...(source === 'direct' ? { options } : {}),
        },
      )) as VertexChatProvider;

      // The loader's temporary environment has ended before authentication begins.
      if (adc === '') {
        await expect(provider.getClientWithCredentials()).rejects.toThrow(
          'Scoped GOOGLE_APPLICATION_CREDENTIALS is empty',
        );
        expect(GoogleAuth).not.toHaveBeenCalled();
      } else {
        await provider.getClientWithCredentials();
        expect(GoogleAuth).toHaveBeenCalledWith(expect.objectContaining({ keyFilename: adc }));
      }
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps a higher provider API key in default express mode after loading', async () => {
    const provider = (await loadApiProvider('vertex:gemini-2.5-flash', {
      env: { GOOGLE_APPLICATION_CREDENTIALS: 'scoped.json' },
      options: { env: { GOOGLE_API_KEY: 'provider-key' } },
    })) as VertexChatProvider;
    expect(await provider.getAuthHeaders()).toMatchObject({
      'x-goog-api-key': 'provider-key',
    });
    expect(GoogleAuth).not.toHaveBeenCalled();
  });

  it('retains ADC file and quota settings through actual API parsing and forwards them to the SDK', async () => {
    const env = {
      GOOGLE_APPLICATION_CREDENTIALS: 'scoped.json',
      GOOGLE_CLOUD_QUOTA_PROJECT: 'scoped-quota',
      GOOGLE_CLOUD_PROJECT: 'scoped-project',
    };
    const parsed = CreateJobRequestSchema.parse({ providers: ['echo'], prompts: ['fixture'], env });
    const { client } = await cliState.withEnv(parsed.env, () => GoogleAuthManager.getOAuthClient());
    expect(GoogleAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        keyFilename: 'scoped.json',
        projectId: 'scoped-project',
        clientOptions: { quotaProjectId: 'scoped-quota' },
      }),
    );
    expect(client.quotaProjectId).toBe('scoped-quota');
  });

  it.each(['provider', 'suite', 'file'] as const)(
    'does not rediscover a masked host project through the SDK (%s)',
    async (scope) => {
      mockProcessEnv({ GOOGLE_CLOUD_PROJECT: 'host-project' });
      const detectedProject = vi.fn(async () => 'host-project');
      const client = makeClient('fixture');
      vi.mocked(GoogleAuth).mockImplementation(function () {
        return {
          getClient: async () => client,
          getProjectId: detectedProject,
        } as unknown as GoogleAuth;
      });
      const env = { GOOGLE_CLOUD_PROJECT: '' };
      const load = () => GoogleAuthManager.getOAuthClient(scope === 'provider' ? { env } : {});
      const result = await (scope === 'provider'
        ? load()
        : scope === 'suite'
          ? cliState.withEnv(env, load)
          : cliState.withEnvFileOverrides(env, load));
      expect(result.projectId).toBeUndefined();
      expect(detectedProject).not.toHaveBeenCalled();
      expect(process.env.GOOGLE_CLOUD_PROJECT).toBe('host-project');
    },
  );

  it('retains credential-file projects and explicit project options when a host project is masked', async () => {
    mockProcessEnv({ GOOGLE_CLOUD_PROJECT: 'host-project' });
    vi.mocked(GoogleAuth).mockImplementation(function (options) {
      return {
        getClient: async () => ({ ...makeClient('fixture'), projectId: 'credential-project' }),
        getProjectId: async () => options?.projectId || 'host-project',
      } as unknown as GoogleAuth;
    });
    const env = { GOOGLE_CLOUD_PROJECT: '' };
    expect((await GoogleAuthManager.getOAuthClient({ env })).projectId).toBe('credential-project');
    expect(
      (await GoogleAuthManager.getOAuthClient({ env, projectId: 'explicit-project' })).projectId,
    ).toBe('explicit-project');
    expect(
      (
        await GoogleAuthManager.getOAuthClient({
          env,
          googleAuthOptions: { projectId: 'auth-option-project' },
        })
      ).projectId,
    ).toBe('auth-option-project');
  });

  it('prefers explicit auth options to scoped ADC and passes provider env above suite and file', async () => {
    await cliState.withEnvFileOverrides({ GOOGLE_APPLICATION_CREDENTIALS: 'file.json' }, () =>
      cliState.withEnv({ GOOGLE_APPLICATION_CREDENTIALS: 'suite.json' }, async () => {
        await GoogleAuthManager.getOAuthClient({
          env: { GOOGLE_APPLICATION_CREDENTIALS: 'provider.json' },
        });
        expect(GoogleAuth).toHaveBeenLastCalledWith(
          expect.objectContaining({ keyFilename: 'provider.json' }),
        );
        await GoogleAuthManager.getOAuthClient({
          keyFilename: 'config.json',
          env: { GOOGLE_APPLICATION_CREDENTIALS: 'provider.json' },
        });
        expect(GoogleAuth).toHaveBeenLastCalledWith(
          expect.objectContaining({ keyFilename: 'config.json' }),
        );
        const { client } = await GoogleAuthManager.getOAuthClient({
          credentials: JSON.stringify({ client_id: 'explicit-json' }),
        });
        expect(await client.getAccessToken()).toEqual({ token: 'explicit-json' });
      }),
    );
  });

  it('does not retain a failed default probe across evaluations, and shares one probe within an invocation', async () => {
    expect(
      await cliState.withEnv({ GOOGLE_APPLICATION_CREDENTIALS: 'missing.json' }, () =>
        GoogleAuthManager.hasDefaultCredentials(),
      ),
    ).toBe(false);
    await cliState.withEnv({ GOOGLE_APPLICATION_CREDENTIALS: 'present.json' }, async () => {
      expect(
        await Promise.all([
          GoogleAuthManager.hasDefaultCredentials(),
          GoogleAuthManager.hasDefaultCredentials(),
        ]),
      ).toEqual([true, true]);
    });
    expect(GoogleAuth).toHaveBeenCalledTimes(2);
  });
  it('keeps host-empty ADC discovery distinct from an explicit empty probe mask', async () => {
    mockProcessEnv({ GOOGLE_APPLICATION_CREDENTIALS: '' });
    await cliState.withEnv({}, async () => {
      await expect(GoogleAuthManager.hasDefaultCredentials()).resolves.toBe(true);
      expect(GoogleAuth).toHaveBeenCalledOnce();
      await expect(
        GoogleAuthManager.hasDefaultCredentials({ GOOGLE_APPLICATION_CREDENTIALS: '' }),
      ).resolves.toBe(false);
      expect(GoogleAuth).toHaveBeenCalledOnce();
    });
  });

  it('keeps an empty provider project in the default-credential probe', async () => {
    mockProcessEnv({ GOOGLE_CLOUD_PROJECT: 'host-project' });
    await expect(
      GoogleAuthManager.hasDefaultCredentials({
        GOOGLE_APPLICATION_CREDENTIALS: 'scoped.json',
        GOOGLE_CLOUD_PROJECT: '',
      }),
    ).resolves.toBe(true);
    expect(GoogleAuth).toHaveBeenCalledWith(
      expect.objectContaining({ keyFilename: 'scoped.json', projectId: '' }),
    );
  });

  it('rejects empty scoped ADC filenames before the SDK can discover lower credentials', async () => {
    mockProcessEnv({ GOOGLE_APPLICATION_CREDENTIALS: 'host.json' });
    await cliState.withEnv({ GOOGLE_APPLICATION_CREDENTIALS: 'suite.json' }, async () => {
      await expect(
        GoogleAuthManager.getOAuthClient({ env: { GOOGLE_APPLICATION_CREDENTIALS: '' } }),
      ).rejects.toThrow('empty');
      expect(
        await GoogleAuthManager.hasDefaultCredentials({ GOOGLE_APPLICATION_CREDENTIALS: '' }),
      ).toBe(false);
    });
    await cliState.withEnvFileOverrides({ GOOGLE_APPLICATION_CREDENTIALS: '' }, async () => {
      await expect(GoogleAuthManager.getOAuthClient()).rejects.toThrow('empty');
      expect(await GoogleAuthManager.hasDefaultCredentials()).toBe(false);
    });
    expect(GoogleAuth).not.toHaveBeenCalled();
    await GoogleAuthManager.getOAuthClient({
      keyFilename: 'explicit.json',
      env: { GOOGLE_APPLICATION_CREDENTIALS: '' },
    });
    expect(GoogleAuth).toHaveBeenCalledWith(
      expect.objectContaining({ keyFilename: 'explicit.json' }),
    );
  });
});
