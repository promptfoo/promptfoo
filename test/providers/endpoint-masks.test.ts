import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import cliState from '../../src/cliState';
import { ProviderEnvOverridesSchema } from '../../src/contracts/env';
import { AbliterationProvider } from '../../src/providers/abliteration';
import { AI21ChatCompletionProvider } from '../../src/providers/ai21';
import { AzureModerationProvider } from '../../src/providers/azure/moderation';
import { DatabricksMosaicAiChatCompletionProvider } from '../../src/providers/databricks';
import { createEnvoyProvider } from '../../src/providers/envoy';
import { FireworksProvider } from '../../src/providers/fireworks/chat';
import { FireworksEmbeddingProvider } from '../../src/providers/fireworks/embedding';
import { AIStudioChatProvider } from '../../src/providers/google/ai.studio';
import { GoogleAuthManager } from '../../src/providers/google/auth';
import { GoogleInteractionsProvider } from '../../src/providers/google/interactions';
import { GoogleProvider } from '../../src/providers/google/provider';
import { VertexChatProvider, VertexEmbeddingProvider } from '../../src/providers/google/vertex';
import { VertexLiveProvider } from '../../src/providers/google/vertexLive';
import { createLiteLLMProvider } from '../../src/providers/litellm';
import { LlamaProvider } from '../../src/providers/llama';
import { LocalAiChatProvider } from '../../src/providers/localai';
import { MlflowGatewayChatCompletionProvider } from '../../src/providers/mlflow-gateway';
import { NvidiaProvider } from '../../src/providers/nvidia/chat';
import {
  OllamaChatProvider,
  OllamaCompletionProvider,
  OllamaEmbeddingProvider,
} from '../../src/providers/ollama';
import { PortkeyChatCompletionProvider } from '../../src/providers/portkey';
import { VoyageEmbeddingProvider } from '../../src/providers/voyage';
import { XAIResponsesProvider } from '../../src/providers/xai/responses';
import { XAIVideoProvider } from '../../src/providers/xai/video';
import { XAIVoiceProvider } from '../../src/providers/xai/voice';
import { mockProcessEnv } from '../util/utils';

import type { EnvOverrides } from '../../src/types/env';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));

type Options = { config: Record<string, any>; env?: EnvOverrides };
function apiUrl(provider: object): string {
  const target = Reflect.get(provider, 'provider') ?? provider;
  return Reflect.get(target, 'getApiUrl').call(target);
}

const endpoints = [
  [
    'LocalAI',
    'LOCALAI_BASE_URL',
    'http://localhost:8080/v1',
    (options: Options) => new LocalAiChatProvider('model', options).apiBaseUrl,
  ],
  [
    'LiteLLM',
    'LITELLM_API_BASE',
    'http://0.0.0.0:4000',
    (options: Options) => apiUrl(createLiteLLMProvider('litellm:model', { config: options })),
  ],
  [
    'Abliteration',
    'ABLIT_API_BASE_URL',
    'https://api.abliteration.ai/v1',
    (options: Options) => apiUrl(new AbliterationProvider('model', options)),
  ],
  [
    'Nvidia',
    'NVIDIA_API_BASE_URL',
    'https://integrate.api.nvidia.com/v1',
    (options: Options) => apiUrl(new NvidiaProvider('model', options)),
  ],
  [
    'Fireworks chat',
    'FIREWORKS_API_BASE_URL',
    'https://api.fireworks.ai/inference/v1',
    (options: Options) => apiUrl(new FireworksProvider('model', options)),
  ],
  [
    'Fireworks embedding',
    'FIREWORKS_API_BASE_URL',
    'https://api.fireworks.ai/inference/v1',
    (options: Options) => apiUrl(new FireworksEmbeddingProvider('model', options)),
  ],
  [
    'AI21',
    'AI21_API_BASE_URL',
    'https://api.ai21.com/studio/v1',
    (options: Options) => apiUrl(new AI21ChatCompletionProvider('jamba-large', options)),
  ],
  [
    'Voyage',
    'VOYAGE_API_BASE_URL',
    'https://api.voyageai.com/v1',
    (options: Options) =>
      apiUrl(new VoyageEmbeddingProvider('voyage-3', options.config, options.env)),
  ],
  [
    'xAI responses',
    'XAI_API_BASE_URL',
    'https://api.x.ai/v1',
    (options: Options) => apiUrl(new XAIResponsesProvider('grok-4', options)),
  ],
  [
    'xAI video',
    'XAI_API_BASE_URL',
    'https://api.x.ai/v1',
    (options: Options) => apiUrl(new XAIVideoProvider('grok-imagine-video', options)),
  ],
  [
    'xAI voice',
    'XAI_API_BASE_URL',
    'https://api.x.ai/v1',
    (options: Options) => apiUrl(new XAIVoiceProvider('grok-voice-agent', options)),
  ],
] as const;
const requiredEndpoints = [
  [
    'Envoy',
    'ENVOY_API_BASE_URL',
    'apiBaseUrl',
    '/v1',
    (options: Options) => apiUrl(createEnvoyProvider('envoy:model', { config: options })),
  ],
  [
    'Databricks',
    'DATABRICKS_WORKSPACE_URL',
    'workspaceUrl',
    '/serving-endpoints',
    (options: Options) => apiUrl(new DatabricksMosaicAiChatCompletionProvider('model', options)),
  ],
  [
    'MLflow',
    'MLFLOW_GATEWAY_URL',
    'gatewayUrl',
    '/gateway/mlflow/v1',
    (options: Options) => apiUrl(new MlflowGatewayChatCompletionProvider('model', options)),
  ],
] as const;
const studioProviders = [
  ['Google', (options: Options) => new GoogleProvider('gemini-2.5-flash', options)],
  ['AI Studio', (options: Options) => new AIStudioChatProvider('gemini-2.5-flash', options)],
] as const;

describe('provider endpoint environment precedence', () => {
  let restoreEnv: () => void;
  beforeEach(() => {
    restoreEnv = mockProcessEnv({}, { clear: true });
    vi.mocked(fetchWithCache).mockReset();
  });
  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  it.each(endpoints)(
    '%s masks ambient %s and retains the public default',
    (_name, key, fallback, resolve) => {
      mockProcessEnv({ [key]: 'https://ambient.example.invalid' });
      expect(resolve({ config: {}, env: { [key]: '' } })).toBe(fallback);
      cliState.withEnv({ [key]: '' }, () => expect(resolve({ config: {} })).toBe(fallback));
      cliState.withEnvFileOverrides({ [key]: '' }, () =>
        expect(resolve({ config: {} })).toBe(fallback),
      );
    },
  );
  it.each(endpoints)(
    '%s keeps explicit config and provider %s above ambient settings',
    (_name, key, _fallback, resolve) => {
      mockProcessEnv({ [key]: 'https://ambient.example.invalid' });
      cliState.withEnv({ [key]: 'https://suite.example.invalid' }, () => {
        expect(resolve({ config: {}, env: { [key]: 'https://provider.example.invalid' } })).toBe(
          'https://provider.example.invalid',
        );
        expect(
          resolve({ config: { apiBaseUrl: 'https://config.example.invalid' }, env: { [key]: '' } }),
        ).toBe('https://config.example.invalid');
        expect(resolve({ config: {} })).toBe('https://suite.example.invalid');
      });
    },
  );
  it.each(requiredEndpoints)(
    '%s rejects an empty %s override and preserves explicit config',
    (_name, key, configKey, suffix, resolve) => {
      mockProcessEnv({ [key]: 'https://ambient.example.invalid' });
      expect(() => resolve({ config: {}, env: { [key]: '' } })).toThrow(/requires|required/i);
      expect(
        resolve({ config: { [configKey]: 'https://config.example.invalid' }, env: { [key]: '' } }),
      ).toBe(`https://config.example.invalid${suffix}`);
      expect(resolve({ config: {}, env: { [key]: 'https://provider.example.invalid' } })).toBe(
        `https://provider.example.invalid${suffix}`,
      );
    },
  );
  it('masks the Azure Content Safety endpoint and reports the existing missing-endpoint error', async () => {
    mockProcessEnv({ AZURE_CONTENT_SAFETY_ENDPOINT: 'https://ambient.example.invalid' });
    const provider = new AzureModerationProvider('text-content-safety', {
      config: { apiKey: 'fixture' },
      env: { AZURE_CONTENT_SAFETY_ENDPOINT: '' },
    });
    expect(provider.endpoint).toBeUndefined();
    expect(await provider.callModerationApi('hello', 'hello')).toMatchObject({
      error: expect.stringContaining('endpoint is not set'),
    });
    expect(fetchWithCache).not.toHaveBeenCalled();
    expect(
      new AzureModerationProvider('text-content-safety', {
        config: { endpoint: 'https://config.example.invalid' },
        env: { AZURE_CONTENT_SAFETY_ENDPOINT: '' },
      }).endpoint,
    ).toBe('https://config.example.invalid');
  });
  it('preserves Portkey config priority and supports an empty public provider env override', () => {
    mockProcessEnv({ PORTKEY_API_BASE_URL: 'https://ambient.example.invalid' });
    const env = ProviderEnvOverridesSchema.parse({ PORTKEY_API_BASE_URL: '' });
    expect(env).toEqual({ PORTKEY_API_BASE_URL: '' });
    expect(apiUrl(new PortkeyChatCompletionProvider('model', { env }))).toBe(
      'https://api.portkey.ai/v1',
    );
    expect(
      apiUrl(
        new PortkeyChatCompletionProvider('model', {
          config: { portkeyApiBaseUrl: 'https://config.example.invalid' },
        }),
      ),
    ).toBe('https://config.example.invalid');
    expect(
      apiUrl(
        new PortkeyChatCompletionProvider('model', {
          env: { PORTKEY_API_BASE_URL: 'https://provider.example.invalid' },
        }),
      ),
    ).toBe('https://provider.example.invalid');
  });
  it.each([
    ['LiteLLM', 'LITELLM_API_BASE'],
    ['Envoy', 'ENVOY_API_BASE_URL'],
  ] as const)('%s applies nested provider masks before factory context %s', (name, key) => {
    const options = {
      config: { env: { [key]: '' } },
      env: { [key]: 'https://context.example.invalid' },
    };
    if (name === 'Envoy') {
      expect(() => createEnvoyProvider('envoy:model', options)).toThrow('requires a gateway URL');
    } else {
      expect(apiUrl(createLiteLLMProvider('litellm:model', options))).toBe('http://0.0.0.0:4000');
    }
  });
  it.each(studioProviders)(
    '%s resolves host/base aliases by scope and keeps config first',
    (_name, create) => {
      mockProcessEnv({ GOOGLE_API_HOST: 'ambient.example.invalid' });
      const endpoint = (options: Options) => create(options).getApiEndpoint('generateContent');
      const suffix = '/v1beta/models/gemini-2.5-flash:generateContent';
      cliState.withEnv({ GOOGLE_API_HOST: 'suite.example.invalid' }, () => {
        expect(
          endpoint({
            config: {},
            env: { GOOGLE_API_BASE_URL: 'https://provider.example.invalid/custom' },
          }),
        ).toBe(`https://provider.example.invalid/custom${suffix}`);
        expect(endpoint({ config: { apiBaseUrl: 'https://config.example.invalid/custom' } })).toBe(
          `https://config.example.invalid/custom${suffix}`,
        );
        expect(
          endpoint({
            config: {},
            env: { GOOGLE_API_HOST: '', PALM_API_HOST: 'alias.example.invalid' },
          }),
        ).toBe(`https://alias.example.invalid${suffix}`);
        expect(
          endpoint({
            config: {},
            env: { GOOGLE_API_HOST: '', PALM_API_HOST: '', GOOGLE_API_BASE_URL: '' },
          }),
        ).toBe(`https://generativelanguage.googleapis.com${suffix}`);
      });
      cliState.withEnvFileOverrides({ PALM_API_HOST: 'file.example.invalid' }, () => {
        expect(endpoint({ config: {} })).toBe(`https://file.example.invalid${suffix}`);
        cliState.withEnv({ GOOGLE_API_BASE_URL: 'https://suite.example.invalid' }, () => {
          expect(endpoint({ config: {} })).toBe(`https://suite.example.invalid${suffix}`);
        });
      });
    },
  );
  it.each([
    [
      'Google Vertex',
      (options: Options) =>
        new GoogleProvider('gemini-2.5-flash', {
          ...options,
          config: { ...options.config, vertexai: true },
        }),
    ],
    ['Vertex chat', (options: Options) => new VertexChatProvider('gemini-2.5-flash', options)],
    [
      'Vertex embedding',
      (options: Options) => new VertexEmbeddingProvider('text-embedding-005', options),
    ],
  ] as const)('%s masks VERTEX_API_HOST without changing regional defaults', (_name, create) => {
    mockProcessEnv({ VERTEX_API_HOST: 'ambient.example.invalid' });
    expect(
      create({ config: { region: 'us-east1' }, env: { VERTEX_API_HOST: '' } }).getApiHost(),
    ).toBe('us-east1-aiplatform.googleapis.com');
    expect(
      create({
        config: { apiHost: 'config.example.invalid' },
        env: { VERTEX_API_HOST: '' },
      }).getApiHost(),
    ).toBe('config.example.invalid');
  });

  it.each([
    [
      'Llama',
      'LLAMA_BASE_URL',
      '/completion',
      'http://localhost:8080',
      async (env: EnvOverrides) => new LlamaProvider('model', { env }).callApi('hello'),
      { content: 'hello' },
    ],
    [
      'Ollama completion',
      'OLLAMA_BASE_URL',
      '/api/generate',
      'http://localhost:11434',
      async (env: EnvOverrides) => new OllamaCompletionProvider('model', { env }).callApi('hello'),
      JSON.stringify({ response: 'hello', done: true }),
    ],
    [
      'Ollama chat',
      'OLLAMA_BASE_URL',
      '/api/chat',
      'http://localhost:11434',
      async (env: EnvOverrides) => new OllamaChatProvider('model', { env }).callApi('hello'),
      JSON.stringify({ message: { content: 'hello' }, done: true }),
    ],
    [
      'Ollama embedding',
      'OLLAMA_BASE_URL',
      '/api/embed',
      'http://localhost:11434',
      async (env: EnvOverrides) =>
        new OllamaEmbeddingProvider('model', { env }).callEmbeddingApi('hello'),
      { embeddings: [[1, 2]] },
    ],
  ] as const)(
    '%s sends requests to its default when %s is masked',
    async (_name, key, path, fallback, call, data) => {
      mockProcessEnv({ [key]: 'https://ambient.example.invalid' });
      vi.mocked(fetchWithCache).mockResolvedValue({
        data,
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: {},
      });
      expect(await call({ [key]: '' })).not.toHaveProperty('error');
      expect(vi.mocked(fetchWithCache).mock.calls[0][0]).toBe(`${fallback}${path}`);
      await call({ [key]: 'https://provider.example.invalid' });
      expect(vi.mocked(fetchWithCache).mock.calls[1][0]).toBe(
        `https://provider.example.invalid${path}`,
      );
    },
  );

  it('resolves Interactions endpoint aliases by scope and falls back after a mask', async () => {
    mockProcessEnv({ GOOGLE_API_HOST: 'ambient.example.invalid' });
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { id: 'fixture', status: 'completed', steps: [] },
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });
    await cliState.withEnv({ GOOGLE_API_HOST: 'suite.example.invalid' }, async () => {
      const provider = new GoogleInteractionsProvider('gemini-omni-flash', {
        config: { apiKey: 'fixture' },
        env: { GOOGLE_API_BASE_URL: 'https://provider.example.invalid/custom/' },
      });
      await provider.callApi('hello');
      expect(vi.mocked(fetchWithCache).mock.calls.at(-1)?.[0]).toBe(
        'https://provider.example.invalid/custom/v1beta/interactions',
      );
      provider.env = { GOOGLE_API_HOST: '' };
      await provider.callApi('hello');
      expect(vi.mocked(fetchWithCache).mock.calls.at(-1)?.[0]).toBe(
        'https://generativelanguage.googleapis.com/v1beta/interactions',
      );
    });
  });
  it.each(['Auth manager', 'Vertex Live', 'Vertex Interactions'])(
    '%s resolves project and region aliases within each scope',
    async (kind) => {
      const client = {
        getAccessToken: vi.fn().mockResolvedValue({ token: 'fixture-token' }),
        getRequestHeaders: vi
          .fn()
          .mockResolvedValue(new Headers({ authorization: 'Bearer fixture-token' })),
      };
      vi.spyOn(GoogleAuthManager, 'getOAuthClient').mockResolvedValue({
        client,
        projectId: 'adc-project',
      });
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: { id: 'fixture', status: 'completed', steps: [] },
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: {},
      });
      mockProcessEnv({
        VERTEX_PROJECT_ID: 'ambient-project',
        VERTEX_REGION: 'us-west1',
        VERTEX_API_HOST: 'ambient.example.invalid',
      });
      const resolve = async (env: EnvOverrides, config: Record<string, any> = {}) => {
        if (kind === 'Auth manager') {
          return {
            project: await GoogleAuthManager.resolveProjectId(config, env),
            region: GoogleAuthManager.resolveRegion(config, env, false),
          };
        }
        if (kind === 'Vertex Live') {
          const provider = new VertexLiveProvider('gemini-live-2.5-flash-native-audio', { env });
          const connection = await Reflect.get(provider, 'getConnection').call(provider, config);
          const [, project, , region] = connection.model.split('/');
          expect(connection.url).toContain(
            region === 'global'
              ? 'wss://aiplatform.googleapis.com/'
              : `wss://${region}-aiplatform.googleapis.com/`,
          );
          return { project, region };
        }
        const provider = new GoogleInteractionsProvider('gemini-omni-flash', {
          config: { ...config, vertexai: true },
          env: { ...env, VERTEX_API_HOST: '' },
        });
        await provider.callApi('hello');
        const url = new URL(String(vi.mocked(fetchWithCache).mock.calls.at(-1)?.[0]));
        const [, , , project, , region] = url.pathname.split('/');
        expect(url.hostname).toBe(
          region === 'global' ? 'aiplatform.googleapis.com' : `${region}-aiplatform.googleapis.com`,
        );
        return { project, region };
      };
      await cliState.withEnv(
        { VERTEX_PROJECT_ID: 'suite-project', VERTEX_REGION: 'us-east1' },
        async () => {
          expect(
            await resolve({
              GOOGLE_CLOUD_PROJECT: 'provider-project',
              GOOGLE_CLOUD_LOCATION: 'europe-west1',
            }),
          ).toEqual({ project: 'provider-project', region: 'europe-west1' });
          expect(await resolve({ VERTEX_PROJECT_ID: '', VERTEX_REGION: '' })).toEqual({
            project: 'adc-project',
            region: kind === 'Vertex Live' ? 'us-central1' : 'global',
          });
          expect(await resolve({}, { projectId: 'config-project', region: 'asia-east1' })).toEqual({
            project: 'config-project',
            region: 'asia-east1',
          });
        },
      );
      await cliState.withEnvFileOverrides(
        { GOOGLE_CLOUD_PROJECT: 'file-project', GOOGLE_CLOUD_LOCATION: 'europe-west2' },
        async () => {
          expect(await resolve({})).toEqual({ project: 'file-project', region: 'europe-west2' });
        },
      );
      await cliState.withEnv(
        {
          VERTEX_PROJECT_ID: 'masked-project',
          GOOGLE_PROJECT_ID: 'alias-project',
          VERTEX_REGION: 'us-east1',
          GOOGLE_CLOUD_LOCATION: 'global',
        },
        async () => {
          expect(await resolve({ VERTEX_PROJECT_ID: '', VERTEX_REGION: '' })).toEqual({
            project: 'alias-project',
            region: 'global',
          });
        },
      );
    },
  );
});
