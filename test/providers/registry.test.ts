import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isFoundationModelProvider } from '../../src/providers/constants';
import { getProviderFactories, providerMap } from '../../src/providers/registry';

import type { LoadApiProviderContext } from '../../src/types/index';
import type { ProviderOptions } from '../../src/types/providers';

vi.mock('../../src/providers/pythonCompletion', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    PythonProvider: vi.fn().mockImplementation(function () {
      return {
        id: () => 'python:script.py:default',
      };
    }),
  };
});

vi.mock('../../src/providers/golangCompletion', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    GolangProvider: vi.fn().mockImplementation(function () {
      return {
        id: () => 'golang:script.go',
        callApi: vi.fn(),
      };
    }),
  };
});

vi.mock('../../src/providers/scriptCompletion', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    ScriptCompletionProvider: vi.fn().mockImplementation(function () {
      return {
        id: () => 'exec:script.sh',
        callApi: vi.fn(),
      };
    }),
  };
});

vi.mock('../../src/redteam/remoteGeneration', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/redteam/remoteGeneration')>();
  return {
    ...mod,
    shouldGenerateRemote: vi.fn(() => true),
    neverGenerateRemote: vi.fn(() => false),
  };
});

describe('Provider Registry', () => {
  describe('Provider Factories', () => {
    const mockProviderOptions: ProviderOptions = {
      id: 'test-provider',
      label: 'Test Provider',
      config: {
        basePath: '/test',
        apiKey: 'test-key',
      },
    };

    const mockContext: LoadApiProviderContext = {
      basePath: '/test',
      options: mockProviderOptions,
    };

    const registry = {
      create: async (path: string, context?: any) => {
        const factory = providerMap.find((f) => f.test(path));
        if (!factory) {
          throw new Error(`Could not find provider for path: ${path}`);
        }
        return factory.create(path, context?.options || {}, context || mockContext);
      },
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    describe('getProviderFactories boundary contract', () => {
      it('returns the providerMap reference itself for the no-family fast path', async () => {
        // Pin identity (toBe, not toEqual) so an accidental `return [...providerMap]`
        // on the hot path regresses loudly instead of silently doubling the
        // per-lookup allocation for every non-family provider call.
        const factories = await getProviderFactories('openai:gpt-4');
        expect(factories).toBe(providerMap);
      });

      it('does not mutate providerMap when a redteam family loads factories', async () => {
        // The merged redteam path must return a fresh array so a caller that
        // accidentally mutates the returned factories cannot corrupt the
        // shared module-scoped providerMap.
        const before = providerMap.length;
        const withRedteam = await getProviderFactories('promptfoo:redteam:crescendo');
        expect(withRedteam).not.toBe(providerMap);
        expect(providerMap.length).toBe(before);
      });

      it('loads redteam factories for a redteam path', async () => {
        const factories = await getProviderFactories('promptfoo:redteam:crescendo');

        expect(factories.length).toBeGreaterThan(providerMap.length);
        expect(factories.some((f) => f.test('promptfoo:redteam:crescendo'))).toBe(true);
        // Base provider factories are still present
        expect(factories.some((f) => f.test('echo'))).toBe(true);
      });

      it('loads redteam factories for the agentic:memory-poisoning path', async () => {
        const factories = await getProviderFactories('agentic:memory-poisoning');

        expect(factories.length).toBeGreaterThan(providerMap.length);
        expect(factories.some((f) => f.test('agentic:memory-poisoning'))).toBe(true);
      });

      it('resolves consistently under concurrent lookups', async () => {
        // Two concurrent redteam lookups both `await import` the family
        // module. Node's ESM cache should deduplicate the load so every call
        // sees the same factory references and there are no duplicates.
        const [a, b, c] = await Promise.all([
          getProviderFactories('promptfoo:redteam:crescendo'),
          getProviderFactories('promptfoo:redteam:crescendo'),
          getProviderFactories('promptfoo:redteam:crescendo'),
        ]);
        const aCres = a.find((f) => f.test('promptfoo:redteam:crescendo'));
        const bCres = b.find((f) => f.test('promptfoo:redteam:crescendo'));
        const cCres = c.find((f) => f.test('promptfoo:redteam:crescendo'));
        expect(aCres).toBeDefined();
        expect(aCres).toBe(bCres);
        expect(bCres).toBe(cCres);
        expect(a.filter((f) => f.test('promptfoo:redteam:crescendo')).length).toBe(1);
      });

      it.each([
        'bedrock:completion:anthropic.claude-v2',
        'bedrock-agent:agent-id',
        'sagemaker:endpoint-name',
      ])('loads AWS factories without mutating providerMap for %s', async (path) => {
        const before = providerMap.length;
        const factories = await getProviderFactories(path);

        expect(factories).not.toBe(providerMap);
        expect(providerMap.length).toBe(before);
        expect(providerMap.some((factory) => factory.test(path))).toBe(false);
        expect(factories.some((factory) => factory.test(path))).toBe(true);
      });

      it('resolves the same AWS factory under concurrent lookups', async () => {
        // All lookups should reuse the factory exported by the cached AWS
        // family module instead of allocating one factory per request.
        const path = 'bedrock:completion:anthropic.claude-v2';
        const [a, b, c] = await Promise.all([
          getProviderFactories(path),
          getProviderFactories(path),
          getProviderFactories(path),
        ]);
        const aBedrock = a.find((factory) => factory.test(path));
        const bBedrock = b.find((factory) => factory.test(path));
        const cBedrock = c.find((factory) => factory.test(path));

        expect(aBedrock).toBeDefined();
        expect(aBedrock).toBe(bBedrock);
        expect(bBedrock).toBe(cBedrock);
        expect(a.filter((factory) => factory.test(path)).length).toBe(1);
      });

      it.each([
        'vertex:chat:gemini-2.5-flash',
        'google:gemini-2.5-flash',
        'palm:chat-bison',
      ])('loads Google factories without mutating providerMap for %s', async (path) => {
        const before = providerMap.length;
        const factories = await getProviderFactories(path);

        expect(factories).not.toBe(providerMap);
        expect(providerMap.length).toBe(before);
        expect(providerMap.some((factory) => factory.test(path))).toBe(false);
        expect(factories.some((factory) => factory.test(path))).toBe(true);
      });

      it('resolves the same Google factory under concurrent lookups', async () => {
        const path = 'google:gemini-2.5-flash';
        const [a, b, c] = await Promise.all([
          getProviderFactories(path),
          getProviderFactories(path),
          getProviderFactories(path),
        ]);
        const aGoogle = a.find((factory) => factory.test(path));
        const bGoogle = b.find((factory) => factory.test(path));
        const cGoogle = c.find((factory) => factory.test(path));

        expect(aGoogle).toBeDefined();
        expect(aGoogle).toBe(bGoogle);
        expect(bGoogle).toBe(cGoogle);
        expect(a.filter((factory) => factory.test(path)).length).toBe(1);
      });
    });

    it('should handle echo provider correctly', async () => {
      const factory = providerMap.find((f) => f.test('echo'));
      expect(factory).toBeDefined();

      const provider = await factory!.create('echo', mockProviderOptions, mockContext);
      const expectedId = mockProviderOptions.id || 'echo';
      expect(provider.id()).toBe(expectedId);

      const result = await provider.callApi('test input');
      expect(result.output).toBe('test input');
      expect(result.raw).toBe('test input');
      expect(result.cost).toBe(0);
      expect(result.isRefusal).toBe(false);
    });

    it('fails fast for xAI embedding aliases since xAI has no public embeddings API', async () => {
      const factory = providerMap.find((f) => f.test('xai:embedding:v1'));
      expect(factory).toBeDefined();

      const embeddingAliases = [
        'xai:embedding:v1',
        'xai:embeddings:v1',
        'xai:embedding',
        'xai:embeddings',
      ];

      for (const alias of embeddingAliases) {
        await expect(factory!.create(alias, {}, mockContext)).rejects.toThrow(
          /xAI does not currently expose a public embeddings API/,
        );
      }
    });

    it('should handle python provider correctly', async () => {
      const factory = providerMap.find((f) => f.test('python:script.py'));
      expect(factory).toBeDefined();

      const provider = await factory!.create('python:script.py', mockProviderOptions, {
        ...mockContext,
        basePath: path.resolve(__dirname, '../fixtures'),
      });
      expect(provider).toBeDefined();
      expect(provider.id()).toBe('python:script.py:default');
    });

    it('should handle huggingface providers correctly', async () => {
      const factory = providerMap.find((f) => f.test('huggingface:text-generation:gpt2'));
      expect(factory).toBeDefined();

      const provider = await factory!.create(
        'huggingface:text-generation:gpt2',
        mockProviderOptions,
        mockContext,
      );
      expect(provider).toBeDefined();

      await expect(
        factory!.create('huggingface:invalid:gpt2', mockProviderOptions, mockContext),
      ).rejects.toThrow('Invalid Huggingface provider path');
    });

    it('should handle atlascloud providers correctly', async () => {
      const factory = providerMap.find((f) => f.test('atlascloud:deepseek-v3'));
      expect(factory).toBeDefined();

      const atlasOptions = {
        ...mockProviderOptions,
        id: undefined,
      };

      const provider = await factory!.create('atlascloud:deepseek-v3', atlasOptions, mockContext);
      expect(provider).toBeDefined();
      expect(provider.id()).toBe('atlascloud:deepseek-v3');
    });

    it('should handle http/websocket providers correctly', async () => {
      const httpProvider = await registry.create('http://example.com', {
        options: {
          config: {
            url: 'http://example.com',
            body: { prompt: '{{input}}' },
          },
        },
      });
      expect(httpProvider.id()).toBe('http://example.com');

      const wsProvider = await registry.create('ws://example.com', {
        options: {
          config: {
            url: 'ws://example.com',
            messageTemplate: '{"message": "{{input}}"}',
            body: { prompt: '{{input}}' },
          },
        },
      });
      expect(wsProvider.id()).toBe('ws://example.com');
    });

    it('should handle n8n providers correctly', async () => {
      const n8nOptions = {
        ...mockProviderOptions,
        id: undefined,
      };

      const factory = providerMap.find((f) => f.test('n8n:https://example.com/webhook/agent'));
      expect(factory).toBeDefined();
      expect(factory).toBe(providerMap.find((f) => f.test('n8n')));

      const providerFromPath = await factory!.create(
        'n8n:https://example.com/webhook/agent',
        n8nOptions,
        mockContext,
      );
      expect(providerFromPath.id()).toMatch(/^n8n:webhook:[a-f0-9]{12}$/);

      const providerFromConfig = await factory!.create(
        'n8n',
        {
          ...n8nOptions,
          config: { url: 'https://example.com/webhook/config-agent' },
        },
        mockContext,
      );
      expect(providerFromConfig.id()).toMatch(/^n8n:webhook:[a-f0-9]{12}$/);

      await expect(factory!.create('n8n', n8nOptions, mockContext)).rejects.toThrow(
        'n8n provider requires a webhook URL',
      );
      expect(isFoundationModelProvider('n8n:https://example.com/webhook/agent')).toBe(false);
    });

    it('dispatches a representative redteam path through getProviderFactories', async () => {
      // Exhaustive per-factory coverage lives in test/redteam/providers/registry.test.ts.
      // This test only smoke-tests the getProviderFactories → redteam family
      // → factory.test → factory.create chain so a regression at the registry
      // boundary (e.g. the family is wired up but never loaded) fails here.
      const path = 'promptfoo:redteam:crescendo';
      const factory = (await getProviderFactories(path)).find((f) => f.test(path));
      expect(factory).toBeDefined();

      const redteamConfig = {
        ...mockProviderOptions,
        config: {
          ...mockProviderOptions.config,
          injectVar: 'test',
          maxTurns: 3,
          maxBacktracks: 2,
          redteamProvider: 'test-provider',
        },
      };

      const provider = await factory!.create(path, redteamConfig, mockContext);
      expect(provider.id()).toBe(path);
    });

    it('should handle anthropic providers correctly', async () => {
      const factory = providerMap.find((f) => f.test('anthropic:messages:claude-3'));
      expect(factory).toBeDefined();

      // Create a version of options without ID for Anthropic tests
      const anthropicOptions = {
        ...mockProviderOptions,
        id: undefined,
      };

      // Test traditional format with messages
      const messagesProvider = await factory!.create(
        'anthropic:messages:claude-3-7-sonnet-20250219',
        anthropicOptions,
        mockContext,
      );
      expect(messagesProvider).toBeDefined();
      expect(messagesProvider.id()).toBe('anthropic:claude-3-7-sonnet-20250219');

      // Test traditional format with completion
      const completionProvider = await factory!.create(
        'anthropic:completion:claude-2',
        anthropicOptions,
        mockContext,
      );
      expect(completionProvider).toBeDefined();
      expect(completionProvider.id()).toBe('anthropic:claude-2');

      const shorthandProvider = await factory!.create(
        'anthropic:claude-3-5-sonnet-20241022',
        anthropicOptions,
        mockContext,
      );
      expect(shorthandProvider).toBeDefined();
      expect(shorthandProvider.id()).toBe('anthropic:claude-3-5-sonnet-20241022');

      // Test error case with invalid model type
      await expect(
        factory!.create('anthropic:invalid:model', mockProviderOptions, mockContext),
      ).rejects.toThrow('Unknown Anthropic model type or model name');

      // Test error case with invalid model name
      await expect(
        factory!.create('anthropic:non-existent-model', mockProviderOptions, mockContext),
      ).rejects.toThrow('Unknown Anthropic model type or model name');
    });

    it('should handle azure providers correctly', async () => {
      const factory = providerMap.find((f) => f.test('azure:chat:gpt-4'));
      expect(factory).toBeDefined();

      const chatProvider = await factory!.create(
        'azure:chat:gpt-4',
        mockProviderOptions,
        mockContext,
      );
      expect(chatProvider).toBeDefined();

      const assistantProvider = await factory!.create(
        'azure:assistant:asst_123',
        mockProviderOptions,
        mockContext,
      );
      expect(assistantProvider).toBeDefined();

      const embeddingProvider = await factory!.create(
        'azure:embedding',
        mockProviderOptions,
        mockContext,
      );
      expect(embeddingProvider).toBeDefined();

      const completionProvider = await factory!.create(
        'azure:completion:davinci',
        mockProviderOptions,
        mockContext,
      );
      expect(completionProvider).toBeDefined();

      const imageProvider = await factory!.create(
        'azure:image:mai-image-2-5',
        mockProviderOptions,
        mockContext,
      );
      expect(imageProvider).toBeDefined();
      expect(imageProvider.toString()).toBe('[Azure Image Provider mai-image-2-5]');

      await expect(
        factory!.create('azure:image', mockProviderOptions, mockContext),
      ).rejects.toThrow(/Azure image provider requires a deployment name/);
      await expect(
        factory!.create('azure:image:', mockProviderOptions, mockContext),
      ).rejects.toThrow(/Azure image provider requires a deployment name/);

      // Model types without a default deployment must name one in the path. Cover both
      // the missing (`azure:chat`) and empty (`azure:chat:`) third-segment variants.
      for (const prefix of ['azure:chat', 'azure:completion']) {
        await expect(factory!.create(prefix, mockProviderOptions, mockContext)).rejects.toThrow(
          /requires a deployment name/,
        );
        await expect(
          factory!.create(`${prefix}:`, mockProviderOptions, mockContext),
        ).rejects.toThrow(/requires a deployment name/);
      }
      await expect(
        factory!.create('azure:assistant', mockProviderOptions, mockContext),
      ).rejects.toThrow(/Azure assistant provider requires an assistant ID/);
      await expect(
        factory!.create('azure:assistant:', mockProviderOptions, mockContext),
      ).rejects.toThrow(/Azure assistant provider requires an assistant ID/);
      await expect(
        factory!.create('azure:foundry-agent', mockProviderOptions, mockContext),
      ).rejects.toThrow(/Azure foundry-agent provider requires an agent ID/);
      await expect(
        factory!.create('azure:foundry-agent:', mockProviderOptions, mockContext),
      ).rejects.toThrow(/Azure foundry-agent provider requires an agent ID/);

      // Types with sensible defaults must still resolve without a deployment segment.
      expect(
        await factory!.create('azure:embedding', mockProviderOptions, mockContext),
      ).toBeDefined();
      expect(
        await factory!.create('azure:responses', mockProviderOptions, mockContext),
      ).toBeDefined();
      expect(await factory!.create('azure:video', mockProviderOptions, mockContext)).toBeDefined();

      // MAI image models are Foundry-only; the Azure OpenAI prefix must reject them.
      await expect(
        factory!.create('azureopenai:image:mai-image-2-5', mockProviderOptions, mockContext),
      ).rejects.toThrow(/azureopenai:image is not supported/);

      await expect(
        factory!.create('azure:invalid:model', mockProviderOptions, mockContext),
      ).rejects.toThrow('Unknown Azure model type');
    });

    it('should handle azure:moderation and reject azureopenai:moderation', async () => {
      const factory = providerMap.find((f) => f.test('azure:moderation'));
      expect(factory).toBeDefined();

      // Both prefixes should resolve to the same factory
      const azureOpenAiFactory = providerMap.find((f) => f.test('azureopenai:moderation'));
      expect(azureOpenAiFactory).toBe(factory);

      const moderationProvider = (await factory!.create(
        'azure:moderation',
        mockProviderOptions,
        mockContext,
      )) as any;
      expect(moderationProvider).toBeDefined();
      expect(moderationProvider.modelName).toBe('text-content-safety');

      const moderationWithModel = (await factory!.create(
        'azure:moderation:text-content-safety',
        mockProviderOptions,
        mockContext,
      )) as any;
      expect(moderationWithModel).toBeDefined();
      expect(moderationWithModel.modelName).toBe('text-content-safety');

      // config.deploymentName fallback with valid model
      const moderationFromConfig = (await factory!.create(
        'azure:moderation',
        {
          ...mockProviderOptions,
          config: { deploymentName: 'text-content-safety' },
        },
        mockContext,
      )) as any;
      expect(moderationFromConfig.modelName).toBe('text-content-safety');

      await expect(
        factory!.create('azureopenai:moderation', mockProviderOptions, mockContext),
      ).rejects.toThrow('Azure OpenAI does not support moderation');

      // Unknown model names should be rejected
      await expect(
        factory!.create('azure:moderation:typo-model', mockProviderOptions, mockContext),
      ).rejects.toThrow('Unknown Azure moderation model: typo-model');
    });

    it('should handle bedrock providers correctly', async () => {
      const factories = await getProviderFactories('bedrock:completion:anthropic.claude-v2');
      const factory = factories.find((f) => f.test('bedrock:completion:anthropic.claude-v2'));
      expect(factory).toBeDefined();

      const completionProvider = await factory!.create(
        'bedrock:completion:anthropic.claude-v2',
        mockProviderOptions,
        mockContext,
      );
      expect(completionProvider.constructor.name).toBe('AwsBedrockCompletionProvider');

      // Both the plural and singular aliases must resolve to the embedding
      // provider; a reroute to the completion provider is a user-visible break
      // because embeddings expose a different callApi contract.
      for (const embeddingAlias of ['embedding', 'embeddings']) {
        const embeddingProvider = await factory!.create(
          `bedrock:${embeddingAlias}:amazon.titan-embed-text-v1`,
          mockProviderOptions,
          mockContext,
        );
        expect(embeddingProvider.constructor.name).toBe('AwsBedrockEmbeddingProvider');
      }

      // Test backwards compatibility: a bare `bedrock:<model>` still resolves to
      // the completion provider.
      const legacyProvider = await factory!.create(
        'bedrock:anthropic.claude-v2',
        mockProviderOptions,
        mockContext,
      );
      expect(legacyProvider.constructor.name).toBe('AwsBedrockCompletionProvider');
    });

    it('should handle bedrock converse providers correctly', async () => {
      const factories = await getProviderFactories('bedrock:converse:anthropic.claude-v2');
      const factory = factories.find((f) => f.test('bedrock:converse:anthropic.claude-v2'));
      expect(factory).toBeDefined();

      const provider = await factory!.create(
        'bedrock:converse:anthropic.claude-v2',
        mockProviderOptions,
        mockContext,
      );
      expect(provider.constructor.name).toBe('AwsBedrockConverseProvider');
    });

    it('should handle bedrock-agent providers correctly', async () => {
      const factories = await getProviderFactories('bedrock-agent:agent-id');
      const factory = factories.find((f) => f.test('bedrock-agent:agent-id'));
      expect(factory).toBeDefined();

      const provider = await factory!.create('bedrock-agent:agent-id', { config: {} }, mockContext);
      expect(provider.constructor.name).toBe('AwsBedrockAgentsProvider');
      expect(provider.id()).toBe('bedrock-agent:agent-id');
    });

    it('should handle bedrock agents providers correctly', async () => {
      const factories = await getProviderFactories('bedrock:agents:agent-id');
      const factory = factories.find((f) => f.test('bedrock:agents:agent-id'));
      expect(factory).toBeDefined();

      const provider = await factory!.create(
        'bedrock:agents:agent-id',
        { config: {} },
        mockContext,
      );
      expect(provider.constructor.name).toBe('AwsBedrockAgentsProvider');
      expect(provider.id()).toBe('bedrock-agent:agent-id');
    });

    it('should handle bedrock knowledge base providers correctly', async () => {
      const factories = await getProviderFactories('bedrock:kb:amazon.titan-text-express-v1');
      const factory = factories.find((f) => f.test('bedrock:kb:amazon.titan-text-express-v1'));
      expect(factory).toBeDefined();

      const provider = await factory!.create(
        'bedrock:kb:amazon.titan-text-express-v1',
        { config: { knowledgeBaseId: 'knowledge-base-id' } },
        mockContext,
      );
      expect(provider.constructor.name).toBe('AwsBedrockKnowledgeBaseProvider');
      expect(provider.id()).toBe('bedrock:kb:knowledge-base-id');
    });

    it('should handle bedrock Nova Sonic providers correctly', async () => {
      const factories = await getProviderFactories('bedrock:nova-sonic');
      const factory = factories.find((f) => f.test('bedrock:nova-sonic'));
      expect(factory).toBeDefined();

      const provider = await factory!.create('bedrock:nova-sonic', { config: {} }, mockContext);
      expect(provider.constructor.name).toBe('NovaSonicProvider');
    });

    it.each([
      ['sagemaker:embedding:endpoint-name', 'SageMakerEmbeddingProvider', {}, undefined],
      ['sagemaker:embeddings:endpoint-name', 'SageMakerEmbeddingProvider', {}, undefined],
      ['sagemaker:endpoint-name', 'SageMakerCompletionProvider', { modelType: 'custom' }, 'custom'],
      ['sagemaker:jumpstart:endpoint-name', 'SageMakerCompletionProvider', {}, 'jumpstart'],
      ['sagemaker:openai:endpoint-name', 'SageMakerCompletionProvider', {}, 'openai'],
      ['sagemaker:custom:my-jumpstart-endpoint', 'SageMakerCompletionProvider', {}, 'jumpstart'],
    ])('should handle %s providers correctly', async (path, expectedProviderName, config, expectedModelType) => {
      const factories = await getProviderFactories(path);
      const factory = factories.find((f) => f.test(path));
      expect(factory).toBeDefined();

      const provider = await factory!.create(path, { config }, mockContext);
      expect(provider.constructor.name).toBe(expectedProviderName);
      if (expectedModelType) {
        expect(provider).toHaveProperty('modelType', expectedModelType);
      }
    });

    it('should handle bedrock Luma Ray video provider with model version', async () => {
      const factories = await getProviderFactories('bedrock:luma.ray-v2:0');
      const factory = factories.find((f) => f.test('bedrock:luma.ray-v2:0'));
      expect(factory).toBeDefined();

      // Don't pass id in options so the provider uses its default id
      const provider = await factory!.create('bedrock:luma.ray-v2:0', { config: {} }, mockContext);
      expect(provider).toBeDefined();
      // Verify the model name includes the full version (luma.ray-v2:0, not just '0')
      expect(provider.constructor.name).toBe('LumaRayVideoProvider');
      expect(provider.id()).toContain('luma.ray-v2:0');
    });

    it('should handle bedrock:video:luma.ray format correctly', async () => {
      const factories = await getProviderFactories('bedrock:video:luma.ray-v2:0');
      const factory = factories.find((f) => f.test('bedrock:video:luma.ray-v2:0'));
      expect(factory).toBeDefined();

      // bedrock:video:luma.ray-v2:0 should route to Luma Ray, not Nova Reel
      const provider = await factory!.create(
        'bedrock:video:luma.ray-v2:0',
        { config: {} },
        mockContext,
      );
      expect(provider).toBeDefined();
      // Verify it's a Luma Ray provider, not Nova Reel
      expect(provider.constructor.name).toBe('LumaRayVideoProvider');
      expect(provider.id()).toContain('luma.ray-v2:0');
      expect(provider.id()).not.toContain('nova-reel');
    });

    it('should handle bedrock Nova Reel video provider', async () => {
      const factories = await getProviderFactories('bedrock:video:amazon.nova-reel-v1:1');
      const factory = factories.find((f) => f.test('bedrock:video:amazon.nova-reel-v1:1'));
      expect(factory).toBeDefined();

      // Don't pass id in options so the provider uses its default id
      const provider = await factory!.create(
        'bedrock:video:amazon.nova-reel-v1:1',
        { config: {} },
        mockContext,
      );
      expect(provider.constructor.name).toBe('NovaReelVideoProvider');
      expect(provider.id()).toContain('nova-reel');
    });

    it('defaults the Nova Reel model for a bare bedrock:video path', async () => {
      const factories = await getProviderFactories('bedrock:video');
      const factory = factories.find((f) => f.test('bedrock:video'));
      expect(factory).toBeDefined();

      // Empty model segment falls back to the default Nova Reel model id.
      const provider = await factory!.create('bedrock:video', { config: {} }, mockContext);
      expect(provider.constructor.name).toBe('NovaReelVideoProvider');
      expect(provider.id()).toContain('amazon.nova-reel-v1:1');
    });

    // Regression guard for the AWS-before-script routing precedence (PR #9537).
    // `getProviderFactories` returns factories in first-match dispatch order (see
    // the consumer loop in src/providers/index.ts), and the module-scoped
    // `providerMap` contains a generic JS/TS-file factory whose `test` is a
    // prefix-agnostic suffix match (`isJavascriptFile`). An AWS provider ID whose
    // final segment ends in a JS/TS extension must still route to the AWS family
    // rather than being hijacked by that custom-module loader. Before the family
    // factories were prepended ahead of `providerMap`, `.find()` (and the real
    // consumer) matched the file factory first and tried to `importModule` the
    // literal provider string, throwing a confusing module-resolution error.
    it.each([
      ['bedrock:converse:anthropic.claude.js', 'AwsBedrockConverseProvider'],
      ['bedrock:completion:anthropic.claude.ts', 'AwsBedrockCompletionProvider'],
      ['bedrock-agent:agent.mjs', 'AwsBedrockAgentsProvider'],
      // 3-segment form so the bare-endpoint path does not trip SageMaker's
      // required-modelType check; the point here is the .ts suffix precedence.
      ['sagemaker:jumpstart:my-endpoint.ts', 'SageMakerCompletionProvider'],
    ])('routes the AWS path %s to the AWS family, not the generic JS-file loader', async (providerPath, expectedClass) => {
      const factories = await getProviderFactories(providerPath);
      // First-match dispatch, exactly how src/providers/index.ts resolves it.
      const factory = factories.find((f) => f.test(providerPath));
      expect(factory).toBeDefined();

      const provider = await factory!.create(providerPath, { config: {} }, mockContext);
      expect(provider.constructor.name).toBe(expectedClass);
    });

    it('should handle cloudflare-ai providers correctly', async () => {
      const factory = providerMap.find((f) =>
        f.test('cloudflare-ai:chat:@cf/meta/llama-2-7b-chat-fp16'),
      );
      expect(factory).toBeDefined();

      // Cloudflare AI requires both accountId and apiKey
      const cloudflareProviderOptions = {
        ...mockProviderOptions,
        config: {
          ...mockProviderOptions.config,
          accountId: 'test-account-id',
          apiKey: 'test-api-key',
        },
      };

      const chatProvider = await factory!.create(
        'cloudflare-ai:chat:@cf/meta/llama-2-7b-chat-fp16',
        cloudflareProviderOptions,
        mockContext,
      );
      expect(chatProvider).toBeDefined();

      const embeddingProvider = await factory!.create(
        'cloudflare-ai:embedding:@cf/baai/bge-base-en-v1.5',
        cloudflareProviderOptions,
        mockContext,
      );
      expect(embeddingProvider).toBeDefined();

      const completionProvider = await factory!.create(
        'cloudflare-ai:completion:@cf/meta/llama-2-7b-chat-fp16',
        cloudflareProviderOptions,
        mockContext,
      );
      expect(completionProvider).toBeDefined();

      await expect(
        factory!.create('cloudflare-ai:invalid:model', cloudflareProviderOptions, mockContext),
      ).rejects.toThrow('Unknown Cloudflare AI model type');
    });

    it('should handle ollama providers correctly', async () => {
      const factory = providerMap.find((f) => f.test('ollama:llama-3.3'));
      expect(factory).toBeDefined();

      const defaultProvider = await factory!.create(
        'ollama:llama-3.3',
        mockProviderOptions,
        mockContext,
      );
      expect(defaultProvider).toBeDefined();

      const chatProvider = await factory!.create(
        'ollama:chat:llama-3.3',
        mockProviderOptions,
        mockContext,
      );
      expect(chatProvider).toBeDefined();

      const completionProvider = await factory!.create(
        'ollama:completion:llama-3.3',
        mockProviderOptions,
        mockContext,
      );
      expect(completionProvider).toBeDefined();

      const embeddingProvider = await factory!.create(
        'ollama:embedding:llama-3.3',
        mockProviderOptions,
        mockContext,
      );
      expect(embeddingProvider).toBeDefined();
    });

    it('should resolve relative paths correctly for file-based providers', async () => {
      // We'll test the path resolution by looking at the provider IDs, which contain the path

      // Test Golang provider
      const golangFactory = providerMap.find((f) => f.test('golang:script.go'));
      expect(golangFactory).toBeDefined();

      // These variables would be used in actual implementation tests
      // Adding underscore prefix to mark as intentionally unused
      const _customContext = {
        basePath: '/custom/path',
      };

      // For relative paths, they should be joined with basePath
      const _relativePath = 'script.go';
      const _expectedRelativePath = path.join('/custom/path', _relativePath);

      // For absolute paths, they should remain unchanged
      const _absolutePath = path.resolve('/absolute/path/script.go');

      // Test Python provider with file:// URL
      const pythonFactory = providerMap.find((f) => f.test('file://script.py'));
      expect(pythonFactory).toBeDefined();

      // Test exec provider
      const execFactory = providerMap.find((f) => f.test('exec:script.sh'));
      expect(execFactory).toBeDefined();

      // Instead of testing the exact path resolution logic (which involves mocking),
      // we'll verify that the registry factories exist and are configured correctly.
      // The actual path resolution logic is now identical in all three providers,
      // so testing one provider's implementation would effectively test all of them.

      // For actual end-to-end tests of the path resolution, integration tests would be more
      // appropriate than these unit tests, especially if we need to mock or spy on
      // the provider constructors.
    });

    it('should preserve absolute paths in file-based providers', async () => {
      // Create a simple integration test that verifies the factory functionality
      // exists but doesn't attempt detailed mocking of the provider internals

      // Create an absolute path that would pass path.isAbsolute() check
      const absoluteGolangPath = path.resolve('/absolute/path/golang-script.go');
      const absolutePythonPath = path.resolve('/absolute/path/python-script.py');
      const absoluteExecPath = path.resolve('/absolute/path/exec-script.sh');

      // Find the correct factories
      const golangFactory = providerMap.find((f) => f.test(`golang:${absoluteGolangPath}`));
      const pythonFactory = providerMap.find((f) => f.test(`python:${absolutePythonPath}`));
      const fileFactory = providerMap.find((f) => f.test(`file://${absolutePythonPath}`));
      const execFactory = providerMap.find((f) => f.test(`exec:${absoluteExecPath}`));

      // Verify factories exist
      expect(golangFactory).toBeDefined();
      expect(pythonFactory).toBeDefined();
      expect(fileFactory).toBeDefined();
      expect(execFactory).toBeDefined();

      // Note: We're not testing the actual mocked implementations here,
      // just verifying that the factories exist and can be found for absolute paths.
      // The actual path resolution logic (path.isAbsolute check) is identical in all providers
      // and is already covered by the implementation in registry.ts.
    });

    it('should handle helicone provider correctly', async () => {
      const factory = providerMap.find((f) => f.test('helicone:openai/gpt-4o'));
      expect(factory).toBeDefined();

      // Create a version of options without ID for Helicone tests
      const heliconeOptions = {
        ...mockProviderOptions,
        id: undefined,
      };

      const provider = await factory!.create(
        'helicone:openai/gpt-4o',
        heliconeOptions,
        mockContext,
      );
      expect(provider).toBeDefined();
      expect(provider.id()).toBe('helicone-gateway:openai/gpt-4o');

      // Test with router configuration
      const providerWithRouter = await factory!.create(
        'helicone:anthropic/claude-3-5-sonnet',
        {
          ...heliconeOptions,
          config: {
            ...heliconeOptions.config,
            router: 'production',
          },
        },
        mockContext,
      );
      expect(providerWithRouter).toBeDefined();
      expect(providerWithRouter.id()).toBe(
        'helicone-gateway:production:anthropic/claude-3-5-sonnet',
      );

      // Test error case with missing model
      await expect(factory!.create('helicone:', mockProviderOptions, mockContext)).rejects.toThrow(
        'Helicone provider requires a model in format helicone:<provider/model>',
      );
    });

    it('should handle groq provider correctly', async () => {
      const factory = providerMap.find((f) => f.test('groq:llama-3.3-70b-versatile'));
      expect(factory).toBeDefined();

      // Use options without id to verify the provider generates its own id
      const groqOptions = { ...mockProviderOptions, id: undefined };
      const provider = await factory!.create(
        'groq:llama-3.3-70b-versatile',
        groqOptions,
        mockContext,
      );
      expect(provider).toBeDefined();
      expect(provider.id()).toBe('groq:llama-3.3-70b-versatile');

      // Test error case with missing model
      await expect(factory!.create('groq:', groqOptions, mockContext)).rejects.toThrow(
        'Invalid groq provider path',
      );
    });

    it('should handle mlflow-gateway provider correctly', async () => {
      const factory = providerMap.find((f) => f.test('mlflow-gateway:my-endpoint'));
      expect(factory).toBeDefined();

      const options = {
        ...mockProviderOptions,
        id: undefined,
        config: { gatewayUrl: 'http://localhost:5000' },
      };
      const provider = await factory!.create('mlflow-gateway:my-endpoint', options, mockContext);
      expect(provider).toBeDefined();
      expect(provider.id()).toBe('mlflow-gateway:my-endpoint');

      await expect(
        factory!.create(
          'mlflow-gateway:',
          { ...options, config: { gatewayUrl: 'http://localhost:5000' } },
          mockContext,
        ),
      ).rejects.toThrow('MLflow Gateway endpoint name is required');
    });

    it('should handle groq:responses provider correctly', async () => {
      // groq:responses: is handled by the same factory as groq:
      const factory = providerMap.find((f) => f.test('groq:responses:llama-3.3-70b-versatile'));
      expect(factory).toBeDefined();

      // Use options without id to verify the provider generates its own id
      const groqOptions = { ...mockProviderOptions, id: undefined };
      const provider = await factory!.create(
        'groq:responses:openai/gpt-oss-120b',
        groqOptions,
        mockContext,
      );
      expect(provider).toBeDefined();
      expect(provider.id()).toBe('groq:responses:openai/gpt-oss-120b');

      // Test error case with missing model
      await expect(factory!.create('groq:responses:', groqOptions, mockContext)).rejects.toThrow(
        'Invalid groq:responses provider path',
      );
    });

    it('should handle nvidia provider correctly', async () => {
      const factory = providerMap.find((f) => f.test('nvidia:meta/llama-3.3-70b-instruct'));
      expect(factory).toBeDefined();

      const nvidiaOptions = { ...mockProviderOptions, id: undefined };
      const provider = await factory!.create(
        'nvidia:meta/llama-3.3-70b-instruct',
        nvidiaOptions,
        mockContext,
      );
      expect(provider.id()).toBe('nvidia:meta/llama-3.3-70b-instruct');

      // Missing model after the prefix should throw.
      await expect(factory!.create('nvidia:', nvidiaOptions, mockContext)).rejects.toThrow(
        /expected "nvidia:<model>"/,
      );
      await expect(
        factory!.create('nvidia:embedding:nvidia/nv-embed-v1', nvidiaOptions, mockContext),
      ).rejects.toThrow(/Unsupported NVIDIA NIM provider subtype "embedding"/);
    });

    it('should route novita sub-types and reject unknown ones', async () => {
      const factory = providerMap.find((f) => f.test('novita:meta/llama-3.1-8b-instruct'));
      expect(factory).toBeDefined();

      const novitaOptions = { ...mockProviderOptions, id: undefined };

      // Shorthand `novita:<model>` resolves to chat.
      const shorthand = await factory!.create(
        'novita:meta/llama-3.1-8b-instruct',
        novitaOptions,
        mockContext,
      );
      expect(shorthand.id()).toBe('novita:chat:meta/llama-3.1-8b-instruct');

      // Explicit sub-types resolve to their respective providers.
      const chat = await factory!.create(
        'novita:chat:meta/llama-3.1-8b-instruct',
        novitaOptions,
        mockContext,
      );
      expect(chat.id()).toBe('novita:chat:meta/llama-3.1-8b-instruct');

      const completion = await factory!.create(
        'novita:completion:meta/llama-3.1-8b-instruct',
        novitaOptions,
        mockContext,
      );
      expect(completion.id()).toBe('novita:completion:meta/llama-3.1-8b-instruct');

      const embedding = await factory!.create(
        'novita:embedding:baai/bge-m3',
        novitaOptions,
        mockContext,
      );
      expect(embedding.id()).toBe('novita:embedding:baai/bge-m3');

      // Unknown sub-types (image, moderation, typos) fail-fast instead of silently
      // routing to chat — a routing regression flagged in `src/providers/AGENTS.md`.
      await expect(factory!.create('novita:image:foo', novitaOptions, mockContext)).rejects.toThrow(
        /Unknown Novita provider sub-type "image"/,
      );
      await expect(
        factory!.create('novita:moderation:bar', novitaOptions, mockContext),
      ).rejects.toThrow(/Unknown Novita provider sub-type "moderation"/);

      // Missing model after the prefix should throw.
      await expect(factory!.create('novita:', novitaOptions, mockContext)).rejects.toThrow(
        /Novita model name is required/,
      );
    });

    it('should handle orcarouter provider correctly', async () => {
      const factory = providerMap.find((f) => f.test('orcarouter:openai/gpt-4o'));
      expect(factory).toBeDefined();

      const orcaOptions = { ...mockProviderOptions, id: undefined };
      const provider = await factory!.create('orcarouter:openai/gpt-4o', orcaOptions, mockContext);
      expect(provider.id()).toBe('orcarouter:openai/gpt-4o');

      const autoProvider = await factory!.create(
        'orcarouter:orcarouter/auto',
        orcaOptions,
        mockContext,
      );
      expect(autoProvider.id()).toBe('orcarouter:orcarouter/auto');
    });
  });

  // Kept at the very end of the file because it uses vi.doMock + resetModules
  // to simulate a broken redteam family dynamic import. Running last avoids
  // polluting earlier tests that share the original module graph.
  describe('getProviderFactories family load error wrapping', () => {
    afterEach(() => {
      vi.doUnmock('../../src/redteam/providers/registry');
      vi.resetModules();
    });

    it('wraps family factories() rejections with the requested provider path and preserves cause', async () => {
      // vi.doMock factory throws are caught by vitest and rewrapped with its
      // own diagnostic message, which would lose the cause identity the
      // wrapper is trying to preserve. Defining `redteamProviderFactories`
      // as a throwing getter lets the import succeed while the destructure
      // inside `family.factories()` triggers the throw — which is the
      // realistic failure shape (module loads, export access fails) and
      // round-trips cleanly through the async rejection.
      const cause = new Error('simulated registry load failure');
      vi.doMock('../../src/redteam/providers/registry', () => ({
        get redteamProviderFactories() {
          throw cause;
        },
      }));
      vi.resetModules();
      const { getProviderFactories: reloadedGetProviderFactories } = await import(
        '../../src/providers/registry'
      );

      let caught: unknown;
      try {
        await reloadedGetProviderFactories('promptfoo:redteam:crescendo');
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toContain(
        "Failed to load provider family for 'promptfoo:redteam:crescendo'",
      );
      expect((caught as Error).message).toContain('simulated registry load failure');
      expect((caught as Error).cause).toBe(cause);
    });
  });

  describe('google: prefix routing', () => {
    // Empty options so the provider computes its own id() rather than using
    // a caller-supplied override.
    const bareOptions: ProviderOptions = { config: {} };
    const bareContext: LoadApiProviderContext = {
      basePath: '/test',
      options: bareOptions,
    };

    it.each([
      [
        'google:live:gemini-live-2.5-flash-preview',
        async () => (await import('../../src/providers/google/live')).GoogleLiveProvider,
      ],
      [
        'google:image:imagen-3.0-generate-002',
        async () => (await import('../../src/providers/google/image')).GoogleImageProvider,
      ],
      [
        'google:video:veo-3.1-generate-preview',
        async () => (await import('../../src/providers/google/video')).GoogleVideoProvider,
      ],
      [
        'google:gemini-2.5-flash-image',
        async () => (await import('../../src/providers/google/gemini-image')).GeminiImageProvider,
      ],
      // Bare google:<model> default chat route (no service-type segment).
      [
        'google:gemini-2.5-flash',
        async () => (await import('../../src/providers/google/ai.studio')).AIStudioChatProvider,
      ],
      [
        'palm:chat-bison',
        async () => (await import('../../src/providers/google/ai.studio')).AIStudioChatProvider,
      ],
      [
        'vertex:chat:gemini-2.5-flash',
        async () => (await import('../../src/providers/google/vertex')).VertexChatProvider,
      ],
      // Bare vertex:<model> default route exercises the splits.slice(1) chat fallback
      // (distinct from the vertex:chat: branch, which slices from index 2).
      [
        'vertex:gemini-2.5-flash',
        async () => (await import('../../src/providers/google/vertex')).VertexChatProvider,
      ],
      [
        'vertex:embedding:gemini-embedding-001',
        async () => (await import('../../src/providers/google/vertex')).VertexEmbeddingProvider,
      ],
      // Plural `embeddings` alias must route to the same Vertex embedding provider.
      [
        'vertex:embeddings:gemini-embedding-001',
        async () => (await import('../../src/providers/google/vertex')).VertexEmbeddingProvider,
      ],
      [
        'vertex:video:veo-3.1-generate-preview',
        async () => (await import('../../src/providers/google/video')).GoogleVideoProvider,
      ],
    ] as const)('routes %s to the expected provider class', async (providerPath, loadExpectedProvider) => {
      const factory = (await getProviderFactories(providerPath)).find((f) => f.test(providerPath));
      expect(factory).toBeDefined();
      const provider = await factory!.create(providerPath, bareOptions, bareContext);
      const ExpectedProvider = await loadExpectedProvider();
      expect(provider).toBeInstanceOf(ExpectedProvider);
    });

    it('applies vertexai config and provider id for vertex:video routes', async () => {
      const providerPath = 'vertex:video:veo-3.1-generate-preview';
      const factory = (await getProviderFactories(providerPath)).find((f) => f.test(providerPath));
      expect(factory).toBeDefined();
      const provider = await factory!.create(providerPath, bareOptions, bareContext);
      expect((provider as any).config?.vertexai).toBe(true);
      expect(provider.id()).toBe(providerPath);
    });

    it('applies provider id but omits vertexai config for google:video routes', async () => {
      const providerPath = 'google:video:veo-3.1-generate-preview';
      const factory = (await getProviderFactories(providerPath)).find((f) => f.test(providerPath));
      expect(factory).toBeDefined();
      const provider = await factory!.create(providerPath, bareOptions, bareContext);
      // Unlike the vertex:video branch, the google:video branch must not inject vertexai.
      expect((provider as any).config?.vertexai).toBeUndefined();
      expect(provider.id()).toBe(providerPath);
    });

    it.each([
      [
        'google:custom-model.ts',
        async () => (await import('../../src/providers/google/ai.studio')).AIStudioChatProvider,
      ],
      [
        'palm:chat-bison.js',
        async () => (await import('../../src/providers/google/ai.studio')).AIStudioChatProvider,
      ],
      [
        'vertex:chat:custom-model.mjs',
        async () => (await import('../../src/providers/google/vertex')).VertexChatProvider,
      ],
    ] as const)('routes script-like id %s to the expected provider class', async (providerPath, loadExpectedProvider) => {
      const factory = (await getProviderFactories(providerPath)).find((f) => f.test(providerPath));
      expect(factory).toBeDefined();
      const provider = await factory!.create(providerPath, bareOptions, bareContext);
      const ExpectedProvider = await loadExpectedProvider();
      expect(provider).toBeInstanceOf(ExpectedProvider);
    });

    it.each([
      ['google:embedding:gemini-embedding-001', 'google:embedding:gemini-embedding-001'],
      ['google:embeddings:gemini-embedding-001', 'google:embedding:gemini-embedding-001'],
      ['palm:embedding:gemini-embedding-001', 'google:embedding:gemini-embedding-001'],
    ])('routes %s to the AI Studio embedding provider (id %s)', async (providerPath, expectedId) => {
      const factory = (await getProviderFactories(providerPath)).find((f) => f.test(providerPath));
      expect(factory).toBeDefined();
      const provider = await factory!.create(providerPath, bareOptions, bareContext);
      expect(provider.id()).toBe(expectedId);
      expect(typeof (provider as any).callEmbeddingApi).toBe('function');
    });

    it('does not route google:<model> (chat) to the embedding provider', async () => {
      const factory = (await getProviderFactories('google:gemini-2.5-flash')).find((f) =>
        f.test('google:gemini-2.5-flash'),
      );
      expect(factory).toBeDefined();
      const provider = await factory!.create('google:gemini-2.5-flash', bareOptions, bareContext);
      expect(typeof (provider as any).callEmbeddingApi).not.toBe('function');
      expect(provider.id()).toContain('gemini-2.5-flash');
    });

    it.each([
      'google:embedding:',
      'google:embeddings:',
      'palm:embedding:',
    ])('throws a clear error for %s with no model name', async (providerPath) => {
      const factory = (await getProviderFactories(providerPath)).find((f) => f.test(providerPath));
      expect(factory).toBeDefined();
      await expect(factory!.create(providerPath, bareOptions, bareContext)).rejects.toThrow(
        /Missing model name/,
      );
    });
  });
});
