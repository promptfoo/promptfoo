import { createHmac } from 'crypto';

import { context as otelContext, propagation, ROOT_CONTEXT, trace } from '@opentelemetry/api';
import { getCache, isCacheEnabled } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import { sha256 } from '../util/createHash';
import { getRequestTimeoutMs, parseChatPrompt } from './shared';
import { hasActiveTracingSpan } from './tracing';
import type { LanguageModelUsage } from 'ai';

import type { EnvOverrides } from '../types/env';
import type {
  ApiEmbeddingProvider,
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderEmbeddingResponse,
  ProviderOptions,
  ProviderResponse,
} from '../types/providers';
import type { TokenUsage } from '../types/shared';

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
  const apiKey = config.apiKeyEnvar
    ? ((env?.[config.apiKeyEnvar as keyof EnvOverrides] as string | undefined) ??
      getEnvString(config.apiKeyEnvar))
    : ((env?.VERCEL_AI_GATEWAY_API_KEY as string | undefined) ??
      getEnvString('VERCEL_AI_GATEWAY_API_KEY'));
  return apiKey ?? getEnvString('AI_GATEWAY_API_KEY');
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
      apiKey: config.apiKey,
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
function mapTokenUsage(
  usage?: Partial<Pick<LanguageModelUsage, 'inputTokens' | 'outputTokens' | 'totalTokens'>>,
): TokenUsage {
  return {
    prompt: usage?.inputTokens,
    completion: usage?.outputTokens,
    total: usage?.totalTokens ?? (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
    numRequests: 1,
  };
}

/** Let the AI SDK create its own model, tool, and embedding spans for traced evaluations. */
function getSdkTelemetryOptions(providerId: string, context?: CallApiContextParams) {
  if (!context?.traceparent && !hasActiveTracingSpan()) {
    return {};
  }

  return {
    experimental_telemetry: {
      isEnabled: true,
      functionId: providerId,
      recordInputs: false,
      recordOutputs: false,
    },
  };
}

/** Preserve the evaluation parent when SDK calls are invoked without an active matching span. */
function withSdkTraceContext<T>(context: CallApiContextParams | undefined, fn: () => T): T {
  const traceparent = context?.traceparent;
  if (!traceparent) {
    return fn();
  }

  const [, traceId] = traceparent.split('-');
  const activeSpanContext = trace.getActiveSpan()?.spanContext();
  if (activeSpanContext?.traceId.toLowerCase() === traceId?.toLowerCase()) {
    return fn();
  }

  const parentContext = propagation.extract(ROOT_CONTEXT, { traceparent });
  return otelContext.with(parentContext, fn);
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
      maxOutputTokens: maxTokens,
      topP,
      topK,
      frequencyPenalty,
      presencePenalty,
      stopSequences,
      maxRetries,
    }).filter(([, v]) => v !== undefined),
  );
}

function fingerprintGatewayIdentity(value: string) {
  return createHmac('sha256', value)
    .update('promptfoo:vercel-gateway-cache-identity')
    .digest('hex');
}

function getGatewayCacheConfig(config: VercelAiConfig, env?: EnvOverrides) {
  const headers = config.headers
    ? Object.fromEntries(
        Object.entries(config.headers)
          .map(([key, value]) => [key.toLowerCase(), fingerprintGatewayIdentity(value)] as const)
          .sort(([left], [right]) => left.localeCompare(right)),
      )
    : undefined;
  const apiKey = config.apiKey;
  const baseUrl = resolveBaseUrl(config, env);

  return {
    apiKeyFingerprint: apiKey ? fingerprintGatewayIdentity(apiKey) : undefined,
    baseUrlFingerprint: baseUrl === undefined ? undefined : fingerprintGatewayIdentity(baseUrl),
    headers,
  };
}

/**
 * Creates an AbortController with timeout and returns cleanup function.
 */
function createTimeoutController(
  timeoutMs: number,
  abortSignal?: AbortSignal,
): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: abortSignal ? AbortSignal.any([controller.signal, abortSignal]) : controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId);
      controller.abort();
    },
  };
}

/**
 * Handles common error cases and returns appropriate ProviderResponse.
 */
function handleApiError(
  error: unknown,
  timeoutMs: number,
  context: string,
  abortSignal?: AbortSignal,
): ProviderResponse {
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (abortSignal?.aborted) {
    return { error: 'Request aborted' };
  }

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

  private getCacheKey(prompt: string, config: VercelAiConfig): string {
    // Version generation responses because AI SDK 6 caps and usage changed.
    return `vercel:v2:${this.modelName}:${sha256(
      JSON.stringify({
        prompt,
        gateway: getGatewayCacheConfig(config, this.env),
        config: {
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          topP: config.topP,
          topK: config.topK,
          frequencyPenalty: config.frequencyPenalty,
          presencePenalty: config.presencePenalty,
          stopSequences: config.stopSequences,
          streaming: config.streaming,
          responseSchema: config.responseSchema,
        },
      }),
    )}`;
  }

  /**
   * Handles streaming API calls using streamText().
   */
  private async callApiStreaming(
    messages: ChatMessage[],
    config: VercelAiConfig,
    context?: CallApiContextParams,
    abortSignal?: AbortSignal,
  ): Promise<ProviderResponse> {
    const timeout = config.timeout ?? getRequestTimeoutMs();
    const { signal, cleanup } = createTimeoutController(timeout, abortSignal);

    try {
      const gateway = await createGatewayInstance(config, this.env);
      const { streamText } = await import('ai');

      logger.debug('Calling Vercel AI Gateway (streaming)', {
        model: this.modelName,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      });

      const result = streamText({
        model: gateway(this.modelName),
        messages,
        ...pickGenerateOptions(config),
        ...getSdkTelemetryOptions(this.id(), context),
        abortSignal: signal,
      });

      let output = '';
      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          output += part.text;
        } else if (part.type === 'error') {
          throw part.error;
        }
      }
      const [usage, finishReason] = await Promise.all([result.usage, result.finishReason]);
      signal.throwIfAborted();

      logger.debug('Vercel AI Gateway streaming response received', {
        model: this.modelName,
        usage,
        finishReason,
      });

      return { output, tokenUsage: mapTokenUsage(usage), finishReason };
    } catch (error) {
      return handleApiError(error, timeout, 'streaming API call', abortSignal);
    } finally {
      cleanup();
    }
  }

  /**
   * Handles structured output API calls using generateObject().
   */
  private async callApiStructured(
    messages: ChatMessage[],
    config: VercelAiConfig,
    context?: CallApiContextParams,
    abortSignal?: AbortSignal,
  ): Promise<ProviderResponse> {
    const timeout = config.timeout ?? getRequestTimeoutMs();
    const { signal, cleanup } = createTimeoutController(timeout, abortSignal);

    try {
      const gateway = await createGatewayInstance(config, this.env);
      const { generateObject, jsonSchema } = await import('ai');

      // OpenAI requires additionalProperties: false for strict mode
      const schema = jsonSchema<Record<string, unknown>>({
        ...config.responseSchema,
        additionalProperties: config.responseSchema?.additionalProperties ?? false,
      } as Parameters<typeof jsonSchema>[0]);

      logger.debug('Calling Vercel AI Gateway (structured output)', {
        model: this.modelName,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      });

      const result = await generateObject({
        model: gateway(this.modelName),
        messages,
        schema,
        ...pickGenerateOptions(config),
        ...getSdkTelemetryOptions(this.id(), context),
        abortSignal: signal,
      });

      signal.throwIfAborted();

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
      return handleApiError(error, timeout, 'structured output API call', abortSignal);
    } finally {
      cleanup();
    }
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (options?.abortSignal?.aborted) {
      return { error: 'Request aborted' };
    }
    const config = { ...this.config, apiKey: resolveApiKey(this.config, this.env) };
    // The SDK can resolve a request-scoped OIDC token when no API key is configured.
    const cacheEnabled = isCacheEnabled() && Boolean(config.apiKey);
    const cache = await getCache();
    const cacheKey = this.getCacheKey(prompt, config);

    // Check cache first
    if (cacheEnabled && !(context?.bustCache ?? context?.debug)) {
      const cachedResponse = await cache.get<string>(cacheKey);
      if (cachedResponse) {
        logger.debug(`Returning cached response for Vercel AI Gateway: ${this.modelName}`);
        try {
          const parsed = JSON.parse(cachedResponse) as ProviderResponse;
          // Older streaming responses could cache partial output after an SDK error.
          if (!parsed.error && parsed.finishReason !== 'error') {
            return { ...parsed, cached: true };
          }
        } catch {
          // If parsing fails, return as raw output
          return { output: cachedResponse, cached: true };
        }
      }
    }

    // Parse prompt as chat messages if it's in JSON/YAML format
    const messages = parseChatPrompt<ChatMessage[]>(prompt, [{ role: 'user', content: prompt }]);

    // Dispatch to appropriate method based on config
    const response = await withSdkTraceContext(context, async () => {
      if (config.responseSchema) {
        return this.callApiStructured(messages, config, context, options?.abortSignal);
      }
      if (config.streaming) {
        return this.callApiStreaming(messages, config, context, options?.abortSignal);
      }
      return this.callApiNonStreaming(messages, config, context, options?.abortSignal);
    });

    // Cache the response if successful
    if (cacheEnabled && !response.error) {
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
  private async callApiNonStreaming(
    messages: ChatMessage[],
    config: VercelAiConfig,
    context?: CallApiContextParams,
    abortSignal?: AbortSignal,
  ): Promise<ProviderResponse> {
    const timeout = config.timeout ?? getRequestTimeoutMs();
    const { signal, cleanup } = createTimeoutController(timeout, abortSignal);

    try {
      const gateway = await createGatewayInstance(config, this.env);
      const { generateText } = await import('ai');

      logger.debug('Calling Vercel AI Gateway', {
        model: this.modelName,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      });

      const result = await generateText({
        model: gateway(this.modelName),
        messages,
        ...pickGenerateOptions(config),
        ...getSdkTelemetryOptions(this.id(), context),
        abortSignal: signal,
      });

      signal.throwIfAborted();

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
      return handleApiError(error, timeout, 'API call', abortSignal);
    } finally {
      cleanup();
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
    const config = { ...this.config, apiKey: resolveApiKey(this.config, this.env) };
    const cacheEnabled = isCacheEnabled() && Boolean(config.apiKey);
    const cache = await getCache();
    const cacheKey = `vercel:embedding:${this.modelName}:${sha256(
      JSON.stringify({
        input,
        gateway: getGatewayCacheConfig(config, this.env),
      }),
    )}`;

    // Check cache first
    if (cacheEnabled && !(context?.bustCache ?? context?.debug)) {
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

    const timeout = config.timeout ?? getRequestTimeoutMs();
    const { signal, cleanup } = createTimeoutController(timeout);

    try {
      const gateway = await createGatewayInstance(config, this.env);
      const { embed } = await import('ai');

      logger.debug('Calling Vercel AI Gateway for embedding', { model: this.modelName });

      const result = await withSdkTraceContext(context, () =>
        embed({
          model: gateway.textEmbeddingModel(this.modelName),
          value: input,
          ...getSdkTelemetryOptions(this.id(), context),
          abortSignal: signal,
        }),
      );

      cleanup();

      logger.debug('Vercel AI Gateway embedding response received', {
        model: this.modelName,
        embeddingLength: result.embedding?.length,
      });

      const response: ProviderEmbeddingResponse = {
        embedding: result.embedding,
        tokenUsage: { total: result.usage?.tokens },
      };

      if (cacheEnabled) {
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
