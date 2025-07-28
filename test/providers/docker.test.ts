import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { OpenAiCompletionProvider } from '../../src/providers/openai/completion';
import { OpenAiEmbeddingProvider } from '../../src/providers/openai/embedding';
import {
  createDockerProvider,
  fetchLocalModels,
  hasLocalModel,
  parseProviderPath,
} from '../../src/providers/docker';
import { fetchWithCache } from '../../src/cache';

jest.mock('../../src/providers/openai');
jest.mock('../../src/cache');

describe('docker model runner provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchLocalModels', () => {
    it('should throw a helpful error if cannot connect to DMR endpoint', async () => {
      jest.mocked(fetchWithCache).mockRejectedValue(new Error('some error'));

      await expect(fetchLocalModels('http://localhost:1234/')).rejects.toThrow(
        'Failed to connect to Docker Model Runner. Is it enabled? Are the API endpoints enabled? For details, see https://docs.docker.com/ai/model-runner.',
      );
    });
  });

  describe('hasLocalModel', () => {
    it('returns true if the model exists', async () => {
      jest.mocked(fetchWithCache).mockResolvedValue({
        data: {
          data: [
            {
              id: 'ai/model-a:tag-a',
            },
            {
              id: 'ai/model-b:tag-b',
            },
          ],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      await expect(hasLocalModel('ai/model-a:tag-a', 'http://localhost:1234/')).resolves.toBe(true);
    });

    it('returns false if the model does not exists', async () => {
      jest.mocked(fetchWithCache).mockResolvedValue({
        data: {
          data: [
            {
              id: 'ai/model-x:tag-x',
            },
          ],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      await expect(hasLocalModel('ai/model-a:tag-a', 'http://localhost:1234/')).resolves.toBe(
        false,
      );
    });
  });

  describe('createDockerProvider', () => {
    it('creates chat completion provider when type is chat', () => {
      const provider = createDockerProvider('docker:chat:model-name');
      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('model-name', expect.any(Object));
    });

    it('creates completion provider when type is completion', () => {
      const provider = createDockerProvider('docker:completion:model-name');
      expect(provider).toBeInstanceOf(OpenAiCompletionProvider);
      expect(OpenAiCompletionProvider).toHaveBeenCalledWith('model-name', expect.any(Object));
    });

    it('creates embedding provider when type is embedding', () => {
      const provider = createDockerProvider('docker:embedding:model-name');
      expect(provider).toBeInstanceOf(OpenAiEmbeddingProvider);
      expect(OpenAiEmbeddingProvider).toHaveBeenCalledWith('model-name', expect.any(Object));
    });

    it('defaults to chat provider when no type specified', () => {
      const provider = createDockerProvider('docker:model-name');
      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(OpenAiChatCompletionProvider).toHaveBeenCalledWith('model-name', expect.any(Object));
    });
  });

  describe('parseProviderPath', () => {
    it('parses docker provider path for chat', () => {
      const { type, model } = parseProviderPath('docker:chat:ai/model:tag');
      expect(type).toBe('chat');
      expect(model).toBe('ai/model:tag');
    });

    it('parses docker provider path for completion', () => {
      const { type, model } = parseProviderPath('docker:completion:ai/model:tag');
      expect(type).toBe('completion');
      expect(model).toBe('ai/model:tag');
    });

    it('parses docker provider path for embeddings', () => {
      const { type, model } = parseProviderPath('docker:embeddings:ai/model:tag');
      expect(type).toBe('embeddings');
      expect(model).toBe('ai/model:tag');
    });

    it('parses docker provider path with no type to chat', () => {
      const { type, model } = parseProviderPath('docker:ai/model:tag');
      expect(type).toBe('chat');
      expect(model).toBe('ai/model:tag');
    });

    it('parses docker provider path with HF models', () => {
      const { type, model } = parseProviderPath(
        'docker:hf.co/unsloth/Qwen3-Coder-480B-A35B-Instruct-GGUF:Q4_K_M',
      );
      expect(type).toBe('chat');
      expect(model).toBe('hf.co/unsloth/Qwen3-Coder-480B-A35B-Instruct-GGUF:Q4_K_M');
    });
  });
});
