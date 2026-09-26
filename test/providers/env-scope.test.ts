import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import cliState from '../../src/cliState';
import logger from '../../src/logger';
import { AI21ChatCompletionProvider } from '../../src/providers/ai21';
import { AzureFoundryAgentProvider } from '../../src/providers/azure/foundry-agent';
import { AzureModerationProvider } from '../../src/providers/azure/moderation';
import { resolveBedrockMantleRegion } from '../../src/providers/bedrock/mantle';
import { CloudflareAiChatCompletionProvider } from '../../src/providers/cloudflare-ai';
import { createCloudflareGatewayProvider } from '../../src/providers/cloudflare-gateway';
import { CohereChatCompletionProvider, CohereEmbeddingProvider } from '../../src/providers/cohere';
import { GoogleAuthManager } from '../../src/providers/google/auth';
import { GeminiImageProvider } from '../../src/providers/google/gemini-image';
import { GoogleImageProvider } from '../../src/providers/google/image';
import { GoogleLiveProvider } from '../../src/providers/google/live';
import * as googleUtil from '../../src/providers/google/util';
import { GoogleVideoProvider } from '../../src/providers/google/video';
import {
  HuggingfaceFeatureExtractionProvider,
  HuggingfaceSentenceSimilarityProvider,
  HuggingfaceTextClassificationProvider,
  HuggingfaceTextGenerationProvider,
  HuggingfaceTokenExtractionProvider,
} from '../../src/providers/huggingface';
import { loadApiProvider } from '../../src/providers/index';
import { LlamaProvider } from '../../src/providers/llama';
import {
  MistralChatCompletionProvider,
  MistralEmbeddingProvider,
} from '../../src/providers/mistral';
import {
  OllamaChatProvider,
  OllamaCompletionProvider,
  OllamaEmbeddingProvider,
} from '../../src/providers/ollama';
import { OpenAiChatKitProvider } from '../../src/providers/openai/chatkit';
import { mergeProviderEnv } from '../../src/providers/registry';
import { SageMakerCompletionProvider } from '../../src/providers/sagemaker';
import { SlackProvider } from '../../src/providers/slack';
import { SnowflakeCortexProvider } from '../../src/providers/snowflake';
import { VoyageEmbeddingProvider } from '../../src/providers/voyage';
import { WatsonXProvider } from '../../src/providers/watsonx';
import { XAIImageProvider } from '../../src/providers/xai/image';
import { XAIVideoProvider } from '../../src/providers/xai/video';
import { XAIVoiceProvider } from '../../src/providers/xai/voice';
import { mockProcessEnv } from '../util/utils';

import type { EnvOverrides } from '../../src/types/env';
import type { ProviderOptions } from '../../src/types/providers';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));

vi.mock('../../src/providers/google/util', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/providers/google/util')>()),
  getGoogleClient: vi.fn(),
}));

// Read key selection without dispatching an authenticated request, including providers
// whose key getter is protected/private because it is normally used by callApi.
function apiKey(provider: object): string | undefined {
  return Reflect.get(provider, 'getApiKey').call(provider);
}

describe('provider environment scopes', () => {
  let restoreEnv: () => void;
  beforeEach(() => {
    restoreEnv = mockProcessEnv({}, { clear: true });
    vi.mocked(fetchWithCache).mockReset();
    vi.mocked(googleUtil.getGoogleClient).mockReset();
  });
  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  const keyProviders: [string, string, (options: ProviderOptions) => object][] = [
    ['xAI image', 'XAI_API_KEY', (options) => new XAIImageProvider('grok-imagine-image', options)],
    ['xAI video', 'XAI_API_KEY', (options) => new XAIVideoProvider('grok-imagine-video', options)],
    ['xAI voice', 'XAI_API_KEY', (options) => new XAIVoiceProvider('grok-voice', options)],
    ['Google Live', 'GEMINI_API_KEY', (options) => new GoogleLiveProvider('gemini-live', options)],
    [
      'Google image',
      'GEMINI_API_KEY',
      (options) => new GoogleImageProvider('imagen-4.0-generate-001', options),
    ],
    [
      'Gemini image',
      'GEMINI_API_KEY',
      (options) => new GeminiImageProvider('gemini-2.5-flash-image', options),
    ],
    [
      'HF text',
      'HF_API_TOKEN',
      (options) => new HuggingfaceTextGenerationProvider('model', options),
    ],
    [
      'HF classification',
      'HF_API_TOKEN',
      (options) => new HuggingfaceTextClassificationProvider('model', options),
    ],
    [
      'HF embedding',
      'HF_API_TOKEN',
      (options) => new HuggingfaceFeatureExtractionProvider('model', options),
    ],
    [
      'HF similarity',
      'HF_API_TOKEN',
      (options) => new HuggingfaceSentenceSimilarityProvider('model', options),
    ],
    [
      'HF tokens',
      'HF_API_TOKEN',
      (options) => new HuggingfaceTokenExtractionProvider('model', options),
    ],
  ];
  it.each(keyProviders)(
    '%s retains provider keys after construction scope ends',
    async (_name, key, create) => {
      const providerEnv = { [key]: 'provider-marker' };
      const provider = cliState.withEnv(providerEnv, () => create({ env: providerEnv }));
      await cliState.withEnv(
        { [key]: 'suite-marker', GOOGLE_API_KEY: 'suite-google', HF_TOKEN: 'suite-hf' },
        async () => {
          await Promise.resolve();
          expect(apiKey(provider)).toBe('provider-marker');
          expect(apiKey(create({ env: providerEnv, config: { apiKey: 'config-marker' } }))).toBe(
            'config-marker',
          );
        },
      );
    },
  );

  const namedProviders: [string, (options: ProviderOptions) => object][] = [
    ['AI21', (options) => new AI21ChatCompletionProvider('jamba-large', options)],
    [
      'Cohere embedding',
      (options) => new CohereEmbeddingProvider('embed-english-v3.0', options.config, options.env),
    ],
    [
      'Mistral chat',
      (options) => new MistralChatCompletionProvider('mistral-large-latest', options),
    ],
    ['Mistral embedding', (options) => new MistralEmbeddingProvider(options)],
    ['Voyage', (options) => new VoyageEmbeddingProvider('voyage-3.5', options.config, options.env)],
    ['WatsonX', (options) => new WatsonXProvider('model', options)],
  ];
  it.each(namedProviders)('%s prefers provider named credentials', (_name, create) => {
    cliState.withEnv(
      { AUDIT_NAMED_KEY: 'suite-marker', MISTRAL_API_KEY: 'vendor-fallback' },
      () => {
        const options = {
          config: { apiKeyEnvar: 'AUDIT_NAMED_KEY' },
          env: { AUDIT_NAMED_KEY: 'provider-marker' },
        };
        expect(apiKey(create(options))).toBe('provider-marker');
        expect(
          apiKey(create({ ...options, config: { ...options.config, apiKey: 'config-marker' } })),
        ).toBe('config-marker');
      },
    );
  });
  it('keeps documented vendor fallback when a named credential is missing', () => {
    const provider = new MistralChatCompletionProvider('mistral-large-latest', {
      config: { apiKeyEnvar: 'MISSING_KEY' },
      env: { MISTRAL_API_KEY: 'fallback-marker' },
    });
    expect(provider.getApiKey()).toBe('fallback-marker');
  });
  it('resolves Cloudflare named account and key from the explicit provider map', () => {
    cliState.withEnv({ CF_ACCOUNT: 'suite-account', CF_KEY: 'suite-key' }, () => {
      const provider = new CloudflareAiChatCompletionProvider('model', {
        config: { apiKeyEnvar: 'CF_KEY', accountIdEnvar: 'CF_ACCOUNT' },
        env: { CF_ACCOUNT: 'provider-account', CF_KEY: 'provider-key' },
      });
      expect(provider.getApiKey()).toBe('provider-key');
      expect(provider.getApiUrl()).toContain('/provider-account/');
    });
  });
  it('resolves Azure Content Safety named keys from provider overrides', () => {
    cliState.withEnv({ SAFETY_KEY: 'suite-key' }, () => {
      const provider = new AzureModerationProvider('text-content-safety', {
        config: { apiKeyEnvar: 'SAFETY_KEY', endpoint: 'https://example.test' },
        env: { SAFETY_KEY: 'provider-key' },
      });
      expect(provider.getContentSafetyApiKey()).toBe('provider-key');
    });
  });
  it('resolves WatsonX bearer and project aliases from provider overrides', () => {
    cliState.withEnv({ NAMED_BEARER: 'suite-bearer', NAMED_PROJECT: 'suite-project' }, () => {
      const provider = new WatsonXProvider('model', {
        config: { apiBearerTokenEnvar: 'NAMED_BEARER', projectIdEnvar: 'NAMED_PROJECT' },
        env: { NAMED_BEARER: 'provider-bearer', NAMED_PROJECT: 'provider-project' },
      });
      expect(provider.getProjectId()).toBe('provider-project');
      expect(Reflect.get(provider, 'getAuthSelection').call(provider)).toMatchObject({
        bearerToken: 'provider-bearer',
      });
    });
  });

  it.each(['suite', 'file'] as const)(
    'constructs endpoint and pool settings from the %s layer',
    (layer) => {
      const scopedEnv = {
        SNOWFLAKE_ACCOUNT_IDENTIFIER: 'scoped-account',
        AZURE_AI_PROJECT_URL: 'https://project.example.test',
        AWS_REGION: 'us-west-2',
        PROMPTFOO_MAX_CONCURRENCY: '7',
      };
      const run =
        layer === 'suite'
          ? cliState.withEnv.bind(cliState)
          : cliState.withEnvFileOverrides.bind(cliState);
      run(scopedEnv, () => {
        expect(new SnowflakeCortexProvider('model', {}).getApiUrl()).toBe(
          'https://scoped-account.snowflakecomputing.com',
        );
        const foundry = new AzureFoundryAgentProvider('agent', { config: { apiKey: 'fake-key' } });
        expect(Reflect.get(foundry, 'projectUrl')).toBe(scopedEnv.AZURE_AI_PROJECT_URL);
        expect(resolveBedrockMantleRegion({}, undefined, 'us-east-1')).toBe('us-west-2');
        const chatkit = new OpenAiChatKitProvider('workflow');
        expect(Reflect.get(chatkit, 'chatKitConfig').poolSize).toBe(7);
        expect(
          Reflect.get(
            new OpenAiChatKitProvider('workflow', { config: { poolSize: 2 } }),
            'chatKitConfig',
          ).poolSize,
        ).toBe(2);
      });
    },
  );
  it('uses file-layer custom Cloudflare Gateway names', () => {
    cliState.withEnvFileOverrides(
      { GATEWAY_ACCOUNT: 'file-account', GATEWAY_NAME: 'file-gateway' },
      () => {
        const provider = createCloudflareGatewayProvider('cloudflare-gateway:openai:gpt-4o', {
          config: {
            accountIdEnvar: 'GATEWAY_ACCOUNT',
            gatewayIdEnvar: 'GATEWAY_NAME',
            apiKey: 'fake-key',
          },
        });
        expect((provider as unknown as { getApiUrl(): string }).getApiUrl()).toContain(
          '/file-account/file-gateway/',
        );
      },
    );
  });
  it('uses provider Google location and project aliases before ambient values', async () => {
    vi.spyOn(GoogleAuthManager, 'getOAuthClient').mockResolvedValue({
      client: {} as never,
      projectId: 'adc-project',
    });
    await cliState.withEnv(
      { VERTEX_REGION: 'suite-region', VERTEX_PROJECT_ID: 'suite-project' },
      async () => {
        const env = {
          GOOGLE_CLOUD_PROJECT: 'provider-project',
          GOOGLE_CLOUD_LOCATION: 'provider-region',
        };
        expect(GoogleAuthManager.determineVertexMode({}, env)).toBe(true);
        expect(GoogleAuthManager.resolveRegion({}, env)).toBe('provider-region');
        expect(await GoogleAuthManager.resolveProjectId({}, env)).toBe('provider-project');
      },
    );
  });
  it('retains SageMaker numeric overrides, including zero and invalid-value defaults', () => {
    cliState.withEnv(
      {
        AWS_SAGEMAKER_TEMPERATURE: '0.9',
        AWS_SAGEMAKER_TOP_P: '0.8',
        AWS_SAGEMAKER_MAX_TOKENS: '999',
        AWS_REGION: 'us-east-1',
      },
      () => {
        const provider = new SageMakerCompletionProvider('endpoint', {
          config: { modelType: 'llama' },
          env: {
            AWS_SAGEMAKER_TEMPERATURE: '0',
            AWS_SAGEMAKER_TOP_P: 'invalid',
            AWS_SAGEMAKER_MAX_TOKENS: '23',
            AWS_DEFAULT_REGION: 'us-west-2',
          },
        });
        expect(JSON.parse(provider.formatPayload('hello'))).toMatchObject({
          parameters: { temperature: 0, top_p: 1, max_new_tokens: 23 },
        });
        expect(provider.getRegion()).toBe('us-west-2');
      },
    );
  });

  it.each([
    ['completion', OllamaCompletionProvider, '/api/generate'],
    ['chat', OllamaChatProvider, '/api/chat'],
    ['embedding', OllamaEmbeddingProvider, '/api/embed'],
  ] as const)(
    'Ollama %s uses provider endpoints and auth at request time',
    async (_name, Provider, route) => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data:
          Provider === OllamaEmbeddingProvider
            ? { embeddings: [[1]] }
            : JSON.stringify({ response: 'ok', message: { content: 'ok' } }),
        cached: false,
        status: 200,
        statusText: 'OK',
      });
      const provider = new Provider('model', {
        env: { OLLAMA_BASE_URL: 'http://provider.test', OLLAMA_API_KEY: 'provider-key' },
      });
      await cliState.withEnv(
        { OLLAMA_BASE_URL: 'http://suite.test', OLLAMA_API_KEY: 'suite-key' },
        async () => {
          if (provider instanceof OllamaEmbeddingProvider) {
            await provider.callEmbeddingApi('hello');
          } else {
            await provider.callApi('hello');
          }
        },
      );
      expect(vi.mocked(fetchWithCache).mock.calls[0].slice(0, 2)).toEqual([
        `http://provider.test${route}`,
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer provider-key' }),
        }),
      ]);
    },
  );
  it('Llama uses its retained endpoint at request time', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { content: 'ok' },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
    const provider = new LlamaProvider('model', {
      env: { LLAMA_BASE_URL: 'http://provider.test' },
    });
    await cliState.withEnv({ LLAMA_BASE_URL: 'http://suite.test' }, () =>
      provider.callApi('hello'),
    );
    expect(fetchWithCache).toHaveBeenCalledWith(
      'http://provider.test/completion',
      expect.any(Object),
      expect.any(Number),
    );
  });
  it.each(['chat', 'embedding'])(
    'Cohere %s uses provider client headers at request time',
    async (kind) => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: { text: 'ok', embeddings: [[1]] },
        cached: false,
        status: 200,
        statusText: 'OK',
      });
      const env: EnvOverrides = {
        COHERE_API_KEY: 'fake-key',
        COHERE_CLIENT_NAME: 'provider-client',
      };
      await cliState.withEnv({ COHERE_CLIENT_NAME: 'suite-client' }, async () => {
        if (kind === 'chat') {
          await new CohereChatCompletionProvider('command-r', { env }).callApi('hello');
        } else {
          await new CohereEmbeddingProvider('embed-english-v3.0', {}, env).callEmbeddingApi(
            'hello',
          );
        }
      });
      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Client-Name': 'provider-client' }),
        }),
        expect.any(Number),
      );
    },
  );
  it.each(['suite', 'file'] as const)(
    'Slack constructs its SDK client from the %s layer',
    (layer) => {
      const run =
        layer === 'suite'
          ? cliState.withEnv.bind(cliState)
          : cliState.withEnvFileOverrides.bind(cliState);
      run({ SLACK_BOT_TOKEN: 'scoped-token' }, () => {
        const provider = new SlackProvider({ config: { channel: 'C-test' } });
        expect(Reflect.get(provider, 'client').token).toBe('scoped-token');
        const explicit = new SlackProvider({
          config: { channel: 'C-test', token: 'config-token' },
          env: { SLACK_BOT_TOKEN: 'provider-token' },
        });
        expect(Reflect.get(explicit, 'client').token).toBe('config-token');
      });
    },
  );
  it('does not issue a missing-ADC diagnostic for invocation-file credentials', () => {
    const debug = vi.spyOn(logger, 'debug');
    cliState.withEnvFileOverrides(
      { GOOGLE_APPLICATION_CREDENTIALS: '/synthetic/unused.json' },
      () => {
        GoogleAuthManager.validateAndWarn({ vertexai: true });
      },
    );
    expect(debug).not.toHaveBeenCalledWith(
      expect.stringContaining('no projectId, credentials, or ADC detected'),
    );
  });
  it('uses provider SageMaker retry counts without falling through an invalid override', async () => {
    await cliState.withEnv({ AWS_SAGEMAKER_MAX_RETRIES: '9' }, async () => {
      for (const [value, expected] of [
        ['4', 4],
        ['', 3],
        ['invalid', 3],
      ] as const) {
        const provider = new SageMakerCompletionProvider('endpoint', {
          config: {
            modelType: 'llama',
            region: 'us-east-1',
            accessKeyId: 'synthetic-id',
            secretAccessKey: 'synthetic-secret',
          },
          env: { AWS_SAGEMAKER_MAX_RETRIES: value },
        });
        const client = await provider.getSageMakerRuntimeInstance();
        expect(await client.config.maxAttempts()).toBe(expected);
        client.destroy();
      }
    });
  });
  it.each([
    [
      'Imagen',
      () =>
        new GoogleImageProvider('imagen-4.0-generate-001', {
          env: { GOOGLE_CLOUD_PROJECT: 'provider-project', GOOGLE_LOCATION: 'provider-region' },
        }),
    ],
    [
      'Gemini image',
      () =>
        new GeminiImageProvider('gemini-2.5-flash-image', {
          env: { GOOGLE_CLOUD_PROJECT: 'provider-project', GOOGLE_LOCATION: 'provider-region' },
        }),
    ],
  ] as const)(
    '%s uses provider location and project values in the outgoing request',
    async (_name, create) => {
      const request = vi.fn().mockResolvedValue({ data: {} });
      const client = { request } as never;
      vi.mocked(googleUtil.getGoogleClient).mockResolvedValue({ client, projectId: 'adc-project' });
      vi.spyOn(GoogleAuthManager, 'getOAuthClient').mockResolvedValue({
        client,
        projectId: 'adc-project',
      });
      await cliState.withEnv(
        { GOOGLE_CLOUD_PROJECT: 'suite-project', GOOGLE_LOCATION: 'suite-region' },
        () => create().callApi('a blue square'),
      );
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining(
            'https://provider-region-aiplatform.googleapis.com/v1/projects/provider-project/locations/provider-region/',
          ),
        }),
      );
    },
  );
  it('Google video resolves provider locations before the suite default', () => {
    const provider = new GoogleVideoProvider('veo-3.0-generate-001', {
      env: { GOOGLE_LOCATION: 'provider-region' },
    });
    cliState.withEnv({ GOOGLE_LOCATION: 'suite-region' }, () => {
      expect(Reflect.get(provider, 'getLocation').call(provider, {})).toBe('provider-region');
      expect(Reflect.get(provider, 'getLocation').call(provider, { region: 'config-region' })).toBe(
        'config-region',
      );
    });
  });
  it.each([
    ['huggingface:text-generation:fixture-model', 'HF_TOKEN', 'HF_API_TOKEN'],
    ['google:live:gemini-fixture', 'GOOGLE_API_KEY', 'GEMINI_API_KEY'],
    ['google:gemini-2.5-flash-image', 'GOOGLE_API_KEY', 'GEMINI_API_KEY'],
    ['google:image:imagen-4.0-generate-001', 'GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'],
  ])('the loader preserves higher-scope aliases for %s', async (id, suiteKey, providerKey) => {
    const suite = { [suiteKey]: 'suite-key' };
    const provider = await loadApiProvider(id, {
      env: suite,
      options: { env: { [providerKey]: 'provider-key' } },
    });
    await cliState.withEnv(suite, async () => {
      await Promise.resolve();
      expect(apiKey(provider)).toBe('provider-key');
    });
  });
  it('the loader preserves provider region aliases for SageMaker and Mantle', async () => {
    const sage = await loadApiProvider('sagemaker:llama:fixture-endpoint', {
      env: { AWS_REGION: 'us-east-1' },
      options: { env: { AWS_DEFAULT_REGION: 'us-west-2' } },
    });
    expect(Reflect.get(sage, 'getRegion').call(sage)).toBe('us-west-2');
    for (const id of ['bedrock:responses:openai.gpt-oss-120b', 'bedrock:mantle:openai.gpt-oss-120b']) {
      const mantle = await loadApiProvider(id, {
        env: { AWS_BEDROCK_REGION: 'us-east-1' },
        options: { config: { apiKey: 'synthetic-token' }, env: { AWS_DEFAULT_REGION: 'us-east-2' } },
      });
      expect(Reflect.get(mantle, 'getApiUrl').call(mantle)).toContain('us-east-2');
    }
  });
  it('keeps alias order within a scope, empty entries, and unrelated variables', () => {
    expect(
      mergeProviderEnv(
        'huggingface:text-generation:fixture',
        { HF_TOKEN: 'suite-key', OTHER: 'retained' },
        { HF_TOKEN: '', HF_API_TOKEN: undefined },
      ),
    ).toEqual({ HF_TOKEN: '', OTHER: 'retained' });
    expect(
      mergeProviderEnv(
        'huggingface:text-generation:fixture',
        { HF_TOKEN: 'suite-key', OTHER: 'retained' },
        { HF_TOKEN: 'primary', HF_API_TOKEN: 'secondary' },
      ),
    ).toEqual({ HF_TOKEN: 'primary', HF_API_TOKEN: 'secondary', OTHER: 'retained' });
    expect(
      mergeProviderEnv('echo', { HF_TOKEN: 'suite-key' }, { HF_API_TOKEN: 'provider-key' }),
    ).toEqual({ HF_TOKEN: 'suite-key', HF_API_TOKEN: 'provider-key' });
  });
});
