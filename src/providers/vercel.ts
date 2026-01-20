import { getCache, isCacheEnabled } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import { parseChatPrompt, REQUEST_TIMEOUT_MS } from './shared';

import type { EnvOverrides } from '../types/env';
import type {
  ApiEmbeddingProvider,
  ApiProvider,
  CallApiContextParams,
  ProviderEmbeddingResponse,
  ProviderOptions,
  ProviderResponse,
} from '../types/providers';
import type { TokenUsage } from '../types/shared';

const DEFAULT_TIMEOUT_MS = REQUEST_TIMEOUT_MS;

/**
 * Message format for chat completions.
 */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Configuration options for the Vercel AI Gateway provider.
 */
export interface VercelAiConfig {
  // Authentication
  apiKey?: string;
  apiKeyEnvar?: string;

  // Model settings
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];

  // Request settings
  maxRetries?: number;
  timeout?: number;
  headers?: Record<string, string>;

  // Base URL override
  baseUrl?: string;

  // Streaming support
  streaming?: boolean;

  // Structured output - JSON schema for response format
  responseSchema?: Record<string, unknown>;
}

interface VercelProviderOptions extends ProviderOptions {
  config?: VercelAiConfig;
  env?: EnvOverrides;
}

/**
 * Resolves the API key from config, environment variables, or defaults.
 */
function resolveApiKey(config: VercelAiConfig, env?: EnvOverrides): string | undefined {
  if (config.apiKey) {
    return config.apiKey;
  }
  if (config.apiKeyEnvar) {
    return (
      (env?.[config.apiKeyEnvar as keyof EnvOverrides] as string | undefined) ??
      getEnvString(config.apiKeyEnvar)
    );
  }
  return (
    (env?.VERCEL_AI_GATEWAY_API_KEY as string | undefined) ??
    getEnvString('VERCEL_AI_GATEWAY_API_KEY')
  );
}

/**
 * Resolves the base URL from config or environment variables.
 */
function resolveBaseUrl(config: VercelAiConfig, env?: EnvOverrides): string | undefined {
  return (
    config.baseUrl ??
    (env?.VERCEL_AI_GATEWAY_BASE_URL as string | undefined) ??
    getEnvString('VERCEL_AI_GATEWAY_BASE_URL')
  );
}

/**
 * Creates a Vercel AI Gateway instance.
 */
async function createGatewayInstance(
  config: VercelAiConfig,
  env?: EnvOverrides,
): Promise<ReturnType<typeof import('ai').createGateway>> {
  try {
    const { createGateway } = await import('ai');

    return createGateway({
      apiKey: resolveApiKey(config, env),
      baseURL: resolveBaseUrl(config, env),
      headers: config.headers,
    });
  } catch (error) {
    throw new Error(
      `Failed to load Vercel AI SDK. Please install it with: npm install ai\n${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Maps Vercel AI SDK usage to promptfoo TokenUsage format.
 */
function mapTokenUsage(usage?: {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}): TokenUsage {
  return {
    prompt: usage?.promptTokens,
    completion: usage?.completionTokens,
    total: usage?.totalTokens ?? (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0),
    numRequests: 1,
  };
}

/**
 * Picks defined generation options from config.
 */
function pickGenerateOptions(config: VercelAiConfig) {
  const {
    temperature,
    maxTokens,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    stopSequences,
    maxRetries,
  } = config;
  return Object.fromEntries(
    Object.entries({
      temperature,
      maxTokens,
      topP,
      topK,
      frequencyPenalty,
      presencePenalty,
      stopSequences,
      maxRetries,
    }).filter(([, v]) => v !== undefined),
  );
}

/**
 * Creates an AbortController with timeout and returns cleanup function.
 */
function createTimeoutController(timeoutMs: number): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId),
  };
}

/**
 * Handles common error cases and returns appropriate ProviderResponse.
 */
function handleApiError(error: unknown, timeoutMs: number, context: string): ProviderResponse {
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (error instanceof Error && error.name === 'AbortError') {
    return { error: `Request timed out after ${timeoutMs}ms` };
  }

  logger.error(`Vercel AI Gateway ${context} error: ${errorMessage}`);
  return { error: `API call error: ${errorMessage}` };
}

/**
 * Vercel AI Gateway provider using the official Vercel AI SDK.
 *
 * Provider format: vercel:<provider>/<model>
 * Example: vercel:openai/gpt-4o-mini, vercel:anthropic/claude-sonnet-4.5
 */
export class VercelAiProvider implements ApiProvider {
  public modelName: string;
  public config: VercelAiConfig;
  public env?: EnvOverrides;
  public label?: string;

  private providerId: string;

  constructor(modelName: string, options: VercelProviderOptions = {}) {
    this.modelName = modelName;
    this.config = options.config || {};
    this.env = options.env;
    this.label = options.label;
    this.providerId = options.id ?? `vercel:${modelName}`;
  }

  id(): string {
    return this.providerId;
  }

  toString(): string {
    return `[Vercel AI Gateway Provider ${this.modelName}]`;
  }

  private getCacheKey(prompt: string): string {
    return `vercel:${this.modelName}:${JSON.stringify({
      prompt,
      config: {
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
        topP: this.config.topP,
        topK: this.config.topK,
        frequencyPenalty: this.config.frequencyPenalty,
        presencePenalty: this.config.presencePenalty,
        stopSequences: this.config.stopSequences,
        streaming: this.config.streaming,
        responseSchema: this.config.responseSchema,
      },
    })}`;
  }

  /**
   * Handles streaming API calls using streamText().
   */
  private async callApiStreaming(messages: ChatMessage[]): Promise<ProviderResponse> {
    const timeout = this.config.timeout ?? DEFAULT_TIMEOUT_MS;
    const { signal, cleanup } = createTimeoutController(timeout);

    try {
      const gateway = await createGatewayInstance(this.config, this.env);
      const { streamText } = await import('ai');

      logger.debug('Calling Vercel AI Gateway (streaming)', {
        model: this.modelName,
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
      });

      const result = streamText({
        model: gateway(this.modelName),
        messages,
        ...pickGenerateOptions(this.config),
        abortSignal: signal,
      });

      let output = '';
      try {
        for await (const chunk of result.textStream) {
          output += chunk;
        }
      } finally {
        cleanup();
      }

      const [usage, finishReason] = await Promise.all([result.usage, result.finishReason]);

      logger.debug('Vercel AI Gateway streaming response received', {
        model: this.modelName,
        usage,
        finishReason,
      });

      return { output, tokenUsage: mapTokenUsage(usage), finishReason };
    } catch (error) {
      return handleApiError(error, timeout, 'streaming API call');
    }
  }

  /**
   * Handles structured output API calls using generateObject().
   */
  private async callApiStructured(messages: ChatMessage[]): Promise<ProviderResponse> {
    const timeout = this.config.timeout ?? DEFAULT_TIMEOUT_MS;
    const { signal, cleanup } = createTimeoutController(timeout);

    try {
      const gateway = await createGatewayInstance(this.config, this.env);
      const { generateObject, jsonSchema } = await import('ai');

      // OpenAI requires additionalProperties: false for strict mode
      const schema = jsonSchema<Record<string, unknown>>({
        ...this.config.responseSchema,
        additionalProperties: this.config.responseSchema?.additionalProperties ?? false,
      } as Parameters<typeof jsonSchema>[0]);

      logger.debug('Calling Vercel AI Gateway (structured output)', {
        model: this.modelName,
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
      });

      const result = await generateObject({
        model: gateway(this.modelName),
        messages,
        schema,
        ...pickGenerateOptions(this.config),
        abortSignal: signal,
      });

      cleanup();

      logger.debug('Vercel AI Gateway structured output response received', {
        model: this.modelName,
        usage: result.usage,
        finishReason: result.finishReason,
      });

      return {
        output: result.object,
        tokenUsage: mapTokenUsage(result.usage),
        finishReason: result.finishReason,
      };
    } catch (error) {
      cleanup();
      return handleApiError(error, timeout, 'structured output API call');
    }
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const cache = await getCache();
    const cacheKey = this.getCacheKey(prompt);

    // Check cache first
    if (isCacheEnabled() && !(context?.bustCache ?? context?.debug)) {
      const cachedResponse = await cache.get<string>(cacheKey);
      if (cachedResponse) {
        logger.debug(`Returning cached response for Vercel AI Gateway: ${this.modelName}`);
        try {
          const parsed = JSON.parse(cachedResponse) as ProviderResponse;
          return { ...parsed, cached: true };
        } catch {
          // If parsing fails, return as raw output
          return { output: cachedResponse, cached: true };
        }
      }
    }

    // Parse prompt as chat messages if it's in JSON/YAML format
    const messages = parseChatPrompt<ChatMessage[]>(prompt, [{ role: 'user', content: prompt }]);

    // Dispatch to appropriate method based on config
    let response: ProviderResponse;
    if (this.config.responseSchema) {
      response = await this.callApiStructured(messages);
    } else if (this.config.streaming) {
      response = await this.callApiStreaming(messages);
    } else {
      response = await this.callApiNonStreaming(messages);
    }

    // Cache the response if successful
    if (isCacheEnabled() && !response.error) {
      try {
        await cache.set(cacheKey, JSON.stringify(response));
      } catch (err) {
        logger.error(`Failed to cache Vercel AI Gateway response: ${String(err)}`);
      }
    }

    return response;
  }

  /**
   * Handles non-streaming API calls using generateText().
   */
  private async callApiNonStreaming(messages: ChatMessage[]): Promise<ProviderResponse> {
    const timeout = this.config.timeout ?? DEFAULT_TIMEOUT_MS;
    const { signal, cleanup } = createTimeoutController(timeout);

    try {
      const gateway = await createGatewayInstance(this.config, this.env);
      const { generateText } = await import('ai');

      logger.debug('Calling Vercel AI Gateway', {
        model: this.modelName,
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
      });

      const result = await generateText({
        model: gateway(this.modelName),
        messages,
        ...pickGenerateOptions(this.config),
        abortSignal: signal,
      });

      cleanup();

      logger.debug('Vercel AI Gateway response received', {
        model: this.modelName,
        usage: result.usage,
        finishReason: result.finishReason,
      });

      return {
        output: result.text,
        tokenUsage: mapTokenUsage(result.usage),
        finishReason: result.finishReason,
      };
    } catch (error) {
      cleanup();
      return handleApiError(error, timeout, 'API call');
    }
  }
}

/**
 * Vercel AI Gateway embedding provider.
 */
export class VercelAiEmbeddingProvider implements ApiEmbeddingProvider {
  public modelName: string;
  public config: VercelAiConfig;
  public env?: EnvOverrides;
  public label?: string;

  private providerId: string;

  constructor(modelName: string, options: VercelProviderOptions = {}) {
    this.modelName = modelName;
    this.config = options.config || {};
    this.env = options.env;
    this.label = options.label;
    this.providerId = options.id ?? `vercel:embedding:${modelName}`;
  }

  id(): string {
    return this.providerId;
  }

  toString(): string {
    return `[Vercel AI Gateway Embedding Provider ${this.modelName}]`;
  }

  async callApi(_prompt: string): Promise<ProviderResponse> {
    return {
      error: 'Use callEmbeddingApi for embedding models',
    };
  }

  async callEmbeddingApi(
    input: string,
    context?: CallApiContextParams,
  ): Promise<ProviderEmbeddingResponse> {
    const cache = await getCache();
    const cacheKey = `vercel:embedding:${this.modelName}:${input}`;

    // Check cache first
    if (isCacheEnabled() && !(context?.bustCache ?? context?.debug)) {
      const cachedResponse = await cache.get<string>(cacheKey);
      if (cachedResponse) {
        logger.debug(`Returning cached embedding for Vercel AI Gateway: ${this.modelName}`);
        try {
          const parsed = JSON.parse(cachedResponse) as ProviderEmbeddingResponse;
          return { ...parsed, cached: true };
        } catch {
          return { error: 'Failed to parse cached embedding response' };
        }
      }
    }

    const timeout = this.config.timeout ?? DEFAULT_TIMEOUT_MS;
    const { signal, cleanup } = createTimeoutController(timeout);

    try {
      const gateway = await createGatewayInstance(this.config, this.env);
      const { embed } = await import('ai');

      logger.debug('Calling Vercel AI Gateway for embedding', { model: this.modelName });

      const result = await embed({
        model: gateway.textEmbeddingModel(this.modelName),
        value: input,
        abortSignal: signal,
      });

      cleanup();

      logger.debug('Vercel AI Gateway embedding response received', {
        model: this.modelName,
        embeddingLength: result.embedding?.length,
      });

      const response: ProviderEmbeddingResponse = {
        embedding: result.embedding,
        tokenUsage: { total: result.usage?.tokens },
      };

      if (isCacheEnabled()) {
        try {
          await cache.set(cacheKey, JSON.stringify(response));
        } catch (err) {
          logger.error(`Failed to cache Vercel AI Gateway embedding: ${String(err)}`);
        }
      }

      return response;
    } catch (error) {
      cleanup();
      return handleApiError(error, timeout, 'embedding');
    }
  }
}

/**
 * Factory function for creating Vercel AI Gateway providers.
 * Parses the provider path and returns the appropriate provider instance.
 *
 * Format: vercel:<provider>/<model>
 * Example: vercel:openai/gpt-4o-mini
 * Example: vercel:embedding:openai/text-embedding-3-small
 */
export function createVercelProvider(
  providerPath: string,
  options: VercelProviderOptions = {},
): ApiProvider {
  // Remove 'vercel:' prefix
  const pathWithoutPrefix = providerPath.substring('vercel:'.length);

  // Check if it's an embedding model
  if (pathWithoutPrefix.startsWith('embedding:')) {
    const modelName = pathWithoutPrefix.substring('embedding:'.length);
    return new VercelAiEmbeddingProvider(modelName, options);
  }

  // Default to text generation provider
  return new VercelAiProvider(pathWithoutPrefix, options);
}
