import { trace } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import logger from '../../src/logger';
import {
  createDockerProvider,
  DMRChatCompletionProvider,
  DMRCompletionProvider,
  DMREmbeddingProvider,
  fetchLocalModels,
  hasLocalModel,
  parseProviderPath,
} from '../../src/providers/docker';
import { createDeferred } from '../util/utils';
import { createMockFetchResponse } from './mockProviderResponses';
import { createAttributeRecordingSpan } from './openai/tracing';

const createCompletionResponse = () => ({
  choices: [{ message: { content: 'test output' } }],
  usage: { total_tokens: 10 },
});

vi.mock('../../src/cache');
vi.mock('../../src/logger');

describe('docker model runner provider', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchLocalModels', () => {
    it('should throw a helpful error if cannot connect to DMR endpoint', async () => {
      vi.mocked(fetchWithCache).mockRejectedValue(new Error('some error'));

      await expect(fetchLocalModels('http://localhost:12434/engines/v1')).rejects.toThrow(
        'Failed to connect to Docker Model Runner. Is it enabled? Are the API endpoints enabled? For details, see https://docs.docker.com/ai/model-runner. \nsome error',
      );
    });
  });

  describe('hasLocalModel', () => {
    it('returns true if the model exists', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue(
        createMockFetchResponse({
          data: [
            {
              id: 'ai/model-a:tag-a',
            },
            {
              id: 'ai/model-b:tag-b',
            },
          ],
        }),
      );

      await expect(
        hasLocalModel('ai/model-a:tag-a', 'http://localhost:12434/engines/v1'),
      ).resolves.toBe(true);
    });

    it('returns false if the model does not exists', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue(
        createMockFetchResponse({
          data: [
            {
              id: 'ai/model-x:tag-x',
            },
          ],
        }),
      );

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
      vi.clearAllMocks();
    });

    it.each([
      {
        providerType: 'chat',
        choices: [{ message: { content: 'test output' } }],
      },
      {
        providerType: 'completion',
        choices: [{ text: 'test output' }],
      },
    ])(
      'attributes $providerType spans to Docker independently of the configured provider ID',
      async ({ providerType, choices }) => {
        const attributes: Record<string, unknown> = {};
        const getTracer = vi.spyOn(trace, 'getTracer').mockReturnValue({
          startActiveSpan: createAttributeRecordingSpan(attributes),
        } as any);

        try {
          vi.mocked(fetchWithCache)
            .mockResolvedValueOnce(createMockFetchResponse({ data: [{ id: 'ai/existing-model' }] }))
            .mockResolvedValueOnce(
              createMockFetchResponse({
                choices,
                usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
              }),
            );

          const provider = createDockerProvider(`docker:${providerType}:ai/existing-model`, {
            id: 'customer:custom-label',
          });

          await provider.callApi('test prompt');

          expect(attributes).toMatchObject({
            'gen_ai.provider.name': 'docker',
            'promptfoo.provider.id': 'customer:custom-label',
          });
        } finally {
          getTracer.mockRestore();
        }
      },
    );

    describe('DMRChatCompletionProvider', () => {
      it.each(['docker:chat:ai/model', 'docker:completion:ai/model'])(
        'cancels %s during model discovery without dispatching inference',
        async (id) => {
          const controller = new AbortController();
          vi.mocked(fetchWithCache).mockImplementationOnce(async (_url, options) => {
            expect(options?.signal).toBe(controller.signal);
            controller.abort();
            return {
              data: { data: [{ id: 'ai/model' }] },
              cached: false,
              status: 200,
              statusText: 'OK',
            };
          });
          const provider = createDockerProvider(id) as DMRChatCompletionProvider;
          await expect(
            provider.callApi('fixture', undefined, { abortSignal: controller.signal }),
          ).rejects.toMatchObject({ name: 'AbortError' });
          expect(fetchWithCache).toHaveBeenCalledOnce();
        },
      );

      it('does not inspect models after cancellation', async () => {
        const provider = createDockerProvider('docker:chat:ai/model');

        await expect(
          (provider as DMRChatCompletionProvider).callApi('test prompt', undefined, {
            abortSignal: AbortSignal.abort(),
          }),
        ).rejects.toMatchObject({ name: 'AbortError' });

        expect(fetchWithCache).not.toHaveBeenCalled();
      });

      it('warns when model is not found but continues execution', async () => {
        // First call is for model check, second is for actual API call
        vi.mocked(fetchWithCache)
          .mockResolvedValueOnce({
            data: { data: [] }, // No models found
            cached: false,
            status: 200,
            statusText: 'OK',
          })
          .mockResolvedValueOnce(createMockFetchResponse(createCompletionResponse()));

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
        vi.mocked(fetchWithCache)
          .mockResolvedValueOnce({
            data: { data: [{ id: 'ai/existing-model' }] }, // Model exists
            cached: false,
            status: 200,
            statusText: 'OK',
          })
          .mockResolvedValueOnce(createMockFetchResponse(createCompletionResponse()));

        const provider = createDockerProvider('docker:chat:ai/existing-model');

        await (provider as DMRChatCompletionProvider).callApi('test prompt');

        expect(logger.warn).not.toHaveBeenCalled();
      });
    });

    describe('DMRCompletionProvider', () => {
      it('warns when model is not found but continues execution', async () => {
        vi.mocked(fetchWithCache)
          .mockResolvedValueOnce({
            data: { data: [] }, // No models found
            cached: false,
            status: 200,
            statusText: 'OK',
          })
          .mockResolvedValueOnce(
            createMockFetchResponse({
              choices: [{ text: 'test output' }],
              usage: { total_tokens: 10 },
            }),
          );

        const provider = createDockerProvider('docker:completion:ai/missing-model');

        const result = await (provider as DMRCompletionProvider).callApi('test prompt');

        expect(logger.warn).toHaveBeenCalledWith(
          "Model 'ai/missing-model' not found. Run 'docker model pull ai/missing-model'.",
        );
        expect(result.output).toBe('test output');
      });
    });

    describe('DMREmbeddingProvider', () => {
      it('does not probe models when embedding work is already aborted', async () => {
        const reason = new DOMException('Embedding cancelled', 'AbortError');
        const signal = AbortSignal.abort(reason);
        vi.mocked(fetchWithCache).mockRejectedValue(new Error('Unexpected model probe'));
        const provider = new DMREmbeddingProvider('ai/embedding', {
          config: { apiBaseUrl: 'http://localhost:12434/engines/v1', apiKey: 'dmr' },
        });

        await expect(
          provider.callEmbeddingApi('text', undefined, { abortSignal: signal }),
        ).rejects.toBe(reason);
        expect(fetchWithCache).not.toHaveBeenCalled();
      });

      it('cancels an in-flight embedding model probe without starting an embedding request', async () => {
        const controller = new AbortController();
        const reason = new DOMException('Embedding cancelled', 'AbortError');
        const started = createDeferred<void>();
        vi.mocked(fetchWithCache).mockImplementation((_url, options) => {
          started.resolve();
          const signal = options?.signal;
          if (!signal) {
            return Promise.reject(new Error('Missing probe signal'));
          }
          return new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
          });
        });
        const provider = new DMREmbeddingProvider('ai/embedding', {
          config: { apiBaseUrl: 'http://localhost:12434/engines/v1', apiKey: 'dmr' },
        });

        const request = provider.callEmbeddingApi('text', undefined, {
          abortSignal: controller.signal,
        });
        const cancelled = expect(request).rejects.toBe(reason);
        await started.promise;
        controller.abort(reason);
        await cancelled;
        expect(fetchWithCache).toHaveBeenCalledOnce();
        expect(logger.warn).not.toHaveBeenCalled();
      });

      it('warns when model is not found but continues execution', async () => {
        vi.mocked(fetchWithCache)
          .mockResolvedValueOnce({
            data: { data: [] }, // No models found
            cached: false,
            status: 200,
            statusText: 'OK',
          })
          .mockResolvedValueOnce(
            createMockFetchResponse({
              data: [{ embedding: [0.1, 0.2, 0.3] }],
              usage: { total_tokens: 10 },
            }),
          );

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
