import { describe, expect, it } from 'vitest';
import { loadApiProvider } from '../../src/providers';
import { AbliterationProvider } from '../../src/providers/abliteration';
import { createAimlApiProvider } from '../../src/providers/aimlapi';
import { AlibabaChatCompletionProvider } from '../../src/providers/alibaba';
import { AtlasCloudProvider } from '../../src/providers/atlascloud';
import { createCerebrasProvider } from '../../src/providers/cerebras';
import { ClouderaAiChatCompletionProvider } from '../../src/providers/cloudera';
import { CloudflareAiChatCompletionProvider } from '../../src/providers/cloudflare-ai';
import { CloudflareGatewayOpenAiProvider } from '../../src/providers/cloudflare-gateway';
import { createCometApiProvider } from '../../src/providers/cometapi';
import { DatabricksMosaicAiChatCompletionProvider } from '../../src/providers/databricks';
import { createDockerProvider } from '../../src/providers/docker';
import { createEnvoyProvider } from '../../src/providers/envoy';
import { FireworksProvider } from '../../src/providers/fireworks/chat';
import { DefaultGitHubGradingProvider } from '../../src/providers/github/defaults';
import { HeliconeGatewayProvider } from '../../src/providers/helicone';
import { HuggingfaceChatCompletionProvider } from '../../src/providers/huggingface';
import { HyperbolicProvider } from '../../src/providers/hyperbolic/chat';
import { JfrogMlChatCompletionProvider } from '../../src/providers/jfrog';
import { createLiteLLMProvider } from '../../src/providers/litellm';
import { LlamaApiProvider } from '../../src/providers/llamaApi';
import { createMiniMaxProvider } from '../../src/providers/minimax';
import { MlflowGatewayChatCompletionProvider } from '../../src/providers/mlflow-gateway';
import { createNovitaProvider } from '../../src/providers/novita';
import { createNscaleProvider } from '../../src/providers/nscale';
import { NvidiaProvider } from '../../src/providers/nvidia/chat';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { OpenClawChatProvider } from '../../src/providers/openclaw/chat';
import { OpenClawResponsesProvider } from '../../src/providers/openclaw/responses';
import { OrcaRouterProvider } from '../../src/providers/orcarouter';
import { PortkeyChatCompletionProvider } from '../../src/providers/portkey';
import { createTogetherAiProvider } from '../../src/providers/togetherai';
import { TrueFoundryProvider } from '../../src/providers/truefoundry';

function getProviderIdentity(provider: unknown): string {
  const underlying = (provider as { provider?: unknown }).provider ?? provider;
  return (underlying as { getGenAIProviderName(): string }).getGenAIProviderName();
}

describe('OpenAI-compatible provider telemetry identity', () => {
  it('uses each known adapter identity instead of the OpenAI protocol identity', () => {
    const providers = [
      [new AbliterationProvider('model'), 'abliteration'],
      [new AlibabaChatCompletionProvider('model'), 'alibaba'],
      [new AtlasCloudProvider('model'), 'atlascloud'],
      [createCerebrasProvider('cerebras:model'), 'cerebras'],
      [
        new ClouderaAiChatCompletionProvider('model', {
          config: { domain: 'example.com' },
        }),
        'cloudera',
      ],
      [
        new CloudflareAiChatCompletionProvider('model', {
          config: { apiBaseUrl: 'https://workers.example.com/v1', apiKey: 'test-key' },
        }),
        'cloudflare-ai',
      ],
      [
        new CloudflareGatewayOpenAiProvider('groq', 'model', {
          config: {
            accountId: 'account',
            gatewayId: 'gateway',
            apiKey: 'test-key',
          },
        }),
        'groq',
      ],
      [
        new DatabricksMosaicAiChatCompletionProvider('model', {
          config: { workspaceUrl: 'https://workspace.example.com' },
        }),
        'databricks',
      ],
      [createDockerProvider('docker:chat:model'), 'docker-model-runner'],
      [new FireworksProvider('model', {}), 'fireworks'],
      [new HeliconeGatewayProvider('model'), 'helicone'],
      [new HuggingfaceChatCompletionProvider('model'), 'huggingface'],
      [new HyperbolicProvider('model', {}), 'hyperbolic'],
      [new JfrogMlChatCompletionProvider('model', { config: {} }), 'jfrog'],
      [new LlamaApiProvider('model'), 'llama-api'],
      [createMiniMaxProvider('minimax:model'), 'minimax'],
      [
        new MlflowGatewayChatCompletionProvider('model', {
          config: { gatewayUrl: 'http://localhost:5000' },
        }),
        'mlflow-gateway',
      ],
      [createNovitaProvider('novita:chat:model'), 'novita'],
      [new NvidiaProvider('model', {}), 'nvidia'],
      [
        new OpenClawChatProvider('main', {
          config: { gateway_url: 'http://localhost:18789' },
        }),
        'openclaw',
      ],
      [
        new OpenClawResponsesProvider('main', {
          config: { gateway_url: 'http://localhost:18789' },
        }),
        'openclaw',
      ],
      [new OrcaRouterProvider('model', {}), 'orcarouter'],
      [new PortkeyChatCompletionProvider('model', { config: {} }), 'portkey'],
      [new TrueFoundryProvider('model'), 'truefoundry'],
      [createAimlApiProvider('aimlapi:chat:model'), 'aimlapi'],
      [createCometApiProvider('cometapi:chat:model'), 'cometapi'],
      [
        createEnvoyProvider('envoy:model', {
          config: { config: { apiBaseUrl: 'https://envoy.example.com/v1' } },
        }),
        'envoy',
      ],
      [createLiteLLMProvider('litellm:chat:model'), 'litellm'],
      [createNscaleProvider('nscale:chat:model'), 'nscale'],
      [createTogetherAiProvider('togetherai:chat:model'), 'togetherai'],
      [DefaultGitHubGradingProvider, 'github'],
    ] as const;

    for (const [provider, expected] of providers) {
      expect(getProviderIdentity(provider)).toBe(expected);
    }
  });

  it('keeps the configured identity independent from user-overridable provider IDs', () => {
    const provider = new OpenAiChatCompletionProvider('model', {
      id: 'user-defined-label',
      genAIProviderName: 'fixed-backend',
    });

    expect(provider.id()).toBe('user-defined-label');
    expect(getProviderIdentity(provider)).toBe('fixed-backend');
  });

  it('configures the registry-backed F5 adapter identity', async () => {
    const provider = await loadApiProvider('f5:model', {
      options: { config: { apiBaseUrl: 'https://f5.example.com' } },
    });

    expect(getProviderIdentity(provider)).toBe('f5');
  });

  it('keeps OpenAI as the default identity', () => {
    expect(getProviderIdentity(new OpenAiChatCompletionProvider('gpt-4o'))).toBe('openai');
  });
});
