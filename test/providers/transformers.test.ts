import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the @huggingface/transformers module before importing the providers
vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn(),
}));

vi.mock('../../src/providers/transformersAvailability', () => ({
  loadTransformers: () => import('@huggingface/transformers'),
}));

// Mock the providerRegistry to prevent actual cleanup registration
vi.mock('../../src/providers/providerRegistry', () => ({
  providerRegistry: {
    register: vi.fn(),
    useResource: vi.fn(),
    throwIfResourceUseAborted: (signal?: AbortSignal) => signal?.throwIfAborted(),
  },
}));

import { providerRegistry } from '../../src/providers/providerRegistry';
import {
  disposePipelines,
  pipelineCache,
  TransformersEmbeddingProvider,
  TransformersTextGenerationProvider,
} from '../../src/providers/transformers';
import { createDeferred } from '../util/utils';

describe('TransformersEmbeddingProvider', () => {
  let mockPipeline: ReturnType<typeof vi.fn>;
  let mockExtractor: ReturnType<typeof vi.fn>;
  let mockDispose: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetAllMocks();

    // Clear pipeline cache between tests
    pipelineCache.clear();

    // Setup mock extractor that returns tensor-like object
    mockExtractor = vi.fn().mockResolvedValue({
      data: new Float32Array([0.1, 0.2, 0.3, 0.4]),
      dims: [1, 4],
    });

    mockDispose = vi.fn().mockResolvedValue(undefined);

    // Mock pipeline factory
    mockPipeline = vi
      .fn()
      .mockResolvedValue(Object.assign(mockExtractor, { dispose: mockDispose }));

    // Get the mocked module and set up the pipeline mock
    // Use 'as any' to avoid complex generic type resolution issues with the library's types
    const transformers = await import('@huggingface/transformers');
    vi.mocked(transformers.pipeline).mockImplementation(mockPipeline as any);
  });

  afterEach(async () => {
    await disposePipelines();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should construct with model name and default options', () => {
      const provider = new TransformersEmbeddingProvider('Xenova/all-MiniLM-L6-v2');
      expect(provider.modelName).toBe('Xenova/all-MiniLM-L6-v2');
      expect(provider.id()).toBe('transformers:feature-extraction:Xenova/all-MiniLM-L6-v2');
    });

    it('should use custom id when provided', () => {
      const provider = new TransformersEmbeddingProvider('model', { id: 'custom-id' });
      expect(provider.id()).toBe('custom-id');
    });

    it('should store config options', () => {
      const provider = new TransformersEmbeddingProvider('model', {
        config: { pooling: 'cls', normalize: false, prefix: 'query: ' },
      });
      expect(provider.config.pooling).toBe('cls');
      expect(provider.config.normalize).toBe(false);
      expect(provider.config.prefix).toBe('query: ');
    });

    it('should have correct toString', () => {
      const provider = new TransformersEmbeddingProvider('Xenova/all-MiniLM-L6-v2');
      expect(provider.toString()).toBe('[Transformers Embedding Provider Xenova/all-MiniLM-L6-v2]');
    });
  });

  describe('callApi', () => {
    it('should return error for callApi (text generation not supported)', async () => {
      const provider = new TransformersEmbeddingProvider('model');
      const result = await provider.callApi('test');

      expect(result.error).toContain('Cannot use an embedding provider for text generation');
    });
  });

  describe('callEmbeddingApi', () => {
    it('waits for a preceding shared pipeline shutdown before using the extractor', async () => {
      let release!: () => void;
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      vi.mocked(providerRegistry.useResource).mockReturnValue(pending);
      const provider = new TransformersEmbeddingProvider('model');
      const result = provider.callEmbeddingApi('test text');
      try {
        await Promise.resolve();
        expect(mockPipeline).not.toHaveBeenCalled();
        release();
        await expect(result).resolves.toMatchObject({ embedding: expect.any(Array) });
        expect(providerRegistry.useResource).toHaveBeenCalledOnce();
      } finally {
        release();
        await Promise.allSettled([result]);
      }
    });

    it('does not initialize or use the extractor after cancellation during shared shutdown', async () => {
      let release!: () => void;
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      vi.mocked(providerRegistry.useResource).mockReturnValue(pending);
      const provider = new TransformersEmbeddingProvider('model');
      const controller = new AbortController();
      const reason = new Error('embedding timed out');
      const result = provider.callEmbeddingApi('test text', { abortSignal: controller.signal });
      const rejected = expect(result).rejects.toBe(reason);
      try {
        expect(providerRegistry.useResource).toHaveBeenCalledWith(
          expect.any(Object),
          controller.signal,
        );
        controller.abort(reason);
        release();
        await rejected;
        expect(mockPipeline).not.toHaveBeenCalled();
        expect(mockExtractor).not.toHaveBeenCalled();
      } finally {
        release();
        await Promise.allSettled([result]);
      }
    });

    it('should call embedding API and return normalized embedding', async () => {
      const provider = new TransformersEmbeddingProvider('Xenova/all-MiniLM-L6-v2');
      const result = await provider.callEmbeddingApi('test text');

      expect(mockPipeline).toHaveBeenCalledWith(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
        expect.objectContaining({
          progress_callback: expect.any(Function),
        }),
      );

      expect(mockExtractor).toHaveBeenCalledWith('test text', {
        pooling: 'mean',
        normalize: true,
      });

      // Float32Array values have floating point precision differences
      expect(result.embedding).toHaveLength(4);
      expect(result.embedding![0]).toBeCloseTo(0.1, 5);
      expect(result.embedding![1]).toBeCloseTo(0.2, 5);
      expect(result.embedding![2]).toBeCloseTo(0.3, 5);
      expect(result.embedding![3]).toBeCloseTo(0.4, 5);
      expect(result.error).toBeUndefined();
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should apply prefix to input text', async () => {
      const provider = new TransformersEmbeddingProvider('BAAI/bge-small-en-v1.5', {
        config: { prefix: 'query: ' },
      });

      await provider.callEmbeddingApi('test text');

      expect(mockExtractor).toHaveBeenCalledWith('query: test text', expect.any(Object));
    });

    it('should use custom pooling options', async () => {
      const provider = new TransformersEmbeddingProvider('model', {
        config: { pooling: 'cls', normalize: false },
      });

      await provider.callEmbeddingApi('test');

      expect(mockExtractor).toHaveBeenCalledWith('test', {
        pooling: 'cls',
        normalize: false,
      });
    });

    it('should cache pipeline instances', async () => {
      const provider = new TransformersEmbeddingProvider('model');

      await provider.callEmbeddingApi('text 1');
      await provider.callEmbeddingApi('text 2');

      // Pipeline should only be created once
      expect(mockPipeline).toHaveBeenCalledTimes(1);
    });

    it('should return error when model is not found', async () => {
      mockPipeline.mockRejectedValue(new Error('Could not locate file for model'));

      const provider = new TransformersEmbeddingProvider('non-existent/model');
      const result = await provider.callEmbeddingApi('test');

      expect(result.error).toContain('Model not found');
      expect(result.error).toContain('non-existent/model');
    });

    it('should handle general errors', async () => {
      mockPipeline.mockRejectedValue(new Error('Some unexpected error'));

      const provider = new TransformersEmbeddingProvider('model');
      const result = await provider.callEmbeddingApi('test');

      expect(result.error).toContain('Transformers.js embedding error');
      expect(result.error).toContain('Some unexpected error');
    });
  });
});

describe('TransformersTextGenerationProvider', () => {
  let mockPipeline: ReturnType<typeof vi.fn>;
  let mockGenerator: ReturnType<typeof vi.fn>;
  let mockDispose: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetAllMocks();

    // Clear pipeline cache between tests
    pipelineCache.clear();

    // Setup mock generator
    mockGenerator = vi.fn().mockResolvedValue([{ generated_text: 'Generated output' }]);
    mockDispose = vi.fn().mockResolvedValue(undefined);

    mockPipeline = vi
      .fn()
      .mockResolvedValue(Object.assign(mockGenerator, { dispose: mockDispose }));

    const transformers = await import('@huggingface/transformers');
    vi.mocked(transformers.pipeline).mockImplementation(mockPipeline as any);
  });

  afterEach(async () => {
    await disposePipelines();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should construct with model name and default options', () => {
      const provider = new TransformersTextGenerationProvider('Xenova/gpt2');
      expect(provider.modelName).toBe('Xenova/gpt2');
      expect(provider.id()).toBe('transformers:text-generation:Xenova/gpt2');
    });

    it('should use custom id when provided', () => {
      const provider = new TransformersTextGenerationProvider('model', { id: 'custom-id' });
      expect(provider.id()).toBe('custom-id');
    });

    it('should store config options', () => {
      const provider = new TransformersTextGenerationProvider('model', {
        config: { temperature: 0.7, maxNewTokens: 100 },
      });
      expect(provider.config.temperature).toBe(0.7);
      expect(provider.config.maxNewTokens).toBe(100);
    });

    it('should have correct toString', () => {
      const provider = new TransformersTextGenerationProvider('Xenova/gpt2');
      expect(provider.toString()).toBe('[Transformers Text Generation Provider Xenova/gpt2]');
    });
  });

  describe('callApi', () => {
    it('does not initialize or invoke text generation after cancellation during shared shutdown', async () => {
      let release!: () => void;
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      vi.mocked(providerRegistry.useResource).mockReturnValue(pending);
      const provider = new TransformersTextGenerationProvider('model');
      const controller = new AbortController();
      const reason = new Error('generation timed out');
      const result = provider.callApi('hello', undefined, { abortSignal: controller.signal });
      const rejected = expect(result).rejects.toBe(reason);
      try {
        expect(providerRegistry.useResource).toHaveBeenCalledWith(
          expect.any(Object),
          controller.signal,
        );
        controller.abort(reason);
        release();
        await rejected;
        expect(mockPipeline).not.toHaveBeenCalled();
        expect(mockGenerator).not.toHaveBeenCalled();
      } finally {
        release();
        await Promise.allSettled([result]);
      }
    });

    it('should generate text with default options', async () => {
      const provider = new TransformersTextGenerationProvider('Xenova/gpt2');
      const result = await provider.callApi('Hello');

      expect(mockPipeline).toHaveBeenCalledWith(
        'text-generation',
        'Xenova/gpt2',
        expect.objectContaining({
          progress_callback: expect.any(Function),
        }),
      );

      expect(mockGenerator).toHaveBeenCalledWith('Hello', {
        max_new_tokens: 256,
        return_full_text: false,
      });

      expect(result.output).toBe('Generated output');
      expect(result.error).toBeUndefined();
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should respect generation parameters', async () => {
      const provider = new TransformersTextGenerationProvider('model', {
        config: {
          temperature: 0.7,
          maxNewTokens: 100,
          topK: 40,
          topP: 0.9,
          doSample: true,
          repetitionPenalty: 1.2,
        },
      });

      await provider.callApi('test');

      expect(mockGenerator).toHaveBeenCalledWith('test', {
        max_new_tokens: 100,
        return_full_text: false,
        temperature: 0.7,
        top_k: 40,
        top_p: 0.9,
        do_sample: true,
        repetition_penalty: 1.2,
      });
    });

    it('should handle chat format output', async () => {
      mockGenerator.mockResolvedValue([
        {
          generated_text: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there!' },
          ],
        },
      ]);

      const provider = new TransformersTextGenerationProvider('model');
      const result = await provider.callApi('Hello');

      expect(result.output).toBe('Hi there!');
    });

    it('should cache pipeline instances', async () => {
      const provider = new TransformersTextGenerationProvider('model');

      await provider.callApi('prompt 1');
      await provider.callApi('prompt 2');

      expect(mockPipeline).toHaveBeenCalledTimes(1);
    });

    it('should handle empty output', async () => {
      mockGenerator.mockResolvedValue([{ generated_text: undefined }]);

      const provider = new TransformersTextGenerationProvider('model');
      const result = await provider.callApi('test');

      expect(result.error).toBe('No output generated');
    });

    it('should return error when model is not found', async () => {
      mockPipeline.mockRejectedValue(new Error('Could not locate file for model'));

      const provider = new TransformersTextGenerationProvider('non-existent/model');
      const result = await provider.callApi('test');

      expect(result.error).toContain('Model not found');
      expect(result.error).toContain('non-existent/model');
    });

    it('should handle general errors', async () => {
      mockPipeline.mockRejectedValue(new Error('Some unexpected error'));

      const provider = new TransformersTextGenerationProvider('model');
      const result = await provider.callApi('test');

      expect(result.error).toContain('Transformers.js generation error');
      expect(result.error).toContain('Some unexpected error');
    });
  });
});

describe('disposePipelines', () => {
  let mockPipeline: ReturnType<typeof vi.fn>;
  let mockDispose: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetAllMocks();
    pipelineCache.clear();

    mockDispose = vi.fn().mockResolvedValue(undefined);

    mockPipeline = vi.fn().mockResolvedValue(
      Object.assign(vi.fn().mockResolvedValue({ data: new Float32Array([0.1]), dims: [1] }), {
        dispose: mockDispose,
      }),
    );

    const transformers = await import('@huggingface/transformers');
    vi.mocked(transformers.pipeline).mockImplementation(mockPipeline as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should dispose all cached pipelines', async () => {
    const provider1 = new TransformersEmbeddingProvider('model1');
    const provider2 = new TransformersEmbeddingProvider('model2');

    await provider1.callEmbeddingApi('test');
    await provider2.callEmbeddingApi('test');

    expect(pipelineCache.size).toBe(2);

    await disposePipelines();

    expect(mockDispose).toHaveBeenCalledTimes(2);
    expect(pipelineCache.size).toBe(0);
  });

  it('should handle dispose errors gracefully', async () => {
    mockDispose.mockRejectedValue(new Error('Dispose error'));

    const provider = new TransformersEmbeddingProvider('model');
    await provider.callEmbeddingApi('test');

    // Should not throw
    await expect(disposePipelines()).resolves.not.toThrow();
    expect(pipelineCache.size).toBe(0);
  });
});

describe('Pipeline caching', () => {
  let mockPipeline: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetAllMocks();
    pipelineCache.clear();

    mockPipeline = vi.fn().mockResolvedValue(
      Object.assign(vi.fn().mockResolvedValue({ data: new Float32Array([0.1]), dims: [1] }), {
        dispose: vi.fn(),
      }),
    );

    const transformers = await import('@huggingface/transformers');
    vi.mocked(transformers.pipeline).mockImplementation(mockPipeline as any);
  });

  afterEach(async () => {
    await disposePipelines();
    vi.clearAllMocks();
  });

  it('should create separate pipelines for different models', async () => {
    const provider1 = new TransformersEmbeddingProvider('model1');
    const provider2 = new TransformersEmbeddingProvider('model2');

    await provider1.callEmbeddingApi('test');
    await provider2.callEmbeddingApi('test');

    expect(mockPipeline).toHaveBeenCalledTimes(2);
  });

  it('should create separate pipelines for different tasks', async () => {
    const embeddingProvider = new TransformersEmbeddingProvider('model');
    const textGenProvider = new TransformersTextGenerationProvider('model');

    // Need to setup generator mock for text generation
    const mockGenerator = vi.fn().mockResolvedValue([{ generated_text: 'output' }]);
    mockPipeline
      .mockResolvedValueOnce(
        Object.assign(vi.fn().mockResolvedValue({ data: new Float32Array([0.1]), dims: [1] }), {
          dispose: vi.fn(),
        }),
      )
      .mockResolvedValueOnce(Object.assign(mockGenerator, { dispose: vi.fn() }));

    await embeddingProvider.callEmbeddingApi('test');
    await textGenProvider.callApi('test');

    expect(mockPipeline).toHaveBeenCalledTimes(2);
    expect(mockPipeline).toHaveBeenCalledWith('feature-extraction', 'model', expect.any(Object));
    expect(mockPipeline).toHaveBeenCalledWith('text-generation', 'model', expect.any(Object));
  });

  it('should create separate pipelines for different devices', async () => {
    const provider1 = new TransformersEmbeddingProvider('model', { config: { device: 'cpu' } });
    const provider2 = new TransformersEmbeddingProvider('model', { config: { device: 'webgpu' } });

    await provider1.callEmbeddingApi('test');
    await provider2.callEmbeddingApi('test');

    expect(mockPipeline).toHaveBeenCalledTimes(2);
  });

  it('should create separate pipelines for different dtypes', async () => {
    const provider1 = new TransformersEmbeddingProvider('model', { config: { dtype: 'fp32' } });
    const provider2 = new TransformersEmbeddingProvider('model', { config: { dtype: 'q4' } });

    await provider1.callEmbeddingApi('test');
    await provider2.callEmbeddingApi('test');

    expect(mockPipeline).toHaveBeenCalledTimes(2);
  });
});

describe('provider-owned pipeline cleanup', () => {
  let pipeline: ReturnType<typeof vi.fn>;
  let dispose: ReturnType<typeof vi.fn>;
  let extractor: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetAllMocks();
    pipelineCache.clear();
    dispose = vi.fn().mockResolvedValue(undefined);
    extractor = vi.fn().mockResolvedValue({ data: new Float32Array([0.25]), dims: [1] });
    pipeline = vi.fn().mockResolvedValue(Object.assign(extractor, { dispose }));
    const transformers = await import('@huggingface/transformers');
    vi.mocked(transformers.pipeline).mockImplementation(pipeline as any);
  });

  afterEach(async () => {
    await disposePipelines();
  });

  it('releases an embedding pipeline when its provider is cleaned up', async () => {
    const provider = new TransformersEmbeddingProvider('fixture');
    expect(await provider.callEmbeddingApi('hello')).toMatchObject({ embedding: [0.25] });
    expect(dispose).not.toHaveBeenCalled();
    await provider.cleanup();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(pipelineCache.size).toBe(0);
  });

  it('keeps a shared caller-owned pipeline until the caller releases it', async () => {
    const caller = new TransformersEmbeddingProvider('fixture');
    await caller.callEmbeddingApi('caller');

    const configured = new TransformersEmbeddingProvider('fixture');
    await configured.callEmbeddingApi('configured');
    await configured.cleanup();

    expect(pipeline).toHaveBeenCalledTimes(1);
    expect(dispose).not.toHaveBeenCalled();
    expect(await caller.callEmbeddingApi('still available')).toMatchObject({ embedding: [0.25] });
    await caller.cleanup();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('shares concurrent initialization until both owners release it', async () => {
    const first = new TransformersEmbeddingProvider('fixture');
    const second = new TransformersEmbeddingProvider('fixture');
    await Promise.all([first.callEmbeddingApi('first'), second.callEmbeddingApi('second')]);

    expect(pipeline).toHaveBeenCalledTimes(1);
    await first.cleanup();
    expect(dispose).not.toHaveBeenCalled();
    await second.cleanup();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(pipelineCache.size).toBe(0);
  });

  it('releases only its own entries and can be used again after cleanup', async () => {
    const first = new TransformersEmbeddingProvider('first');
    const second = new TransformersEmbeddingProvider('second');
    await first.callEmbeddingApi('one');
    await second.callEmbeddingApi('two');

    await first.cleanup();
    await first.cleanup();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(pipelineCache.size).toBe(1);
    await first.callEmbeddingApi('again');
    expect(pipeline).toHaveBeenCalledTimes(3);
    await first.cleanup();
    await second.cleanup();
    expect(dispose).toHaveBeenCalledTimes(3);
    expect(pipelineCache.size).toBe(0);
  });

  it('releases text generation pipelines through provider cleanup', async () => {
    const generator = Object.assign(vi.fn().mockResolvedValue([{ generated_text: 'hello' }]), {
      dispose,
    });
    pipeline.mockResolvedValue(generator);

    const provider = new TransformersTextGenerationProvider('fixture');
    expect(await provider.callApi('hello')).toMatchObject({ output: 'hello' });
    await provider.cleanup();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(pipelineCache.size).toBe(0);
  });

  it.each(['provider', 'global'])(
    'finishes %s cleanup before pending initialization and disposes its late result',
    async (mode) => {
      vi.useFakeTimers();
      const initialized = createDeferred<void>();
      const ready = createDeferred<unknown>();
      pipeline.mockImplementationOnce(() => {
        initialized.resolve();
        return ready.promise;
      });
      const provider = new TransformersEmbeddingProvider('fixture');
      const call = provider.callEmbeddingApi('hello');
      await initialized.promise;
      const cleanup = mode === 'global' ? disposePipelines() : provider.cleanup();
      expect(pipelineCache.size).toBe(0);
      const cleaned = vi.fn();
      void cleanup.then(cleaned);
      try {
        await vi.advanceTimersByTimeAsync(0);
        expect(cleaned).toHaveBeenCalledOnce();
        expect(dispose).not.toHaveBeenCalled();
      } finally {
        ready.resolve(Object.assign(extractor, { dispose }));
        await Promise.all([call, cleanup]);
        vi.useRealTimers();
      }
      expect(await call).toMatchObject({ error: expect.stringContaining('released') });
      expect(extractor).not.toHaveBeenCalled();

      expect(dispose).toHaveBeenCalledTimes(1);
      expect(pipelineCache.size).toBe(0);
      await provider.callEmbeddingApi('again');
      expect(pipeline).toHaveBeenCalledTimes(2);
      await provider.cleanup();
      expect(dispose).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    { kind: 'embedding', reuse: false },
    { kind: 'embedding', reuse: true },
    { kind: 'text generation', reuse: true },
  ])('keeps released pending $kind calls canceled (reuse: $reuse)', async ({ kind, reuse }) => {
    if (kind === 'text generation') {
      extractor.mockResolvedValue([{ generated_text: 'hello' }]);
    }
    const initialized = createDeferred<void>();
    const ready = createDeferred<unknown>();
    pipeline.mockImplementationOnce(() => {
      initialized.resolve();
      return ready.promise;
    });
    const Provider =
      kind === 'embedding' ? TransformersEmbeddingProvider : TransformersTextGenerationProvider;
    const first = new Provider('fixture');
    const second = new Provider('fixture');
    const call = (provider: typeof first, text: string) =>
      provider instanceof TransformersEmbeddingProvider
        ? provider.callEmbeddingApi(text)
        : provider.callApi(text);

    const releasedCall = call(first, 'released');
    const retainedCall = call(second, 'retained');
    await initialized.promise;
    await first.cleanup();
    const reusedCall = reuse ? call(first, 'reused') : undefined;
    ready.resolve(Object.assign(extractor, { dispose }));

    const [released, retained, reused] = await Promise.all([
      releasedCall,
      retainedCall,
      reusedCall,
    ]);
    expect(released).toMatchObject({ error: expect.stringContaining('released') });
    const expected = kind === 'embedding' ? { embedding: [0.25] } : { output: 'hello' };
    expect(retained).toMatchObject(expected);
    expect(pipeline).toHaveBeenCalledOnce();
    expect(extractor).toHaveBeenCalledTimes(reuse ? 2 : 1);
    expect(extractor).toHaveBeenCalledWith('retained', expect.anything());
    expect(dispose).not.toHaveBeenCalled();
    if (reuse) {
      expect(reused).toMatchObject(expected);
      expect(extractor).toHaveBeenCalledWith('reused', expect.anything());
      await first.cleanup();
      expect(dispose).not.toHaveBeenCalled();
    }
    await second.cleanup();
    expect(dispose).toHaveBeenCalledOnce();
    expect(pipelineCache.size).toBe(0);
    await first.cleanup();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it.each(['succeeds', 'fails'])(
    'keeps a replacement cached when released initialization %s',
    async (outcome) => {
      const initialized = createDeferred<void>();
      const ready = createDeferred<unknown>();
      const lateDispose = vi.fn().mockResolvedValue(undefined);
      const lateExtractor = Object.assign(vi.fn(), { dispose: lateDispose });
      pipeline.mockImplementationOnce(() => {
        initialized.resolve();
        return ready.promise;
      });

      const provider = new TransformersEmbeddingProvider('fixture');
      const releasedCall = provider.callEmbeddingApi('released');
      await initialized.promise;
      await provider.cleanup();
      expect(await provider.callEmbeddingApi('replacement')).toMatchObject({ embedding: [0.25] });

      if (outcome === 'succeeds') {
        ready.resolve(lateExtractor);
      } else {
        ready.reject(new Error('fixture initialization failed'));
      }
      expect(await releasedCall).toMatchObject({
        error: expect.stringContaining(
          outcome === 'succeeds' ? 'released' : 'initialization failed',
        ),
      });
      expect(lateExtractor).not.toHaveBeenCalled();
      expect(lateDispose).toHaveBeenCalledTimes(outcome === 'succeeds' ? 1 : 0);
      expect(pipelineCache.size).toBe(1);

      const borrower = new TransformersEmbeddingProvider('fixture');
      expect(await borrower.callEmbeddingApi('shared replacement')).toMatchObject({
        embedding: [0.25],
      });
      expect(pipeline).toHaveBeenCalledTimes(2);
      await provider.cleanup();
      expect(dispose).not.toHaveBeenCalled();
      await borrower.cleanup();
      expect(dispose).toHaveBeenCalledOnce();
      expect(pipelineCache.size).toBe(0);
    },
  );

  it('removes failed initialization from every sharing owner', async () => {
    pipeline.mockRejectedValueOnce(new Error('fixture initialization failed'));
    const first = new TransformersEmbeddingProvider('fixture');
    const second = new TransformersEmbeddingProvider('fixture');
    const results = await Promise.all([
      first.callEmbeddingApi('first'),
      second.callEmbeddingApi('second'),
    ]);
    for (const result of results) {
      expect(result.error).toContain('fixture initialization failed');
    }
    expect(Reflect.get(first, 'pipelines').size).toBe(0);
    expect(Reflect.get(second, 'pipelines').size).toBe(0);
    expect(await second.callEmbeddingApi('retry')).toMatchObject({ embedding: [0.25] });
    await second.cleanup();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('global cleanup removes ownership from every provider before reuse', async () => {
    const first = new TransformersEmbeddingProvider('fixture');
    const second = new TransformersEmbeddingProvider('fixture');
    await Promise.all([first.callEmbeddingApi('first'), second.callEmbeddingApi('second')]);
    await disposePipelines();

    expect(Reflect.get(first, 'pipelines').size).toBe(0);
    expect(Reflect.get(second, 'pipelines').size).toBe(0);
    expect(dispose).toHaveBeenCalledOnce();
    expect(await first.callEmbeddingApi('again')).toMatchObject({ embedding: [0.25] });
    expect(pipeline).toHaveBeenCalledTimes(2);
    await disposePipelines();
    expect(Reflect.get(first, 'pipelines').size).toBe(0);
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  it('retries failed initialization and disposes the successful retry once', async () => {
    pipeline.mockRejectedValueOnce(new Error('fixture initialization failed'));
    const provider = new TransformersEmbeddingProvider('fixture');
    expect(await provider.callEmbeddingApi('first')).toMatchObject({
      error: expect.stringContaining('fixture initialization failed'),
    });
    expect(pipelineCache.size).toBe(0);
    expect(Reflect.get(provider, 'pipelines').size).toBe(0);
    expect(await provider.callEmbeddingApi('second')).toMatchObject({ embedding: [0.25] });

    await disposePipelines();
    await provider.cleanup();
    expect(pipeline).toHaveBeenCalledTimes(2);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(pipelineCache.size).toBe(0);
  });
});
