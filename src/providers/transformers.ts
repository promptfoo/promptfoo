import logger from '../logger';
import { providerRegistry } from './providerRegistry';
import { loadTransformers } from './transformersAvailability';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderEmbeddingResponse,
  ProviderResponse,
} from '../types/index';

/**
 * Common options for all Transformers.js providers
 */
interface TransformersBaseOptions {
  /**
   * Device to run the model on.
   * @default 'auto'
   */
  device?:
    | 'auto'
    | 'cpu'
    | 'gpu'
    | 'wasm'
    | 'webgpu'
    | 'cuda'
    | 'dml'
    | 'coreml'
    | 'webnn'
    | 'webnn-npu'
    | 'webnn-gpu'
    | 'webnn-cpu';

  /**
   * Data type / quantization level for the model.
   * @default 'auto' (q8 for WASM, fp32 for WebGPU)
   */
  dtype?: 'auto' | 'fp32' | 'fp16' | 'q8' | 'int8' | 'uint8' | 'q4' | 'bnb4' | 'q4f16';

  /**
   * Override the default cache directory for model files.
   */
  cacheDir?: string;

  /**
   * Only load models from local cache, don't download from HuggingFace Hub.
   * @default false
   */
  localFilesOnly?: boolean;

  /**
   * Model version/branch to use.
   * @default 'main'
   */
  revision?: string;

  /**
   * ONNX runtime session options.
   */
  sessionOptions?: Record<string, unknown>;
}

/**
 * Options for embedding/feature extraction pipelines
 */
interface TransformersEmbeddingOptions extends TransformersBaseOptions {
  /**
   * Pooling strategy for embeddings.
   * @default 'mean'
   */
  pooling?: 'none' | 'mean' | 'cls' | 'first_token' | 'eos' | 'last_token';

  /**
   * Whether to L2 normalize embeddings.
   * @default true
   */
  normalize?: boolean;

  /**
   * Text prefix to prepend to inputs. Critical for models like BGE, E5.
   * @example "query: " for queries, "passage: " for documents
   */
  prefix?: string;
}

/**
 * Options for text generation pipelines
 */
interface TransformersTextGenerationOptions extends TransformersBaseOptions {
  /**
   * Maximum number of tokens to generate.
   * @default 256
   */
  maxNewTokens?: number;

  /**
   * Sampling temperature. Higher = more random.
   * @default 1.0
   */
  temperature?: number;

  /**
   * Top-k sampling. Only consider top k tokens.
   * @default 50
   */
  topK?: number;

  /**
   * Nucleus sampling. Only consider tokens with cumulative probability >= top_p.
   * @default 1.0
   */
  topP?: number;

  /**
   * Enable sampling. If false, uses greedy decoding.
   * @default false
   */
  doSample?: boolean;

  /**
   * Penalty for repeating tokens.
   * @default 1.0
   */
  repetitionPenalty?: number;

  /**
   * Prevent n-grams of this size from repeating.
   */
  noRepeatNgramSize?: number;

  /**
   * Number of beams for beam search. 1 = no beam search.
   * @default 1
   */
  numBeams?: number;

  /**
   * Whether to include the prompt in the output.
   * @default false
   */
  returnFullText?: boolean;
}

// Type for Transformers.js pipeline result
type Pipeline = {
  (input: string | string[], options?: Record<string, unknown>): Promise<unknown>;
  dispose?: () => Promise<void>;
};

interface PipelineEntry {
  key: string;
  pipeline: Promise<Pipeline>;
  owners: Set<Set<PipelineEntry>>;
  value?: Pipeline;
  disposal?: Promise<void>;
}

// Providers share pipelines until the last owner releases them.
const pipelineCache = new Map<string, PipelineEntry>();

function getPipelineCacheKey(
  task: string,
  model: string,
  options: TransformersBaseOptions,
): string {
  const device = options.device || 'auto';
  const dtype = options.dtype || 'auto';
  return `${task}:${model}:${device}:${dtype}`;
}

async function initializePipeline(
  task: string,
  model: string,
  options: TransformersBaseOptions,
  cacheKey: string,
): Promise<Pipeline> {
  type PipelineFn = (
    task: string,
    model: string,
    options?: Record<string, unknown>,
  ) => Promise<Pipeline>;

  // The shared loader validates the optional SDK before initializing its pipelines.
  const transformers = (await loadTransformers()) as { pipeline: PipelineFn };
  const pipelineFn = transformers.pipeline;

  const pipelineOptions: Record<string, unknown> = {
    progress_callback: (progress: {
      status: string;
      name?: string;
      file?: string;
      progress?: number;
      loaded?: number;
      total?: number;
      task?: string;
      model?: string;
    }) => {
      if (progress.status === 'progress' && progress.file) {
        const percent = progress.progress?.toFixed(1) || '?';
        logger.debug(`[Transformers] Downloading ${progress.file}: ${percent}%`);
      } else if (progress.status === 'ready') {
        logger.debug(`[Transformers] Model ready: ${progress.model || model}`);
      }
    },
  };

  // Apply options
  for (const [source, target] of [
    ['device', 'device'],
    ['dtype', 'dtype'],
    ['cacheDir', 'cache_dir'],
    ['localFilesOnly', 'local_files_only'],
    ['revision', 'revision'],
    ['sessionOptions', 'session_options'],
  ] as const) {
    if (options[source]) {
      pipelineOptions[target] = source === 'localFilesOnly' ? true : options[source];
    }
  }

  logger.debug(`[Transformers] Loading pipeline: ${task}:${model}`, {
    device: pipelineOptions.device,
    dtype: pipelineOptions.dtype,
  });

  const startTime = Date.now();
  const pipe = await pipelineFn(task, model, pipelineOptions);
  const loadTime = Date.now() - startTime;

  logger.debug(`[Transformers] Pipeline loaded in ${loadTime}ms: ${cacheKey}`);

  return pipe;
}

async function getOrCreatePipeline(
  task: string,
  model: string,
  options: TransformersBaseOptions,
  owned: Set<PipelineEntry>,
  signal?: AbortSignal,
): Promise<Pipeline> {
  await providerRegistry.useResource(pipelineCleanup, signal);
  providerRegistry.throwIfResourceUseAborted(signal);
  providerRegistry.register(pipelineCleanup);
  const cacheKey = getPipelineCacheKey(task, model, options);

  let entry = pipelineCache.get(cacheKey);
  if (entry) {
    logger.debug(`[Transformers] Using shared pipeline: ${cacheKey}`);
  } else {
    const initPromise = initializePipeline(task, model, options, cacheKey);

    const newEntry: PipelineEntry = {
      key: cacheKey,
      pipeline: initPromise,
      owners: new Set(),
    };
    pipelineCache.set(cacheKey, newEntry);
    newEntry.pipeline = initPromise.then(
      async (pipe) => {
        newEntry.value = pipe;
        if (newEntry.owners.size === 0) {
          await disposePipeline(newEntry);
        }
        return pipe;
      },
      (error) => {
        forgetPipelineEntry(newEntry);
        throw error;
      },
    );
    entry = newEntry;
  }
  owned.add(entry);
  entry.owners.add(owned);
  const pipe = await entry.pipeline;
  if (!owned.has(entry)) {
    throw new Error('Transformers pipeline was released during initialization');
  }
  return pipe;
}

function forgetPipelineEntry(entry: PipelineEntry): void {
  if (pipelineCache.get(entry.key) === entry) {
    pipelineCache.delete(entry.key);
  }
  for (const owner of entry.owners) {
    owner.delete(entry);
  }
  entry.owners.clear();
}

function disposePipeline(entry: PipelineEntry): Promise<void> {
  forgetPipelineEntry(entry);
  const pipe = entry.value;
  if (!pipe) {
    // Initialization disposes its result when it finishes without any owners.
    return Promise.resolve();
  }
  entry.disposal ??= (async () => {
    try {
      await pipe.dispose?.();
      logger.debug(`[Transformers] Disposed pipeline: ${entry.key}`);
    } catch (err) {
      logger.warn(`[Transformers] Error disposing pipeline ${entry.key}:`, { error: err });
    }
  })();
  return entry.disposal;
}

async function releasePipelines(owned: Set<PipelineEntry>): Promise<void> {
  const disposals: Promise<void>[] = [];
  for (const entry of owned) {
    entry.owners.delete(owned);
    if (entry.owners.size === 0) {
      disposals.push(disposePipeline(entry));
    }
  }
  owned.clear();
  await Promise.all(disposals);
}

/** Dispose all pipelines during process shutdown or explicit global cleanup. */
async function disposePipelines(): Promise<void> {
  await Promise.all([...pipelineCache.values()].map(disposePipeline));
}

const pipelineCleanup = { shutdown: disposePipelines };

function handleTransformersError(
  error: Error,
  provider: { modelName: string },
  kind: 'embedding' | 'generation',
): { error: string } {
  // Check for model not found
  if (error.message?.includes('Could not locate file')) {
    return {
      error:
        `Model not found: ${provider.modelName}. ` +
        'Make sure the model exists on HuggingFace Hub and has ONNX weights available. ' +
        'Browse models at: https://huggingface.co/models?library=transformers.js',
    };
  }

  logger.error(`[Transformers] ${kind === 'embedding' ? 'Embedding' : 'Generation'} error:`, {
    error: error.message,
  });
  return {
    error: `Transformers.js ${kind} error: ${error.message}`,
  };
}

/**
 * Provider for local text embeddings using Transformers.js feature extraction.
 *
 * @example
 * ```yaml
 * providers:
 *   - transformers:feature-extraction:Xenova/all-MiniLM-L6-v2
 * ```
 */
export class TransformersEmbeddingProvider implements ApiProvider {
  modelName: string;
  config: TransformersEmbeddingOptions;
  private pipelines = new Set<PipelineEntry>();

  constructor(
    modelName: string,
    options: { id?: string; config?: TransformersEmbeddingOptions } = {},
  ) {
    const { id, config } = options;
    this.modelName = modelName;
    this.id = id ? () => id : this.id;
    this.config = config || {};
  }

  id(): string {
    return `transformers:feature-extraction:${this.modelName}`;
  }

  toString(): string {
    return `[Transformers Embedding Provider ${this.modelName}]`;
  }

  cleanup(): Promise<void> {
    const pipelines = this.pipelines;
    // Reuse gets a fresh owner token so released pending calls stay canceled.
    this.pipelines = new Set<PipelineEntry>();
    return releasePipelines(pipelines);
  }

  async callApi(_prompt: string): Promise<ProviderResponse> {
    return {
      error:
        'Cannot use an embedding provider for text generation. Use callEmbeddingApi() instead.',
    };
  }

  async callEmbeddingApi(
    text: string,
    options?: CallApiOptionsParams,
  ): Promise<ProviderEmbeddingResponse> {
    try {
      const extractor = await getOrCreatePipeline(
        'feature-extraction',
        this.modelName,
        this.config,
        this.pipelines,
        options?.abortSignal,
      );
      providerRegistry.throwIfResourceUseAborted(options?.abortSignal);

      // Apply prefix if configured (critical for BGE, E5, Instructor models)
      const inputText = this.config.prefix ? `${this.config.prefix}${text}` : text;

      // Default to mean pooling + normalization for sentence embeddings
      const extractionOptions: Record<string, unknown> = {
        pooling: this.config.pooling ?? 'mean',
        normalize: this.config.normalize ?? true,
      };

      logger.debug(`[Transformers] Extracting embeddings for text (length: ${text.length})`, {
        pooling: extractionOptions.pooling,
        normalize: extractionOptions.normalize,
        hasPrefix: !!this.config.prefix,
      });

      const startTime = Date.now();
      const result = (await extractor(inputText, extractionOptions)) as {
        data: Float32Array | Int8Array;
        dims: number[];
      };
      const latencyMs = Date.now() - startTime;

      // Convert Tensor to number array
      const embedding = Array.from(result.data);

      logger.debug(`[Transformers] Embedding extracted in ${latencyMs}ms`, {
        dims: result.dims,
        embeddingLength: embedding.length,
      });

      return {
        embedding,
        latencyMs,
      };
    } catch (err) {
      providerRegistry.throwIfResourceUseAborted(options?.abortSignal);
      return handleTransformersError(err as Error, this, 'embedding');
    }
  }
}

/**
 * Provider for local text generation using Transformers.js.
 *
 * @example
 * ```yaml
 * providers:
 *   - id: transformers:text-generation:onnx-community/Qwen3-0.6B-ONNX
 *     config:
 *       dtype: q4
 *       maxNewTokens: 256
 * ```
 */
export class TransformersTextGenerationProvider implements ApiProvider {
  modelName: string;
  config: TransformersTextGenerationOptions;
  private pipelines = new Set<PipelineEntry>();

  constructor(
    modelName: string,
    options: { id?: string; config?: TransformersTextGenerationOptions } = {},
  ) {
    const { id, config } = options;
    this.modelName = modelName;
    this.id = id ? () => id : this.id;
    this.config = config || {};
  }

  id(): string {
    return `transformers:text-generation:${this.modelName}`;
  }

  toString(): string {
    return `[Transformers Text Generation Provider ${this.modelName}]`;
  }

  cleanup(): Promise<void> {
    const pipelines = this.pipelines;
    // Reuse gets a fresh owner token so released pending calls stay canceled.
    this.pipelines = new Set<PipelineEntry>();
    return releasePipelines(pipelines);
  }

  async callApi(
    prompt: string,
    _context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    try {
      const generator = await getOrCreatePipeline(
        'text-generation',
        this.modelName,
        this.config,
        this.pipelines,
        options?.abortSignal,
      );

      providerRegistry.throwIfResourceUseAborted(options?.abortSignal);

      // Build generation options (convert camelCase to snake_case for library)
      const generationOptions: Record<string, unknown> = {
        max_new_tokens: this.config.maxNewTokens ?? 256,
        return_full_text: this.config.returnFullText ?? false,
      };

      // Only include defined options
      for (const [source, target] of [
        ['temperature', 'temperature'],
        ['topK', 'top_k'],
        ['topP', 'top_p'],
        ['doSample', 'do_sample'],
        ['repetitionPenalty', 'repetition_penalty'],
        ['noRepeatNgramSize', 'no_repeat_ngram_size'],
        ['numBeams', 'num_beams'],
      ] as const) {
        if (this.config[source] !== undefined) {
          generationOptions[target] = this.config[source];
        }
      }

      logger.debug(`[Transformers] Generating text for prompt (length: ${prompt.length})`, {
        maxNewTokens: generationOptions.max_new_tokens,
        temperature: generationOptions.temperature,
      });

      const startTime = Date.now();
      const result = (await generator(prompt, generationOptions)) as Array<{
        generated_text: string | Array<{ role: string; content: string }>;
      }>;
      const latencyMs = Date.now() - startTime;

      // Extract generated text
      const rawOutput = Array.isArray(result) ? result[0]?.generated_text : undefined;

      if (rawOutput === undefined) {
        return {
          error: 'No output generated',
          latencyMs,
        };
      }

      // Handle chat format output (array of messages)
      let output: string;
      if (typeof rawOutput === 'string') {
        output = rawOutput;
      } else if (Array.isArray(rawOutput)) {
        // Get the last message content (the assistant's response)
        const lastMessage = rawOutput[rawOutput.length - 1];
        output = lastMessage?.content || JSON.stringify(rawOutput);
      } else {
        output = JSON.stringify(rawOutput);
      }

      logger.debug(`[Transformers] Generated text in ${latencyMs}ms`, {
        outputLength: output.length,
      });

      return {
        output,
        latencyMs,
      };
    } catch (err) {
      providerRegistry.throwIfResourceUseAborted(options?.abortSignal);
      return handleTransformersError(err as Error, this, 'generation');
    }
  }
}

// Export for testing
export { disposePipelines, pipelineCache };
