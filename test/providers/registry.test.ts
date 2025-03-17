import path from 'path';
import { providerMap } from '../../src/providers/registry';
import type { LoadApiProviderContext } from '../../src/types';
import type { ProviderOptions } from '../../src/types/providers';

jest.mock('../../src/providers/adaline.gateway', () => ({
  AdalineGatewayChatProvider: jest.fn().mockImplementation((providerName, modelName) => ({
    id: () => `adaline:${providerName}:chat:${modelName}`,
  })),
  AdalineGatewayEmbeddingProvider: jest.fn().mockImplementation((providerName, modelName) => ({
    id: () => `adaline:${providerName}:embedding:${modelName}`,
  })),
}));

jest.mock('../../src/providers/pythonCompletion', () => {
  return {
    PythonProvider: jest.fn().mockImplementation(() => ({
      id: () => 'python:script.py:default',
    })),
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
      jest.clearAllMocks();
    });

    it('should handle adaline provider paths correctly', async () => {
      const factory = providerMap.find((f) => f.test('adaline:openai:chat:gpt-4'));
      expect(factory).toBeDefined();

      const chatProvider = await factory!.create(
        'adaline:openai:chat:gpt-4',
        mockProviderOptions,
        mockContext,
      );
      expect(chatProvider.id()).toBe('adaline:openai:chat:gpt-4');

      const embeddingProvider = await factory!.create(
        'adaline:openai:embedding:text-embedding-3-large',
        mockProviderOptions,
        mockContext,
      );
      expect(embeddingProvider.id()).toBe('adaline:openai:embedding:text-embedding-3-large');

      await expect(
        factory!.create('adaline:invalid', mockProviderOptions, mockContext),
      ).rejects.toThrow('Invalid adaline provider path');
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

    it('should handle redteam providers correctly', async () => {
      const redteamPaths = [
        'promptfoo:redteam:best-of-n',
        'promptfoo:redteam:crescendo',
        'promptfoo:redteam:goat',
        'promptfoo:redteam:iterative',
        'promptfoo:redteam:iterative:image',
        'promptfoo:redteam:iterative:tree',
        'promptfoo:redteam:pandamonium',
      ];

      const redteamConfig = {
        ...mockProviderOptions,
        config: {
          ...mockProviderOptions.config,
          injectVar: 'test',
          maxRounds: 3,
          maxBacktracks: 2,
          redteamProvider: 'test-provider',
        },
      };

      for (const path of redteamPaths) {
        const factory = providerMap.find((f) => f.test(path));
        expect(factory).toBeDefined();

        const provider = await factory!.create(path, redteamConfig, mockContext);
        expect(provider).toBeDefined();
        expect(provider.id()).toEqual(path);
      }
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

      await expect(
        factory!.create('azure:invalid:model', mockProviderOptions, mockContext),
      ).rejects.toThrow('Unknown Azure model type');
    });

    it('should handle bedrock providers correctly', async () => {
      const factory = providerMap.find((f) => f.test('bedrock:completion:anthropic.claude-v2'));
      expect(factory).toBeDefined();

      const completionProvider = await factory!.create(
        'bedrock:completion:anthropic.claude-v2',
        mockProviderOptions,
        mockContext,
      );
      expect(completionProvider).toBeDefined();

      const embeddingProvider = await factory!.create(
        'bedrock:embedding:amazon.titan-embed-text-v1',
        mockProviderOptions,
        mockContext,
      );
      expect(embeddingProvider).toBeDefined();

      // Test backwards compatibility
      const legacyProvider = await factory!.create(
        'bedrock:anthropic.claude-v2',
        mockProviderOptions,
        mockContext,
      );
      expect(legacyProvider).toBeDefined();
    });

    it('should handle cloudflare-ai providers correctly', async () => {
      const factory = providerMap.find((f) =>
        f.test('cloudflare-ai:chat:@cf/meta/llama-2-7b-chat-fp16'),
      );
      expect(factory).toBeDefined();

      const chatProvider = await factory!.create(
        'cloudflare-ai:chat:@cf/meta/llama-2-7b-chat-fp16',
        mockProviderOptions,
        mockContext,
      );
      expect(chatProvider).toBeDefined();

      const embeddingProvider = await factory!.create(
        'cloudflare-ai:embedding:@cf/baai/bge-base-en-v1.5',
        mockProviderOptions,
        mockContext,
      );
      expect(embeddingProvider).toBeDefined();

      const completionProvider = await factory!.create(
        'cloudflare-ai:completion:@cf/meta/llama-2-7b-chat-fp16',
        mockProviderOptions,
        mockContext,
      );
      expect(completionProvider).toBeDefined();

      await expect(
        factory!.create('cloudflare-ai:invalid:model', mockProviderOptions, mockContext),
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
  });
});
