import { afterEach, describe, expect, it, vi } from 'vitest';
import { GroqProvider } from '../../src/providers/groq/chat';
import { getProviderRequestTemplates, loadApiProvider } from '../../src/providers/index';
import { LiteLLMProvider } from '../../src/providers/litellm';

import type { ApiProvider, CallApiContextParams, ProviderOptions } from '../../src/types/index';

const endpoint = 'http://127.0.0.1:12345';
const providerConfig = {
  apiBaseUrl: endpoint,
  apiKey: 'synthetic-key',
  accountId: 'synthetic-account',
  gatewayId: 'synthetic-gateway',
  gatewayUrl: endpoint,
  workspaceUrl: endpoint,
  portkeyApiBaseUrl: endpoint,
  auth_token: 'synthetic-token',
  gateway_url: endpoint,
};
const direct = { metadata: { http: { status: 200, statusText: 'OK', redirected: false } } };
const providerCases = [
  ['abliteration:fixture-model', 'AbliterationProvider', 'chat'],
  ['alibaba:chat:qwen3.8-max', 'AlibabaChatCompletionProvider', 'chat'],
  ['atlascloud:fixture-model', 'AtlasCloudProvider', 'chat'],
  ['cerebras:fixture-model', 'CerebrasProvider', 'chat'],
  ['cloudera:fixture-model', 'ClouderaAiChatCompletionProvider', 'chat'],
  ['cloudflare-ai:chat:fixture-model', 'CloudflareAiChatCompletionProvider', 'chat'],
  ['cloudflare-ai:completion:fixture-model', 'CloudflareAiCompletionProvider', 'completion'],
  ['cloudflare-gateway:openai:fixture-model', 'CloudflareGatewayOpenAiProvider', 'chat'],
  ['databricks:fixture-model', 'DatabricksMosaicAiChatCompletionProvider', 'chat'],
  ['deepseek:fixture-model', 'DeepSeekProvider', 'chat'],
  ['docker:chat:fixture-model', 'DMRChatCompletionProvider', 'chat'],
  ['docker:completion:fixture-model', 'DMRCompletionProvider', 'completion'],
  ['helicone:fixture-model', 'HeliconeGatewayProvider', 'chat'],
  ['huggingface:chat:fixture-model', 'HuggingfaceChatCompletionProvider', 'chat'],
  ['jfrog:fixture-model', 'JfrogMlChatCompletionProvider', 'chat'],
  ['litellm:completion:fixture-model', 'LiteLLMCompletionProvider', 'completion'],
  ['litellm:fixture-model', 'LiteLLMProvider', 'chat'],
  ['llamaapi:fixture-model', 'LlamaApiProvider', 'chat'],
  ['meta:chat:fixture-model', 'MetaProvider', 'chat'],
  ['meta:responses:fixture-model', 'MetaResponsesProvider', 'responses'],
  ['minimax:MiniMax-M3', 'MiniMaxProvider', 'chat'],
  ['mlflow-gateway:chat:fixture-model', 'MlflowGatewayChatCompletionProvider', 'chat'],
  ['moonshot:kimi-k3', 'MoonshotProvider', 'chat'],
  ['novita:chat:fixture-model', 'NovitaChatCompletionProvider', 'chat'],
  ['novita:completion:fixture-model', 'NovitaCompletionProvider', 'completion'],
  ['orcarouter:fixture-model', 'OrcaRouterProvider', 'chat'],
  ['perplexity:sonar', 'PerplexityProvider', 'chat'],
  ['portkey:fixture-model', 'PortkeyChatCompletionProvider', 'chat'],
  ['truefoundry:fixture-model', 'TrueFoundryProvider', 'chat'],
  ['bedrock:mantle:google.gemma-4-31b-it', 'BedrockMantleChatProvider', 'chat'],
  ['bedrock:responses:openai.gpt-5.6-sol', 'BedrockOpenAiResponsesProvider', 'responses'],
  ['bedrock:responses:xai.grok-4.3', 'BedrockGrokResponsesProvider', 'responses'],
  ['bedrock:responses:openai.gpt-oss-120b', 'BedrockGptOssResponsesProvider', 'responses'],
  ['fireworks:fixture-model', 'FireworksProvider', 'chat'],
  ['groq:openai/gpt-oss-20b', 'GroqProvider', 'chat'],
  ['groq:responses:openai/gpt-oss-20b', 'GroqResponsesProvider', 'responses'],
  ['hyperbolic:fixture-model', 'HyperbolicProvider', 'chat'],
  ['nvidia:fixture-model', 'NvidiaProvider', 'chat'],
  ['openclaw:chat:fixture-agent', 'OpenClawChatProvider', 'chat'],
  ['openclaw:responses:fixture-agent', 'OpenClawResponsesProvider', 'responses'],
  ['xai:chat:grok-4.3', 'XAIProvider', 'chat'],
] as const;

const promptContext = (passthrough: unknown): CallApiContextParams => ({
  vars: {},
  prompt: { raw: '{{input}}', label: 'fixture', config: { passthrough } },
});
const classify = (provider: ApiProvider, context?: CallApiContextParams) =>
  getProviderRequestTemplates(provider, 'User-supplied text.', context, direct);

afterEach(() => vi.restoreAllMocks());

describe('built-in compatible request attribution', () => {
  it.each(providerCases)('qualifies concrete %s request behavior', async (id, className, kind) => {
    const provider = await loadApiProvider(id, { options: { config: { ...providerConfig } } });
    expect(Object.getPrototypeOf(provider).constructor.name).toBe(className);
    expect(classify(provider)).toEqual({
      forwardsPrompt: true,
      ...(kind === 'chat' ? { parsesPrompt: true } : {}),
    });
    const field = kind === 'chat' ? 'messages' : kind === 'responses' ? 'input' : 'prompt';
    for (const replacement of [undefined, null, []]) {
      provider.config!.passthrough = { [field]: replacement };
      expect(classify(provider).forwardsPrompt).toBe(false);
      expect(classify(provider, promptContext({})).forwardsPrompt).toBe(true);
    }
    provider.config!.passthrough = {};
    expect(classify(provider, promptContext({ [field]: [] })).forwardsPrompt).toBe(false);
    for (const redirected of [true, undefined]) {
      expect(
        getProviderRequestTemplates(provider, 'User-supplied text.', undefined, {
          prompt: 'User-supplied text.',
          cached: true,
          metadata: { http: { status: 200, statusText: 'OK', redirected } },
        }).forwardsPrompt,
      ).toBe(false);
    }
    expect(
      getProviderRequestTemplates(provider, 'User-supplied text.', undefined, {
        ...direct,
        cached: true,
      }).forwardsPrompt,
    ).toBe(true);
  });

  it.each(['cerebras:fixture-model', 'cloudflare-ai:chat:fixture-model'])(
    'checks the effective constructed passthrough for %s',
    async (id) => {
      const provider = await loadApiProvider(id, {
        options: {
          config: {
            ...providerConfig,
            messages: [{ role: 'user', content: 'Fixed replacement.' }],
          },
        },
      });
      expect(provider.config!.passthrough.messages).toEqual([
        { role: 'user', content: 'Fixed replacement.' },
      ]);
      expect(classify(provider).forwardsPrompt).toBe(false);
      expect(classify(provider, promptContext({})).forwardsPrompt).toBe(true);
    },
  );

  it('checks promoted Cloudflare completion prompt replacements', async () => {
    const provider = await loadApiProvider('cloudflare-ai:completion:fixture-model', {
      options: { config: { ...providerConfig, prompt: 'Fixed replacement.' } },
    });
    expect(provider.config!.passthrough.prompt).toBe('Fixed replacement.');
    expect(classify(provider).forwardsPrompt).toBe(false);
    expect(classify(provider, promptContext({})).forwardsPrompt).toBe(true);
  });

  it.each(['groq:responses:openai/gpt-oss-20b', 'meta:responses:fixture-model'])(
    'retains Responses normalization exclusions for %s',
    async (id) => {
      const provider = await loadApiProvider(id, { options: { config: { ...providerConfig } } });
      const prompt = JSON.stringify([
        { role: 'user', content: [{ type: 'text', text: 'Supplied.' }] },
      ]);
      expect(
        getProviderRequestTemplates(provider, prompt, undefined, { ...direct, prompt })
          .forwardsPrompt,
      ).toBe(false);
    },
  );

  it.each(['Groq', 'LiteLLM'])(
    'does not inherit qualification into unknown %s subclasses',
    (kind) => {
      class UnknownGroq extends GroqProvider {}
      class UnknownLiteLLM extends LiteLLMProvider {}
      const options: ProviderOptions = { config: { ...providerConfig } };
      const provider =
        kind === 'Groq'
          ? new UnknownGroq('fixture-model', options)
          : new UnknownLiteLLM('fixture-model', options);
      expect(classify(provider)).toEqual({ forwardsPrompt: false });
      expect(
        getProviderRequestTemplates(provider, 'User-supplied text.', undefined, {
          ...direct,
          prompt: 'Different sent text.',
        }),
      ).toEqual({ forwardsPrompt: false });
      expect(
        getProviderRequestTemplates(provider, 'User-supplied text.', undefined, {
          ...direct,
          prompt: 'User-supplied text.',
        }),
      ).toEqual({ forwardsPrompt: true });
    },
  );

  it.each([
    'openrouter:fixture-model',
    'snowflake:fixture-model',
    'huggingface:text-generation:fixture-model',
  ])('keeps unqualified owned transport or conditional delegation conservative: %s', async (id) => {
    const provider = await loadApiProvider(id, {
      options: {
        config: {
          ...providerConfig,
          accountIdentifier: 'fixture-account',
          chatCompletion: true,
        },
      },
    });
    expect(classify(provider)).toEqual({ forwardsPrompt: false });
  });
});
