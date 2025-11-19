import {
  createDockerProvider,
  fetchLocalModels,
  hasLocalModel,
  parseProviderPath,
  DMRChatCompletionProvider,
  DMRCompletionProvider,
  DMREmbeddingProvider,
} from '../../src/providers/docker';
import { fetchWithCache } from '../../src/cache';
import logger from '../../src/logger';

jest.mock('../../src/cache');
jest.mock('../../src/logger');

describe('docker model runner provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchLocalModels', () => {
    it('should throw a helpful error if cannot connect to DMR endpoint', async () => {
      jest.mocked(fetchWithCache).mockRejectedValue(new Error('some error'));

      await expect(fetchLocalModels('http://localhost:12434/engines/v1')).rejects.toThrow(
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

      await expect(
        hasLocalModel('ai/model-a:tag-a', 'http://localhost:12434/engines/v1'),
      ).resolves.toBe(true);
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

      await expect(
        hasLocalModel('ai/model-a:tag-a', 'http://localhost:12434/engines/v1'),
      ).resolves.toBe(false);
    });
  });

  describe('createDockerProvider', () => {
    it('creates chat completion provider when type is chat', () => {
      const provider = createDockerProvider('docker:chat:model-name');
      expect(provider).toBeInstanceOf(DMRChatCompletionProvider);
    });

    it('creates completion provider when type is completion', () => {
      const provider = createDockerProvider('docker:completion:model-name');
      expect(provider).toBeInstanceOf(DMRCompletionProvider);
    });

    it('creates embedding provider when type is embedding', () => {
      const provider = createDockerProvider('docker:embedding:model-name');
      expect(provider).toBeInstanceOf(DMREmbeddingProvider);
    });

    it('defaults to chat provider when no type specified', () => {
      const provider = createDockerProvider('docker:model-name');
      expect(provider).toBeInstanceOf(DMRChatCompletionProvider);
    });

    it('uses custom environment variables when provided', () => {
      const provider = createDockerProvider('docker:model-name', {
        env: {
          DOCKER_MODEL_RUNNER_BASE_URL: 'http://custom:8080',
          DOCKER_MODEL_RUNNER_API_KEY: 'custom-key',
        },
      });
      expect(provider).toBeInstanceOf(DMRChatCompletionProvider);
      // The actual config verification is tested in the DMR Provider Classes tests
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

  describe('DMR Provider Classes', () => {
    beforeEach(() => {
      // Clear mocks
      jest.clearAllMocks();
    });

    describe('DMRChatCompletionProvider', () => {
      it('warns when model is not found but continues execution', async () => {
        // First call is for model check, second is for actual API call
        jest
          .mocked(fetchWithCache)
          .mockResolvedValueOnce({
            data: { data: [] }, // No models found
            cached: false,
            status: 200,
            statusText: 'OK',
          })
          .mockResolvedValueOnce({
            data: {
              choices: [{ message: { content: 'test output' } }],
              usage: { total_tokens: 10 },
            },
            cached: false,
            status: 200,
            statusText: 'OK',
          });

        const provider = createDockerProvider('docker:chat:ai/missing-model');

        const result = await (provider as DMRChatCompletionProvider).callApi('test prompt');

        expect(fetchWithCache).toHaveBeenCalledWith(
          'http://localhost:12434/engines/v1/models',
          undefined,
          undefined,
          'json',
          true,
          0,
        );
        expect(logger.warn).toHaveBeenCalledWith(
          "Model 'ai/missing-model' not found. Run 'docker model pull ai/missing-model'.",
        );
        expect(result.output).toBe('test output');
      });

      it('does not warn when model exists', async () => {
        jest
          .mocked(fetchWithCache)
          .mockResolvedValueOnce({
            data: { data: [{ id: 'ai/existing-model' }] }, // Model exists
            cached: false,
            status: 200,
            statusText: 'OK',
          })
          .mockResolvedValueOnce({
            data: {
              choices: [{ message: { content: 'test output' } }],
              usage: { total_tokens: 10 },
            },
            cached: false,
            status: 200,
            statusText: 'OK',
          });

        const provider = createDockerProvider('docker:chat:ai/existing-model');

        await (provider as DMRChatCompletionProvider).callApi('test prompt');

        expect(logger.warn).not.toHaveBeenCalled();
      });
    });

    describe('DMRCompletionProvider', () => {
      it('warns when model is not found but continues execution', async () => {
        jest
          .mocked(fetchWithCache)
          .mockResolvedValueOnce({
            data: { data: [] }, // No models found
            cached: false,
            status: 200,
            statusText: 'OK',
          })
          .mockResolvedValueOnce({
            data: {
              choices: [{ text: 'test output' }],
              usage: { total_tokens: 10 },
            },
            cached: false,
            status: 200,
            statusText: 'OK',
          });

        const provider = createDockerProvider('docker:completion:ai/missing-model');

        const result = await (provider as DMRCompletionProvider).callApi('test prompt');

        expect(logger.warn).toHaveBeenCalledWith(
          "Model 'ai/missing-model' not found. Run 'docker model pull ai/missing-model'.",
        );
        expect(result.output).toBe('test output');
      });
    });

    describe('DMREmbeddingProvider', () => {
      it('warns when model is not found but continues execution', async () => {
        jest
          .mocked(fetchWithCache)
          .mockResolvedValueOnce({
            data: { data: [] }, // No models found
            cached: false,
            status: 200,
            statusText: 'OK',
          })
          .mockResolvedValueOnce({
            data: {
              data: [{ embedding: [0.1, 0.2, 0.3] }],
              usage: { total_tokens: 10 },
            },
            cached: false,
            status: 200,
            statusText: 'OK',
          });

        const provider = createDockerProvider('docker:embedding:ai/missing-embedding-model');

        const result = await (provider as DMREmbeddingProvider).callEmbeddingApi('test text');

        expect(logger.warn).toHaveBeenCalledWith(
          "Model 'ai/missing-embedding-model' not found. Run 'docker model pull ai/missing-embedding-model'.",
        );
        expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
      });
    });
  });
});
